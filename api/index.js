const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const bcrypt = require('bcryptjs');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
// Konfigurasi Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Melayani file statis dari folder 'public' yang ada di luar folder 'api'
app.use(express.static(path.join(__dirname, '../public')));

// Mengarahkan semua request non-API ke index.html (untuk SPA)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public', 'index.html'));
    }
});
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
    app.use('/api', apiKeyModule.router);
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

// [SINKRONKAN] Gunakan satu format Register
app.post('/api/register-user', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, msg: 'Data tidak lengkap' });

        const exist = await User.findOne({ username });
        if (exist) return res.status(400).json({ success: false, msg: "Username sudah dipakai" });
        
        // Wajib Hash Password agar akun aman dan bisa dibaca Bcrypt saat login
        const hashedPassword = await bcrypt.hash(password, 10);
        const role = username.toLowerCase() === 'man' ? 'admin' : 'member';
        
        await new User({ username, password: hashedPassword, role }).save();
        res.json({ success: true, msg: "Registrasi Berhasil!" });
    } catch (e) {
        res.status(500).json({ success: false, msg: "Error Server" });
    }
});

// [SINKRONKAN] Login dengan Bcrypt Compare agar akun lama bisa masuk
app.post('/api/login-user', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) return res.status(400).json({ success: false, msg: "Username tidak ditemukan" });

        // Bandingkan password input dengan hash di database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, msg: "Password Salah" });

        // Buat Token JWT agar session "nyangkut" di frontend
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ 
            success: true, 
            token, 
            username: user.username, 
            balance: user.balance, 
            role: user.role 
        });
    } catch (e) {
        res.status(500).json({ success: false, msg: "Error Server" });
    }
});
// Get User Profile
app.get('/api/user/:username', async (req, res) => {
    if(req.params.username === 'man (Owner)') return res.json({ username: 'man (Owner)', balance: 999999999, role: 'admin' });
    
    const user = await User.findOne({ username: req.params.username });
    res.json(user || {});
});

// Change Password
app.post('/api/user/change-password', async (req, res) => {
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
app.get('/api/products', async (req, res) => { res.json(await Product.find()); });
app.post('/api/products', async (req, res) => { await new Product(req.body).save(); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Categories CRUD
app.get('/api/categories', async (req, res) => { res.json(await Category.find()); });
app.post('/api/categories', async (req, res) => { await new Category(req.body).save(); res.json({ success: true }); });
app.delete('/api/categories/:id', async (req, res) => { await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Vouchers
app.post('/api/check-voucher', async (req, res) => {
    const v = await Voucher.findOne({ code: req.body.code });
    if(v) res.json({ success: true, percent: v.percent }); else res.json({ success: false });
});

// Update Route Admin Topups
app.get('/api/admin/topups', async (req, res) => { 
    const data = await TopUpTx.find().sort({ createdAt: -1 }).limit(50);
    res.json(data); 
});

// Order System (Produk Digital Manual)
app.post('/api/order', async (req, res) => {
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
    app.use('/api', h2hRouter); 
    console.log("✅ H2H Module Loaded");
} catch (e) {
    console.error("Warning: h2h.js error/missing", e);
}

// Admin System / Status
app.get('/api/system/status', (req, res) => res.json({ 
    vpsActive: true, 
    vpsStartTime: new Date(Date.now()-36000000), 
    botActive: true, 
    botStartTime: new Date(Date.now()-18000000) 
}));

app.post('/api/testimonials', async (req, res) => { 
    await new Testimonial(req.body).save(); 
    res.json({ success: true }); 
});

app.get('/api/testimonials', async (req, res) => { 
    res.json(await Testimonial.find().sort({ createdAt: -1 }).limit(10)); 
});

// ==========================================
// 6. PUBLIC DATA (RECENT ACTIVITY)
// ==========================================

function censorUser(str) {
    if(!str) return "Member";
    if(str.length <= 3) return str + "*";
    return str.substring(0, 3) + "***";
}

app.get('/api/public/recent-activities', async (req, res) => {
    try {
        const topups = await TopUpTx.find({ status: 'success' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const orders = await Transaction.find({ status: 'success' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

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
                type: 'buy',
                user: censorUser(o.username),
                desc: o.productName.length > 20 ? o.productName.substring(0, 20) + '...' : o.productName,
                time: o.createdAt
            });
        });

        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.json(activities);
    } catch (e) {
        console.error("Recent Activity Error:", e);
        res.json([]); 
    }
});
// ==========================================
// [BARU] ADMIN USER MANAGEMENT ROUTES
// ==========================================

// 1. Ambil Semua User (Untuk Admin Panel)
app.get('/api/admin/users', async (req, res) => {
    try {
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
        // Ambil 100 transaksi terakhir
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
        const vouchers = await Voucher.find().sort({ createdAt: -1 });
        res.json(vouchers);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/voucher', async (req, res) => {
    try {
        const exist = await Voucher.findOne({ code: req.body.code });
        if(exist) return res.status(400).json({ success: false, msg: "Kode sudah ada" });
        
        await new Voucher(req.body).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/voucher/:id', async (req, res) => {
    try {
        await Voucher.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 3. KELOLA BOT AKTIF (Active Services)
app.get('/api/admin/all-services', async (req, res) => {
    try {
        const services = await ActiveService.find().sort({ expiredDate: 1 });
        res.json(services);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/services', async (req, res) => {
    try {
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
        await ActiveService.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});
// ==========================================
// FITUR GACHA SALDO
// ==========================================
app.post('/api/gacha/play', async (req, res) => {
    try {
        const { username } = req.body;
        const cost = 1000;

        // Validasi input
        if (!username) {
            return res.status(400).json({ success: false, msg: "Sesi tidak valid, silakan login ulang." });
        }

        // 1. Cari User di Database
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

        // 4. Logika Probabilitas
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

        // 7. Kembalikan hasil ke frontend
        res.json({ success: true, prize, newBalance: user.balance });

    } catch (error) {
        console.error("Gacha Error:", error);
        res.status(500).json({ success: false, msg: "Terjadi kesalahan server saat memproses Gacha." });
    }
});
// ==========================================
// SCHEMA DEFINITIONS (APP PREMIUM)
// ==========================================

const AppPremiumConfigSchema = new mongoose.Schema({
    appName: { type: String, required: true, unique: true },
    price: { type: Number, default: 0 },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' }
});
const AppPremiumConfig = mongoose.models.AppPremiumConfig || mongoose.model('AppPremiumConfig', AppPremiumConfigSchema);

const AppPremiumStockSchema = new mongoose.Schema({
    appName: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    instructions: { type: String, default: '' },
    status: { type: String, default: 'available' },
    buyer: { type: String, default: null },
    purchasedAt: { type: Date, default: null }
});
const AppPremiumStock = mongoose.models.AppPremiumStock || mongoose.model('AppPremiumStock', AppPremiumStockSchema);


// ==========================================
// --- API UNTUK USER (FRONTEND) ---
// ==========================================

// Get List App & Sisa Stock
app.get('/api/app-premium/list', async (req, res) => {
    try {
        const configs = await AppPremiumConfig.find();
        const apps = [];
        
        for (let conf of configs) {
            const stockCount = await AppPremiumStock.countDocuments({ appName: conf.appName, status: 'available' });
            apps.push({
                appName: conf.appName,
                price: conf.price,
                description: conf.description,
                imageUrl: conf.imageUrl,
                stock: stockCount
            });
        }
        res.json({ success: true, data: apps });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Proses Pembelian
app.post('/api/app-premium/buy', async (req, res) => {
    try {
        const { username, appName } = req.body;
        if (!username) return res.status(401).json({ success: false, msg: "Sesi tidak valid, login ulang." });

        const user = await User.findOne({ username });
        const config = await AppPremiumConfig.findOne({ appName });
        
        if (!user || !config) return res.status(400).json({ success: false, msg: "Data produk tidak valid." });
        if (user.balance < config.price) return res.status(400).json({ success: false, msg: "Saldo tidak mencukupi." });

        const stock = await AppPremiumStock.findOne({ appName, status: 'available' });
        if (!stock) return res.status(400).json({ success: false, msg: "Maaf, stock aplikasi ini habis!" });

        user.balance -= config.price;
        await user.save();

        stock.status = 'sold';
        stock.buyer = username;
        stock.purchasedAt = new Date();
        await stock.save();

        res.json({ success: true, newBalance: user.balance, account: stock });
    } catch (e) { res.status(500).json({ success: false, msg: "Terjadi kesalahan server." }); }
});

// Riwayat Pembelian User
app.get('/api/app-premium/history/:username', async (req, res) => {
    try {
        const history = await AppPremiumStock.find({ buyer: req.params.username, status: 'sold' }).sort({ purchasedAt: -1 });
        res.json({ success: true, data: history });
    } catch (e) { res.status(500).json({ success: false }); }
});


// ==========================================
// --- API UNTUK ADMIN ---
// ==========================================

// Ambil semua daftar config
app.get('/api/admin/app-premium/configs', async (req, res) => {
    try {
        const configs = await AppPremiumConfig.find();
        res.json({ success: true, data: configs });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Update / Simpan Config
app.post('/api/admin/app-premium/config', async (req, res) => {
    try {
        const { appName, price, description, imageUrl } = req.body;
        await AppPremiumConfig.findOneAndUpdate(
            { appName: appName.toLowerCase() }, 
            { price, description, imageUrl }, 
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Tambah Stock
app.post('/api/admin/app-premium/stock', async (req, res) => {
    try {
        const { appName, email, password, instructions } = req.body;
        await new AppPremiumStock({ appName: appName.toLowerCase(), email, password, instructions, status: 'available' }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Hapus Produk & Stok
app.delete('/api/admin/app-premium/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        await AppPremiumConfig.findOneAndDelete({ appName: appName.toLowerCase() });
        await AppPremiumStock.deleteMany({ appName: appName.toLowerCase() });
        res.json({ success: true, msg: "Produk & Seluruh stok berhasil dihapus!" });
    } catch (e) { res.status(500).json({ success: false }); }
});
//dashboard buat saldo cek
app.use('/api', require('./dashboard'));

connectDB().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ MongoDB Connected & Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error("❌ Gagal menyalakan server karena error DB:", err);
});

module.exports = app;