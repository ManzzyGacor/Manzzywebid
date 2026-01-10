const express = require('express');
const mongoose = require('mongoose');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const router = express.Router();

// 1. DATABASE CONNECTION
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; } 
    catch (err) { console.error("DB Error:", err); }
};

// API KEY RUMAHOTP (Pastikan Benar)
const RUMAHOTP_API_KEY = "otp_bEiRJAgrGjhzWAvz"; // Ganti dengan API Key kamu

// SCHEMA
const User = mongoose.models.User || mongoose.model('User');
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction');
const TopUpTx = mongoose.models.TopUpTx || mongoose.model('TopUpTx', new mongoose.Schema({
    orderId: String,        
    username: String,
    amount: Number,         
    fee: Number,            
    totalPayment: Number,   
    paymentNumber: String,  
    status: { type: String, default: 'pending' }, 
    expiredAt: Date,
    createdAt: { type: Date, default: Date.now }
}));

// HELPER FUNCTION
async function callRumahOTP(url, method = 'GET') {
    try {
        const res = await fetch(url, {
            method: method,
            headers: {
                'x-apikey': RUMAHOTP_API_KEY,
                'Accept': 'application/json'
            }
        });
        return await res.json();
    } catch (e) {
        console.error("API Call Error:", e);
        return { success: false, message: e.message };
    }
}

// ==========================================
// ROUTES
// ==========================================

// 1. CREATE DEPOSIT
router.post('/create', async (req, res) => {
    try {
        await connectDB();
        const { username, amount } = req.body;

        // Cek Config Maintenance
        try {
            const PaymentConfig = mongoose.models.PaymentConfig || mongoose.model('PaymentConfig');
            const config = await PaymentConfig.findOne();
            if (config && config.isAutoActive === false) {
                return res.json({ success: false, msg: "⛔ Metode Otomatis Maintenance." });
            }
        } catch (e) {}

        if (amount < 1000) return res.json({ success: false, msg: "Min Top Up Rp 1.000" });

        // Request ke RumahOTP
        const apiUrl = `https://www.rumahotp.com/api/v1/deposit/create?amount=${amount}&payment_id=qris`;
        const result = await callRumahOTP(apiUrl);

        if (result.success && result.data) {
            const d = result.data;
            
            // Simpan Transaksi Baru
            await new TopUpTx({
                orderId: d.id, // ID dari RumahOTP (ROxxx)
                username: username,
                amount: d.currency.diterima, 
                fee: d.currency.fee,
                totalPayment: d.currency.total, 
                paymentNumber: d.qr, 
                status: 'pending',
                expiredAt: new Date(d.expired)
            }).save();

            res.json({ 
                success: true, 
                data: {
                    orderId: d.id,
                    total: d.currency.total,
                    qrString: d.qr,
                    expiredAt: d.expired
                }
            });
        } else {
            console.error("Gagal Create:", result);
            res.json({ success: false, msg: "Gagal membuat QRIS (Server Error)." });
        }
    } catch (e) {
        console.error("Create Error:", e);
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// 2. CEK STATUS (Polling dari Browser) - [BAGIAN INI DIPERBAIKI]
router.get('/check/:orderId', async (req, res) => {
    try {
        await connectDB();
        const { orderId } = req.params;
        const tx = await TopUpTx.findOne({ orderId: orderId });
        
        if (!tx) return res.json({ success: false, status: 'not_found' });

        // Jika di database sudah sukses, langsung return sukses
        if (tx.status === 'success') return res.json({ success: true, status: 'success' });
        
        // JIKA MASIH PENDING, CEK LAGI KE RUMAHOTP (Force Check)
        const apiUrl = `https://www.rumahotp.com/api/v2/deposit/get_status?deposit_id=${orderId}`;
        const check = await callRumahOTP(apiUrl);

        console.log(`🔍 Checking ${orderId}:`, check); // Debug Log di Vercel

        if (check.success && check.data) {
            const statusPusat = check.data.status.toLowerCase(); // success/pending/cancel

            // KONDISI SUKSES
            if (statusPusat === 'success') {
                // Update Database Lokal
                tx.status = 'success';
                await tx.save();

                // Tambah Saldo User
                const user = await User.findOne({ username: tx.username });
                if (user) {
                    // Pastikan angka benar-benar number
                    const saldoMasuk = parseInt(tx.amount);
                    user.balance = (user.balance || 0) + saldoMasuk;
                    await user.save();

                    // Catat History
                    await new Transaction({ 
                        invoiceId: tx.orderId, 
                        username: user.username, 
                        productName: 'Deposit Otomatis', 
                        formData: `Via QRIS (Fee: ${tx.fee})`, 
                        amount: saldoMasuk,
                        status: 'success' 
                    }).save();

                    console.log(`✅ Saldo ${saldoMasuk} masuk ke ${user.username}`);
                }
                return res.json({ success: true, status: 'success' });
            } 
            // KONDISI BATAL
            else if (statusPusat === 'cancel' || statusPusat === 'canceled') {
                tx.status = 'canceled';
                await tx.save();
                return res.json({ success: true, status: 'canceled' });
            }
        }
        
        // Jika masih pending
        res.json({ success: true, status: 'pending' });

    } catch (e) {
        console.error("Check Error:", e);
        res.json({ success: false, status: 'error' });
    }
});

// 3. WEBHOOK (Callback Otomatis)
// URL Webhook kamu: https://domain-kamu.vercel.app/api/topup/webhook
router.post('/webhook', async (req, res) => {
    try {
        await connectDB();
        const data = req.body; 
        console.log("🔔 Webhook Masuk:", data);

        // Sesuaikan cara baca data webhook RumahOTP
        // RumahOTP biasanya kirim: { id: 'RO...', status: 'success' }
        const orderId = data.id || data.deposit_id;
        const status = data.status ? data.status.toLowerCase() : '';

        if (status === 'success') {
            const tx = await TopUpTx.findOne({ orderId: orderId });
            
            // Cek biar gak double saldo
            if (tx && tx.status === 'pending') {
                tx.status = 'success';
                await tx.save();

                const user = await User.findOne({ username: tx.username });
                if (user) {
                    const saldoMasuk = parseInt(tx.amount);
                    user.balance = (user.balance || 0) + saldoMasuk;
                    await user.save();

                    await new Transaction({ 
                        invoiceId: tx.orderId, 
                        username: user.username, 
                        productName: 'Deposit Otomatis', 
                        formData: 'Auto by Webhook', 
                        amount: saldoMasuk,
                        status: 'success' 
                    }).save();
                    console.log(`✅ Webhook: Saldo masuk ke ${user.username}`);
                }
            }
        }
        res.json({ success: true }); // Wajib balas 200 OK
    } catch (e) {
        console.error("Webhook Error:", e);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;