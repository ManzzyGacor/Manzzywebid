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
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        hour: 'numeric',
        hour12: false
    });
    const jamWIB = parseInt(formatter.format(new Date()), 10);

    if (jamWIB === 23 || jamWIB === 0) {
        if (req.path.startsWith('/api')) {
            return res.json({ success: false, msg: "Sistem sedang maintenance rutin (23.00 - 01.00 WIB)." });
        }
        
        return res.status(503).send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Maintenance - Manzzy ID</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;500;700&display=swap" rel="stylesheet">
                <style>
                    body { 
                        font-family: 'Space Grotesk', sans-serif; 
                        background: #050505; 
                        overflow: hidden;
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        height: 100vh; 
                        margin: 0; 
                    }
                    
                    /* Animasi Background Galaxy */
                    .bg-glow {
                        position: absolute;
                        width: 500px;
                        height: 500px;
                        background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(0,0,0,0) 70%);
                        border-radius: 50%;
                        filter: blur(80px);
                        z-index: -1;
                        animation: moveGlow 15s infinite alternate ease-in-out;
                    }

                    @keyframes moveGlow {
                        0% { transform: translate(-20%, -20%); }
                        100% { transform: translate(20%, 20%); }
                    }

                    /* Card Floating Effect */
                    .galaxy-card { 
                        background: rgba(15, 15, 20, 0.8);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(139, 92, 246, 0.3); 
                        box-shadow: 0 0 40px rgba(139, 92, 246, 0.1);
                        animation: float 6s infinite ease-in-out;
                    }

                    @keyframes float {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-20px); }
                    }

                    .gear-spin {
                        animation: spin 4s infinite linear;
                    }

                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }

                    .shimmer {
                        position: relative;
                        overflow: hidden;
                    }
                    .shimmer::after {
                        content: '';
                        position: absolute;
                        top: -50%; left: -50%;
                        width: 200%; height: 200%;
                        background: linear-gradient(45deg, transparent, rgba(255,255,255,0.05), transparent);
                        transform: rotate(45deg);
                        animation: shimmer 3s infinite;
                    }
                    @keyframes shimmer {
                        0% { transform: translateX(-100%) rotate(45deg); }
                        100% { transform: translateX(100%) rotate(45deg); }
                    }
                </style>
            </head>
            <body>
                <div class="bg-glow"></div>
                
                <div class="galaxy-card p-10 rounded-[40px] text-center max-w-md w-full mx-4 relative overflow-hidden">
                    <div class="relative w-24 h-24 mx-auto mb-8">
                        <div class="absolute inset-0 bg-purple-500/20 rounded-full animate-ping"></div>
                        <div class="relative w-full h-full bg-purple-600/20 text-purple-500 rounded-3xl flex items-center justify-center text-4xl shadow-lg border border-purple-500/30">
                            <i class="fa-solid fa-gears gear-spin"></i>
                        </div>
                    </div>

                    <h2 class="text-3xl font-bold mb-3 tracking-tighter text-white">UPGRADING SYSTEM</h2>
                    <p class="text-gray-400 text-sm mb-8 leading-relaxed px-4">
                        Sistem <span class="text-purple-400 font-bold">Manzzy ID</span> sedang melakukan sinkronisasi data dan perawatan rutin untuk pengalaman transaksi yang lebih cepat.
                    </p>

                    <div class="shimmer bg-white/5 border border-white/10 rounded-2xl p-5 relative">
                        <div class="flex flex-col items-center">
                            <span class="text-[10px] text-gray-500 uppercase tracking-[0.3em] mb-2">Estimated Ready At</span>
                            <div class="flex items-center gap-3">
                                <span class="text-2xl font-mono text-white font-bold">23:00</span>
                                <div class="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                                <span class="text-2xl font-mono text-white font-bold">01:00</span>
                                <span class="text-xs text-purple-400 font-bold ml-1">WIB</span>
                            </div>
                        </div>
                    </div>

                    <div class="mt-10 flex items-center justify-center gap-2 text-gray-600">
                        <div class="h-[1px] w-8 bg-gray-800"></div>
                        <span class="text-[9px] font-bold uppercase tracking-widest">Server Stability Priority</span>
                        <div class="h-[1px] w-8 bg-gray-800"></div>
                    </div>
                </div>
            </body>
            </html>
        `);
    }
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