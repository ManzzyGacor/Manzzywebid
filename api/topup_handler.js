const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const router = express.Router();

const RUMAHOTP_API_KEY = "rk-dev-TEjAEh29JdgEB6oItLoFdt4uoj34MEjM";

// 1. DATABASE CONNECTION
const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    try { await mongoose.connect(process.env.MONGO_URI); } 
    catch (err) { console.error("DB Error:", err); }
};

// 2. SCHEMAS
const User = mongoose.models.User || mongoose.model('User');
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction');
const TopUpTx = mongoose.models.TopUpTx || mongoose.model('TopUpTx', new mongoose.Schema({
    orderId: String,        
    username: String,
    amount: Number,         
    totalPayment: Number,   
    qrString: String,  
    status: { type: String, default: 'pending' }, 
    createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// FUNGSI INTI: ANTI-DOUBLE SALDO (Biar Gak Masuk 2x)
// ==========================================
async function prosesSaldoMasuk(orderId) {
    const tx = await TopUpTx.findOne({ orderId: orderId, status: 'pending' });
    if (!tx) return { success: false };

    // Kunci status jadi success dulu
    tx.status = 'success';
    await tx.save();

    const user = await User.findOne({ username: tx.username });
    if (user) {
        const saldoMasuk = parseInt(tx.amount);
        user.balance = (user.balance || 0) + saldoMasuk;
        await user.save();

        // Simpan ke riwayat transaksi umum
        await new Transaction({ 
            invoiceId: tx.orderId, 
            username: user.username, 
            productName: 'Deposit Otomatis', 
            formData: 'Auto Payment', 
            amount: saldoMasuk,
            status: 'success' 
        }).save();

        console.log(`✅ Saldo Rp${saldoMasuk} masuk ke ${user.username}`);
        return { success: true };
    }
    return { success: false };
}

// ==========================================
// 1. REQUEST TOP UP (QRIS)
// ==========================================
router.post('/create', async (req, res) => {
    try {
        await connectDB();
        const { username, amount } = req.body;
        const amountInt = parseInt(amount);

        // Request ke RumahOTP v1
        const url = `https://www.rumahotp.io/api/v1/deposit/create?amount=${amountInt}&payment_id=qris`;
        const response = await axios.get(url, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY, 'Accept': 'application/json' }
        });

        if (response.data.success) {
            const newTx = new TopUpTx({
                orderId: response.data.data.id,
                username: username,
                amount: amountInt,
                totalPayment: response.data.data.amount,
                qrString: response.data.data.qr_string,
                status: 'pending'
            });
            await newTx.save();

            res.json({ 
                success: true, 
                data: { 
                    orderId: newTx.orderId,
                    qrString: newTx.qrString, // Dibaca oleh topup.js
                    amount: newTx.totalPayment
                } 
            });
        } else {
            res.json({ success: false, msg: response.data.msg || "Gagal membuat QRIS" });
        }
    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// ==========================================
// 2. CEK STATUS (POLLING)
// ==========================================
router.get('/check/:orderId', async (req, res) => {
    try {
        await connectDB();
        
        // Cek status ke RumahOTP
        const url = `https://www.rumahotp.io/api/v1/deposit/get_status?deposit_id=${req.params.orderId}`;
        const response = await axios.get(url, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY }
        });

        if (response.data.success && response.data.data.status === 'success') {
            const hasil = await prosesSaldoMasuk(req.params.orderId);
            return res.json({ success: hasil.success, status: 'success' });
        }
        
        res.json({ success: true, status: 'pending' });
    } catch (e) { res.json({ success: false }); }
});

// ==========================================
// 3. WEBHOOK (OTOMATIS DARI PROVIDER)
// ==========================================
router.post('/webhook', async (req, res) => {
    try {
        await connectDB();
        const data = req.body;
        const orderId = data.id || data.deposit_id;
        const status = data.status ? data.status.toLowerCase() : '';

        if (status === 'success') {
            await prosesSaldoMasuk(orderId);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).send("OK"); }
});

module.exports = router;