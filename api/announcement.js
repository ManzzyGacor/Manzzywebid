const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// 1. KONEKSI DB (Penting biar gak putus)
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
    text: { type: String, default: "Selamat datang di Manzzy ID Official!" },
    isActive: { type: Boolean, default: true }
}));

// 3. ROUTE GET (Untuk Frontend/User)
router.get('/', async (req, res) => {
    try {
        await connectDB();
        let data = await Announcement.findOne();
        if (!data) data = await new Announcement().save();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. ROUTE POST (Untuk Admin Simpan)
router.post('/', async (req, res) => {
    try {
        await connectDB();
        const { text, isActive } = req.body;
        const data = await Announcement.findOneAndUpdate(
            {}, 
            { text, isActive }, 
            { upsert: true, new: true }
        );
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// [WAJIB ADA] KUNCI AGAR TIDAK ERROR "APPLY"
module.exports = router;