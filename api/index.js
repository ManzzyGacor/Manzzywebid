const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// --- SCHEMAS ---

// 1. Schema Admin
const AdminSchema = new mongoose.Schema({ username: String, password: String });
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

// 2. Schema User (Pembeli) - BARU
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// 3. Schema Testimonial (Rating) - BARU
const TestimonialSchema = new mongoose.Schema({
    username: String,
    rating: Number, // 1 - 5
    comment: String,
    date: { type: Date, default: Date.now }
});
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

// 4. Schema Kategori
const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);

// 5. Schema Product
const ProductSchema = new mongoose.Schema({
    name: String, price: String, desc: String, imageUrl: String,
    category: String, isAvailable: { type: Boolean, default: true }
});
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

// --- KONEKSI DATABASE ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log("✅ Database Connected");
        // Auto-Create Admin
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) await new Admin({ username: 'man', password: '112233' }).save();
    } catch (err) { console.error("❌ Database Error:", err); }
};

// --- ROUTES ---

app.get('/api', (req, res) => res.send('Manzzy Backend v3.0 (User System) Ready'));

// --- AUTH ROUTES ---
// Admin Login
app.post('/api/login', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, password });
    if (admin) res.json({ success: true });
    else res.status(401).json({ success: false });
});

// User Register (BARU)
app.post('/api/register-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    try {
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ success: false, message: "Username sudah dipakai" });
        
        const newUser = new User({ username, password });
        await newUser.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// User Login (BARU)
app.post('/api/login-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) res.json({ success: true, username: user.username });
    else res.status(401).json({ success: false, message: "Username/Password Salah" });
});

// --- TESTIMONIAL ROUTES (BARU) ---
app.get('/api/testimonials', async (req, res) => {
    await connectDB();
    // Ambil yang terbaru dulu
    const reviews = await Testimonial.find().sort({ date: -1 });
    res.json(reviews);
});

app.post('/api/testimonials', async (req, res) => {
    await connectDB();
    try {
        const { username, rating, comment } = req.body;
        const newReview = new Testimonial({ username, rating, comment });
        await newReview.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CATEGORY & PRODUCT ROUTES (SAMA) ---
app.get('/api/categories', async (req, res) => { await connectDB(); const c = await Category.find(); res.json(c); });
app.post('/api/categories', async (req, res) => { await connectDB(); try { await new Category(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/products', async (req, res) => { await connectDB(); const { category } = req.query; const filter = category ? { category } : {}; const p = await Product.find(filter); res.json(p); });
app.post('/api/products', async (req, res) => { await connectDB(); try { await new Product(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.put('/api/products/:id', async (req, res) => { await connectDB(); try { await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

module.exports = app;
