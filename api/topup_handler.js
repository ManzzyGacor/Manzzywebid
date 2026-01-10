const express = require('express');
const mongoose = require('mongoose');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const router = express.Router();

// 1. DATABASE & SCHEMA
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try { await mongoose.connect(process.env.MONGO_URI); isConnected = true; } 
    catch (err) { console.error("DB Error:", err); }
};

// --- KONFIGURASI RUMAHOTP ---
// Ganti dengan API Key kamu
const RUMAHOTP_API_KEY = "otp_bEiRJAgrGjhzWAvz"; 

const User = mongoose.models.User || mongoose.model('User');
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction');

// Schema Transaksi TopUp
const TopUpTx = mongoose.models.TopUpTx || mongoose.model('TopUpTx', new mongoose.Schema({
    orderId: String,        // ID dari RumahOTP (RO...)
    username: String,
    amount: Number,         // Nominal yang diterima user (misal 2000)
    fee: Number,            // Biaya admin
    totalPayment: Number,   // Total yang harus dibayar (misal 2112)
    paymentNumber: String,  // QR String (Base64 Image)
    status: { type: String, default: 'pending' }, 
    expiredAt: Date,
    createdAt: { type: Date, default: Date.now }
}));

// 2. HELPER REQUEST KE RUMAHOTP
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
        console.error("API Error:", e);
        return { success: false, message: e.message };
    }
}

// ==========================================
// ROUTES
// ==========================================

// 1. BUAT QRIS (CREATE DEPOSIT)
router.post('/create', async (req, res) => {
    try {
        await connectDB();
        const { username, amount } = req.body;

        // [CEK MAINTENANCE DARI ADMIN]
        try {
            const PaymentConfig = mongoose.models.PaymentConfig || mongoose.model('PaymentConfig');
            const config = await PaymentConfig.findOne();
            if (config && config.isAutoActive === false) {
                return res.json({ success: false, msg: "⛔ Sistem Otomatis Maintenance. Gunakan Manual." });
            }
        } catch (errConfig) {}

        if (amount < 1000) return res.json({ success: false, msg: "Min Top Up Rp 2.000" });

        // Request ke RumahOTP
        // Endpoint: /api/v1/deposit/create?amount=NOMINAL&payment_id=qris
        const apiUrl = `https://www.rumahotp.com/api/v1/deposit/create?amount=${amount}&payment_id=qris`;
        const result = await callRumahOTP(apiUrl);

        if (result.success && result.data) {
            const d = result.data;

            // Simpan ke Database
            await new TopUpTx({
                orderId: d.id, // ID Deposit (ROxxxx)
                username: username,
                amount: d.currency.diterima, // Saldo bersih yang akan masuk
                fee: d.currency.fee,
                totalPayment: d.currency.total, // Total bayar (+fee)
                paymentNumber: d.qr, // Base64 Image QRIS
                status: 'pending',
                expiredAt: new Date(d.expired)
            }).save();

            res.json({ 
                success: true, 
                data: {
                    orderId: d.id,
                    total: d.currency.total,
                    qrString: d.qr, // Ini Base64 Image
                    expiredAt: d.expired
                }
            });
        } else {
            console.error("RumahOTP Error:", result);
            res.json({ success: false, msg: "Gagal membuat QRIS. Cek nominal/server." });
        }
    } catch (e) {
        console.error("Topup Create Error:", e);
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// 2. CEK STATUS (POLLING / MANUAL CHECK)
router.get('/check/:orderId', async (req, res) => {
    try {
        await connectDB();
        const tx = await TopUpTx.findOne({ orderId: req.params.orderId });
        
        if (!tx) return res.json({ success: false, status: 'not_found' });
        if (tx.status === 'success') return res.json({ success: true, status: 'success' });
        if (tx.status === 'canceled') return res.json({ success: true, status: 'canceled' });

        // Cek ke RumahOTP (Pakai V2 sesuai request agar lebih detail)
        const apiUrl = `https://www.rumahotp.com/api/v2/deposit/get_status?deposit_id=${tx.orderId}`;
        const check = await callRumahOTP(apiUrl);

        if (check.success && check.data) {
            const statusPusat = check.data.status; // success, pending, cancel

            if (statusPusat === 'success' && tx.status !== 'success') {
                // UPDATE SUKSES
                tx.status = 'success';
                await tx.save();

                const user = await User.findOne({ username: tx.username });
                if(user) {
                    user.balance += tx.amount; 
                    await user.save();

                    // Catat di History Transaksi
                    await new Transaction({ 
                        invoiceId: tx.orderId, 
                        username: user.username, 
                        productName: 'Deposit Otomatis', 
                        formData: `Via QRIS (Fee: ${tx.fee})`, 
                        amount: tx.amount,
                        status: 'success' 
                    }).save();
                }
                return res.json({ success: true, status: 'success' });

            } else if (statusPusat === 'cancel' && tx.status !== 'canceled') {
                // UPDATE GAGAL/CANCEL
                tx.status = 'canceled';
                await tx.save();
                return res.json({ success: true, status: 'canceled' });
            }
        }

        res.json({ success: true, status: 'pending' });

    } catch (e) {
        console.error("Check Error:", e);
        res.json({ success: false, status: 'error' });
    }
});

// 3. BATALKAN TRANSAKSI (CANCEL)
router.post('/cancel', async (req, res) => {
    try {
        await connectDB();
        const { orderId } = req.body;
        
        const tx = await TopUpTx.findOne({ orderId });
        if (!tx) return res.status(404).json({ success: false, msg: "Transaksi tidak ditemukan" });
        if (tx.status !== 'pending') return res.json({ success: false, msg: "Transaksi sudah selesai/batal" });

        // Request Cancel ke RumahOTP
        const apiUrl = `https://www.rumahotp.com/api/v1/deposit/cancel?deposit_id=${orderId}`;
        const result = await callRumahOTP(apiUrl);

        if (result.success) {
            tx.status = 'canceled';
            await tx.save();
            res.json({ success: true, msg: "Transaksi dibatalkan." });
        } else {
            res.json({ success: false, msg: "Gagal membatalkan di server pusat." });
        }

    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

module.exports = router;