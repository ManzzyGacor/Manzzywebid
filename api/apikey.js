const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();

// HELPER: Ambil Model User (Pastikan Schema sudah terload di index.js)
const getUserModel = () => mongoose.models.User || mongoose.model('User');

// ==========================================
// MIDDLEWARE: CEK API KEY (Dipakai untuk melindungi route)
// ==========================================
const authApiKey = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer mzy_..."

    if (!token) return res.status(401).json({ success: false, msg: "Akses Ditolak: API Key tidak ditemukan." });

    try {
        const User = getUserModel();
        // Cari user pemilik key ini
        const user = await User.findOne({ apiKey: token });
        
        if (!user) return res.status(403).json({ success: false, msg: "API Key Invalid / Tidak Terdaftar." });

        // Simpan data user di request agar bisa dipakai route selanjutnya
        req.user = user;
        next();
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, msg: "Server Error saat validasi key." });
    }
};

// ==========================================
// ROUTE: GENERATE API KEY BARU
// ==========================================
router.post('/user/generate-apikey', async (req, res) => {
    const { username } = req.body;
    
    try {
        const User = getUserModel();
        // 1. Buat Key Random (Format: mzy_live_xxxx)
        const randomStr = crypto.randomBytes(16).toString('hex');
        const newKey = `mzy_live_${randomStr}`;
        
        // 2. Simpan ke Database User
        const user = await User.findOneAndUpdate(
            { username }, 
            { apiKey: newKey }, 
            { new: true }
        );
        
        if(!user) return res.status(404).json({ success: false, msg: "User tidak ditemukan" });
        
        res.json({ success: true, apiKey: newKey });
    } catch(e) {
        res.status(500).json({ success: false, msg: "Gagal generate key: " + e.message });
    }
});

// ==========================================
// ROUTE: CEK PROFILE (Contoh Endpoint Developer)
// ==========================================
router.get('/v1/profile', authApiKey, (req, res) => {
    res.json({
        success: true,
        data: {
            username: req.user.username,
            balance: req.user.balance,
            role: req.user.role,
            status: "Active"
        }
    });
});

module.exports = { router, authApiKey };

