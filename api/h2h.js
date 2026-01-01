const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Helper Fetch & Models
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const User = mongoose.model('User');
const Transaction = mongoose.model('Transaction');

// --- KONFIGURASI ---
// Ganti dengan API Key RumahOTP kamu atau ambil dari database jika sudah ada fitur config admin
const RUMAHOTP_API_KEY = "otp_bEiRJAgrGjhzWAvz"; 
const DEFAULT_MARGIN_PERCENT = 5; // Default profit 10% jika config tidak ditemukan

// Helper Request ke RumahOTP
async function requestRumahOTP(endpoint, params = {}) {
    const url = new URL("https://www.rumahotp.com/api/v1/h2h" + endpoint);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    
    // Header wajib sesuai dokumentasi
    const headers = {
        'x-apikey': RUMAHOTP_API_KEY,
        'Accept': 'application/json'
    };

    const res = await fetch(url, { method: 'GET', headers });
    return await res.json();
}

// ==========================================
// 1. LIST PRODUK (DENGAN MARGIN)
// ==========================================
router.get('/products/h2h-list', async (req, res) => {
    try {
        // Ambil data produk mentah
        const raw = await requestRumahOTP('/product');
        
        if (raw.success) {
            // TERAPKAN MARGIN (Sesuai request: samain kayak nokos)
            // Kita hitung harga jual di sini biar user lihat harga yang sudah dimarkup
            const products = raw.data.map(p => {
                const originalPrice = p.price;
                const markup = Math.ceil(originalPrice * (DEFAULT_MARGIN_PERCENT / 100));
                const sellingPrice = originalPrice + markup;
                
                return {
                    ...p,
                    price: sellingPrice, // Harga Jual (Modal + Margin)
                    original_price: originalPrice // Disimpan buat admin kalau perlu
                };
            });
            res.json({ success: true, data: products });
        } else {
            res.json({ success: false, data: [] });
        }
    } catch (e) {
        console.error("H2H Product Error:", e);
        res.status(500).json({ success: false, msg: "Gagal memuat produk" });
    }
});

// ==========================================
// 2. CEK AKUN (GAME / E-WALLET)
// ==========================================
router.post('/check-account', async (req, res) => {
    const { type, code, target } = req.body; // type: 'game' atau 'ewallet'
    
    try {
        let endpoint = '';
        let params = {};

        if (type === 'ewallet' || type === 'bank') {
            // Cek Rekening / E-Wallet
            endpoint = '/check/rekening';
            params = { bank_code: code, account_number: target };
        } else {
            // Cek Game ID
            endpoint = '/check/username';
            params = { account_code: code, account_number: target };
        }

        const result = await requestRumahOTP(endpoint, params);
        res.json(result); // { success: true, data: { status: 'valid', account_name: '...' } }

    } catch (e) {
        console.error("Check Account Error:", e);
        res.json({ success: false, msg: "Gagal mengecek ID" });
    }
});

// ==========================================
// 3. TRANSAKSI ORDER (REAL)
// ==========================================
router.post('/buy-ppob', async (req, res) => {
    const { username, productCode, target, expectedPrice } = req.body;

    try {
        // A. Cek User & Saldo
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User tidak ditemukan" });

        // B. Cek Harga Terbaru (Security: Biar gak ditembak harga murah dari frontend)
        const rawProds = await requestRumahOTP('/product');
        const product = rawProds.data.find(p => p.code === productCode);
        
        if (!product) return res.status(400).json({ success: false, msg: "Produk tidak tersedia" });

        // Hitung ulang harga jual (Modal + Margin)
        const modal = product.price;
        const margin = Math.ceil(modal * (DEFAULT_MARGIN_PERCENT / 100));
        const finalPrice = modal + margin;

        // Cek Saldo
        if (user.balance < finalPrice) {
            return res.status(400).json({ success: false, msg: "Saldo tidak cukup" });
        }

        // C. Proses Transaksi ke RumahOTP
        // Endpoint: /transaksi/create?target=TARGET&id=ID_CODE
        const orderRes = await requestRumahOTP('/transaksi/create', {
            target: target,
            id: productCode
        });

        if (orderRes.success && orderRes.data) {
            // D. Potong Saldo & Simpan Database
            user.balance -= finalPrice;
            await user.save();

            const trxData = orderRes.data; // Data respon dari RumahOTP
            const invoice = 'PPOB-' + Date.now().toString().slice(-6);

            // Simpan Transaksi
            await new Transaction({
                invoiceId: invoice,
                username: username,
                productName: product.name, // Nama Produk
                amount: finalPrice,        // Harga Jual
                status: 'success',         // Langsung success (atau pending tergantung respon h2h)
                formData: `Target: ${target} | SN: ${trxData.response?.sn || 'Proses'}`, // Simpan SN disini
                providerId: trxData.id     // ID Transaksi dari RumahOTP (buat tracking)
            }).save();

            res.json({ 
                success: true, 
                msg: "Transaksi Berhasil", 
                invoiceId: invoice,
                sn: trxData.response?.sn,
                account_name: trxData.tujuan_info?.name
            });

        } else {
            // Gagal dari pusat
            res.status(400).json({ success: false, msg: "Gagal memproses di server pusat. Coba lagi." });
        }

    } catch (e) {
        console.error("Order Error:", e);
        res.status(500).json({ success: false, msg: "Terjadi kesalahan server" });
    }
});

module.exports = router;