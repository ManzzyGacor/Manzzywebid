// Gunakan window agar tidak bentrok jika file dimuat ulang
window.checkInterval = window.checkInterval || null;
window.currentOrderId = window.currentOrderId || null;

// 1. REQUEST TOP UP
async function requestTopUp(e) {
    e.preventDefault();
    
    const userSession = localStorage.getItem('user_session');
    if (!userSession) return showToast("Login dulu!", "error");

    const amount = document.getElementById('topupAmount').value;
    if (amount < 1000) return showToast("Minimal Rp 1.000", "error");

    const btn = document.getElementById('btn-topup-process');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/topup/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userSession, amount: amount })
        });
        const result = await res.json();

        // FIX: Server mengirim { success: true, data: { orderId, qrString, amount } }
        if (result.success && result.data) {
            showQrInterface(result.data);
        } else {
            showToast(result.msg || "Gagal membuat transaksi.", "error");
        }
    } catch (e) {
        console.error("Topup Error:", e);
        showToast("Gagal terhubung ke server.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// 2. TAMPILKAN QRIS
function showQrInterface(data) {
    window.currentOrderId = data.orderId;
    
    document.getElementById('topup-form-area').classList.add('hidden');
    document.getElementById('topup-qr-area').classList.remove('hidden');
    
    // Update Info Pembayaran
    document.getElementById('qr-amount-display').innerText = `Rp ${data.amount.toLocaleString()}`;
    document.getElementById('qr-order-id').innerText = data.orderId;

    // Gambar QR Code
    const qrContainer = document.getElementById("qrcode");
    qrContainer.innerHTML = ""; // Bersihkan QR lama
    
    new QRCode(qrContainer, {
        text: data.qrString, // String NMID dari RumahOTP
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Mulai Cek Status Otomatis (Polling) tiap 5 detik
    if (window.checkInterval) clearInterval(window.checkInterval);
    window.checkInterval = setInterval(checkPaymentStatus, 5000);
}

// 3. CEK STATUS PEMBAYARAN
async function checkPaymentStatus() {
    if (!window.currentOrderId) return;
    try {
        const res = await fetch(`/api/topup/check/${window.currentOrderId}`);
        const result = await res.json();
        
        // FIX: Cek status success dari backend
        if (result.success && result.status === 'success') {
            finishTopUp();
        }
    } catch (e) {
        console.error("Polling Error:", e);
    }
}

function finishTopUp() {
    if (window.checkInterval) clearInterval(window.checkInterval);
    document.getElementById('topup-qr-area').classList.add('hidden');
    document.getElementById('topup-success-area').classList.remove('hidden');
    showToast("✅ Pembayaran Berhasil!", "success");
    
    // Update saldo di header tanpa refresh
    if (typeof checkUserLogin === "function") checkUserLogin(); 
}

function resetTopUpView() {
    if (window.checkInterval) clearInterval(window.checkInterval);
    window.currentOrderId = null;
    document.getElementById('topup-form-area').classList.remove('hidden');
    document.getElementById('topup-qr-area').classList.add('hidden');
    document.getElementById('topup-success-area').classList.add('hidden');
    document.getElementById('topupAmount').value = '';
}