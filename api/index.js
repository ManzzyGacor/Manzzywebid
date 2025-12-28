const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

// --- IMPORT ROUTE NOKOS (Pastikan file api/nokos.js ada!) ---
const nokosRoute = require('./nokos');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

// --- DATABASE CONNECT ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { 
        await mongoose.connect(process.env.MONGO_URI); 
        isConnected = true; 
        console.log("✅ DB Connected");
        
        // Init Admin Default
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) await new Admin({ username: 'man', password: '112233' }).save();

        // Init System Status (Manual Control)
        const checkStatus = await SystemStatus.findOne({ id: 'main' });
        if (!checkStatus) await new SystemStatus({ id: 'main' }).save();

    } catch (err) { console.error("❌ DB Error:", err); }
};

// =========================================
// SCHEMAS
// =========================================

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

const ActiveServiceSchema = new mongoose.Schema({
    username: String, productName: String, targetNumber: String, serverIp: String,
    status: { type: String, default: 'active' }, expiredDate: Date, createdDate: { type: Date, default: Date.now }
});
const ActiveService = mongoose.models.ActiveService || mongoose.model('ActiveService', ActiveServiceSchema);

const VoucherSchema = new mongoose.Schema({
    code: { type: String, unique: true }, amount: Number, expiredDate: Date,
    maxUsage: { type: Number, default: 1 }, usedBy: [String] 
});
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', VoucherSchema);

// SYSTEM STATUS (MANUAL CONTROL)
const SystemStatusSchema = new mongoose.Schema({
    id: { type: String, default: 'main' },
    botActive: { type: Boolean, default: true },
    botStartTime: { type: Date, default: Date.now },
    vpsActive: { type: Boolean, default: true },
    vpsStartTime: { type: Date, default: Date.now }
});
const SystemStatus = mongoose.models.SystemStatus || mongoose.model('SystemStatus', SystemStatusSchema);

const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, date: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

// =========================================
// API ROUTES
// =========================================

app.get('/api', (req, res) => res.send('Manzzy Backend v13.0 (Nokos Integrated)'));

// --- [PENTING] MOUNT ROUTE NOKOS ---
app.use('/api/nokos', nokosRoute);

// 1. AUTH
app.post('/api/register-user', async (req, res) => { await connectDB(); const { username, password } = req.body; try { const existing = await User.findOne({ username }); if (existing) return res.status(400).json({ success: false, message: "Username sudah dipakai" }); const newUser = new User({ username, password }); await newUser.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/login-user', async (req, res) => { await connectDB(); const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) res.json({ success: true, username: user.username, balance: user.balance }); else res.status(401).json({ success: false, message: "Password Salah" }); });
app.get('/api/user/:username', async (req, res) => { await connectDB(); const user = await User.findOne({ username: req.params.username }); if (user) res.json({ username: user.username, balance: user.balance }); else res.status(404).json({ error: "User not found" }); });

// 2. ORDER (AUTO SUCCESS)
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

        user.balance -= product.price; await user.save();
        const inv = 'INV-' + Date.now().toString().slice(-6);
        let status = 'pending';
        // Auto Success untuk mode auto & manual (agar history rapi)
        if (product.orderMode === 'auto' || product.orderMode === 'manual') status = 'success'; 
        await new Order({ invoiceId: inv, username: user.username, productName: product.name, price: product.price, formData, mode: product.orderMode, status }).save();
        res.json({ success: true, invoiceId: inv, mode: product.orderMode, productName: product.name, formData });
    } catch (err) { res.status(500).json({ success: false, msg: err.message }); }
});

// 3. TOP UP
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
    topup.proofImage = null; await topup.save();
    res.json({ success: true });
});

// 4. VOUCHER
app.post('/api/admin/vouchers', async (req, res) => { await connectDB(); const { code, amount, days, maxUsage } = req.body; const expDate = new Date(); expDate.setDate(expDate.getDate() + parseInt(days)); try { await new Voucher({ code, amount, expiredDate: expDate, maxUsage: maxUsage||1 }).save(); res.json({ success: true }); } catch (e) { res.status(400).json({ success: false, msg: "Kode Error" }); } });
app.get('/api/admin/vouchers', async (req, res) => { await connectDB(); const list = await Voucher.find().sort({ expiredDate: 1 }); res.json(list); });
app.delete('/api/admin/vouchers/:id', async (req, res) => { await connectDB(); await Voucher.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.post('/api/redeem', async (req, res) => { await connectDB(); const { username, code } = req.body; try { const voucher = await Voucher.findOne({ code }); if (!voucher) return res.status(404).json({ success: false, msg: "Kode Salah!" }); if (new Date() > new Date(voucher.expiredDate)) return res.status(400).json({ success: false, msg: "Kode Kadaluarsa!" }); if (voucher.usedBy.length >= voucher.maxUsage) return res.status(400).json({ success: false, msg: "Voucher Habis!" }); if (voucher.usedBy.includes(username)) return res.status(400).json({ success: false, msg: "Sudah Dipakai!" }); const user = await User.findOne({ username }); if (!user) return res.status(404).json({ success: false, msg: "User Error" }); user.balance += voucher.amount; await user.save(); voucher.usedBy.push(username); await voucher.save(); res.json({ success: true, amount: voucher.amount }); } catch (err) { res.status(500).json({ success: false, msg: "Server Error" }); } });

// 5. MANUAL SYSTEM CONTROL
app.get('/api/system/status', async (req, res) => { await connectDB(); const status = await SystemStatus.findOne({ id: 'main' }); res.json(status || {}); });
app.post('/api/admin/system/toggle', async (req, res) => { await connectDB(); const { type, action } = req.body; const status = await SystemStatus.findOne({ id: 'main' }); if (!status) return res.status(404).json({ success: false }); const now = new Date(); if (type === 'bot') { if (action === 'on' && !status.botActive) status.botStartTime = now; status.botActive = (action === 'on'); } else if (type === 'vps') { if (action === 'on' && !status.vpsActive) status.vpsStartTime = now; status.vpsActive = (action === 'on'); } await status.save(); res.json({ success: true, status }); });

// 6. HISTORY & SERVICES
app.get('/api/services/:username', async (req, res) => { await connectDB(); const services = await ActiveService.find({ username: req.params.username }).sort({ expiredDate: 1 }); res.json(services); });
app.post('/api/admin/services', async (req, res) => { await connectDB(); const { username, productName, targetNumber, serverIp, days } = req.body; const expDate = new Date(); expDate.setDate(expDate.getDate() + parseInt(days)); await new ActiveService({ username, productName, targetNumber, serverIp, expiredDate: expDate }).save(); res.json({ success: true }); });
app.put('/api/admin/services/:id', async (req, res) => { await connectDB(); const service = await ActiveService.findById(req.params.id); if(service){ const d = new Date(service.expiredDate); d.setDate(d.getDate() + parseInt(req.body.days)); service.expiredDate = d; service.status='active'; await service.save(); } res.json({ success: true }); });
app.delete('/api/admin/services/:id', async (req, res) => { await connectDB(); await ActiveService.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.get('/api/admin/all-services', async (req, res) => { await connectDB(); const list = await ActiveService.find().sort({ createdDate: -1 }); res.json(list); });

app.get('/api/history/:username', async (req, res) => { 
    await connectDB(); 
    try { 
        // Topup
        const topups = await TopUp.find({ username: req.params.username }).lean(); 
        const historyTopup = topups.map(t => ({ 
            type: 'IN', desc: 'Top Up Saldo', amount: t.amount, 
            status: t.status === 'approved' ? 'success' : (t.status === 'rejected' ? 'failed' : 'pending'), 
            date: t.date || t._id.getTimestamp() 
        })); 
        
        // Order
        const orders = await Order.find({ username: req.params.username }).lean(); 
        const historyOrder = orders.map(o => ({ 
            type: 'OUT', desc: o.productName, amount: o.price, 
            status: o.status || 'success', date: o.date || o._id.getTimestamp() 
        })); 

        const fullHistory = [...historyTopup, ...historyOrder].sort((a, b) => new Date(b.date) - new Date(a.date)); 
        res.json(fullHistory); 
    } catch (err) { res.status(500).json([]); } 
});

// 7. MISC
app.post('/api/login', async (req, res) => { await connectDB(); const admin = await Admin.findOne(req.body); if(admin) res.json({success:true}); else res.status(401).json({success:false}); });
app.get('/api/admin/orders', async (req, res) => { await connectDB(); const list = await Order.find().sort({ date: -1 }).limit(50); res.json(list); });
app.get('/api/categories', async (req, res) => { await connectDB(); const c = await Category.find(); res.json(c); });
app.post('/api/categories', async (req, res) => { await connectDB(); await new Category(req.body).save(); res.json({ success: true }); });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.get('/api/testimonials', async (req, res) => { await connectDB(); const r = await Testimonial.find().sort({ date: -1 }); res.json(r); });
app.post('/api/testimonials', async (req, res) => { await connectDB(); await new Testimonial(req.body).save(); res.json({ success: true }); });

module.exports = app;