
// api/index.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// --- MODELS (DEFINISI SCHEMA DI ATAS BIAR AMAN) ---

// 1. Model Product
const ProductSchema = new mongoose.Schema({
    name: String,
    price: String,
    desc: String,
    imageUrl: String
});
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

// 2. Model Admin
const AdminSchema = new mongoose.Schema({
    username: String,
    password: String
});
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);


// --- KONEKSI DATABASE SERVERLESS (Caching) ---
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    
    try {
        // Mengambil link database dari Environment Variable Vercel
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log("✅ Database Connected via Vercel");

        // --- FITUR AUTO-CREATE ADMIN ---
        // Cek apakah admin 'man' sudah ada?
        const checkAdmin = await Admin.findOne({ username: 'man' });
        
        if (!checkAdmin) {
            // Kalau belum ada, buat baru
            const newAdmin = new Admin({ username: 'man', password: '112233' });
            await newAdmin.save();
            console.log("⚠️ Akun Admin Otomatis Dibuat: User: man | Pass: 112233");
        } else {
            console.log("✅ Akun Admin 'man' sudah tersedia.");
        }

    } catch (err) {
        console.error("❌ Database Error:", err);
    }
};

// --- ROUTES ---

// 1. Root Route
app.get('/api', (req, res) => {
    res.send('Manzzy ID Backend is Running!');
});

// 2. Login
app.post('/api/login', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    
    // Cari admin di database
    const admin = await Admin.findOne({ username, password });
    
    if (admin) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Username/Password Salah!" });
    }
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
module.exports = app;
