const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const router = express.Router();

// 1. KONEKSI DB
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

    // LOGIKA PATH
    // Jika endpoint dimulai dengan '/', kita pakai path manual (v1/dll)
    // Jika tidak, default masuk ke /api/v2/
    let path = `/api/v2/${endpoint}`;
    if (endpoint.startsWith('/')) path = `/api${endpoint}`;

    const options = {
        hostname: 'www.rumahotp.com',
        path: path,
        method: method,
        headers: {
            'x-apikey': config.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0' // Biar tidak diblokir
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
                    // Debugging: Tampilkan path yg salah jika bukan JSON
                    reject(new Error(`Respon Server Error (HTML). Cek URL: ${path}`));
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

// --- BAGIAN ORDER (FIXED: orders pakai 's') ---
router.post('/buy', async (req, res) => {
    await connectDB();
    const { username, number_id, provider_id, operator_id, service_name } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User error" });

        // FIX: Ubah 'order' jadi 'orders' (Sesuai dokumentasi kamu)
        const { result, config } = await callRumahOTP(`orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);

        if (!result.success) return res.status(400).json({ success: false, msg: result.message || "Gagal order." });

        // Jika sukses, ambil datanya
        // Kadang data ada di result.data, kadang langsung di result (tergantung API)
        const data = result.data || result; 
        
        const originalPrice = data.price;
        const margin = config.marginPercent || 0;
        const sellingPrice = Math.ceil(originalPrice + (originalPrice * margin / 100));

        if (user.balance < sellingPrice) return res.status(400).json({ success: false, msg: "Saldo kurang!" });

        user.balance -= sellingPrice; await user.save();
        const inv = 'NOK-' + Date.now().toString().slice(-6);
        
        await new NokosTx({
            invoiceId: inv, username: user.username, refId: data.order_id,
            serviceName: service_name, country: data.country, phoneNumber: data.phone_number,
            price: sellingPrice, status: 'waiting',
            expiresAt: new Date(Date.now() + (data.expires_in_minute * 60000))
        }).save();

        res.json({ success: true, invoiceId: inv });

    } catch (err) { 
        console.error(err);
        res.status(500).json({ success: false, msg: err.message }); 
    }
});

router.get('/status/:invoiceId', async (req, res) => {
    await connectDB();
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if(!tx) return res.status(404).json({ success: false });

    try {
        // Cek Status pakai V1 (Biasanya v1 lebih stabil utk status)
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