const express = require('express');
const mongoose = require('mongoose');
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

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({ 
    username: String, balance: Number 
}));

const NokosTxSchema = new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, // waiting, success, canceled
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
});
const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', NokosTxSchema);

// 2. HELPER FUNCTION (Support V1 & V2)
async function callRumahOTP(endpoint, method = 'GET', data = null) {
    await connectDB();
    const config = await NokosConfig.findOne();
    if (!config || !config.apiKey) throw new Error("API Key Nokos belum disetting!");

    // Logika Otomatis pilih versi API
    let baseUrl = `https://www.rumahotp.com/api/v2/${endpoint}`;
    if (endpoint.startsWith('v1/')) {
        baseUrl = `https://www.rumahotp.com/api/${endpoint}`;
    }

    const options = {
        method: method,
        headers: {
            'x-apikey': config.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };
    if (data && method !== 'GET') options.body = JSON.stringify(data);

    try {
        const response = await fetch(baseUrl, options);
        const result = await response.json();
        return { result, config };
    } catch (e) { throw new Error("Koneksi Provider Gagal"); }
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
                    p.price = Math.ceil(p.price + (p.price * margin / 100)); // Markup Harga
                    p.price_format = `Rp${p.price.toLocaleString('id-ID')}`;
                });
            });
        }
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/operators', async (req, res) => {
    try { const { result } = await callRumahOTP(`operators?country=${req.query.country}&provider_id=${req.query.provider_id}`); res.json(result); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ORDER NOMOR (BUY)
router.post('/buy', async (req, res) => {
    await connectDB();
    const { username, number_id, provider_id, operator_id, service_name } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User error" });

        // Tembak Order V2
        const { result, config } = await callRumahOTP(`order?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);

        if (!result.success) return res.status(400).json({ success: false, msg: result.message || "Gagal order." });

        // Hitung Harga Jual
        const originalPrice = result.data.price;
        const margin = config.marginPercent || 0;
        const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));

        if (user.balance < sellingPrice) return res.status(400).json({ success: false, msg: "Saldo kurang!" });

        // Potong Saldo & Simpan
        user.balance -= sellingPrice; await user.save();
        const inv = 'NOK-' + Date.now().toString().slice(-6);
        
        await new NokosTx({
            invoiceId: inv, username: user.username, refId: result.data.order_id,
            serviceName: service_name, country: result.data.country, phoneNumber: result.data.phone_number,
            price: sellingPrice, status: 'waiting',
            expiresAt: new Date(Date.now() + (result.data.expires_in_minute * 60000))
        }).save();

        res.json({ success: true, invoiceId: inv });

    } catch (err) { res.status(500).json({ success: false, msg: "Server Error" }); }
});

// CEK STATUS & AMBIL SMS (V1)
router.get('/status/:invoiceId', async (req, res) => {
    await connectDB();
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if(!tx) return res.status(404).json({ success: false });

    try {
        // Tembak API V1
        const { result } = await callRumahOTP(`v1/orders/get_status?order_id=${tx.refId}`);
        
        if(result.success && result.data) {
            const d = result.data;
            // Jika ada SMS Code baru (bukan "-"), simpan!
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code;
                tx.status = 'success';
                await tx.save();
            }
            // Jika status cancel dari pusat, refund user
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                tx.status = 'canceled';
                const user = await User.findOne({ username: tx.username });
                if(user) { user.balance += tx.price; await user.save(); } // Refund
                await tx.save();
            }
        }
        res.json({ success: true, data: tx });
    } catch(e) { res.status(500).json({ success: false }); }
});

// CANCEL ORDER / REFUND MANUAL (V1)
router.post('/cancel', async (req, res) => {
    await connectDB();
    const { invoiceId, username } = req.body;
    const tx = await NokosTx.findOne({ invoiceId, username });
    
    if(!tx || tx.status !== 'waiting') return res.status(400).json({ success: false, msg: "Tidak bisa cancel" });

    try {
        // Request Cancel ke Provider
        const { result } = await callRumahOTP(`v1/orders/set_status?order_id=${tx.refId}&status=canceled`);
        
        if(result.success) {
            tx.status = 'canceled';
            const user = await User.findOne({ username });
            if(user) { user.balance += tx.price; await user.save(); } // Refund
            await tx.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, msg: "Gagal cancel dari pusat" });
        }
    } catch(e) { res.status(500).json({ success: false }); }
});

// HISTORY
router.get('/history/:username', async (req, res) => {
    await connectDB();
    const list = await NokosTx.find({ username: req.params.username }).sort({ createdAt: -1 });
    res.json(list);
});

module.exports = router;

