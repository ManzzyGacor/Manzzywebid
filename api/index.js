require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// 1. DATABASE MODELS (Langsung di sini)
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' }
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order_id: String,
    phone_number: String,
    service: String,
    price: Number,
    status: { type: String, default: 'received' },
    otp_code: { type: String, default: null },
    expired_at: Number
}));

mongoose.connect(process.env.MONGO_URI).then(() => console.log("Manzzy DB Ready"));

// 2. SESSION
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// 3. API RUMAHOTP CONFIG
const R_URL = 'https://www.rumahotp.io/api';
const R_KEY = process.env.RUMAHOTP_KEY;
const headers = { 'x-apikey': R_KEY, 'Accept': 'application/json' };

// --- ENDPOINTS ---

// Auth: Login & Me
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        res.json({ success: true, user });
    } else { res.status(401).json({ success: false }); }
});

app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) return res.json({ login: false });
    const user = await User.findById(req.session.userId);
    res.json({ login: true, user });
});

// Nokos: Get Services & Countries
app.get('/api/nokos/services', async (req, res) => {
    const resp = await axios.get(`${R_URL}/v2/services`, { headers });
    res.json(resp.data);
});

app.get('/api/nokos/countries', async (req, res) => {
    const resp = await axios.get(`${R_URL}/v2/countries?service_id=${req.query.sid}`, { headers });
    res.json(resp.data);
});

// Order: Beli Nomor
app.post('/api/nokos/order', async (req, res) => {
    if (!req.session.userId) return res.status(401).send("Auth fail");
    const { number_id, provider_id, operator_id, price, service_name } = req.body;

    const user = await User.findById(req.session.userId);
    if (user.balance < price) return res.json({ success: false, msg: "Saldo Kurang" });

    try {
        const resp = await axios.get(`${R_URL}/v2/orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`, { headers });
        if (resp.data.success) {
            user.balance -= price;
            await user.save();
            
            const newOrder = new Order({
                userId: user._id,
                order_id: resp.data.data.order_id,
                phone_number: resp.data.data.phone_number,
                service: service_name,
                price: price,
                expired_at: resp.data.data.expired_at
            });
            await newOrder.save();
            res.json(resp.data);
        } else { res.json(resp.data); }
    } catch (e) { res.status(500).send("Error"); }
});

// Status: Cek OTP
app.get('/api/nokos/status/:oid', async (req, res) => {
    const resp = await axios.get(`${R_URL}/v1/orders/get_status?order_id=${req.params.oid}`, { headers });
    if (resp.data.success && resp.data.data.otp_code) {
        await Order.findOneAndUpdate({ order_id: req.params.oid }, { otp_code: resp.data.data.otp_code, status: 'completed' });
    }
    res.json(resp.data);
});

// Endpoint Batalkan Pesanan & Refund Saldo
app.post('/api/nokos/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, msg: "Auth fail" });
    
    const { order_id } = req.body;
    const order = await Order.findOne({ order_id: order_id, userId: req.session.userId });

    if (!order) return res.json({ success: false, msg: "Pesanan tidak ditemukan" });
    if (order.status !== 'received') return res.json({ success: false, msg: "Pesanan sudah selesai/batal" });

    try {
        // 1. Panggil API RumahOTP untuk batalkan
        const resp = await axios.get(`${R_URL}/v1/orders/set_status?order_id=${order_id}&status=cancel`, { headers });

        if (resp.data.success) {
            // 2. Update Status di DB kita
            order.status = 'canceled';
            await order.save();

            // 3. REFUND Saldo ke User
            await User.findByIdAndUpdate(req.session.userId, { $inc: { balance: order.price } });

            res.json({ success: true, msg: "Pesanan dibatalkan & Saldo dikembalikan!" });
        } else {
            res.json({ success: false, msg: "Gagal membatalkan di server pusat" });
        }
    } catch (e) {
        res.status(500).json({ success: false, msg: "Koneksi Error" });
    }
});
// ADMIN KONTROL
// Tambahkan di dalam api/index.js (Satu file saja)

// 1. MODEL SETTING (Untuk Admin Kontrol)
const Setting = mongoose.model('Setting', new mongoose.Schema({
    web_name: { type: String, default: 'MANZZY ID' },
    profit_percent: { type: Number, default: 10 }, // 10% profit
    rumahotp_key: { type: String, default: '' }
}));

// 2. LOGIC LOGIN & REGISTER (Jadi Satu)
app.post('/api/auth/submit', async (req, res) => {
    const { username, password, type } = req.body; // type: 'login' atau 'register'
    
    if (type === 'register') {
        const check = await User.findOne({ username });
        if (check) return res.json({ success: false, msg: "Username sudah ada!" });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const role = (username.toLowerCase() === 'man') ? 'admin' : 'member';
        const newUser = new User({ username, password: hashedPassword, role });
        await newUser.save();
        return res.json({ success: true, msg: "Daftar Berhasil!" });
    } else {
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.role = user.role;
            return res.json({ success: true, user });
        }
        res.json({ success: false, msg: "Login Gagal!" });
    }
});

// 3. ADMIN MIDDLEWARE (Pagar Keamanan)
const isAdmin = (req, res, next) => {
    if (req.session.role === 'admin') next();
    else res.status(403).json({ msg: "Akses Ditolak!" });
};

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

// 5. HARGA OTOMATIS + PROFIT %
app.get('/api/nokos/countries', async (req, res) => {
    const set = await Setting.findOne();
    const resp = await axios.get(`${R_URL}/v2/countries?service_id=${req.query.sid}`, { headers: { 'x-apikey': set.rumahotp_key } });
    
    // Tambahkan profit ke setiap item
    const dataWithProfit = resp.data.data.map(item => {
        const originalPrice = item.pricelist[0].price;
        item.price_user = Math.ceil(originalPrice + (originalPrice * set.profit_percent / 100));
        return item;
    });
    
    res.json({ success: true, data: dataWithProfit });
});
app.listen(process.env.PORT || 3000);