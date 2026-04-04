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
        
        // 1. Ambil data & Paksa ke Tipe Number yang benar
        const username = req.body.username;
        const serviceName = req.body.service_name || req.body.serviceName;
        const countryName = req.body.country_name || req.body.countryName || req.body.country;
        
let rawPrice = req.body.userPrice || req.body.user_price || req.body.price;

let priceToPay = Number(String(rawPrice).replace(/[^0-9]/g, '')); 

        const rawNumberId = req.body.number_id || req.body.numberId;
        const rawProviderId = req.body.provider_id || req.body.providerId;
        const rawOperatorId = req.body.operator_id || req.body.operatorId;

        const finalNumberId = Number(rawNumberId);
        const finalProviderId = Number(rawProviderId);
        const finalOperatorId = (rawOperatorId === 'any' || !rawOperatorId) ? 1 : Number(rawOperatorId);

        // 2. VALIDASI KRUSIAL (Mencegah NaN masuk ke Database)
        if (isNaN(priceToPay) || isNaN(finalNumberId) || isNaN(finalProviderId)) {
            console.error("🚫 STOP! Ada data NaN:", { priceToPay, finalNumberId, finalProviderId });
            return res.json({ success: false, msg: "Kesalahan pada sistem server." });
        }

        const user = await User.findOne({ username });
        if (!user) return res.json({ success: false, msg: "User tidak ditemukan." });
        
        // Pastikan saldo user juga angka
        const currentBalance = Number(user.balance) || 0;

        if (currentBalance < priceToPay) {
            return res.json({ success: false, msg: "Saldo tidak cukup!" });
        }

        // 3. Tembak ke RumahOTP v2
        const url = `https://www.rumahotp.io/api/v2/orders?number_id=${finalNumberId}&provider_id=${finalProviderId}&operator_id=${finalOperatorId}`;
        const response = await axios.get(url, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY, 'Accept': 'application/json' }
        });

        if (response.data.success) {
            // 4. POTONG SALDO (Gunakan rumus yang aman dari NaN)
            user.balance = currentBalance - priceToPay; 
            await user.save();

            // Ganti bagian simpan transaksi di dalam router.post('/buy')
const newTx = new NokosTx({
    invoiceId: 'INV' + Date.now(),
    username: username,
    orderId: response.data.data.order_id,
    serviceName: serviceName,
    countryName: countryName,
    phoneNumber: response.data.data.phone_number,
    price: priceToPay,
    status: 'waiting',
    // SET KE 20 MENIT (Batal Otomatis)
    expiresAt: new Date(Date.now() + 20 * 60000) 
});
await newTx.save();

            res.json({ success: true, data: newTx });
        } else {
            res.json({ success: false, msg: response.data.msg || "Gagal ambil nomor" });
        }
    } catch (e) {
        console.error("Order Error:", e.message);
        res.json({ success: false, msg: "Terjadi kesalahan sistem." });
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

router.post('/cancel', async (req, res) => {
    try {
        await connectDB();
        const { orderId, username } = req.body;
        
        const tx = await NokosTx.findOne({ orderId, username, status: 'waiting' });
        if (!tx) return res.json({ success: false, msg: "Transaksi tidak ditemukan atau sudah selesai." });

        // LOGIKA 3 MENIT: Cek selisih waktu sekarang dengan waktu dibuat
        const diffInMinutes = (Date.now() - new Date(tx.createdAt).getTime()) / 60000;
        
        if (diffInMinutes < 3) {
            return res.json({ 
                success: false, 
                msg: `Tunggu ${Math.ceil(3 - diffInMinutes)} menit lagi untuk membatalkan.` 
            });
        }

        // Tembak API Batal ke RumahOTP
        const response = await axios.get(`https://www.rumahotp.io/api/v2/orders/cancel?order_id=${orderId}`, {
            headers: { 'x-apikey': RUMAHOTP_API_KEY }
        });

        if (response.data.success) {
            // Update status & Refund saldo
            tx.status = 'cancelled';
            await tx.save();
            await User.findOneAndUpdate({ username }, { $inc: { balance: tx.price } });
            
            res.json({ success: true, msg: "Berhasil dibatalkan, saldo dikembalikan." });
        } else {
            res.json({ success: false, msg: response.data.msg || "Gagal batal di provider." });
        }
    } catch (e) {
        res.json({ success: false, msg: "Error server saat membatalkan." });
    }
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