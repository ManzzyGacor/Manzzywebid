const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// 1. KONEKSI DATABASE
// (Penting: Gunakan satu koneksi global biar hemat resource)
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { 
        await mongoose.connect(process.env.MONGO_URI); 
        isConnected = true; 
    } catch (err) { 
        console.error("DB Error:", err); 
    }
};

// 2. SCHEMA
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', new mongoose.Schema({
    text: { type: String, default: "" }
}));

// 3. GET DATA (Dipanggil Frontend)
router.get('/', async (req, res) => {
    try {
        await connectDB();
        let data = await Announcement.findOne();
        if (!data) data = await new Announcement({ text: "" }).save();
        res.json(data);
    } catch (e) {
        console.error("GET Announcement Error:", e);
        res.status(500).json({ text: "" }); 
    }
});

// 4. POST DATA (Dipanggil Admin untuk Simpan)
router.post('/', async (req, res) => {
    try {
        await connectDB();
        const { text } = req.body;
        await Announcement.findOneAndUpdate({}, { text: text }, { upsert: true, new: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. DELETE DATA (Dipanggil Admin untuk Hapus)
router.delete('/', async (req, res) => {
    try {
        await connectDB();
        await Announcement.findOneAndUpdate({}, { text: "" });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// [WAJIB ADA] Ini kunci biar tidak error "reading 'apply'"
module.exports = router;