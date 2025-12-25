
// api/index
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors()); // Penting agar frontend bisa akses backend

// --- KONEKSI DATABASE SERVERLESS (Caching) ---
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    try {
        // Mengambil link database dari Environment Variable Vercel
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log( true;
        console.log("✅ Dat);
    } catch (err) {
        console.error("❌ Database Error:", err);
    }
};

// --- MODELS ---
// Kita definisikan ulang di sini atau bisa dipisah file (biar simpel satukan aja)
const ProductSchema = new mongoose.Schema({
    name: String,
    price: String,
    desc: String,
    imageUrl: String
});
// Cek jika model sudah ada biar gak error overwrite
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

const AdminSchema = new mongoose.Schema({
    username: String,
    password: String
});
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

// --- ROUTES ---

// 1. Root Route (Cek server hidup)
app.get('/api', (req, res) => {
    res.send('Manzzy ID Backend is Running!');
});

// 2. Login
app.post('/api/login', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, password });
    if (admin) res.json({ success: true });
    else res.status(401).json({ success: false, message: "Salah!" });
});

// 3. Get Products
app.get('/api/products', async (req, res) => {
    await connectDB();
    const products = await Product.find();
    res.json(products);
});

// 4. Add Product
app.post('/api/products', async (req, res) => {
    await connectDB();
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Delete Product
app.delete('/api/products/:id', async (req, res) => {
    await connectDB();
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// PENTING: Jangan pakai app.listen()!
// Vercel butuh kita export app-nya.
module.exports = app;

