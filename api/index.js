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

// 6. Schema Config Pterodactyl (BARU)
const PteroConfigSchema = new mongoose.Schema({
    panelUrl: String,   // ex: https://panel.domain.com
    apiKey: String,     // ex: ptlc_xxxxx (Client API)
    serverId: String    // ex: a1b2c3d4 (Identifier)
});
const PteroConfig = mongoose.models.PteroConfig || mongoose.model('PteroConfig', PteroConfigSchema);

// --- KONEKSI DATABASE ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; console.log("✅ Database Connected");
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) await new Admin({ username: 'man', password: '112233' }).save();
    } catch (err) { console.error("❌ Database Error:", err); }
};

// --- ROUTES STANDAR (Login, Produk, dll) ---
app.get('/api', (req, res) => res.send('Manzzy Backend v4.0 (Pterodactyl Integration) Ready'));
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

// --- ROUTES PTERODACTYL (BARU & CANGGIH) ---

// 1. Simpan Config (Hanya Admin)
app.post('/api/ptero/config', async (req, res) => {
    await connectDB();
    try {
        // Hapus config lama, simpan yang baru (biar cuma 1)
        await PteroConfig.deleteMany({});
        const newConfig = new PteroConfig(req.body);
        await newConfig.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Get Config (Untuk diisi di form admin)
app.get('/api/ptero/config', async (req, res) => {
    await connectDB();
    const config = await PteroConfig.findOne();
    res.json(config || {});
});

// 3. Get Real-Time Stats (Untuk Homepage)
app.get('/api/ptero/stats', async (req, res) => {
    await connectDB();
    const config = await PteroConfig.findOne();
    if (!config) return res.status(404).json({ error: "Config not found" });

    try {
        // Fetch ke Pterodactyl
        const response = await fetch(`${config.panelUrl}/api/client/servers/${config.serverId}/resources`, {
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error("Gagal konek ke panel");
        const data = await response.json();
        
        // Format Data
        const stats = data.attributes.resources;
        const state = data.attributes.current_state; // running, offline, starting
        
        res.json({
            status: state,
            cpu: stats.cpu_absolute.toFixed(1),
            ram: (stats.memory_bytes / 1024 / 1024 / 1024).toFixed(2), // Byte to GB
            disk: (stats.disk_bytes / 1024 / 1024 / 1024).toFixed(2)   // Byte to GB
        });
    } catch (err) {
        // Kalau error/offline, kirim data dummy 0 biar web ga rusak
        res.json({ status: "offline", cpu: "0", ram: "0", disk: "0" });
    }
});

// 4. Power Action (Start/Stop/Restart) - Admin Only
app.post('/api/ptero/power', async (req, res) => {
    await connectDB();
    const config = await PteroConfig.findOne();
    const { signal } = req.body; // "start", "stop", "restart", "kill"

    try {
        const response = await fetch(`${config.panelUrl}/api/client/servers/${config.serverId}/power`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ signal })
        });
        
        if (!response.ok) throw new Error("Gagal kirim perintah");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
