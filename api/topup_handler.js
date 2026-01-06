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

// Config Pakasir (Manual Config di Code)
const PAKASIR_API_KEY = "IlW5ldOEdH6jSDTTrMwB8B2rA1umtsv5"; 
const PAKASIR_PROJECT = "manzzy"; // contoh: depodomain

const User = mongoose.models.User || mongoose.model('User');
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction');

const TopUpTx = mongoose.models.TopUpTx || mongoose.model('TopUpTx', new mongoose.Schema({
    orderId: String,
    username: String,
    amount: Number,
    fee: Number,
    totalPayment: Number,
    paymentNumber: String, // QR String
    status: { type: String, default: 'pending' }, 
    expiredAt: Date,
    createdAt: { type: Date, default: Date.now }
}));

// 2. HELPER API PAKASIR
async function callPakasir(endpoint, data) {
    const payload = {
        project: PAKASIR_PROJECT,
        api_key: PAKASIR_API_KEY,
        ...data
    };

    try {
        const res = await fetch(`https://app.pakasir.com/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        return { error: e.message };
    }
}

// ==========================================
// ROUTES
// ==========================================

// ... (Kode Sebelumnya)

// 1. BUAT QRIS (CREATE)
router.post('/create', async (req, res) => {
    await connectDB();
    const { username, amount } = req.body;

    // [BARU] CEK STATUS MAINTENANCE
    const PaymentConfig = mongoose.models.PaymentConfig || mongoose.model('PaymentConfig');
    const config = await PaymentConfig.findOne();
    
    // Jika config ada DAN Auto Active = False, tolak transaksi
    if (config && config.isAutoActive === false) {
        return res.json({ success: false, msg: "⛔ Metode Otomatis Sedang Maintenance. Silakan gunakan Top Up Manual." });
    }

    if (amount < 1000) return res.json({ success: false, msg: "Min Top Up Rp 1.000" });
    
    // Buat Order ID Unik
    const orderId = 'TOP-' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 999);

    // Request ke Pakasir
    const result = await callPakasir('transactioncreate/qris', {
        order_id: orderId,
        amount: parseInt(amount)
    });

    if (result.payment) {
        await new TopUpTx({
            orderId: orderId,
            username: username,
            amount: parseInt(amount), // Saldo murni yg masuk
            fee: result.payment.fee,
            totalPayment: result.payment.total_payment, // Total yg harus dibayar user
            paymentNumber: result.payment.payment_number,
            expiredAt: new Date(result.payment.expired_at)
        }).save();

        res.json({ 
            success: true, 
            data: {
                orderId: orderId,
                total: result.payment.total_payment,
                qrString: result.payment.payment_number,
                expiredAt: result.payment.expired_at
            }
        });
    } else {
        console.error("Pakasir Error:", result);
        res.json({ success: false, msg: "Gagal membuat QRIS. Cek API Key." });
    }
});

// 2. CEK STATUS (Polling Frontend)
router.get('/check/:orderId', async (req, res) => {
    await connectDB();
    const tx = await TopUpTx.findOne({ orderId: req.params.orderId });
    if (!tx) return res.json({ success: false, status: 'not_found' });

    if (tx.status === 'success') return res.json({ success: true, status: 'success' });

    // Optional: Cek manual ke Pakasir jika webhook delay
    try {
        const checkUrl = `https://app.pakasir.com/api/transactiondetail?project=${PAKASIR_PROJECT}&amount=${tx.amount}&order_id=${tx.orderId}&api_key=${PAKASIR_API_KEY}`;
        const check = await fetch(checkUrl);
        const data = await check.json();

        if (data.transaction && data.transaction.status === 'completed') {
            tx.status = 'success';
            await tx.save();

            const user = await User.findOne({ username: tx.username });
            if(user) {
                user.balance += tx.amount; 
                await user.save();
                await new Transaction({ invoiceId: tx.orderId, username: user.username, productName: 'Deposit QRIS', formData: 'Auto Check', amount: tx.amount, status: 'success' }).save();
            }
            return res.json({ success: true, status: 'success' });
        }
    } catch(e) {}

    res.json({ success: true, status: 'pending' });
});

// 3. WEBHOOK (WAJIB DIPASANG DI PAKASIR)
router.post('/webhook', async (req, res) => {
    await connectDB();
    const { order_id, status, amount } = req.body;

    console.log(`🔔 Webhook: ${order_id} | Status: ${status}`);

    if (status === 'completed') {
        const tx = await TopUpTx.findOne({ orderId: order_id });
        
        // SECURITY CHECK: Pastikan transaksi ada & status masih PENDING
        // Ini mencegah saldo masuk 2x (Double Deposit)
        if (tx && tx.status === 'pending') {
            tx.status = 'success';
            await tx.save();

            const user = await User.findOne({ username: tx.username });
            if(user) {
                user.balance += tx.amount; 
                await user.save();

                await new Transaction({ 
                    invoiceId: tx.orderId, 
                    username: user.username, 
                    productName: 'Deposit Otomatis', 
                    formData: 'Auto by Webhook', 
                    amount: tx.amount,
                    status: 'success' 
                }).save();
                console.log(`✅ Sukses masuk saldo ke ${user.username}`);
            }
        } else {
            console.log("⚠️ Transaksi sudah sukses duluan / tidak valid.");
        }
    }
    
    // Wajib response 200 OK ke Pakasir
    res.json({ received: true });
});

module.exports = router;