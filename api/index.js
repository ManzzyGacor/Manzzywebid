const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// --- SCHEMAS ---

// 1. Schema Kategori (BARU)
const CategorySchema = new mongoose.Schema({
    name: String,
    imageUrl: String
});
const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);

// 2. Schema Product (UPDATE: tambah category & isAvailable)
const ProductSchema = new mongoose.Schema({
    name: String,
    price: String,
    desc: String,
    imageUrl: String,
    category: String,        // Menyimpan Nama Kategori
    isAvailable: { type: Boolean, default: true } // Status Tersedia/Habis
});
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

// 3. Schema Admin
const AdminSchema = new mongoose.Schema({
    username: String,
    password: String
});
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);


// --- KONEKSI DATABASE ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        isConnected = true;
        console.log("✅ Database Connected");
        
        // Auto-Create Admin (Safety)
        const checkAdmin = await Admin.findOne({ username: 'man' });
        if (!checkAdmin) {
            await new Admin({ username: 'man', password: '112233' }).save();
        }
    } catch (err) {
        console.error("❌ Database Error:", err);
    }
};

// --- ROUTES ---

app.get('/api', (req, res) => res.send('Manzzy Backend v2.0 Ready'));

// Login
app.post('/api/login', async (req, res) => {
    await connectDB();
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, password });
    if (admin) res.json({ success: true });
    else res.status(401).json({ success: false });
});

// --- API CATEGORY (BARU) ---
app.get('/api/categories', async (req, res) => {
    await connectDB();
    const categories = await Category.find();
    res.json(categories);
});

app.post('/api/categories', async (req, res) => {
    await connectDB();
    try {
        const newCat = new Category(req.body);
        await newCat.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/categories/:id', async (req, res) => {
    await connectDB();
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// --- API PRODUCTS (UPDATE) ---

// Get All Products
app.get('/api/products', async (req, res) => {
    await connectDB();
    // Bisa filter by query ?category=nama
    const { category } = req.query;
    let filter = {};
    if(category) filter.category = category;
    
    const products = await Product.find(filter);
    res.json(products);
});

// Add Product
app.post('/api/products', async (req, res) => {
    await connectDB();
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Edit Product (BARU: PUT)
app.put('/api/products/:id', async (req, res) => {
    await connectDB();
    try {
        await Product.findByIdAndUpdate(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete Product
app.delete('/api/products/:id', async (req, res) => {
    await connectDB();
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

module.exports = app;
