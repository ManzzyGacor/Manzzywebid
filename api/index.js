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
// Update Model User
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' }, // member, reseller, admin
    resellerUntil: { type: Date, default: null } // Tanggal expired reseller
}));


// Model NokosTx (Riwayat Transaksi)
const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
}));

// Update Model Setting (Biar harga upgrade bisa lo atur di Admin)
const Setting = mongoose.models.Setting || mongoose.model('Setting', new mongoose.Schema({
    siteName: { type: String, default: 'Manzzy ID' },
    rumahotp_key: String,
    marginPercent: { type: Number, default: 20 },
    resellerPrice: { type: Number, default: 11000 }, // Harga upgrade
    resellerMargin: { type: Number, default: 8 }    // Margin khusus reseller (12% lebih murah dari 20%)
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
    
    try {
        const user = await User.findById(req.session.userId);
        
        if (user) {
            // Auto-sinkronisasi: Jika role reseller tapi masa aktif sudah habis, turunkan jadi member
            if (user.role === 'reseller' && user.resellerUntil && new Date() > user.resellerUntil) {
                user.role = 'member';
                await user.save();
            }
            res.json({ login: true, user });
        } else {
            res.json({ login: false });
        }
    } catch (e) {
        res.json({ login: false });
    }
});


const nokosRouter = require('./nokos');

// Gunakan prefix /api/nokos
app.use('/api/nokos', nokosRouter);


// =====================================
const adminRouter = require('./adminapi'); // Sesuaikan path-nya
app.use('/api/admin', adminRouter);

const topupRouter = require('./topupapi');
app.use('/api/topup', topupRouter);

app.listen(3000, () => console.log("Server Manzzy ID Ready Port 3000"));