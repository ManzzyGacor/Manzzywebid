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

// [FIX 1] CEK STATUS & LOGIKA EXPIRED YANG BENAR
router.get('/status/:invoiceId', async (req, res) => {
    await connectDB();
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if(!tx) return res.status(404).json({ success: false });

    // === LOGIKA BARU EXPIRED CHECK ===
    if (tx.status === 'waiting' && new Date() > new Date(tx.expiresAt)) {
        
        // KASUS A: Waktu Habis TAPI SMS SUDAH ADA
        // (User lupa klik selesai, jangan direfund!)
        if (tx.smsCode && tx.smsCode !== '-' && tx.smsCode.length > 2) {
            const autoSuccess = await NokosTx.findOneAndUpdate(
                { _id: tx._id, status: 'waiting' },
                { status: 'success' }, // Paksa SUKSES
                { new: true }
            );
            if(autoSuccess) {
                return res.json({ success: true, data: autoSuccess, msg: "Waktu habis, Auto-Complete." });
            }
        } 
        
        // KASUS B: Waktu Habis DAN SMS BELUM ADA
        // (Murni gagal, silahkan refund)
        else {
            const expiredTx = await NokosTx.findOneAndUpdate(
                { _id: tx._id, status: 'waiting' },
                { status: 'canceled' },
                { new: true }
            );
            if (expiredTx) {
                const user = await User.findOne({ username: tx.username });
                if(user) { user.balance += tx.price; await user.save(); }
                return res.json({ success: true, data: expiredTx, msg: "Waktu habis. Refund sukses." });
            }
        }
    }

    try {
        const { result } = await callRumahOTP(`/v1/orders/get_status?order_id=${tx.refId}`);
        if(result.success && result.data) {
            const d = result.data;
            
            // Simpan Kode SMS jika ada, tapi biarkan status waiting (menunggu user/expired)
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code; 
                await tx.save();
            }

            // Jika Pusat Cancel Murni
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
        
        const freshData = await NokosTx.findById(tx._id);
        res.json({ success: true, data: freshData });
    } catch(e) { res.status(500).json({ success: false }); }
});

// [FIX 2] ACTION (CANCEL/DONE/RESEND)
router.post('/action', async (req, res) => {
    await connectDB();
    const { invoiceId, username, action } = req.body;
    
    const tx = await NokosTx.findOne({ invoiceId, username });
    if(!tx) return res.status(404).json({ success: false, msg: "Order not found" });

    if (tx.status !== 'waiting') return res.status(400).json({ success: false, msg: "Transaksi selesai/batal." });

    if (action === 'cancel') {
        // [TAMBAHAN] Cek apakah SMS sudah ada? Kalau sudah ada, jangan kasih cancel manual!
        if (tx.smsCode && tx.smsCode !== '-') {
            return res.status(400).json({ success: false, msg: "SMS sudah masuk! Tidak bisa cancel, silakan klik Selesai/Resend." });
        }

        const timeDiff = Date.now() - new Date(tx.createdAt).getTime();
        if (timeDiff < 240000) return res.status(400).json({ success: false, msg: "Harap tunggu 4 menit sebelum cancel." });
    }

    try {
        const { result } = await callRumahOTP(`/v1/orders/set_status?order_id=${tx.refId}&status=${action}`);
        
        if (result.success || result.data) {
            if (action === 'cancel') {
                const processedTx = await NokosTx.findOneAndUpdate(
                    { _id: tx._id, status: 'waiting' }, 
                    { status: 'canceled' }, { new: true }
                );
                if (processedTx) {
                    const user = await User.findOne({ username });
                    if(user) { user.balance += tx.price; await user.save(); }
                    res.json({ success: true, msg: "Sukses Refund." });
                } else {
                    res.json({ success: false, msg: "Gagal/Sudah diproses." });
                }

            } else if (action === 'done') {
                const processedTx = await NokosTx.findOneAndUpdate(
                    { _id: tx._id, status: 'waiting' }, 
                    { status: 'success' }
                );
                if(processedTx) res.json({ success: true, msg: "Pesanan Selesai." });
                else res.json({ success: false, msg: "Gagal update." });

            } else if (action === 'resend') {
                res.json({ success: true, msg: "Request Resend..." });
            }
        } else {
            res.json({ success: false, msg: "Gagal dari pusat" });
        }
    } catch(e) { res.status(500).json({ success: false, msg: "Server Error" }); }
});

router.get('/history/:username', async (req, res) => {
    await connectDB();
    const list = await NokosTx.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(list);
});
// ... (Kode sebelumnya)

// ==========================================
// [BARU] STATISTIK PROFIT NOKOS (ADMIN)
// ==========================================
router.get('/admin/stats', async (req, res) => {
    try {
        await connectDB();
        
        // 1. Ambil Config untuk tau Margin saat ini
        const config = await NokosConfig.findOne();
        const margin = config ? config.marginPercent : 20; // Default 20% kalo gak ada setting

        // 2. Ambil Semua Transaksi SUKSES
        const txs = await NokosTx.find({ status: 'success' });

        let omsetKotor = 0;
        let untungBersih = 0;

        txs.forEach(tx => {
            const hargaJual = tx.price;
            omsetKotor += hargaJual;

            // Hitung Modal Asli (Reverse Calculation)
            // Rumus: Harga Jual = Modal + (Modal * Margin%)
            // Maka:  Modal = Harga Jual / (1 + Margin/100)
            const modalAsli = hargaJual / (1 + (margin / 100));
            
            // Profit = Harga Jual - Modal
            untungBersih += (hargaJual - modalAsli);
        });

        res.json({
            success: true,
            total_trx: txs.length,
            omset: Math.floor(omsetKotor),
            profit: Math.floor(untungBersih),
            margin_used: margin
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Gagal hitung profit" });
    }
});

module.exports = router; 