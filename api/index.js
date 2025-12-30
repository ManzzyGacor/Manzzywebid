const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' })); 

// Helper Fetch (Untuk verifikasi token Google)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 1. KONEKSI DB
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; } 
    catch (err) { console.error("DB Error:", err); }
};

// ==========================================
// [BARU] LOGIN ADMIN & GOOGLE AUTH
// ==========================================

// Login Admin (Hardcode)
app.post('/api/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'man' && password === '112233') {
        return res.json({ success: true, username: 'Manzzy (Owner)', role: 'admin', token: 'admin-super-token' });
    }
    return res.status(400).json({ success: false, message: "Password Salah" });
});

// Login Google (Auto Register)
app.post('/api/auth/google', async (req, res) => {
    await connectDB();
    const { token } = req.body;

    try {
        // 1. Verifikasi Token ke Google
        const verify = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
        const googleData = await verify.json();

        // Jika token tidak valid / expired
        if (!googleData.email) return res.status(400).json({ success: false, msg: "Token Google Invalid" });

        const email = googleData.email;

        // 2. Cek User di Database
        let user = await User.findOne({ username: email });

        if (!user) {
            // 3. Jika Belum Ada -> Buat User Baru (Auto Register)
            // Password random karena login via Google
            const randomPass = Math.random().toString(36).slice(-8) + "GooGLE";
            
            user = new User({
                username: email, // Username pakai email
                password: randomPass, 
                balance: 0,
                role: 'member'
            });
            await user.save();
        }

        // 4. Login Sukses
        res.json({ 
            success: true, 
            username: user.username, 
            balance: user.balance, 
            role: user.role,
            isGoogle: true
        });

    } catch (e) {
        console.error("Google Auth Error:", e);
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// ==========================================
// SCHEMA DEFINITIONS
// ==========================================
const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' } 
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const ActiveServiceSchema = new mongoose.Schema({ username: String, productName: String, targetNumber: String, serverIp: String, expiredDate: Date });
const ActiveService = mongoose.models.ActiveService || mongoose.model('ActiveService', ActiveServiceSchema);

const TopUpSchema = new mongoose.Schema({ username: String, amount: Number, proofImage: String, status: { type: String, default: 'pending' }, createdAt: { type: Date, default: Date.now } });
const TopUp = mongoose.models.TopUp || mongoose.model('TopUp', TopUpSchema);

const ProductSchema = new mongoose.Schema({ name: String, category: String, price: Number, desc: String, imageUrl: String, formFields: String, isAvailable: { type: Boolean, default: true }, orderMode: { type: String, default: 'manual' } });
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const VoucherSchema = new mongoose.Schema({ code: { type: String, required: true, unique: true }, percent: { type: Number, required: true }, createdAt: { type: Date, default: Date.now } });
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', VoucherSchema);

const CategorySchema = new mongoose.Schema({ name: String, imageUrl: String });
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);

const TestimonialSchema = new mongoose.Schema({ username: String, rating: Number, comment: String, createdAt: { type: Date, default: Date.now } });
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

const TransactionSchema = new mongoose.Schema({ invoiceId: String, username: String, productName: String, formData: String, amount: Number, status: { type: String, default: 'success' }, createdAt: { type: Date, default: Date.now } });
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

// ==========================================
// ROUTES AUTH USER BIASA
// ==========================================

app.post('/api/login-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(400).json({ success: false, message: "Username/Password Salah" });
        res.json({ success: true, username: user.username, balance: user.balance, role: user.role });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/register-user', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    try {
        const exist = await User.findOne({ username });
        if (exist) return res.status(400).json({ success: false, message: "Username ada" });
        await new User({ username, password }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/user/:username', async (req, res) => {
    if(req.params.username === 'Manzzy (Owner)') return res.json({ username: 'Manzzy (Owner)', balance: 999999999, role: 'admin' });
    await connectDB();
    const user = await User.findOne({ username: req.params.username });
    res.json(user || {});
});

// ==========================================
// ROUTES ADMIN DASHBOARD DATA
// ==========================================

app.get('/api/admin/orders', async (req, res) => { await connectDB(); res.json(await Transaction.find().sort({ createdAt: -1 }).limit(50)); });
app.get('/api/admin/topups', async (req, res) => { await connectDB(); res.json(await TopUp.find().sort({ createdAt: -1 })); });

app.post('/api/admin/topup/action', async (req, res) => {
    await connectDB();
    const { id, action } = req.body;
    try {
        if (action === 'approve') {
            const tx = await TopUp.findOneAndUpdate({ _id: id, status: 'pending' }, { status: 'success', proofImage: null }, { new: true });
            if (!tx) return res.status(400).json({ success: false, message: "Sudah diproses" });
            const user = await User.findOne({ username: tx.username });
            if(user) {
                user.balance += tx.amount;
                await new Transaction({ invoiceId: 'TOP', username: user.username, productName: 'Deposit', amount: tx.amount, status: 'success' }).save();
                await user.save();
            }
            res.json({ success: true });
        } else {
            await TopUp.findOneAndUpdate({ _id: id, status: 'pending' }, { status: 'failed', proofImage: null });
            res.json({ success: true });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/all-services', async (req, res) => { await connectDB(); res.json(await ActiveService.find().sort({ expiredDate: 1 })); });
app.post('/api/admin/services', async (req, res) => {
    await connectDB();
    const { username, productName, targetNumber, serverIp, days } = req.body;
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    await new ActiveService({ username, productName, targetNumber, serverIp, expiredDate: exp }).save();
    res.json({ success: true });
});
app.delete('/api/admin/services/:id', async (req, res) => { await connectDB(); await ActiveService.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/services/:username', async (req, res) => { await connectDB(); res.json(await ActiveService.find({ username: req.params.username })); });

app.get('/api/products', async (req, res) => { await connectDB(); res.json(await Product.find()); });
app.post('/api/products', async (req, res) => { await connectDB(); await new Product(req.body).save(); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await connectDB(); await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/categories', async (req, res) => { await connectDB(); res.json(await Category.find()); });
app.post('/api/categories', async (req, res) => { await connectDB(); await new Category(req.body).save(); res.json({ success: true }); });
app.delete('/api/categories/:id', async (req, res) => { await connectDB(); await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/admin/vouchers', async (req, res) => { await connectDB(); res.json(await Voucher.find()); });
app.post('/api/admin/voucher', async (req, res) => { await connectDB(); try { await new Voucher(req.body).save(); res.json({success:true}); } catch(e){ res.json({success:false}); } });
app.delete('/api/admin/voucher/:id', async (req, res) => { await connectDB(); await Voucher.findByIdAndDelete(req.params.id); res.json({success:true}); });

app.post('/api/check-voucher', async (req, res) => {
    await connectDB();
    const v = await Voucher.findOne({ code: req.body.code });
    if(v) res.json({ success: true, percent: v.percent }); else res.json({ success: false });
});

app.post('/api/admin/system/toggle', (req, res) => res.json({ success: true }));
app.get('/api/system/status', (req, res) => res.json({ vpsActive: true, vpsStartTime: new Date(Date.now()-36000000), botActive: true, botStartTime: new Date(Date.now()-18000000) }));

app.post('/api/topup', async (req, res) => { await connectDB(); await new TopUp(req.body).save(); res.json({ success: true }); });
app.post('/api/order', async (req, res) => {
    await connectDB();
    const { username, productId, formData, voucherCode } = req.body;
    const user = await User.findOne({ username });
    const prod = await Product.findById(productId);
    if(!user || !prod) return res.json({ success: false, msg: "Data invalid" });
    
    let price = prod.price;
    let note = "";
    if(voucherCode) {
        const v = await Voucher.findOne({ code: voucherCode });
        if(v) { price = price - Math.ceil(price * (v.percent/100)); note = `(Disc ${v.percent}%)`; }
    }

    if(user.balance < price) return res.json({ success: false, msg: "Saldo kurang" });
    user.balance -= price; await user.save();

    const inv = 'INV-' + Date.now().toString().slice(-6);
    await new Transaction({ invoiceId: inv, username, productName: `${prod.name} ${note}`, formData, amount: price }).save();
    res.json({ success: true, invoiceId: inv, productName: prod.name, mode: prod.orderMode });
});

app.get('/api/history/:username', async (req, res) => {
    await connectDB();
    const txs = await Transaction.find({ username: req.params.username }).sort({ createdAt: -1 }).limit(20);
    res.json(txs.map(t => ({ date: t.createdAt, desc: t.productName, amount: t.amount, status: t.status, type: t.productName==='Deposit'?'IN':'OUT' })));
});

app.post('/api/testimonials', async (req, res) => { await connectDB(); await new Testimonial(req.body).save(); res.json({ success: true }); });
app.get('/api/testimonials', async (req, res) => { await connectDB(); res.json(await Testimonial.find().sort({ createdAt: -1 }).limit(10)); });

const nokosRouter = require('./nokos');
app.use('/api/nokos', nokosRouter);

module.exports = app;