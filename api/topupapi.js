const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const router = express.Router();

// Ambil Model Setting yang udah kita buat sebelumnya (untuk API Key)
const Setting = mongoose.models.Setting || mongoose.model('Setting', new mongoose.Schema({
    rumahotp_key: String
}));

// Model Deposit untuk catat riwayat top up
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', new mongoose.Schema({
    username: String,
    depositId: String,
    amount: Number,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
}));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    username: String,
    balance: { type: Number, default: 0 }
}));

// Helper Request Manual V1 (Deposit pake V1)
async function callRumahOTPV1(endpoint) {
    const config = await Setting.findOne();
    if (!config || !config.rumahotp_key) throw new Error("API Key belum disetting!");

    const options = {
        hostname: 'www.rumahotp.io',
        path: `/api/v1/${endpoint}`,
        method: 'GET',
        headers: { 'x-apikey': config.rumahotp_key, 'Accept': 'application/json' }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

// ROUTE 1: Create Deposit
router.post('/create', async (req, res) => {
    const { amount } = req.body;
    const userId = req.session.userId;

    if (!userId) return res.json({ success: false, msg: "Silakan login dulu" });
    if (amount < 2000) return res.json({ success: false, msg: "Minimal top up Rp 2.000" });

    try {
        const user = await User.findById(userId);
        const result = await callRumahOTPV1(`deposit/create?amount=${amount}&payment_id=qris`);

        if (result.success) {
            await new Deposit({
                username: user.username,
                depositId: result.data.id,
                amount: result.data.currency.diterima
            }).save();
            res.json(result);
        } else {
            res.json({ success: false, msg: result.message });
        }
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

// ROUTE 2: Get Status & Auto-Update Saldo
router.get('/status/:depositId', async (req, res) => {
    try {
        const dep = await Deposit.findOne({ depositId: req.params.depositId, status: 'pending' });
        if (!dep) return res.json({ success: false, msg: "Data tidak ditemukan atau sudah diproses" });

        const result = await callRumahOTPV1(`deposit/get_status?deposit_id=${dep.depositId}`);

        if (result.success && result.data.status === 'success') {
            dep.status = 'success';
            await dep.save();

            // Tambah Saldo User
            await User.findOneAndUpdate(
                { username: dep.username },
                { $inc: { balance: dep.amount } }
            );
            return res.json({ success: true, status: 'success' });
        }
        res.json({ success: true, status: result.data.status });
    } catch (e) { res.json({ success: false }); }
});

module.exports = router;