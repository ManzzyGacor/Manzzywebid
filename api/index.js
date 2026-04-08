require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const https = require('https');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. DATABASE MODELS (SINKRON DENGAN KODE LO)
// ==========================================
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' }
}));

const NokosConfig = mongoose.model('NokosConfig', new mongoose.Schema({
    provider: { type: String, default: 'rumahotp' },
    apiKey: String,
    marginPercent: { type: Number, default: 20 }
}));

const NokosTx = mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, 
    username: String, 
    refId: String, // order_id dari pusat
    serviceName: String, 
    country: String, 
    phoneNumber: String,
    price: Number, 
    status: { type: String, default: 'waiting' }, 
    smsCode: String, 
    expiresAt: Date, 
    createdAt: { type: Date, default: Date.now }
}));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("--- MANZZY SYSTEM READY ---"));
// cek admin
// Middleware untuk cek apakah user adalah Admin
const isAdmin = async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ msg: "Login dulu bos!" });
    
    try {
        const user = await User.findById(req.session.userId);
        if (user && user.role === 'admin') {
            next(); // Lanjut ke proses berikutnya
        } else {
            res.status(403).json({ msg: "Lu bukan admin, dilarang masuk!" });
        }
    } catch (e) {
        res.status(500).json({ msg: "Error pengecekan admin" });
    }
};
// ==========================================
// 2. HELPER REQUEST (SESUAI LOGIKA LO)
// ==========================================
async function callRumahOTP(endpoint, method = 'GET', data = null) {
    const config = await NokosConfig.findOne();
    if (!config || !config.apiKey) throw new Error("API Key belum disetting!");

    let path = endpoint.startsWith('/') ? `/api${endpoint}` : 
               endpoint.startsWith('v1/') ? `/api/${endpoint}` : `/api/v2/${endpoint}`;

    const options = {
        hostname: 'www.rumahotp.io',
        path: path,
        method: method,
        headers: {
            'x-apikey': config.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } 
                catch (e) { reject(new Error("API Response Error")); }
            });
        });
        req.on('error', (e) => reject(e));
        if (data && method !== 'GET') req.write(JSON.stringify(data));
        req.end();
    });
}

// ==========================================
// 3. AUTH & SESSION
// ==========================================
app.use(session({
    secret: 'manzzy-secret',
    resave: false,
    saveUninitialized: false
}));

app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) return res.json({ login: false });
    const user = await User.findById(req.session.userId);
    res.json({ login: true, user });
});

// ==========================================
// 4. NOKOS ROUTES (SINKRON DENGAN nokos.js)
// ==========================================

// Get Services
app.get('/api/nokos/services', async (req, res) => {
    try { const result = await callRumahOTP('services'); res.json({ success: true, data: result.data }); }
    catch (e) { res.status(500).json({ success: false }); }
});

// Get Countries + Profit Otomatis
app.get('/api/nokos/countries', async (req, res) => {
    try {
        const config = await NokosConfig.findOne();
        const result = await callRumahOTP(`countries?service_id=${req.query.sid}`);
        if (result.success) {
            const margin = config.marginPercent || 20;
            result.data.forEach(c => {
                c.pricelist.forEach(p => {
                    p.price_user = Math.ceil(p.price + (p.price * margin / 100));
                });
            });
        }
        res.json(result);
    } catch (e) { res.json({ success: false }); }
});

// Get Operators
app.get('/api/nokos/operators', async (req, res) => {
    try {
        const result = await callRumahOTP(`operators?country=${req.query.country}&provider_id=${req.query.provider_id}`);
        res.json(result);
    } catch (e) { res.json({ success: false }); }
});

// BUY (LOGIKA TRANSACTIONAL)
app.post('/api/nokos/order', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, msg: "Login dulu!" });
    
    const { number_id, provider_id, operator_id, price, service_name } = req.body;
    const user = await User.findById(req.session.userId);

    if (user.balance < price) return res.json({ success: false, msg: "Saldo Kurang" });

    try {
        const result = await callRumahOTP(`orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);
        
        if (result.success) {
            user.balance -= price;
            await user.save();

            const inv = 'NOK-' + Date.now().toString().slice(-6);
            const tx = new NokosTx({
                invoiceId: inv,
                username: user.username,
                refId: result.data.order_id,
                serviceName: service_name,
                country: result.data.country,
                phoneNumber: result.data.phone_number,
                price: price,
                expiresAt: new Date(Date.now() + 20 * 60000) // Default 20 menit
            });
            await tx.save();
            res.json({ success: true, data: { order_id: inv, phone_number: result.data.phone_number } });
        } else {
            res.json({ success: false, msg: result.message });
        }
    } catch (e) { res.json({ success: false, msg: "Gagal Order" }); }
});

// POLLING STATUS (DENGAN LOGIKA AUTO-REFUND & AUTO-SUCCESS LO)
app.get('/api/nokos/status/:invoiceId', async (req, res) => {
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if (!tx) return res.json({ success: false });

    // Cek Expired
    if (tx.status === 'waiting' && new Date() > tx.expiresAt) {
        if (tx.smsCode && tx.smsCode.length > 2) {
            tx.status = 'success'; await tx.save();
            return res.json({ success: true, data: tx, msg: "Auto-Complete" });
        } else {
            tx.status = 'canceled'; await tx.save();
            await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            return res.json({ success: true, data: tx, msg: "Auto-Refund" });
        }
    }

    try {
        const result = await callRumahOTP(`/v1/orders/get_status?order_id=${tx.refId}`);
        if (result.success) {
            const d = result.data;
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code; await tx.save();
            }
            if (d.status === 'completed') { tx.status = 'success'; await tx.save(); }
            if (d.status === 'canceled') {
                tx.status = 'canceled'; await tx.save();
                await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            }
        }
        res.json({ success: true, data: tx });
    } catch (e) { res.json({ success: false }); }
});

// ACTION (CANCEL/DONE)
app.post('/api/nokos/cancel', async (req, res) => {
    const tx = await NokosTx.findOne({ invoiceId: req.body.order_id });
    if (!tx || tx.status !== 'waiting') return res.json({ success: false });

    try {
        const result = await callRumahOTP(`/v1/orders/set_status?order_id=${tx.refId}&status=cancel`);
        if (result.success) {
            tx.status = 'canceled'; await tx.save();
            await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            res.json({ success: true, msg: "Dibatalkan & Refund." });
        } else { res.json({ success: false, msg: result.message }); }
    } catch (e) { res.json({ success: false }); }
});

// Ambil Riwayat Transaksi Nokos User
app.get('/api/nokos/history', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false });
        
        const user = await User.findById(req.session.userId);
        // Cari di koleksi NokosTx, urutkan dari yang terbaru (descending)
        const history = await NokosTx.find({ username: user.username }).sort({ createdAt: -1 });
        
        res.json({ success: true, data: history });
    } catch (e) {
        res.status(500).json({ success: false, msg: "Gagal memuat riwayat" });
    }
});
// =====================================
// ADMIN KONTROL

// 4. ENDPOINT KONTROL ADMIN
// Ambil Semua Setting
app.get('/api/admin/settings', isAdmin, async (req, res) => {
    const set = await Setting.findOne() || await Setting.create({});
    res.json(set);
});

// Update Setting (Nama Web, Profit, API Key)
app.post('/api/admin/settings/update', isAdmin, async (req, res) => {
    await Setting.updateOne({}, req.body);
    res.json({ success: true });
});

// Cari User berdasarkan Username
app.get('/api/admin/users/search', isAdmin, async (req, res) => {
    const user = await User.findOne({ username: req.query.username });
    if (!user) return res.json({ success: false });
    res.json({ success: true, user });
});

// Edit Saldo (Tambah/Kurang)
app.post('/api/admin/users/balance', isAdmin, async (req, res) => {
    const { userId, amount } = req.body; // amount bisa + atau -
    await User.findByIdAndUpdate(userId, { $inc: { balance: amount } });
    res.json({ success: true });
});

// Jadikan Admin / Hapus User
app.post('/api/admin/users/action', isAdmin, async (req, res) => {
    const { userId, action } = req.body;
    if (action === 'make_admin') await User.findByIdAndUpdate(userId, { role: 'admin' });
    if (action === 'delete') await User.findByIdAndDelete(userId);
    res.json({ success: true });
});

app.listen(3000, () => console.log("Server Manzzy ID Ready Port 3000"));