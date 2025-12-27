const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

// --- SCHEMAS ---
const AdminSchema = new mongoose.Schema({ username: String, password: String });
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true },
    balance: { type: Number, default: 0 }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const TopUpSchema = new mongoose.Schema({
    username: String, amount: Number, proofImage: String,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});
const TopUp = mongoose.models.TopUp || mongoose.model('TopUp', TopUpSchema);

// Schema Settingan Website (Mode Order & Form)
const SiteConfigSchema = new mongoose.Schema({
    orderMode: { type: String, default: 'manual' }, // 'manual' (WA) or 'auto' (Dashboard)
    formFields: { type: String, default: 'Nomor WhatsApp,Nama Bot' } // Label input dipisah koma
});
const SiteConfig = mongoose.models.SiteConfig || mongoose.model('SiteConfig', SiteConfigSchema);

// Schema Order/Transaksi
const OrderSchema = new mongoose.Schema({
    invoiceId: String,
    username: String,
    productName: String,
    price: Number,
    formData: String, // Isi form user (JSON string)
    status: { type: String, default: 'pending' }, // pending, success, failed
    mode: String, // auto/manual
    date: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// Schema Produk (Existing)
const ProductSchema = new mongoose.Schema({ name: String, price: Number, desc: String, imageUrl: String, category: String, isAvailable: { type: Boolean, default: true } });
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, date: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);
const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
const PteroConfigSchema = new mongoose.Schema({ panelUrl: String, apiKey: String, serverId: String, cookie: String });
const PteroConfig = mongoose.models.PteroConfig || mongoose.model('PteroConfig', PteroConfigSchema);

// --- CONNECT DB ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; console.log("✅ DB Connected");
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) await new Admin({ username: 'man', password: '112233' }).save();
        // Init Config Default
        const checkConfig = await SiteConfig.findOne();
        if (!checkConfig) await new SiteConfig().save();
    } catch (err) { console.error("❌ DB Error:", err); }
};

// --- ROUTES ---
app.get('/api', (req, res) => res.send('Manzzy Backend v9.0 (Order System) Ready'));

// Auth
app.post('/api/login', async (req, res) => { await connectDB(); const { username, password } = req.body; const admin = await Admin.findOne({ username, password }); if (admin) res.json({ success: true }); else res.status(401).json({ success: false }); });
app.post('/api/register-user', async (req, res) => { await connectDB(); const { username, password } = req.body; try { const existing = await User.findOne({ username }); if (existing) return res.status(400).json({ success: false, message: "Username ada" }); const newUser = new User({ username, password }); await newUser.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/login-user', async (req, res) => { await connectDB(); const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) res.json({ success: true, username: user.username, balance: user.balance }); else res.status(401).json({ success: false }); });
app.get('/api/user/:username', async (req, res) => { await connectDB(); const user = await User.findOne({ username: req.params.username }); if (user) res.json({ balance: user.balance }); else res.status(404).json({ error: "User not found" }); });

// Top Up & Hapus Gambar
app.post('/api/topup', async (req, res) => { await connectDB(); try { await new TopUp({ username: req.body.username, amount: parseInt(req.body.amount), proofImage: req.body.proofImage }).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/admin/topups', async (req, res) => { await connectDB(); const list = await TopUp.find({ status: 'pending' }).sort({ date: 1 }); res.json(list); });
app.post('/api/admin/topup-action', async (req, res) => {
    await connectDB();
    const { id, action } = req.body;
    try {
        const topup = await TopUp.findById(id);
        if (!topup) return res.status(400).json({ error: "Invalid" });

        if (action === 'approve') {
            const user = await User.findOne({ username: topup.username });
            if (user) { user.balance += topup.amount; await user.save(); }
            topup.status = 'approved';
        } else {
            topup.status = 'rejected';
        }
        
        // FITUR HAPUS GAMBAR (Hemat Database)
        topup.proofImage = null; 
        
        await topup.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ORDER SYSTEM & CONFIG ---

// 1. Get/Set Site Config (Mode Auto/Manual)
app.get('/api/config', async (req, res) => { await connectDB(); const cfg = await SiteConfig.findOne(); res.json(cfg); });
app.post('/api/config', async (req, res) => { await connectDB(); try { await SiteConfig.deleteMany({}); await new SiteConfig(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

// 2. Create Order (Potong Saldo)
app.post('/api/order', async (req, res) => {
    await connectDB();
    const { username, productId, formData } = req.body;
    
    try {
        const user = await User.findOne({ username });
        const product = await Product.findById(productId);
        const config = await SiteConfig.findOne();

        if (!user || !product) return res.status(404).json({ success: false, msg: "Data tidak valid" });
        if (user.balance < product.price) return res.status(400).json({ success: false, msg: "Saldo tidak cukup" });

        // Potong Saldo
        user.balance -= product.price;
        await user.save();

        // Buat Order
        const inv = 'INV-' + Date.now().toString().slice(-6);
        const newOrder = new Order({
            invoiceId: inv,
            username: user.username,
            productName: product.name,
            price: product.price,
            formData: formData, // Data isian user
            mode: config.orderMode,
            status: config.orderMode === 'manual' ? 'success' : 'pending' // Manual dianggap lgsg sukses krn lanjut WA
        });
        await newOrder.save();

        res.json({ success: true, invoiceId: inv, mode: config.orderMode, productName: product.name, formData });
    } catch (err) { res.status(500).json({ success: false, msg: err.message }); }
});

// 3. Admin Get Orders
app.get('/api/admin/orders', async (req, res) => { await connectDB(); const list = await Order.find().sort({ date: -1 }).limit(50); res.json(list); });

// --- CRUD STANDAR (Categories, Products, Testimoni, Ptero) ---
// (Bagian ini sama seperti sebelumnya, disingkat agar muat)
app.get('/api/testimonials', async (req, res) => { await connectDB(); const r = await Testimonial.find().sort({ date: -1 }); res.json(r); });
app.post('/api/testimonials', async (req, res) => { await connectDB(); try { await new Testimonial(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/categories', async (req, res) => { await connectDB(); const c = await Category.find(); res.json(c); });
app.post('/api/categories', async (req, res) => { await connectDB(); try { await new Category(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.get('/api/products', async (req, res) => { await connectDB(); const { category } = req.query; const filter = category ? { category } : {}; const p = await Product.find(filter); res.json(p); });
app.post('/api/products', async (req, res) => { await connectDB(); try { await new Product(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.put('/api/products/:id', async (req, res) => { await connectDB(); try { await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.post('/api/ptero/config', async (req, res) => { await connectDB(); try { await PteroConfig.deleteMany({}); await new PteroConfig(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/ptero/config', async (req, res) => { await connectDB(); const config = await PteroConfig.findOne(); res.json(config || {}); });
// Note: Ptero Stats/Power removed from backend (moved to frontend client-side as requested previously)

module.exports = app;
