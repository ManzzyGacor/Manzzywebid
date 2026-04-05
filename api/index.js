require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. DATABASE MODELS
// ==========================================
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' }
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
    web_name: { type: String, default: 'Manzzy ID' },
    rumahotp_key: String,
    profit_percent: { type: Number, default: 20 }
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

// ==========================================
// 2. SESSION & AUTH
// ==========================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'manzzy-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const isAdmin = (req, res, next) => {
    if (req.session.userId && req.session.role === 'admin') next();
    else res.status(403).json({ success: false, msg: "Akses ditolak" });
};

// Cek Sesi User (Buat Profil)
app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) return res.json({ login: false });
    try {
        const user = await User.findById(req.session.userId).select('-password');
        res.json({ login: true, user });
    } catch (err) { res.json({ login: false }); }
});

// Auth Submit (Login & Register)
app.post('/api/auth/submit', async (req, res) => {
    try {
        const { username, password, type } = req.body;
        if (type === 'register') {
            const existing = await User.findOne({ username });
            if (existing) return res.json({ success: false, msg: "Username sudah ada" });
            const hash = await bcrypt.hash(password, 10);
            const role = (username.toLowerCase() === 'man') ? 'admin' : 'member';
            const newUser = new User({ username, password: hash, role, balance: 0 });
            await newUser.save();
            return res.json({ success: true });
        } else {
            const user = await User.findOne({ username });
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.json({ success: false, msg: "Username/Password salah" });
            }
            req.session.userId = user._id;
            req.session.role = user.role;
            return res.json({ success: true });
        }
    } catch (err) { res.json({ success: false, msg: "Error Server" }); }
});

// ==========================================
// 3. RUMAHOTP API ROUTES (SESUAI DOCS)
// ==========================================
const R_URL = 'https://www.rumahotp.io/api';

// A. Tampilkan Layanan (Services)
app.get('/api/nokos/services', async (req, res) => {
    try {
        const set = await Setting.findOne();
        const resp = await axios.get(`${R_URL}/v2/services`, {
            headers: { 'x-apikey': set.rumahotp_key, 'Accept': 'application/json' }
        });
        res.json(resp.data);
    } catch (e) { res.status(500).json({ success: false }); }
});

// B. Tampilkan Negara & Price (Countries)
app.get('/api/nokos/countries', async (req, res) => {
    try {
        const set = await Setting.findOne();
        const resp = await axios.get(`${R_URL}/v2/countries?service_id=${req.query.sid}`, {
            headers: { 'x-apikey': set.rumahotp_key, 'Accept': 'application/json' }
        });
        
        // Logic Profit (Misal 10%)
        const dataWithProfit = resp.data.data.map(item => {
            item.pricelist = item.pricelist.map(p => {
                p.price_user = Math.ceil(p.price + (p.price * (set.profit_percent / 100)));
                return p;
            });
            return item;
        });
        res.json({ success: true, data: dataWithProfit });
    } catch (e) { res.status(500).json({ success: false }); }
});
app.get('/api/nokos/operators', async (req, res) => {
    try {
        const { country, provider_id } = req.query;
        const set = await Setting.findOne();
        const resp = await axios.get(`${R_URL}/v2/operators?country=${country}&provider_id=${provider_id}`, {
            headers: { 'x-apikey': set.rumahotp_key }
        });
        res.json(resp.data);
    } catch (e) { res.json({ success: false }); }
});
// C. BELI NOMOR (Sesuai Dokumentasi GET /v2/orders)
// GANTI ROUTE ORDER LO JADI INI
app.post('/api/nokos/order', async (req, res) => {
    console.log("--- ADA REQUEST ORDER BARU ---");
    console.log("Body:", req.body); // Liat di terminal data yang masuk apa aja

    if (!req.session.userId) return res.status(401).json({ success: false, msg: "Auth fail" });
    
    const { number_id, provider_id, operator_id, price, service_name } = req.body;

    try {
        const user = await User.findById(req.session.userId);
        const set = await Setting.findOne();
        const API_KEY = set?.rumahotp_key || process.env.RUMAHOTP_KEY;

        if (user.balance < price) return res.json({ success: false, msg: "Saldo Kurang" });

        // LOG SEBELUM TEMBAK RUMAHOTP
        console.log(`Mencoba Order ke RumahOTP: Number:${number_id}, Prov:${provider_id}, Op:${operator_id}`);

        const resp = await axios.get(`${R_URL}/v2/orders`, {
            params: { 
                number_id: number_id, 
                provider_id: provider_id, 
                operator_id: operator_id 
            },
            headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' }
        });

        console.log("Respon RumahOTP:", resp.data);

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
            res.json({ success: true, data: resp.data.data });
        } else {
            res.json({ success: false, msg: resp.data.message });
        }
    } catch (e) {
        // LOG ERROR DETAIL
        console.error("!!! ERROR ORDER !!!");
        if (e.response) {
            console.error("Data Error:", e.response.data);
            res.status(500).json({ success: false, msg: e.response.data.message || "Error dari Provider" });
        } else {
            console.error("Pesan Error:", e.message);
            res.status(500).json({ success: false, msg: "Koneksi ke Provider Gagal" });
        }
    }
});

// D. CEK STATUS OTP (GET /v1/orders/get_status)
app.get('/api/nokos/status/:orderId', async (req, res) => {
    try {
        const set = await Setting.findOne();
        const resp = await axios.get(`${R_URL}/v1/orders/get_status?order_id=${req.params.orderId}`, {
            headers: { 'x-apikey': set.rumahotp_key, 'Accept': 'application/json' }
        });
        res.json(resp.data);
    } catch (e) { res.json({ success: false }); }
});

// E. BATALKAN PESANAN (GET /v1/orders/set_status)
app.post('/api/nokos/cancel', async (req, res) => {
    try {
        const { order_id } = req.body;
        const set = await Setting.findOne();
        const resp = await axios.get(`${R_URL}/v1/orders/set_status?order_id=${order_id}&status=cancel`, {
            headers: { 'x-apikey': set.rumahotp_key, 'Accept': 'application/json' }
        });
        
        if (resp.data.success) {
            const order = await Order.findOne({ order_id });
            if (order) {
                await User.findByIdAndUpdate(order.userId, { $inc: { balance: order.price } });
                await Order.findOneAndDelete({ order_id });
            }
            res.json({ success: true, msg: "Pesanan dibatalkan, saldo kembali" });
        } else { res.json({ success: false, msg: "Gagal membatalkan di provider" }); }
    } catch (e) { res.json({ success: false, msg: "Koneksi Error" }); }
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

app.listen(process.env.PORT || 3000);