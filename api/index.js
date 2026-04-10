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
async function callRumahOTP(fullPath, method = 'GET', data = null) {
    // Ambil API Key dari NokosConfig
    const config = await NokosConfig.findOne();
    if (!config || !config.apiKey) throw new Error("API Key belum disetting!");

    // Path sekarang fleksibel, lo tinggal tulis 'v2/services' di route-nya
    const path = `/api/${fullPath}`;

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
            res.on('data', (c) => body += c);
            res.on('end', () => { 
                try { 
                    resolve(JSON.parse(body)); 
                } catch (e) { 
                    reject(new Error("Gagal parsing JSON. Cek API Key lo!")); 
                } 
            });
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
    try {
        // Tulis jalurnya lengkap sesuai docs lo: v2/services
        const resData = await callRumahOTP('v2/services'); 
        
        if (resData && resData.success) {
            // Sesuai respon JSON lo: resData.data isinya array layanan
            return res.json({ 
                success: true, 
                data: resData.data 
            });
        } else {
            return res.json({ success: false, msg: "Gagal ambil layanan" });
        }
    } catch (e) {
        res.status(500).json({ success: false, msg: e.message });
    }
});

app.get('/api/nokos/countries', async (req, res) => {
    try {
        const { sid } = req.query; // Ambil SID dari URL
        const resData = await callRumahOTP(`v2/countries?service_id=${sid}`);
        
        // Ambil margin dari DB
        const config = await NokosConfig.findOne();
        const margin = config ? config.marginPercent : 20;

        if (resData.success && resData.data) {
            resData.data.forEach(c => {
                if (c.pricelist) {
                    c.pricelist.forEach(p => {
                        // Backend harus ngasih p.price_user biar Frontend gak bingung
                        p.price_user = Math.ceil(p.price + (p.price * margin / 100));
                    });
                }
            });
            return res.json(resData);
        }
        res.json({ success: false });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/nokos/order', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, msg: "Session expired" });
    
    const { number_id, provider_id, operator_id, price, service_name } = req.body;
    const user = await User.findById(req.session.userId);

    try {
        // Path v2 untuk beli nomor
        const result = await callRumahOTP(`v2/orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`);
        
        if (result.success) {
            user.balance -= price; 
            await user.save();

            const inv = 'NOK-' + Date.now().toString().slice(-6);
            const tx = new NokosTx({
                invoiceId: inv,
                username: user.username,
                refId: result.data.order_id, // RO000xxxx
                serviceName: service_name,
                country: result.data.country,
                phoneNumber: result.data.phone_number,
                price: price,
                expiresAt: new Date(result.data.expired_at || (Date.now() + 20 * 60000))
            });
            await tx.save();

            res.json({ success: true, invoiceId: inv, data: result.data });
        } else {
            res.json({ success: false, msg: result.message });
        }
    } catch (e) {
        res.json({ success: false, msg: "Gagal Order" });
    }
});

app.get('/api/nokos/status/:invoiceId', async (req, res) => {
    try {
        const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
        if (!tx) return res.json({ success: false });

        // Path v1 sesuai docs lo
        const result = await callRumahOTP(`v1/orders/get_status?order_id=${tx.refId}`);

        if (result.success) {
            const d = result.data;
            // status: received, completed, canceled, expiring
            if (d.otp_code) tx.smsCode = d.otp_code;
            if (d.status === 'completed') tx.status = 'success';
            
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                tx.status = 'canceled';
                await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            }
            await tx.save();
        }
        res.json({ success: true, data: tx });
    } catch (e) {
        res.json({ success: false });
    }
});

app.post('/api/nokos/action', async (req, res) => {
    const { order_id, status } = req.body; // order_id di sini adalah invoiceId kita
    const tx = await NokosTx.findOne({ invoiceId: order_id });
    
    try {
        // Path v1 dengan parameter status (cancel/resend/done)
        const result = await callRumahOTP(`v1/orders/set_status?order_id=${tx.refId}&status=${status}`);
        
        if (result.success) {
            if (status === 'cancel') {
                tx.status = 'canceled';
                await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            }
            await tx.save();
            res.json({ success: true, msg: "Status berhasil diupdate" });
        } else {
            res.json({ success: false, msg: result.message });
        }
    } catch (e) {
        res.json({ success: false });
    }
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