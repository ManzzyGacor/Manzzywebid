const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

// --- DATABASE CONNECT ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; console.log("✅ DB Connected");
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) await new Admin({ username: 'man', password: '112233' }).save();
    } catch (err) { console.error("❌ DB Error:", err); }
};

// --- SCHEMAS ---
const AdminSchema = new mongoose.Schema({ username: String, password: String });
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true },
    balance: { type: Number, default: 0 } 
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({ 
    name: String, price: Number, desc: String, imageUrl: String, category: String, 
    isAvailable: { type: Boolean, default: true },
    orderMode: { type: String, default: 'manual' }, 
    formFields: { type: String, default: 'Nomor WhatsApp' } 
});
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
    invoiceId: String, username: String, productName: String, price: Number,
    formData: String, status: { type: String, default: 'pending' }, mode: String,
    date: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

const TopUpSchema = new mongoose.Schema({
    username: String, amount: Number, proofImage: String,
    status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
});
const TopUp = mongoose.models.TopUp || mongoose.model('TopUp', TopUpSchema);

const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, date: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);
const PteroConfigSchema = new mongoose.Schema({ panelUrl: String, apiKey: String, serverId: String, cookie: String });
const PteroConfig = mongoose.models.PteroConfig || mongoose.model('PteroConfig', PteroConfigSchema);

// --- ROUTES ---
app.get('/api', (req, res) => res.send('Backend Ready'));

// 1. AUTH & USER (FIXED BALANCE)
app.post('/api/register-user', async (req, res) => { await connectDB(); const { username, password } = req.body; try { const existing = await User.findOne({ username }); if (existing) return res.status(400).json({ success: false, message: "Username sudah dipakai" }); const newUser = new User({ username, password }); await newUser.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

app.post('/api/login-user', async (req, res) => { 
    await connectDB(); 
    const { username, password } = req.body; 
    const user = await User.findOne({ username, password }); 
    if (user) {
        // Kirim balik username & balance biar frontend bisa langsung simpan
        res.json({ success: true, username: user.username, balance: user.balance }); 
    } else {
        res.status(401).json({ success: false, message: "Password Salah" }); 
    }
});

// Endpoint User Info (Dipanggil index.html saat refresh)
app.get('/api/user/:username', async (req, res) => {
    await connectDB();
    const user = await User.findOne({ username: req.params.username });
    if (user) res.json({ username: user.username, balance: user.balance });
    else res.status(404).json({ error: "User not found" });
});

// 2. PRODUCTS, ORDERS, TOPUP (SAME AS BEFORE)
app.get('/api/products', async (req, res) => { await connectDB(); const p = await Product.find(req.query.category ? { category: req.query.category } : {}); res.json(p); });
app.post('/api/products', async (req, res) => { await connectDB(); await new Product(req.body).save(); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.post('/api/order', async (req, res) => {
    await connectDB();
    const { username, productId, formData } = req.body;
    try {
        const user = await User.findOne({ username });
        const product = await Product.findById(productId);
        if (!user || !product) return res.status(404).json({ success: false, msg: "Data invalid" });
        if (user.balance < product.price) return res.status(400).json({ success: false, msg: "Saldo Kurang" });

        user.balance -= product.price; 
        await user.save();

        const inv = 'INV-' + Date.now().toString().slice(-6);
        const status = product.orderMode === 'manual' ? 'success' : 'pending';
        await new Order({ invoiceId: inv, username: user.username, productName: product.name, price: product.price, formData, mode: product.orderMode, status }).save();
        res.json({ success: true, invoiceId: inv, mode: product.orderMode, productName: product.name, formData });
    } catch (err) { res.status(500).json({ success: false, msg: err.message }); }
});

app.post('/api/topup', async (req, res) => { await connectDB(); await new TopUp({ username: req.body.username, amount: parseInt(req.body.amount), proofImage: req.body.proofImage }).save(); res.json({ success: true }); });
app.get('/api/admin/topups', async (req, res) => { await connectDB(); const list = await TopUp.find({ status: 'pending' }).sort({ date: 1 }); res.json(list); });
app.post('/api/admin/topup-action', async (req, res) => {
    await connectDB();
    const { id, action } = req.body;
    const topup = await TopUp.findById(id);
    if (!topup) return res.status(400).json({ error: "Invalid" });
    if (action === 'approve') {
        const user = await User.findOne({ username: topup.username });
        if (user) { user.balance += topup.amount; await user.save(); }
        topup.status = 'approved';
    } else { topup.status = 'rejected'; }
    topup.proofImage = null;
    await topup.save();
    res.json({ success: true });
});

// Admin & Others
app.post('/api/login', async (req, res) => { await connectDB(); const admin = await Admin.findOne(req.body); if(admin) res.json({success:true}); else res.status(401).json({success:false}); });
app.get('/api/admin/orders', async (req, res) => { await connectDB(); const list = await Order.find().sort({ date: -1 }).limit(50); res.json(list); });
app.get('/api/categories', async (req, res) => { await connectDB(); const c = await Category.find(); res.json(c); });
app.post('/api/categories', async (req, res) => { await connectDB(); await new Category(req.body).save(); res.json({ success: true }); });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.get('/api/testimonials', async (req, res) => { await connectDB(); const r = await Testimonial.find().sort({ date: -1 }); res.json(r); });
app.post('/api/testimonials', async (req, res) => { await connectDB(); await new Testimonial(req.body).save(); res.json({ success: true }); });
app.post('/api/ptero/config', async (req, res) => { await connectDB(); await PteroConfig.deleteMany({}); await new PteroConfig(req.body).save(); res.json({ success: true }); });
app.get('/api/ptero/config', async (req, res) => { await connectDB(); const config = await PteroConfig.findOne(); res.json(config || {}); });

module.exports = app;
