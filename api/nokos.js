const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const router = express.Router();

// 1. KONEKSI & SCHEMA
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

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({ 
    username: String, balance: Number 
}));

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

    // Auto Path V1/V2
    let path = `/api/v2/${endpoint}`;
    if (endpoint.startsWith('/')) path = `/api${endpoint}`; // Manual path

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
                    console.error("HTML Error Body:", body); // Debug log
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

// --- SAFE ORDER FLOW ---
router.post('/buy', async (req, res) => {
    await connectDB();
    const { username, number_id, provider_id, operator_id, service_name, service_id } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User error" });

        // 1. CEK HARGA & VALIDASI SALDO USER DULU (Sebelum Beli)
        // Kita panggil endpoint countries untuk dapat harga real-time
        const { result: priceRes, config } = await callRumahOTP(`countries?service_id=${service_id}`);
        
        let originalPrice = 0;
        let found = false;

        // Cari harga produk yg sesuai
        if (priceRes.success && priceRes.data) {
            // Loop negara
            for (let c of priceRes.data) {
                if (String(c.number_id) === String(number_id)) {
                    // Ketemu negaranya, ambil harga provider
                    const p = c.pricelist.find(x => String(x.provider_id) === String(provider_id));
                    if (p) {
                        originalPrice = p.price;
                        found = true;
                        break;
                    }
                }
            }
        }

        if (!found) return res.status(400).json({ success: false, msg: "Gagal cek harga. Coba refresh." });

        const margin = config.marginPercent || 0;
        const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));

        // Cek Saldo User
        if (user.balance < sellingPrice) {
            return res.status(400).json({ success: false, msg: `Saldo kurang! Butuh Rp${sellingPrice.toLocaleString()}` });
        }

        // 2. EKSEKUSI ORDER KE RUMAHOTP (Endpoint: orders)
        // PENTING: Jika saldo RumahOTP habis, error akan muncul di sini
        const { result } = await callRumahOTP(`orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);

        if (!result.success) {
            // Tampilkan pesan error ASLI dari RumahOTP (misal: "Insufficient balance")
            const errorMsg = result.message || (result.data ? JSON.stringify(result.data) : "Gagal dari pusat.");
            console.error("❌ Gagal Order:", errorMsg);
            return res.status(400).json({ success: false, msg: "Pusat: " + errorMsg });
        }

        // 3. POTONG SALDO & SIMPAN
        // Data sukses biasanya ada di result.data atau result langsung
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

    } catch (err) { 
        console.error("🔥 Crash Buy:", err);
        res.status(500).json({ success: false, msg: "Error: " + err.message }); 
    }
});

router.get('/status/:invoiceId', async (req, res) => {
    await connectDB();
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if(!tx) return res.status(404).json({ success: false });

    try {
        const { result } = await callRumahOTP(`/v1/orders/get_status?order_id=${tx.refId}`);
        if(result.success && result.data) {
            const d = result.data;
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code; tx.status = 'success'; await tx.save();
            }
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                tx.status = 'canceled';
                const user = await User.findOne({ username: tx.username });
                if(user) { user.balance += tx.price; await user.save(); }
                await tx.save();
            }
        }
        res.json({ success: true, data: tx });
    } catch(e) { res.status(500).json({ success: false }); }
});

router.post('/cancel', async (req, res) => {
    await connectDB();
    const { invoiceId, username } = req.body;
    const tx = await NokosTx.findOne({ invoiceId, username });
    if(!tx || tx.status !== 'waiting') return res.status(400).json({ success: false, msg: "Gagal" });

    try {
        const { result } = await callRumahOTP(`/v1/orders/set_status?order_id=${tx.refId}&status=canceled`);
        if(result.success) {
            tx.status = 'canceled';
            const user = await User.findOne({ username });
            if(user) { user.balance += tx.price; await user.save(); }
            await tx.save();
            res.json({ success: true });
        } else { res.json({ success: false, msg: "Gagal" }); }
    } catch(e) { res.status(500).json({ success: false }); }
});

router.get('/history/:username', async (req, res) => {
    await connectDB();
    const list = await NokosTx.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(list);
});

module.exports = router;