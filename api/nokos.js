const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const router = express.Router();

// ==========================================
// 1. MODELS (Mastiin gak bentrok sama index.js)
// ==========================================
const Setting = mongoose.models.Setting || mongoose.model('Setting', new mongoose.Schema({
    siteName: { type: String, default: 'Manzzy ID' },
    rumahotp_key: String,
    marginPercent: { type: Number, default: 20 }
}));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    username: String,
    balance: { type: Number, default: 0 }
}));

const NokosTx = mongoose.models.NokosTx || mongoose.model('NokosTx', new mongoose.Schema({
    invoiceId: String, username: String, refId: String,
    serviceName: String, country: String, phoneNumber: String,
    price: Number, status: { type: String, default: 'waiting' }, 
    smsCode: String, expiresAt: Date, createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// 2. HELPER REQUEST (SESUAI SPEK V1/V2 LO)
// ==========================================
async function callRumahOTP(fullPath, method = 'GET', data = null) {
    const config = await Setting.findOne(); // Pake Setting biar sinkron dashboard
    if (!config || !config.rumahotp_key) throw new Error("API Key belum disetting!");

    // Path cuma nambahin /api/ di depan, versinya (v1/v2) kita tulis manual di route
    const path = `/api/${fullPath}`;

    const options = {
        hostname: 'www.rumahotp.io',
        path: path,
        method: method,
        headers: {
            'x-apikey': config.rumahotp_key,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } 
                catch (e) { reject(new Error("Response dari RumahOTP error")); }
            });
        });
        req.on('error', (e) => reject(e));
        if (data && method !== 'GET') req.write(JSON.stringify(data));
        req.end();
    });
}

// ==========================================
// 3. ROUTES NOKOS
// ==========================================

router.get('/services', async (req, res) => {
    try {
        // Tulis manual versinya di sini: v2/services
        const result = await callRumahOTP('v2/services');
        
        // Langsung kirim hasil JSON dari RumahOTP ke Frontend
        res.json(result); 
        
    } catch (e) { 
        res.status(500).json({ success: false, msg: e.message }); 
    }
});

// Ambil Negara & Harga (v2)
router.get('/countries', async (req, res) => {
    try {
        // 1. Ambil 'sid' (sesuai kiriman dari frontend nokos.js lo)
        const sid = req.query.sid; 
        
        if (!sid) {
            return res.json({ success: false, msg: "Service ID (sid) kosong!" });
        }

        // 2. Ambil margin dari koleksi Setting (Admin Kontrol)
        const set = await Setting.findOne();
        const margin = set ? set.marginPercent : 20;

        // 3. Tembak ke v2/countries
        // PENTING: Pakai parameter service_id sesuai dokumentasi RumahOTP lo
        const resData = await callRumahOTP(`v2/countries?service_id=${sid}`);

        if (resData && resData.success) {
            // 4. Hitung harga jual tiap negara & pricelist
            resData.data.forEach(c => {
                if (c.pricelist) {
                    c.pricelist.forEach(p => {
                        // Tambahkan field price_user (Harga + Margin)
                        p.price_user = Math.ceil(p.price + (p.price * margin / 100));
                        // Update format harganya biar cantik
                        p.price_format = `Rp${p.price_user.toLocaleString('id-ID')}`;
                    });
                }
            });
            
            // Kirim balik ke frontend
            return res.json({
                success: true,
                data: resData.data
            });
        } else {
            return res.json({ success: false, msg: resData.message || "Gagal ambil negara" });
        }
    } catch (e) {
        console.error("ERROR COUNTRIES:", e.message);
        res.status(500).json({ success: false, msg: e.message });
    }
});

// Ambil Operator (v2)
// Ambil Operator (v2) - Tulis Manual
router.get('/operators', async (req, res) => {
    try {
        const country = req.query.country;
        const provider_id = req.query.provider_id;

        if (!country || !provider_id) {
            return res.json({ success: false, msg: "Country atau Provider ID tidak lengkap" });
        }

        // Tulis manual 'v2/' dan encode nama negaranya biar aman
        const endpoint = `v2/operators?country=${encodeURIComponent(country)}&provider_id=${provider_id}`;
        
        console.log(`--- MENGAMBIL OPERATOR: ${country} (v2) ---`);
        
        const result = await callRumahOTP(endpoint);
        
        // Langsung kirim respon JSON dari RumahOTP
        res.json(result);

    } catch (e) {
        console.error("ERROR OPERATORS:", e.message);
        res.status(500).json({ success: false, msg: e.message });
    }
});

// Beli Nomor (v2) - Tulis Manual
router.post('/order', async (req, res) => {
    // 1. Cek Login
    if (!req.session.userId) {
        return res.json({ success: false, msg: "Sesi telah habis, silakan login ulang." });
    }

    const { number_id, provider_id, operator_id, price, service_name } = req.body;

    try {
        // 2. Ambil data User & Cek Saldo
        const user = await User.findById(req.session.userId);
        if (!user) return res.json({ success: false, msg: "User tidak ditemukan." });
        
        if (user.balance < price) {
            return res.json({ success: false, msg: "Saldo tidak cukup!" });
        }

        // 3. Tembak ke v2/orders (Manual Prefix)
        const endpoint = `v2/orders?number_id=${number_id}&provider_id=${provider_id}&operator_id=${operator_id}`;
        console.log(`--- PROSES BELI NOMOR: ${service_name} (v2) ---`);
        
        const result = await callRumahOTP(endpoint);

        if (result && result.success) {
            // 4. Potong Saldo User
            user.balance -= price;
            await user.save();

            // 5. Buat Invoice Internal (NOK-xxxxxx)
            const inv = 'NOK-' + Date.now().toString().slice(-6);
            
            // 6. Simpan Transaksi ke Database
            const newTx = new NokosTx({
                invoiceId: inv,
                username: user.username,
                refId: result.data.order_id, // RO000xxxx dari pusat
                serviceName: service_name,
                country: result.data.country || "Unknown",
                phoneNumber: result.data.phone_number,
                price: price,
                status: 'waiting',
                // Set expired (default 20 menit jika dari pusat gak ada)
                expiresAt: new Date(Date.now() + 20 * 60000) 
            });
            await newTx.save();

            // 7. Respon ke Frontend
            res.json({ 
                success: true, 
                invoiceId: inv, 
                data: result.data 
            });

        } else {
            // Jika gagal dari pusat (stok habis/key salah)
            res.json({ 
                success: false, 
                msg: result.message || "Gagal mendapatkan nomor dari pusat." 
            });
        }
    } catch (e) {
        console.error("ERROR ORDER:", e.message);
        res.status(500).json({ success: false, msg: "Terjadi kesalahan sistem: " + e.message });
    }
});

// Cek Status (v1)
// Cek Status OTP (v1) - Tulis Manual
router.get('/status/:invoiceId', async (req, res) => {
    try {
        // 1. Cari transaksi di database kita
        const tx = await NokosTx.findOne({ invoiceId: req.params.invoiceId });
        if (!tx) return res.json({ success: false, msg: "Order tidak ditemukan" });

        // 2. Logic Auto-Expired (Jika waktu habis di DB kita tapi status masih waiting)
        if (tx.status === 'waiting' && new Date() > tx.expiresAt) {
            // Jika sudah ada OTP masuk tapi belum diklik selesai, kita anggap sukses
            if (tx.smsCode && tx.smsCode.length > 2) {
                tx.status = 'success';
                await tx.save();
            } else {
                // Jika murni tidak ada OTP, batalkan dan refund saldo
                tx.status = 'canceled';
                await tx.save();
                await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
                return res.json({ success: true, data: tx, msg: "Waktu habis, saldo di-refund." });
            }
        }

        // 3. Tembak ke RumahOTP v1 (Manual Prefix)
        // Kita pakai refId (RO000xxx) buat nanya ke pusat
        const result = await callRumahOTP(`v1/orders/get_status?order_id=${tx.refId}`);

        if (result && result.success) {
            const d = result.data;

            // A. Simpan Kode OTP kalau muncul
            if (d.otp_code && d.otp_code !== '-' && d.otp_code !== tx.smsCode) {
                tx.smsCode = d.otp_code;
                await tx.save();
            }

            // B. Jika di pusat statusnya 'completed'
            if (d.status === 'completed') {
                tx.status = 'success';
                await tx.save();
            }

            // C. Jika di pusat statusnya 'canceled' (Refund Saldo Otomatis)
            if (d.status === 'canceled' && tx.status !== 'canceled') {
                tx.status = 'canceled';
                await tx.save();
                await User.findOneAndUpdate(
                    { username: tx.username }, 
                    { $inc: { balance: tx.price } }
                );
            }
        }

        // 4. Kirim data terbaru ke frontend buat di-render
        res.json({ 
            success: true, 
            data: tx 
        });

    } catch (e) {
        console.error("ERROR STATUS POLLING:", e.message);
        res.json({ success: false });
    }
});

// Action (v1)
router.post('/cancel', async (req, res) => {
    const tx = await NokosTx.findOne({ invoiceId: req.body.order_id });
    if (!tx || tx.status !== 'waiting') return res.json({ success: false });
    try {
        const result = await callRumahOTP(`v1/orders/set_status?order_id=${tx.refId}&status=cancel`);
        if (result.success) {
            tx.status = 'canceled'; await tx.save();
            await User.findOneAndUpdate({ username: tx.username }, { $inc: { balance: tx.price } });
            res.json({ success: true });
        } else { res.json({ success: false }); }
    } catch (e) { res.json({ success: false }); }
});

router.get('/history', async (req, res) => {
    if(!req.session.userId) return res.json({success:false});
    const user = await User.findById(req.session.userId);
    const list = await NokosTx.find({ username: user.username }).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
});

module.exports = router;