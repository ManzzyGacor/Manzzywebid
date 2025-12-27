const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// --- SCHEMAS ---
const AdminSchema = new mongoose.Schema({ username: String, password: String });
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

const UserSchema = new mongoose.Schema({ username: { type: String, required: true, unique: true }, password: { type: String, required: true } });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, date: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);

const ProductSchema = new mongoose.Schema({ name: String, price: String, desc: String, imageUrl: String, category: String, isAvailable: { type: Boolean, default: true } });
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

// UPDATE: Tambah Field Cookie
const PteroConfigSchema = new mongoose.Schema({ 
    panelUrl: String, 
    apiKey: String, 
    serverId: String,
    cookie: String // <-- Field Baru
});
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
app.get('/api', (req, res) => res.send('Manzzy Backend v6.0 (Cookie Injector) Ready'));

// Auth & Standard Routes
app.post('/api/login', async (req, res) => { await connectDB(); const { username, password } = req.body; const admin = await Admin.findOne({ username, password }); if (admin) res.json({ success: true }); else res.status(401).json({ success: false }); });
app.post('/api/register-user', async (req, res) => { await connectDB(); const { username, password } = req.body; try { const existing = await User.findOne({ username }); if (existing) return res.status(400).json({ success: false, message: "Username sudah dipakai" }); const newUser = new User({ username, password }); await newUser.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/login-user', async (req, res) => { await connectDB(); const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) res.json({ success: true, username: user.username }); else res.status(401).json({ success: false, message: "Salah" }); });
app.get('/api/testimonials', async (req, res) => { await connectDB(); const r = await Testimonial.find().sort({ date: -1 }); res.json(r); });
app.post('/api/testimonials', async (req, res) => { await connectDB(); try { await new Testimonial(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/categories', async (req, res) => { await connectDB(); const c = await Category.find(); res.json(c); });
app.post('/api/categories', async (req, res) => { await connectDB(); try { await new Category(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.get('/api/products', async (req, res) => { await connectDB(); const { category } = req.query; const filter = category ? { category } : {}; const p = await Product.find(filter); res.json(p); });
app.post('/api/products', async (req, res) => { await connectDB(); try { await new Product(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.put('/api/products/:id', async (req, res) => { await connectDB(); try { await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// --- PTERODACTYL REAL-TIME (COOKIE INJECTED) ---

// Helper Headers: Pura-pura jadi browser + Bawa Cookie
const PTERO_HEADERS = (key, cookie) => ({
    'Authorization': `Bearer ${key}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie': cookie || '' // INI KUNCINYA
});

app.post('/api/ptero/config', async (req, res) => { await connectDB(); try { await PteroConfig.deleteMany({}); await new PteroConfig(req.body).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/ptero/config', async (req, res) => { await connectDB(); const config = await PteroConfig.findOne(); res.json(config || {}); });

app.get('/api/ptero/stats', async (req, res) => {
    await connectDB();
    const config = await PteroConfig.findOne();
    if (!config) return res.status(404).json({ error: "Config not found" });

    try {
        const response = await fetch(`${config.panelUrl}/api/client/servers/${config.serverId}/resources`, {
            headers: PTERO_HEADERS(config.apiKey, config.cookie)
        });
        
        if (!response.ok) {
            // Log error status untuk debugging
            console.log("Panel Status Code:", response.status);
            throw new Error("Panel Blocked/Error");
        }

        const data = await response.json();
        const stats = data.attributes.resources;
        const state = data.attributes.current_state; 
        
        res.json({
            status: state,
            cpu: stats.cpu_absolute.toFixed(1),
            ram: (stats.memory_bytes / 1024 / 1024 / 1024).toFixed(2),
            disk: (stats.disk_bytes / 1024 / 1024 / 1024).toFixed(2),
            uptime: stats.uptime || 0 
        });
    } catch (err) {
        res.json({ status: "offline", cpu: "0", ram: "0", disk: "0", uptime: 0 });
    }
});

app.post('/api/ptero/power', async (req, res) => {
    await connectDB();
    const config = await PteroConfig.findOne();
    const { signal } = req.body;
    try {
        const response = await fetch(`${config.panelUrl}/api/client/servers/${config.serverId}/power`, {
            method: 'POST',
            headers: PTERO_HEADERS(config.apiKey, config.cookie),
            body: JSON.stringify({ signal })
        });
        
        if (!response.ok) throw new Error("Gagal / CF Block");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
