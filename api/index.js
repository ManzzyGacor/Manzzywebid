const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit besar untuk upload bukti transfer

// 1. KONEKSI DATABASE
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; } 
    catch (err) { console.error("DB Error:", err); }
};

// 2. SCHEMA DEFINITIONS (SAMA DENGAN NOKOS.JS)
const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' } // member / admin
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const TopUpSchema = new mongoose.Schema({
    username: String,
    amount: Number,
    proofImage: String, // Base64
    status: { type: String, default: 'pending' }, // pending, success, failed
    createdAt: { type: Date, default: Date.now }
});
const TopUp = mongoose.models.TopUp || mongoose.model('TopUp', TopUpSchema);

const ProductSchema = new mongoose.Schema({
    name: String, category: String, price: Number,
    desc: String, imageUrl: String, formFields: String,
    isAvailable: { type: Boolean, default: true }
});
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);

const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, createdAt: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

const TransactionSchema = new mongoose.Schema({
    invoiceId: String, username: String, productName: String,
    amount: Number, status: { type: String, default: 'success' },
    createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

// ==========================================
// ROUTES AUTH
// ==========================================

app.post('/api/register-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    try {
        const exist = await User.findOne({ username });
        if (exist) return res.status(400).json({ success: false, message: "Username sudah dipakai" });
        
        await new User({ username, password, balance: 0 }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/login-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(400).json({ success: false, message: "Username/Password Salah" });
        res.json({ success: true, username: user.username, balance: user.balance, role: user.role });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/user/:username', async (req, res) => {
    await connectDB();
    const user = await User.findOne({ username: req.params.username });
    if(user) res.json(user); else res.json({});
});

// ==========================================
// ROUTES TOPUP (DENGAN ANTI DOUBLE)
// ==========================================

// User Request Topup
app.post('/api/topup', async (req, res) => {
    await connectDB();
    try {
        await new TopUp(req.body).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Admin Get List Topup
app.get('/api/admin/topups', async (req, res) => {
    await connectDB();
    const list = await TopUp.find().sort({ createdAt: -1 });
    res.json(list);
});

// [FIX] ADMIN APPROVE/REJECT (ATOMIC LOCK)
// [FIX] ADMIN APPROVE/REJECT + HEMAT PENYIMPANAN (Hapus Gambar Setelah Proses)
app.post('/api/admin/topup/action', async (req, res) => {
    await connectDB();
    const { id, action } = req.body; // action: 'approve' / 'reject'

    try {
        if (action === 'approve') {
            // 1. Update Status jadi Success & KOSONGKAN proofImage (Biar Hemat DB)
            const tx = await TopUp.findOneAndUpdate(
                { _id: id, status: 'pending' }, 
                { 
                    status: 'success',
                    proofImage: null // <--- INI KUNCINYA (Hapus gambar setelah selesai)
                },
                { new: true }
            );

            if (!tx) {
                return res.status(400).json({ success: false, message: "Sudah diproses sebelumnya!" });
            }

            // 2. Tambah Saldo User
            const user = await User.findOne({ username: tx.username });
            if (user) {
                user.balance += tx.amount;
                
                await new Transaction({
                    invoiceId: 'TOP-' + Date.now().toString().slice(-6),
                    username: user.username,
                    productName: 'Deposit Saldo',
                    amount: tx.amount,
                    status: 'success'
                }).save();

                await user.save();
            }
            res.json({ success: true });

        } else {
            // REJECT (Hapus juga gambarnya biar gak nyampah)
            const tx = await TopUp.findOneAndUpdate(
                { _id: id, status: 'pending' }, 
                { 
                    status: 'failed',
                    proofImage: null // <--- Hapus gambar sampah
                }
            );
            if (!tx) return res.status(400).json({ success: false, message: "Sudah diproses!" });
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ==========================================
// ROUTES PRODUCT & ORDER
// ==========================================

app.get('/api/categories', async (req, res) => {
    await connectDB(); res.json(await Category.find());
});

app.get('/api/products', async (req, res) => {
    await connectDB(); res.json(await Product.find());
});

app.post('/api/order', async (req, res) => {
    await connectDB();
    const { username, productId, formData } = req.body;
    
    const user = await User.findOne({ username });
    const product = await Product.findById(productId);
    
    if(!user || !product) return res.json({ success: false, msg: "Data invalid" });
    if(user.balance < product.price) return res.json({ success: false, msg: "Saldo kurang" });

    // Potong Saldo
    user.balance -= product.price;
    await user.save();

    // Buat Invoice
    const invId = 'INV-' + Date.now().toString().slice(-6);
    await new Transaction({
        invoiceId: invId,
        username: user.username,
        productName: product.name,
        amount: product.price,
        status: 'success' // Sukses bayar (status pengerjaan urusan admin)
    }).save();

    // Cek apakah produk otomatis (misal Nokos) atau manual
    // Di sini kita anggap manual dulu sesuai flow standar
    res.json({ 
        success: true, 
        invoiceId: invId, 
        productName: product.name,
        mode: 'manual' 
    });
});

// ==========================================
// ROUTES SYSTEM / HISTORY / TESTI
// ==========================================

// History Gabungan (Topup & Order Web)
app.get('/api/history/:username', async (req, res) => {
    await connectDB();
    // Cari Transaksi Pembelian (Limit 20 biar ringan)
    const txs = await Transaction.find({ username: req.params.username })
        .sort({ createdAt: -1 })
        .limit(20); // <--- TAMBAHAN LIMIT DB
    
    // Map data agar seragam
    const list = txs.map(t => ({
        date: t.createdAt,
        desc: t.productName,
        amount: t.amount,
        status: t.status,
        type: t.productName === 'Deposit Saldo' ? 'IN' : 'OUT'
    }));
    
    res.json(list);
});

app.post('/api/testimonials', async (req, res) => {
    await connectDB(); await new Testimonial(req.body).save(); res.json({ success: true });
});
app.get('/api/testimonials', async (req, res) => {
    await connectDB(); res.json(await Testimonial.find().sort({ createdAt: -1 }).limit(10));
});

// System Status (Mockup)
app.get('/api/system/status', (req, res) => {
    res.json({
        vpsActive: true, vpsStartTime: new Date(Date.now() - 36000000),
        botActive: true, botStartTime: new Date(Date.now() - 18000000)
    });
});

// REDEEM CODE
app.post('/api/redeem', async (req, res) => {
    await connectDB();
    const { username, code } = req.body;
    if(code === 'MANZZY10K') {
        // Cek apakah user sudah pernah redeem (opsional, disini simple aja)
        const user = await User.findOne({ username });
        if(user) {
            user.balance += 10000;
            await user.save();
            await new Transaction({
                invoiceId: 'GIFT-' + Date.now().toString().slice(-4),
                username, productName: 'Voucher Code', amount: 10000, status: 'success'
            }).save();
            return res.json({ success: true, amount: 10000 });
        }
    }
    res.json({ success: false, msg: "Kode salah / habis" });
});

// LOAD NOKOS MODULE
const nokosRouter = require('./nokos');
app.use('/api/nokos', nokosRouter);

// EXECUTE
module.exports = app;