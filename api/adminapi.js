const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import Models (Pastikan path-nya bener sesuai struktur folder lo)
const User = mongoose.models.User;
const Setting = mongoose.models.Setting;
const NokosTx = mongoose.models.NokosTx;

// MIDDLEWARE: Cek apakah yang akses beneran Admin
async function isAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ success: false, msg: "Login dulu" });
    const user = await User.findById(req.session.userId);
    if (user && user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, msg: "Bukan akses admin!" });
    }
}

// 1. Ambil Statistik Dashboard
router.get('/dashboard-stats', isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const users = await User.find();
        const totalBalance = users.reduce((acc, curr) => acc + (curr.balance || 0), 0);
        const totalResellers = await User.countDocuments({ role: 'reseller' });
        
        // Hitung order hari ini
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayOrders = await NokosTx.countDocuments({ createdAt: { $gte: startOfDay } });

        res.json({
            success: true,
            totalUsers,
            totalBalance,
            totalResellers,
            todayOrders
        });
    } catch (e) { res.json({ success: false, msg: e.message }); }
});

// 2. Cari User Berdasarkan Username
router.get('/users/search', isAdmin, async (req, res) => {
    try {
        const { username } = req.query;
        const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
        if (!user) return res.json({ success: false, msg: "User tidak ditemukan" });
        res.json({ success: true, user });
    } catch (e) { res.json({ success: false, msg: e.message }); }
});

// 3. Update Saldo User Manual
router.post('/users/balance', isAdmin, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        // Kita timpa saldonya atau tambah? Biasanya admin mau set nominal langsung
        await User.findByIdAndUpdate(userId, { balance: amount });
        res.json({ success: true, msg: "Saldo berhasil diupdate" });
    } catch (e) { res.json({ success: false, msg: e.message }); }
});

// 4. Ambil & Simpan Settingan
router.get('/settings', isAdmin, async (req, res) => {
    const config = await Setting.findOne();
    res.json(config || {});
});

router.post('/settings', isAdmin, async (req, res) => {
    try {
        const update = req.body;
        await Setting.findOneAndUpdate({}, update, { upsert: true });
        res.json({ success: true, msg: "Setting disimpan" });
    } catch (e) { res.json({ success: false, msg: e.message }); }
});

module.exports = router;
