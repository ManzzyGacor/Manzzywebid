const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Schema Pengumuman
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', new mongoose.Schema({
    text: { type: String, default: "Selamat datang di Manzzy ID Official!" },
    isActive: { type: Boolean, default: true }
}));

// 1. GET (Untuk User & Admin) - Ambil Data
router.get('/', async (req, res) => {
    try {
        let data = await Announcement.findOne();
        if (!data) data = await new Announcement().save();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. POST (Untuk Admin) - Update Data
router.post('/', async (req, res) => {
    try {
        const { text, isActive } = req.body;
        // Update atau Buat baru (Upsert)
        const data = await Announcement.findOneAndUpdate({}, { text, isActive }, { upsert: true, new: true });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

