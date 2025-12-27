const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// PENTING: Naikkan limit agar bisa upload gambar (bukti transfer)
app.use(bodyParser.json({ limit: '10mb' })); 
app.use(cors());

// --- SCHEMAS ---
const AdminSchema = new mongoose.Schema({ username: String, password: String });
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

// Update User: Tambah Balance
const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true },
    balance: { type: Number, default: 0 } // Saldo Default 0
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Schema TopUp (BARU)
const TopUpSchema = new mongoose.Schema({
    username: String,
    amount: Number,
    proofImage: String, // Base64 Image
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    date: { type: Date, default: Date.now }
});
const TopUp = mongoose.models.TopUp || mongoose.model('TopUp', TopUpSchema);

const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, date: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);

const ProductSchema = new mongoose.Schema({ name: String, price: String, desc: String, imageUrl: String, category: String, isAvailable: { type: Boolean, default: true } });
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const PteroConfigSchema = new mongoose.Schema({ panelUrl: String, apiKey: String, serverId: String, cookie: String });
const PteroConfig = mongoose.models.PteroConfig || mongoose.model('PteroConfig', PteroConfigSchema);

// --- CONNECT DB ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; console.log("✅ Database Connected");
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) await new Admin({ username: 'man', password: '112233' }).save();
    } catch (err) { console.error("❌ Database Error:", err); }
};

// --- ROUTES ---
app.get('/api', (req, res) => res.send('Manzzy Backend v8.0 (TopUp System) Ready'));

// Auth & User Info
app.post('/api/login', async (req, res) => { await connectDB(); const { username, password } = req.body; const admin = await Admin.findOne({ username, password }); if (admin) res.json({ success: true }); else res.status(401).json({ success: false }); });
app.post('/api/register-user', async (req, res) => { await connectDB(); const { username, password } = req.body; try { const existing = await User.findOne({ username }); if (existing) return res.status(400).json({ success: false, message: "Username sudah dipakai" }); const newUser = new User({ username, password }); await newUser.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/login-user', async (req, res) => { await connectDB(); const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) res.json({ success: true, username: user.username, balance: user.balance }); else res.status(401).json({ success: false, message: "Salah" }); });

// Get User Balance (Real-time update)
app.get('/api/user/:username', async (req, res) => {
    await connectDB();
    const user = await User.findOne({ username: req.params.username });
    if (user) res.json({ balance: user.balance });
    else res.status(404).json({ error: "User not found" });
});

// --- FITUR TOP UP (BARU) ---

// 1. User Request Top Up
app.post('/api/topup', async (req, res) => {
    await connectDB();
    try {
        const { username, amount, proofImage } = req.body;
        const newTopUp = new TopUp({ username, amount: parseInt(amount), proofImage });
        await newTopUp.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Admin Get List Pending Top Up
app.get('/api/admin/topups', async (req, res) => {
    await connectDB();
    // Ambil yang pending saja, urutkan dari yang lama
    const list = await TopUp.find({ status: 'pending' }).sort({ date: 1 });
    res.json(list);
});

// 3. Admin Action (Approve/Reject)
app.post('/api/admin/topup-action', async (req, res) => {
    await connectDB();
    const { id, action } = req.body; // action: 'approve' or 'reject'
    
    try {
        const topup = await TopUp.findById(id);
        if (!topup || topup.status !== 'pending') return res.status(400).json({ error: "Invalid Request" });

        if (action === 'approve') {
            // Tambah Saldo User
            const user = await User.findOne({ username: topup.username });
            if (user) {
                user.balance += topup.amount;
                await user.save();
            }
            topup.status = 'approved';
        } else {
            topup.status = 'rejected';
        }
        
        await topup.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- EXISTING ROUTES (Testimoni, Produk, Ptero) ---
app.get('/api/testimonials', async (req, res) => { await connectDB(); const r = await Testimonial.find().sort({ date: -1 }); res.json(r); });
app.post('/api/testimonials', async (req, res) => { await connectDB(); try { await new Testimonial(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/categories', async (req, res) => { await connectDB(); const c = await Category.find(); res.json(c); });
app.post('/api/categories', async (req, res) => { await connectDB(); try { await new Category(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.get('/api/products', async (req, res) => { await connectDB(); const { category } = req.query; const filter = category ? { category } : {}; const p = await Product.find(filter); res.json(p); });
app.post('/api/products', async (req, res) => { await connectDB(); try { await new Product(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.put('/api/products/:id', async (req, res) => { await connectDB(); try { await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Ptero Config & Proxy (Client Fetch Mode - API Config Only)
app.post('/api/ptero/config', async (req, res) => { await connectDB(); try { await PteroConfig.deleteMany({}); await new PteroConfig(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/ptero/config', async (req, res) => { await connectDB(); const config = await PteroConfig.findOne(); res.json(config || {}); });

module.exports = app;
