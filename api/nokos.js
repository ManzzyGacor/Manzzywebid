const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const router = express.Router();

// ==========================================
// 1. MODELS (Mastiin gak bentrok sama index.js)
// ==========================================
const Setting = mongoose.models.Setting || mongoose.model('Setting', new mongoose.Schema({
    siteName: { type: String, default: 'Manzzy ID' },
    rumahotp_key: String,
    marginPercent: { type: Number, default: 20 }
}));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    username: String,
    balance: { type: Number, default: 0 }
}));

const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// 2. HELPER REQUEST (SESUAI SPEK V1/V2 LO)
// ==========================================
async function callRumahOTP(endpoint, method = 'GET', data = null) {
    // Ambil data dari koleksi settings
    const config = await Setting.findOne(); 
    
    // Cek apakah data setting ada dan key-nya sudah diisi
    if (!config || !config.rumahotp_key) {
        throw new Error("API Key RumahOTP belum disetting di Dashboard Admin!");
    }

    let path = endpoint.startsWith('v1/') ? `/api/${endpoint}` : `/api/v2/${endpoint}`;
    if (!endpoint.includes('/')) path = `/api/v2/${endpoint}`;

    const options = {
        hostname: 'www.rumahotp.io',
        path: path,
        method: method,
        headers: {
            'x-apikey': config.rumahotp_key, // Field disesuaikan dengan Dashboard lo
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } 
                catch (e) { reject(new Error("Response Error")); }
            });
        });
        req.on('error', (e) => reject(e));
        if (data && method !== 'GET') req.write(JSON.stringify(data));
        req.end();
    });
}

// ==========================================
// 3. ROUTES NOKOS
// ==========================================

// Ambil Layanan (v2)
router.get('/services', async (req, res) => {
    try {
        const result = await callRumahOTP('services');
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

// Ambil Negara & Harga (v2)
router.get('/countries', async (req, res) => {
    try {
        // 1. Ambil 'sid' sesuai kiriman dari nokos.js (Frontend)
        const { sid } = req.query; 

        if (!sid) return res.json({ success: false, msg: "Service ID tidak ditemukan" });

        // 2. Ambil Setting untuk margin
        const config = await Setting.findOne();
        const margin = config ? config.marginPercent : 20;

        // 3. Tembak ke RumahOTP v2/countries
        // Pakai helper callRumahOTP yang lo punya
        const resData = await callRumahOTP(`v2/countries?service_id=${sid}`);
        
        if (resData && resData.success) {
            // 4. Mapping harganya biar Frontend lo bisa baca p.price_user
            resData.data.forEach(country => {
                if (country.pricelist) {
                    country.pricelist.forEach(p => {
                        // Itung harga jual = harga pusat + margin
                        p.price_user = Math.ceil(p.price + (p.price * margin / 100));
                        // Tambahin price_format biar keren di tampilan
                        p.price_format = `Rp ${p.price_user.toLocaleString('id-ID')}`;
                    });
                }
            });
            return res.json(resData);
        } else {
            return res.json({ success: false, msg: resData.message || "Gagal ambil negara" });
        }
    } catch (e) {
        console.error("ERROR COUNTRIES:", e.message);
        res.status(500).json({ success: false, msg: e.message });
    }
});

// Ambil Operator (v2)
router.get('/operators', async (req, res) => {
    try {
        const result = await callRumahOTP(`operators?country=${req.query.country}&provider_id=${req.query.provider_id}`);
        res.json(result);
    } catch (e) { res.status(500).json({ success: false }); }
});

// Beli Nomor (v2)
router.post('/order', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, msg: "Session habis" });
    const { number_id, provider_id, operator_id, price, service_name } = req.body;
    
    try {
        const user = await User.findById(req.session.userId);
        if (user.balance < price) return res.json({ success: false, msg: "Saldo kurang" });

        const result = await callRumahOTP(`orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);
        
        if (result.success) {
            user.balance -= price; await user.save();
            const inv = 'NOK-' + Date.now().toString().slice(-6);
            await new NokosTx({
                invoiceId: inv, username: user.username, refId: result.data.order_id,
                serviceName: service_name, country: result.data.country, phoneNumber: result.data.phone_number,
                price: price, expiresAt: new Date(Date.now() + 20 * 60000)
            }).save();
            res.json({ success: true, invoiceId: inv, data: result.data });
        } else { res.json({ success: false, msg: result.message }); }
    } catch (e) { res.json({ success: false, msg: "Error Sistem" }); }
});

// Cek Status (v1)
router.get('/status/:invoiceId', async (req, res) => {
    try {
        const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
        if (!tx) return res.json({ success: false });

        const result = await callRumahOTP(`v1/orders/get_status?order_id=${tx.refId}`);
        if (result.success) {
            const d = result.data;
            if (d.otp_code) tx.smsCode = d.otp_code;
            if (d.status === 'completed') tx.status = 'success';
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                tx.status = 'canceled';
                await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            }
            await tx.save();
        }
        res.json({ success: true, data: tx });
    } catch (e) { res.json({ success: false }); }
});

// Action (v1)
router.post('/cancel', async (req, res) => {
    const tx = await NokosTx.findOne({ invoiceId: req.body.order_id });
    if (!tx || tx.status !== 'waiting') return res.json({ success: false });
    try {
        const result = await callRumahOTP(`v1/orders/set_status?order_id=${tx.refId}&status=cancel`);
        if (result.success) {
            tx.status = 'canceled'; await tx.save();
            await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            res.json({ success: true });
        } else { res.json({ success: false }); }
    } catch (e) { res.json({ success: false }); }
});

router.get('/history', async (req, res) => {
    if(!req.session.userId) return res.json({success:false});
    const user = await User.findById(req.session.userId);
    const list = await NokosTx.find({ username: user.username }).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
});

module.exports = router;