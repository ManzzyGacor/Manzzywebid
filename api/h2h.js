const express = require('express');
const router = express.Router();

// Helper Fetch (Karena di Node.js versi lama butuh ini)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ==========================================
// ROUTE KHUSUS H2H (HOST TO HOST)
// ==========================================

// 1. Ambil Produk dari RumahOTP
router.get('/products/rumahotp', async (req, res) => {
    try {
        // Request ke API External
        const response = await fetch('https://www.rumahotp.com/api/v1/h2h/product');
        const result = await response.json();
        
        // Teruskan data ke frontend kamu
        res.json(result); 
    } catch (e) {
        console.error("❌ Gagal fetch H2H:", e);
        res.status(500).json({ success: false, msg: "Gagal mengambil data produk eksternal" });
    }
});

// Nanti kalau ada H2H lain (misal Digiflazz), tambah di sini routenya..

module.exports = router;

