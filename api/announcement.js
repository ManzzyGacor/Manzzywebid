const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// 1. KONEKSI DATABASE (WAJIB ADA)
// Tanpa ini, server tidak tau mau simpan data ke mana
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { 
        // Pastikan MONGO_URI ada di Environment Variables Vercel
        await mongoose.connect(process.env.MONGO_URI); 
        isConnected = true; 
    } catch (err) { 
        console.error("DB Error:", err); 
    }
};

// 2. SCHEMA DATABASE
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', new mongoose.Schema({
    text: { type: String, default: "Selamat datang di Manzzy ID Official!" },
    isActive: { type: Boolean, default: true }
}));

// 3. GET (Ambil Data)
router.get('/', async (req, res) => {
    try {
        await connectDB(); // Connect dulu
        let data = await Announcement.findOne();
        if (!data) data = await new Announcement().save();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 4. POST (Simpan Data)
router.post('/', async (req, res) => {
    try {
        await connectDB(); // Connect dulu
        const { text, isActive } = req.body;
        
        // Update data yang ada, atau buat baru jika belum ada
        const data = await Announcement.findOneAndUpdate(
            {}, 
            { text, isActive }, 
            { upsert: true, new: true }
        );
        
        res.json({ success: true, data });
    } catch (e) {
        console.error("Gagal Simpan:", e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;