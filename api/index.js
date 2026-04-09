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
// 1. DATABASE MODELS
// ==========================================

// Model User
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' }
}));

// Model NokosConfig (Untuk Margin & API Key)
const NokosConfig = mongoose.models.NokosConfig || mongoose.model('NokosConfig', new mongoose.Schema({
    apiKey: String,
    marginPercent: { type: Number, default: 20 }
}));

// Model NokosTx (Riwayat Transaksi)
const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
}));

// Model Setting (UNTUK ADMIN KONTROL - WAJIB ADA BIAR GAK ERROR)
const Setting = mongoose.models.Setting || mongoose.model('Setting', new mongoose.Schema({
    siteName: { type: String, default: 'Manzzy ID' },
    rumahotp_key: String,
    marginPercent: { type: Number, default: 20 }
}));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("--- DATABASE CONNECTED ---"));

// ==========================================
// 2. SESSION CONFIG
// ==========================================
app.use(session({
    secret: 'manzzy-galaxy-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 Jam
}));

// ==========================================
// 3. MIDDLEWARE
// ==========================================
const isAdmin = async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ msg: "Akses ditolak!" });
    const user = await User.findById(req.session.userId);
    if (user && user.role === 'admin') next();
    else res.status(403).json({ msg: "Khusus Admin!" });
};

// ==========================================
// 4. HELPER RUMAH OTP
// ==========================================
async function callRumahOTP(endpoint, method = 'GET', data = null) {
    const config = await NokosConfig.findOne();
    if (!config || !config.apiKey) throw new Error("API Key belum disetting!");
    let path = endpoint.startsWith('v1/') ? `/api/${endpoint}` : `/api/v2/${endpoint}`;
    const options = {
        hostname: 'www.rumahotp.io',
        path: path, method: method,
        headers: { 'x-apikey': config.apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' }
    };
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        });
        req.on('error', (e) => reject(e));
        if (data && method !== 'GET') req.write(JSON.stringify(data));
        req.end();
    });
}

// ==========================================
// AUTH ROUTES (Sesuai auth.html lo)
// ==========================================

app.post('/api/auth/submit', async (req, res) => {
    const { username, password, type } = req.body;
    try {
        if (type === 'register') {
            // Cek apakah user sudah ada
            const exist = await User.findOne({ username });
            if (exist) return res.json({ success: false, msg: "Username sudah dipakai!" });

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            // Cek jika username 'man' otomatis jadi admin
            const role = username.toLowerCase() === 'man' ? 'admin' : 'member';
            
            const newUser = new User({ 
                username: username.toLowerCase(), 
                password: hashedPassword, 
                role, 
                balance: 0 
            });
            await newUser.save();
            return res.json({ success: true, msg: "Daftar berhasil!" });
        } else {
            // Login logic
            const user = await User.findOne({ username: username.toLowerCase() });
            if (user && await bcrypt.compare(password, user.password)) {
                req.session.userId = user._id;
                return res.json({ success: true, msg: "Login berhasil!" });
            }
            res.json({ success: false, msg: "Username/Password salah!" });
        }
    } catch (e) { res.status(500).json({ success: false, msg: "Error: " + e.message }); }
});

app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) return res.json({ login: false });
    const user = await User.findById(req.session.userId);
    res.json({ login: true, user });
});

// ==========================================
// NOKOS ROUTES
// ==========================================

app.get('/api/nokos/services', async (req, res) => {
    try { const resData = await callRumahOTP('services'); res.json({ success: true, data: resData.data }); }
    catch (e) { res.json({ success: false }); }
});

app.get('/api/nokos/countries', async (req, res) => {
    try {
        const config = await NokosConfig.findOne();
        const resData = await callRumahOTP(`countries?service_id=${req.query.sid}`);
        if (resData.success) {
            const margin = config.marginPercent || 20;
            resData.data.forEach(c => {
                c.pricelist.forEach(p => { p.price_user = Math.ceil(p.price + (p.price * margin / 100)); });
            });
        }
        res.json(resData);
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/nokos/order', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, msg: "Session expired" });
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
            res.json({ success: true, invoiceId: inv, data: { phone_number: result.data.phone_number } });
        } else { res.json({ success: false, msg: result.message }); }
    } catch (e) { res.json({ success: false, msg: "Gagal Order" }); }
});

app.get('/api/nokos/status/:invoiceId', async (req, res) => {
    const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
    if (!tx) return res.json({ success: false });

    // Auto-Expire & Auto-Refund Logic
    if (tx.status === 'waiting' && new Date() > tx.expiresAt) {
        if (tx.smsCode && tx.smsCode.length > 2) { tx.status = 'success'; await tx.save(); }
        else {
            tx.status = 'canceled'; await tx.save();
            await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
        }
    }

    try {
        const result = await callRumahOTP(`v1/orders/get_status?order_id=${tx.refId}`);
        if (result.success) {
            const d = result.data;
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) { tx.smsCode = d.otp_code; await tx.save(); }
            if (d.status === 'completed') { tx.status = 'success'; await tx.save(); }
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                tx.status = 'canceled'; await tx.save();
                await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            }
        }
        res.json({ success: true, data: tx });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/nokos/cancel', async (req, res) => {
    const tx = await NokosTx.findOne({ invoiceId: req.body.order_id });
    if (!tx || tx.status !== 'waiting') return res.json({ success: false });
    try {
        const result = await callRumahOTP(`v1/orders/set_status?order_id=${tx.refId}&status=cancel`);
        if (result.success) {
            tx.status = 'canceled'; await tx.save();
            await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            res.json({ success: true });
        } else { res.json({ success: false, msg: result.message }); }
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/nokos/history', async (req, res) => {
    if(!req.session.userId) return res.json({success:false});
    const user = await User.findById(req.session.userId);
    const list = await NokosTx.find({ username: user.username }).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
});



// =====================================
// ADMIN KONTROL

// UPDATE: Ambil Semua Setting (Fixing Model Setting)
app.get('/api/admin/settings', isAdmin, async (req, res) => {
    let set = await Setting.findOne();
    if (!set) set = await Setting.create({});
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