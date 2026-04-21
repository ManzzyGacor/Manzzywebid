require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const https = require('https');
const axios = require('axios');


const app = express();

// ==========================================
// FITUR AUTO MAINTENANCE (23:00 - 01:00 WIB)
// ==========================================
app.use((req, res, next) => {
    // Ambil jam server saat ini secara spesifik di zona waktu WIB (Jakarta)
    // Biar gak error walaupun jam VPS lo pake zona waktu luar negeri
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        hour: 'numeric',
        hour12: false
    });
    const jamWIB = parseInt(formatter.format(new Date()), 10);

    // Cek apakah jam menunjukkan pukul 23 atau 00
    if (jamWIB === 23 || jamWIB === 0) {
        
        // Kalau request-nya dari fetch API di background (biar ga error json parsing)
        if (req.path.startsWith('/api')) {
            return res.json({ success: false, msg: "Sistem sedang maintenance rutin (23.00 - 01.00 WIB)." });
        }
        
        // Kalau user buka web dari browser, tampilkan halaman maintenance keren
        return res.status(503).send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Maintenance - Manzzy ID</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;500;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Space Grotesk', sans-serif; background: #050505; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .galaxy-card { background: linear-gradient(145deg, #111114, #09090b); border: 1px solid rgba(139, 92, 246, 0.2); }
                </style>
            </head>
            <body>
                <div class="galaxy-card p-10 rounded-3xl text-center max-w-md w-full mx-4 shadow-2xl shadow-purple-900/20">
                    <div class="w-16 h-16 bg-purple-500/20 text-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl animate-pulse">
                        <i class="fa-solid fa-screwdriver-wrench"></i> 🛠️
                    </div>
                    <h2 class="text-2xl font-bold mb-2 tracking-widest text-white">SERVER MAINTENANCE</h2>
                    <p class="text-gray-400 text-sm mb-6 leading-relaxed">Sistem Manzzy ID sedang dalam perawatan rutin harian untuk menjaga performa server tetap maksimal.</p>
                    <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                        <p class="text-xs text-gray-500 uppercase tracking-widest mb-1">Jadwal Maintenance:</p>
                        <p class="text-lg font-mono text-purple-400 font-bold">23:00 - 01:00 WIB</p>
                    </div>
                    <p class="text-[10px] text-gray-600 mt-6">Silakan kembali lagi setelah jam 01:00 WIB.</p>
                </div>
            </body>
            </html>
        `);
    }
    
    // Kalau bukan jam maintenance, izinkan user masuk ke web seperti biasa
    next();
});
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
app.set('trust proxy', 1); 

app.use(session({
    secret: 'manzzy-galaxy-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 Jam
        secure: false // Pastikan ini false dulu biar bisa jalan di HTTP & HTTPS
    } 
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