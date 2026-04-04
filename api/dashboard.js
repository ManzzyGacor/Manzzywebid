const express = require('express');
const axios = require('axios');
const router = express.Router();

// Ganti dengan API Key RumahOTP Kamu
const RUMAHOTP_API_KEY = "rk-dev-TEjAEh29JdgEB6oItLoFdt4uoj34MEjM"; 

// ROUTE: Ambil Saldo Provider (RumahOTP)
router.get('/admin/provider-balance', async (req, res) => {
    try {
        const options = {
            method: 'GET',
            url: 'https://www.rumahotp.io/api/v1/user/balance',
            headers: {
                'x-apikey': RUMAHOTP_API_KEY,
                'Accept': 'application/json'
            }
        };

        const response = await axios(options);
        
        if (response.data.success) {
            res.json({
                success: true,
                balance: response.data.data.formated, // "Rp1.000.000"
                email: response.data.data.email,
                name: response.data.data.first_name
            });
        } else {
            res.json({ success: false, balance: "Error" });
        }

    } catch (error) {
        console.error("Gagal ambil saldo provider:", error.message);
        res.json({ success: false, balance: "Rp 0 (Offline)" });
    }
});

module.exports = router;

