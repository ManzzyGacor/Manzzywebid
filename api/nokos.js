const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const router = express.Router();

// 1. KONEKSI DB & SCHEMA
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; } 
    catch (err) { console.error("DB Error:", err); }
};

const NokosConfig = mongoose.models.NokosConfig || mongoose.model('NokosConfig', new mongoose.Schema({
    provider: { type: String, default: 'rumahotp' },
    apiKey: String,
    marginPercent: { type: Number, default: 20 }
}));

const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    balance: { type: Number, default: 0 } 
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
}));

// 2. HELPER REQUEST
async function callRumahOTP(endpoint, method = 'GET', data = null) {
    await connectDB();
    const config = await NokosConfig.findOne();
    if (!config || !config.apiKey) throw new Error("API Key belum disetting!");

    let path = `/api/v2/${endpoint}`;
    if (endpoint.startsWith('/')) path = `/api${endpoint}`;
    if (endpoint.startsWith('v1/')) path = `/api/${endpoint}`;

    const options = {
        hostname: 'www.rumahotp.com',
        path: path,
        method: method,
        headers: {
            'x-apikey': config.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ result: json, config });
                } catch (e) {
                    reject(new Error(`Server Error (HTML). Path: ${path}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error("Koneksi Error: " + e.message)));
        if (data && method !== 'GET') req.write(JSON.stringify(data));
        req.end();
    });
}

// ==========================================
// ROUTES
// ==========================================

router.post('/admin/config', async (req, res) => {
    await connectDB(); await NokosConfig.deleteMany({}); await new NokosConfig(req.body).save(); res.json({ success: true });
});

router.get('/services', async (req, res) => {
    try { const { result } = await callRumahOTP('services'); res.json(result); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/countries', async (req, res) => {
    try {
        const { result, config } = await callRumahOTP(`countries?service_id=${req.query.service_id}`);
        if (result.success && result.data) {
            const margin = config.marginPercent || 0;
            result.data.forEach(c => {
                if(c.pricelist) c.pricelist.forEach(p => {
                    p.price = Math.ceil(p.price + (p.price * margin / 100)); 
                    p.price_format = `Rp${p.price.toLocaleString('id-ID')}`;
                });
            });
        }
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/operators', async (req, res) => {
    try { 
        const country = encodeURIComponent(req.query.country);
        const { result } = await callRumahOTP(`operators?country=${country}&provider_id=${req.query.provider_id}`); 
        res.json(result); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// BUY
router.post('/buy', async (req, res) => {
    await connectDB();
    const { username, number_id, provider_id, operator_id, service_name, service_id } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User error" });

        const { result: priceRes, config } = await callRumahOTP(`countries?service_id=${service_id}`);
        let originalPrice = 0; let found = false;

        if (priceRes.success && priceRes.data) {
            for (let c of priceRes.data) {
                if (String(c.number_id) === String(number_id)) {
                    const p = c.pricelist.find(x => String(x.provider_id) === String(provider_id));
                    if (p) { originalPrice = p.price; found = true; break; }
                }
            }
        }

        if (!found) return res.status(400).json({ success: false, msg: "Gagal cek harga." });

        const margin = config.marginPercent || 0;
        const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));

        if (user.balance < sellingPrice) return res.status(400).json({ success: false, msg: `Saldo kurang!` });

        const { result } = await callRumahOTP(`orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);

        if (!result.success) {
            const errorMsg = result.message || (result.data ? result.data.message : "Gagal dari pusat.");
            return res.status(400).json({ success: false, msg: "Pusat: " + errorMsg });
        }

        const orderData = result.data || result;
        user.balance -= sellingPrice; 
        await user.save();
        
        const inv = 'NOK-' + Date.now().toString().slice(-6);
        await new NokosTx({
            invoiceId: inv, username: user.username, refId: orderData.order_id,
            serviceName: service_name, country: orderData.country, phoneNumber: orderData.phone_number,
            price: sellingPrice, status: 'waiting',
            expiresAt: new Date(Date.now() + (orderData.expires_in_minute * 60000))
        }).save();

        res.json({ success: true, invoiceId: inv });

    } catch (err) { res.status(500).json({ success: false, msg: "Error: " + err.message }); }
});

// [FIX 1] CEK STATUS & AUTO REFUND (Atomic Lock)
router.get('/status/:invoiceId', async (req, res) => {
    await connectDB();
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if(!tx) return res.status(404).json({ success: false });

    // LOGIC A: Cek Expired Local (Pake Atomic Lock biar ga double)
    if (tx.status === 'waiting' && new Date() > new Date(tx.expiresAt)) {
        // Hanya update jika status di DB masih 'waiting'
        const expiredTx = await NokosTx.findOneAndUpdate(
            { _id: tx._id, status: 'waiting' },
            { status: 'canceled' },
            { new: true }
        );

        // Jika berhasil di-lock (berarti ini request pertama yg mengubahnya)
        if (expiredTx) {
            const user = await User.findOne({ username: tx.username });
            if(user) { user.balance += tx.price; await user.save(); } // Refund aman
            return res.json({ success: true, data: expiredTx, msg: "Waktu habis. Refund sukses." });
        }
    }

    try {
        const { result } = await callRumahOTP(`/v1/orders/get_status?order_id=${tx.refId}`);
        if(result.success && result.data) {
            const d = result.data;
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code; tx.status = 'success'; await tx.save();
            }
            // Jika Pusat Cancel (Stok habis/gangguan) - Pake Atomic Lock juga
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                const canceledTx = await NokosTx.findOneAndUpdate(
                    { _id: tx._id, status: 'waiting' },
                    { status: 'canceled' }
                );
                if(canceledTx) {
                    const user = await User.findOne({ username: tx.username });
                    if(user) { user.balance += tx.price; await user.save(); }
                }
            }
        }
        // Kirim data terbaru
        const freshData = await NokosTx.findById(tx._id);
        res.json({ success: true, data: freshData });
    } catch(e) { res.status(500).json({ success: false }); }
});

// [FIX 2] ACTION (CANCEL/DONE/RESEND) - Anti Double Refund
router.post('/action', async (req, res) => {
    await connectDB();
    const { invoiceId, username, action } = req.body;
    
    const tx = await NokosTx.findOne({ invoiceId, username });
    if(!tx) return res.status(404).json({ success: false, msg: "Order not found" });

    // FAST CHECK: Jika status sudah bukan waiting, tolak request!
    if (tx.status !== 'waiting') {
        return res.status(400).json({ success: false, msg: "Transaksi sudah selesai/batal." });
    }

    if (action === 'cancel') {
        const timeDiff = Date.now() - new Date(tx.createdAt).getTime();
        if (timeDiff < 240000) {
            const sisa = Math.ceil((240000 - timeDiff) / 1000);
            return res.status(400).json({ success: false, msg: `Tunggu ${sisa} detik lagi.` });
        }
    }

    try {
        const { result } = await callRumahOTP(`/v1/orders/set_status?order_id=${tx.refId}&status=${action}`);
        
        if (result.success) {
            if (action === 'cancel') {
                // [KUNCI RAHASIA ANTI DOUBLE]
                // Hanya update & refund JIKA status di DB saat ini masih 'waiting'
                // findOneAndUpdate bersifat atomic (sekali jalan)
                const processedTx = await NokosTx.findOneAndUpdate(
                    { _id: tx._id, status: 'waiting' }, 
                    { status: 'canceled' },
                    { new: true }
                );

                if (processedTx) {
                    // Hanya masuk sini 1x seumur hidup order
                    const user = await User.findOne({ username });
                    if(user) { user.balance += tx.price; await user.save(); } // Refund
                    res.json({ success: true, msg: "Sukses Cancel & Refund." });
                } else {
                    res.json({ success: false, msg: "Sudah diproses sebelumnya." });
                }

            } else if (action === 'done') {
                // Lock juga biar ga bisa dicancel setelah done
                const processedTx = await NokosTx.findOneAndUpdate(
                    { _id: tx._id, status: 'waiting' }, 
                    { status: 'success' }
                );
                if(processedTx) res.json({ success: true, msg: "Pesanan Selesai." });
                else res.json({ success: false, msg: "Status sudah berubah." });

            } else if (action === 'resend') {
                res.json({ success: true, msg: "Request Resend dikirim." });
            }
        } else {
            const msg = result.message || (result.data ? result.data.message : "Gagal dari pusat");
            res.json({ success: false, msg: msg });
        }
    } catch(e) { res.status(500).json({ success: false, msg: "Server Error" }); }
});

router.get('/history/:username', async (req, res) => {
    await connectDB();
    const list = await NokosTx.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(list);
});

module.exports = router;