const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // Pastikan sudah npm install axios
const router = express.Router();

// 1. KONEKSI & SCHEMA
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; } 
    catch (err) { console.error("DB Error Nokos:", err); }
};

const NokosConfig = mongoose.models.NokosConfig || mongoose.model('NokosConfig', new mongoose.Schema({
    provider: { type: String, default: 'rumahotp' },
    apiKey: String,
    marginPercent: { type: Number, default: 20 }
}));

// Gunakan Schema User yang sama dengan index.js
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({ 
    username: String, balance: Number 
}));

const NokosTxSchema = new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
});
const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', NokosTxSchema);

// 2. HELPER FUNCTION (AXIOS VERSION)
async function callRumahOTP(endpoint, method = 'GET', data = null) {
    await connectDB();
    const config = await NokosConfig.findOne();
    if (!config || !config.apiKey) throw new Error("API Key Nokos belum disetting!");

    // Auto switch V1/V2
    let baseUrl = `https://www.rumahotp.com/api/v2/${endpoint}`;
    if (endpoint.startsWith('v1/')) {
        baseUrl = `https://www.rumahotp.com/api/${endpoint}`;
    }

    const options = {
        method: method,
        url: baseUrl,
        headers: {
            'x-apikey': config.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        data: data // Axios pakai 'data', bukan 'body'
    };

    try {
        const response = await axios(options);
        return { result: response.data, config };
    } catch (e) {
        // Log Error detail ke Terminal biar ketahuan
        console.error("❌ RUMAH OTP ERROR:", e.response?.data || e.message);
        throw new Error(e.response?.data?.message || "Koneksi Provider Gagal");
    }
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
                    p.price = Math.ceil(p.price + (p.price * margin / 100)); // Markup
                    p.price_format = `Rp${p.price.toLocaleString('id-ID')}`;
                });
            });
        }
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/operators', async (req, res) => {
    try { 
        // Encode URL untuk menangani spasi di nama negara
        const country = encodeURIComponent(req.query.country);
        const { result } = await callRumahOTP(`operators?country=${country}&provider_id=${req.query.provider_id}`); 
        res.json(result); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ORDER NOMOR (BUY)
router.post('/buy', async (req, res) => {
    await connectDB();
    const { username, number_id, provider_id, operator_id, service_name } = req.body;
    
    console.log(`🛒 Order Masuk: ${username} | Service: ${service_name}`); // Debug Log

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User tidak ditemukan" });

        // Tembak Order V2
        const { result, config } = await callRumahOTP(`order?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);

        if (!result.success) {
            console.error("❌ Gagal di Provider:", result);
            return res.status(400).json({ success: false, msg: result.message || "Stok habis / Gangguan pusat." });
        }

        // Hitung Harga Jual
        const originalPrice = result.data.price;
        const margin = config.marginPercent || 0;
        const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));

        if (user.balance < sellingPrice) return res.status(400).json({ success: false, msg: "Saldo akun kamu kurang!" });

        // Potong Saldo & Simpan
        user.balance -= sellingPrice; await user.save();
        const inv = 'NOK-' + Date.now().toString().slice(-6);
        
        await new NokosTx({
            invoiceId: inv, username: user.username, refId: result.data.order_id,
            serviceName: service_name, country: result.data.country, phoneNumber: result.data.phone_number,
            price: sellingPrice, status: 'waiting',
            expiresAt: new Date(Date.now() + (result.data.expires_in_minute * 60000))
        }).save();

        console.log(`✅ Sukses Order: ${inv}`);
        res.json({ success: true, invoiceId: inv });

    } catch (err) { 
        console.error("🔥 CRASH BUY:", err.message); // Cek terminal kalau error lagi
        res.status(500).json({ success: false, msg: err.message || "Server Error" }); 
    }
});

// CEK STATUS & AMBIL SMS (V1)
router.get('/status/:invoiceId', async (req, res) => {
    await connectDB();
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if(!tx) return res.status(404).json({ success: false });

    try {
        const { result } = await callRumahOTP(`v1/orders/get_status?order_id=${tx.refId}`);
        
        if(result.success && result.data) {
            const d = result.data;
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code;
                tx.status = 'success';
                await tx.save();
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

// CANCEL ORDER
router.post('/cancel', async (req, res) => {
    await connectDB();
    const { invoiceId, username } = req.body;
    const tx = await NokosTx.findOne({ invoiceId, username });
    
    if(!tx || tx.status !== 'waiting') return res.status(400).json({ success: false, msg: "Tidak bisa cancel" });

    try {
        const { result } = await callRumahOTP(`v1/orders/set_status?order_id=${tx.refId}&status=canceled`);
        if(result.success) {
            tx.status = 'canceled';
            const user = await User.findOne({ username });
            if(user) { user.balance += tx.price; await user.save(); }
            await tx.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, msg: "Gagal cancel dari pusat" });
        }
    } catch(e) { res.status(500).json({ success: false }); }
});

router.get('/history/:username', async (req, res) => {
    await connectDB();
    const list = await NokosTx.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(list);
});

module.exports = router;