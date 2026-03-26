const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

// Konfigurasi Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper Fetch (Untuk verifikasi token Google / External API)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ==========================================
// 1. KONEKSI DATABASE
// ==========================================
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { 
        await mongoose.connect(process.env.MONGO_URI); 
        isConnected = true; 
        console.log("✅ MongoDB Connected");
    } catch (err) { 
        console.error("❌ DB Error:", err); 
    }
};

// ==========================================
// 2. SCHEMA DEFINITIONS (UPDATE: API KEY)
// ==========================================

// [UPDATE] User Schema dengan kolom apiKey
const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' },
    // Kolom API Key (Unik & Sparse agar tidak error jika kosong)
    apiKey: { type: String, unique: true, sparse: true } 
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Schema Lainnya (Tetap Sama)
const ActiveService = mongoose.models.ActiveService || mongoose.model('ActiveService', new mongoose.Schema({ username: String, productName: String, targetNumber: String, serverIp: String, expiredDate: Date }));
const Product = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({ name: String, category: String, price: Number, desc: String, imageUrl: String, formFields: String, isAvailable: { type: Boolean, default: true }, orderMode: { type: String, default: 'manual' } }));
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', new mongoose.Schema({ code: { type: String, required: true, unique: true }, percent: { type: Number, required: true }, createdAt: { type: Date, default: Date.now } }));
const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({ name: String, imageUrl: String }));
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', new mongoose.Schema({ username: String, rating: Number, comment: String, createdAt: { type: Date, default: Date.now } }));
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({ invoiceId: String, username: String, productName: String, formData: String, amount: Number, status: { type: String, default: 'success' }, createdAt: { type: Date, default: Date.now } }));
// 1. PASTIKAN SCHEMA INI ADA DI api/index.js (Di bagian Schema Definitions)
// Schema Transaksi TopUp Otomatis (Sama dengan yg di topup_handler.js)
const TopUpTx = mongoose.models.TopUpTx || mongoose.model('TopUpTx', new mongoose.Schema({
    orderId: String, username: String, amount: Number, fee: Number, totalPayment: Number, 
    paymentNumber: String, status: { type: String, default: 'pending' }, 
    expiredAt: Date, createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// 3. INTEGRASI MODULE (ROUTER)
// ==========================================

// A. Mount API Key Module (Developer Features)
// Ini menangani route: /api/user/generate-apikey & /api/v1/profile
try {
    const apiKeyModule = require('./apikey'); 
    app.use('/api', async (req, res, next) => {
        await connectDB(); // Pastikan DB connect sebelum masuk router
        next();
    }, apiKeyModule.router);
} catch (e) {
    console.error("Warning: apikey.js belum dibuat/error.");
}

// B. Mount Nokos Module
// Ini menangani route: /api/nokos/buy, /api/nokos/status, dll
try {
    const nokosRouter = require('./nokos');
    app.use('/api/nokos', nokosRouter);
} catch (e) {
    console.error("Warning: nokos.js belum dibuat/error.");
}
// ==========================================
// C. MOUNT TOPUP MODULE (PAKASIR AUTOMATIC)
// ==========================================
try {
    const topupRouter = require('./topup_handler'); 
    // Ini akan mengaktifkan route:
    // - /api/topup/create
    // - /api/topup/check/:orderId
    // - /api/topup/webhook
    app.use('/api/topup', topupRouter);
    console.log("✅ TopUp Module Loaded");
} catch (e) {
    console.error("Warning: topup_handler.js belum dibuat.", e);
}

// ==========================================
// 4. AUTH ROUTES (LOGIN/REGISTER)
// ==========================================

// Login Admin
app.post('/api/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'man' && password === '112233') {
        return res.json({ success: true, username: 'Manzzy (Owner)', role: 'admin', token: 'admin-super-token' });
    }
    return res.status(400).json({ success: false, message: "Password Salah" });
});

// Google Login
app.post('/api/auth/google', async (req, res) => {
    await connectDB();
    const { token } = req.body;
    try {
        const verify = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)).json();
        if (!verify.email) return res.status(400).json({ success: false, msg: "Token Invalid" });
        
        const email = verify.email;
        let user = await User.findOne({ username: email });
        
        if (!user) {
            const randomPass = Math.random().toString(36).slice(-8) + "GooGLE";
            user = new User({ username: email, password: randomPass, balance: 0 });
            await user.save();
        }
        res.json({ success: true, username: user.username, balance: user.balance, role: user.role, isGoogle: true });
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

// Login User Biasa
app.post('/api/login-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(400).json({ success: false, message: "Username/Password Salah" });
    res.json({ success: true, username: user.username, balance: user.balance, role: user.role });
});

// Register User
app.post('/api/register-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const exist = await User.findOne({ username });
    if (exist) return res.status(400).json({ success: false, message: "Username sudah dipakai" });
    await new User({ username, password }).save();
    res.json({ success: true });
});

// Get User Profile (Include API Key for Frontend)
app.get('/api/user/:username', async (req, res) => {
    if(req.params.username === 'Manzzy (Owner)') return res.json({ username: 'Manzzy (Owner)', balance: 999999999, role: 'admin' });
    
    await connectDB();
    const user = await User.findOne({ username: req.params.username });
    res.json(user || {});
});

// Change Password
app.post('/api/user/change-password', async (req, res) => {
    await connectDB();
    const { username, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, msg: "Min 6 karakter" });

    const user = await User.findOne({ username });
    if(!user) return res.status(404).json({success:false, msg: "User not found"});
    
    user.password = newPassword; 
    await user.save();
    res.json({success:true});
});

// ==========================================
// 5. CORE LOGIC (PRODUCTS, TOPUP, HISTORY)
// ==========================================

// Products CRUD
app.get('/api/products', async (req, res) => { await connectDB(); res.json(await Product.find()); });
app.post('/api/products', async (req, res) => { await connectDB(); await new Product(req.body).save(); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Categories CRUD
app.get('/api/categories', async (req, res) => { await connectDB(); res.json(await Category.find()); });
app.post('/api/categories', async (req, res) => { await connectDB(); await new Category(req.body).save(); res.json({ success: true }); });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Vouchers
app.post('/api/check-voucher', async (req, res) => {
    await connectDB();
    const v = await Voucher.findOne({ code: req.body.code });
    if(v) res.json({ success: true, percent: v.percent }); else res.json({ success: false });
});

// 2. UPDATE ROUTE ADMIN TOPUPS (Cari route '/api/admin/topups' yang lama, GANTI dengan ini)
app.get('/api/admin/topups', async (req, res) => { 
    await connectDB(); 
    // Ambil dari TopUpTx (Otomatis), bukan TopUp (Manual)
    const data = await TopUpTx.find().sort({ createdAt: -1 }).limit(50);
    res.json(data); 
});

// Order System (Produk Digital Manual)
app.post('/api/order', async (req, res) => {
    await connectDB();
    const { username, productId, formData, voucherCode } = req.body;
    
    const user = await User.findOne({ username });
    const prod = await Product.findById(productId);
    
    if(!user || !prod) return res.json({ success: false, msg: "Data invalid" });
    
    let price = prod.price;
    let note = "";
    
    if(voucherCode) {
        const v = await Voucher.findOne({ code: voucherCode });
        if(v) { price -= Math.ceil(price * (v.percent/100)); note = `(Disc ${v.percent}%)`; }
    }

    if(user.balance < price) return res.json({ success: false, msg: "Saldo kurang" });
    
    user.balance -= price; 
    await user.save();
    
    const inv = 'INV-' + Date.now().toString().slice(-6);
    await new Transaction({ invoiceId: inv, username, productName: `${prod.name} ${note}`, formData, amount: price }).save();
    
    res.json({ success: true, invoiceId: inv, productName: prod.name, mode: prod.orderMode });
});

// History Logic
app.get('/api/history/:username', async (req, res) => {
    await connectDB();
    const txs = await Transaction.find({ username: req.params.username }).sort({ createdAt: -1 }).limit(20);
    res.json(txs.map(t => ({ 
        date: t.createdAt, 
        desc: t.productName, 
        amount: t.amount, 
        status: t.status, 
        type: t.productName === 'Deposit' ? 'IN' : 'OUT' 
    })));
});



// D. MOUNT H2H MODULE (Baru)
try {
    const h2hRouter = require('./h2h'); 
    app.use('/api', h2hRouter); // Ini akan mengaktifkan /api/products/rumahotp dari file h2h.js
    console.log("✅ H2H Module Loaded");
} catch (e) {
    console.error("Warning: h2h.js error/missing", e);
}


// Admin System / Status
app.get('/api/system/status', (req, res) => res.json({ vpsActive: true, vpsStartTime: new Date(Date.now()-36000000), botActive: true, botStartTime: new Date(Date.now()-18000000) }));
app.post('/api/testimonials', async (req, res) => { await connectDB(); await new Testimonial(req.body).save(); res.json({ success: true }); });
app.get('/api/testimonials', async (req, res) => { await connectDB(); res.json(await Testimonial.find().sort({ createdAt: -1 }).limit(10)); });
// ==========================================
// 6. PUBLIC DATA (RECENT ACTIVITY)
// ==========================================

// Helper Sensor Username (Manzzy -> Man***)
function censorUser(str) {
    if(!str) return "Member";
    if(str.length <= 3) return str + "*";
    return str.substring(0, 3) + "***";
}

app.get('/api/public/recent-activities', async (req, res) => {
    try {
        await connectDB();

        // 1. Ambil 5 Topup Sukses Terakhir
        const topups = await TopUpTx.find({ status: 'success' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // 2. Ambil 5 Order Produk/Nokos Sukses Terakhir
        const orders = await Transaction.find({ status: 'success' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // 3. Gabungkan Data
        let activities = [];

        topups.forEach(t => {
            activities.push({
                type: 'topup',
                user: censorUser(t.username),
                desc: 'Deposit Saldo',
                time: t.createdAt
            });
        });

        orders.forEach(o => {
            activities.push({
                type: 'buy', // Bisa 'buy' (produk) atau 'nokos'
                user: censorUser(o.username),
                // Jika nama produk panjang, potong dikit
                desc: o.productName.length > 20 ? o.productName.substring(0, 20) + '...' : o.productName,
                time: o.createdAt
            });
        });

        // 4. Urutkan dari yang paling baru
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json(activities);
    } catch (e) {
        console.error("Recent Activity Error:", e);
        res.json([]); // Kembalikan array kosong jika error
    }
});

// ==========================================
// [BARU] ADMIN USER MANAGEMENT ROUTES
// ==========================================

// 1. Ambil Semua User (Untuk Admin Panel)
app.get('/api/admin/users', async (req, res) => {
    try {
        await connectDB();
        // Ambil semua user, urutkan dari saldo terbanyak
        const users = await User.find({}, 'username balance role').sort({ balance: -1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: "Gagal ambil data user" });
    }
});

// 2. Edit Saldo User (Manual oleh Admin)
app.post('/api/admin/user/balance', async (req, res) => {
    const { username, action, amount } = req.body; // action: 'add' atau 'sub'
    
    try {
        await connectDB();
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User tidak ditemukan" });

        const val = parseInt(amount);
        if (action === 'add') {
            user.balance += val;
        } else if (action === 'sub') {
            user.balance -= val;
            if (user.balance < 0) user.balance = 0; // Cegah minus
        }

        await user.save();
        
        // Catat di Transaksi agar ada jejak
        await new Transaction({
            invoiceId: 'ADM-' + Date.now().toString().slice(-6),
            username: username,
            productName: action === 'add' ? 'Saldo Ditambah Admin' : 'Saldo Dikurangi Admin',
            amount: val,
            status: 'success',
            type: action === 'add' ? 'IN' : 'OUT'
        }).save();

        res.json({ success: true, newBalance: user.balance });
    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// ==========================================
// [WAJIB] ADMIN DASHBOARD ROUTES (TAMBAHAN)
// ==========================================

// 1. AMBIL SEMUA ORDER (Manual Produk)
app.get('/api/admin/orders', async (req, res) => {
    try {
        await connectDB();
        // Ambil 100 transaksi terakhir dari schema Transaction
        const orders = await Transaction.find().sort({ createdAt: -1 }).limit(100);
        res.json(orders);
    } catch (e) {
        console.error("Gagal load orders admin:", e);
        res.status(500).json([]);
    }
});

// 2. KELOLA VOUCHER (List, Create, Delete)
app.get('/api/admin/vouchers', async (req, res) => {
    try {
        await connectDB();
        const vouchers = await Voucher.find().sort({ createdAt: -1 });
        res.json(vouchers);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/voucher', async (req, res) => {
    try {
        await connectDB();
        // Validasi duplikat
        const exist = await Voucher.findOne({ code: req.body.code });
        if(exist) return res.status(400).json({ success: false, msg: "Kode sudah ada" });
        
        await new Voucher(req.body).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/voucher/:id', async (req, res) => {
    try {
        await connectDB();
        await Voucher.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 3. KELOLA BOT AKTIF (Active Services)
app.get('/api/admin/all-services', async (req, res) => {
    try {
        await connectDB();
        const services = await ActiveService.find().sort({ expiredDate: 1 });
        res.json(services);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/services', async (req, res) => {
    try {
        await connectDB();
        const { username, productName, targetNumber, serverIp, days } = req.body;
        const expiredDate = new Date(Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000));
        
        await new ActiveService({ 
            username, productName, targetNumber, serverIp, expiredDate 
        }).save();
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/services/:id', async (req, res) => {
    try {
        await connectDB();
        await ActiveService.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// FITUR GACHA SALDO
// ==========================================
app.post('/api/gacha/play', async (req, res) => {
    try {
        // Menggunakan fungsi connectDB bawaan index.js
        await connectDB(); 
        
        const { username } = req.body;
        const cost = 1000;

        // Validasi input
        if (!username) {
            return res.status(400).json({ success: false, msg: "Sesi tidak valid, silakan login ulang." });
        }

        // 1. Cari User di Database (Menggunakan UserSchema bawaan index.js)
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, msg: "User tidak ditemukan di database." });
        }

        // 2. Cek apakah saldo mencukupi
        if (user.balance < cost) {
            return res.status(400).json({ success: false, msg: "Saldo tidak mencukupi untuk gacha!" });
        }

        // 3. Potong saldo untuk biaya main
        user.balance -= cost;

        // 4. Logika Probabilitas (Diacak murni oleh Server backend)
        const chance = Math.random() * 100;
        let prize = {};

        if (chance <= 55) {
            prize = { amount: 0, text: "Yahh, ZONK!", type: 'zonk', icon: '🥺', color: 'text-red-400' };
        } else if (chance <= 85) {
            prize = { amount: 1000, text: "Balik Modal!", type: 'normal', icon: '👍', color: 'text-blue-400' };
        } else if (chance <= 99) {
            prize = { amount: 2000, text: "Cuan Dikit!", type: 'good', icon: '🔥', color: 'text-green-400' };
        } else {
            prize = { amount: 5000, text: "JACKPOT!!!", type: 'jackpot', icon: '🤑', color: 'text-yellow-400' };
        }

        // 5. Tambahkan hadiah ke saldo user
        user.balance += prize.amount;
        
        // 6. Simpan perubahan saldo ke MongoDB
        await user.save(); 

        // 7. Kembalikan hasil ke frontend (gacha.html)
        res.json({ success: true, prize, newBalance: user.balance });

    } catch (error) {
        console.error("Gacha Error:", error);
        res.status(500).json({ success: false, msg: "Terjadi kesalahan server saat memproses Gacha." });
    }
});
//dashboard buat saldo cek
app.use('/api', require('./dashboard'));
module.exports = app;