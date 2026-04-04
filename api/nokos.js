const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const router = express.Router();

const RUMAHOTP_API_KEY = "rk-dev-TEjAEh29JdgEB6oItLoFdt4uoj34MEjM";

// 1. DATABASE CONNECTION
const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(process.env.MONGO_URI);
};

// 2. SCHEMAS (Tetap dipertahankan semua kolomnya)
const User = mongoose.models.User || mongoose.model('User');
const NokosConfig = mongoose.models.NokosConfig || mongoose.model('NokosConfig', new mongoose.Schema({
    provider: { type: String, default: 'rumahotp' },
    apiKey: String,
    marginPercent: { type: Number, default: 20 }
}));

const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, username: String, orderId: String,
    serviceName: String, countryName: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: { type: String, default: '-' },
    expiresAt: Date, createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// 3. ROUTE UNTUK FRONTEND (Sesuai script.js)
// ==========================================

// Daftar Aplikasi (v2)
router.get('/services', async (req, res) => {
    try {
        const response = await axios.get('https://www.rumahotp.io/api/v2/services', {
            headers: { 'x-apikey': RUMAHOTP_API_KEY, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (e) { res.json({ success: false }); }
});

// Daftar Negara & Harga (v2)
router.get('/countries', async (req, res) => {
    try {
        // Biar fleksibel, kita terima serviceId (camelCase) atau service_id (snake_case)
        const sId = req.query.serviceId || req.query.service_id;
        
        if (!sId) return res.json({ success: false, msg: "Service ID diperlukan" });

        const response = await axios.get(`https://www.rumahotp.io/api/v2/countries?service_id=${sId}`, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY, 'Accept': 'application/json' }
        });
        
        // --- LOGIKA MARGIN OTOMATIS ---
        const config = await NokosConfig.findOne();
        const margin = config ? config.marginPercent : 15;

        const fixedData = response.data.data.map(country => {
            return {
                ...country,
                pricelist: country.pricelist.map(p => {
                    const finalPrice = Math.ceil(p.price * (1 + margin / 100));
                    return {
                        ...p,
                        price: finalPrice,
                        price_format: `Rp ${finalPrice.toLocaleString()}`
                    };
                })
            };
        });

        res.json({ success: true, data: fixedData });
    } catch (e) { 
        console.error(e);
        res.json({ success: false }); 
    }
});

// [STEP 3] PESAN NOMOR / ORDER (v2 - FIX Sesuai Dokumentasi)
router.post('/buy', async (req, res) => {
    try {
        await connectDB();
        // Ambil data dari payload frontend
        const { username, numberId, providerId, operatorId, serviceName, countryName, userPrice } = req.body;

        const user = await User.findOne({ username });
        if (!user || user.balance < userPrice) {
            return res.json({ success: false, msg: "Saldo tidak cukup!" });
        }

        const response = await axios.get('https://www.rumahotp.io/api/v2/orders', {
    params: {
        number_id: numberId,
        provider_id: providerId,
        operator_id: (operatorId === 'any') ? 1 : operatorId
    },
    headers: { 
        'x-apikey': RUMAHOTP_API_KEY, 
        'Accept': 'application/json' 
    }
});

        const result = response.data;

        if (result.success) {
            // 1. Potong Saldo
            user.balance -= userPrice;
            await user.save();

            // 2. Simpan ke database kita (Pakai order_id dari respon v2)
            const newTx = new NokosTx({
                invoiceId: 'INV' + Date.now(),
                username: username,
                orderId: result.data.order_id, // RO...
                serviceName: serviceName,
                countryName: countryName,
                phoneNumber: result.data.phone_number,
                price: userPrice,
                status: 'waiting',
                expiresAt: new Date(Date.now() + 15 * 60000) // 15 Menit
            });
            await newTx.save();

            res.json({ success: true, data: newTx });
        } else {
            // Jika gagal (stok habis/provider error)
            res.json({ success: false, msg: result.msg || "Gagal ambil nomor dari provider." });
        }
    } catch (e) {
        console.error("Order Error:", e.message);
        res.status(500).json({ success: false, msg: "Terjadi kesalahan pada server." });
    }
});

// [STEP 2.5] DAFTAR OPERATOR (v2)
router.get('/operators', async (req, res) => {
    try {
        const { country, provider_id } = req.query;
        const response = await axios.get(`https://www.rumahotp.io/api/v2/operators?country=${country}&provider_id=${provider_id}`, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY, 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (e) { res.json({ success: false }); }
});
// [PENTING] Cek Status untuk script.js (v1)
router.get('/status/:invoiceId', async (req, res) => {
    try {
        await connectDB();
        // script.js kamu kirim invoiceId, kita cari di DB
        const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
        if (!tx) return res.json({ success: false });

        // Cek status ke provider pakai orderId (RO...)
        const response = await axios.get(`https://www.rumahotp.io/api/v1/orders/get_status?order_id=${tx.orderId}`, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY }
        });

        if (response.data.success) {
            const remote = response.data.data;
            
            // 1. Jika OTP masuk
            if (remote.otp_code) {
                tx.smsCode = remote.otp_code;
                tx.status = 'completed';
                await tx.save();
            }
            // 2. Jika canceled dari provider tapi di kita masih waiting, lakukan refund
            if (remote.status === 'canceled' && tx.status === 'waiting') {
                tx.status = 'canceled';
                await tx.save();
                const user = await User.findOne({ username: tx.username });
                if(user) { user.balance += tx.price; await user.save(); }
            }
            res.json({ success: true, data: tx });
        } else {
            res.json({ success: false });
        }
    } catch (e) { res.json({ success: false }); }
});

// History per User
router.get('/history/:username', async (req, res) => {
    try {
        await connectDB();
        const list = await NokosTx.find({ username: req.params.username }).sort({ createdAt: -1 });
        res.json(list);
    } catch (e) { res.json([]); }
});

// ==========================================
// 4. ROUTE ADMIN (Tetap Ada!)
// ==========================================

// Config Admin
router.post('/admin/config', async (req, res) => {
    try {
        await connectDB();
        const { apiKey, marginPercent } = req.body;
        await NokosConfig.findOneAndUpdate({}, { apiKey, marginPercent }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// Stats Admin (Profit Calculation)
router.get('/admin/stats', async (req, res) => {
    try {
        await connectDB();
        const config = await NokosConfig.findOne();
        const margin = config ? config.marginPercent : 20;
        const txs = await NokosTx.find({ status: 'completed' }); // completed = success

        let omset = 0;
        let profit = 0;
        txs.forEach(tx => {
            omset += tx.price;
            const modal = tx.price / (1 + (margin / 100));
            profit += (tx.price - modal);
        });

        res.json({ success: true, total_trx: txs.length, omset: Math.floor(omset), profit: Math.floor(profit) });
    } catch (e) { res.json({ success: false }); }
});

module.exports = router;