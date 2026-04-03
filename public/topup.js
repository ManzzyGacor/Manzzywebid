// Gunakan window agar tidak bentrok "Already Declared" jika file dimuat ulang
window.checkInterval = window.checkInterval || null;
window.currentOrderId = window.currentOrderId || null;

// 1. REQUEST TOP UP
async function requestTopUp(e) {
    e.preventDefault();
    
    // Gunakan getItem langsung agar tidak bentrok dengan variabel di script.js
    const userSession = localStorage.getItem('user_session');
    if (!userSession) return showToast("Login dulu!", "error");

    const amount = document.getElementById('topupAmount').value;
    if (amount < 1000) return showToast("Minimal Rp 1.000", "error");

    const btn = document.getElementById('btn-topup-process');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Loading...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/topup/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userSession, amount: amount })
        });
        const data = await res.json();

        if (data.success) {
            showQrInterface(data.data);
        } else {
            showToast(data.msg || "Gagal membuat transaksi.", "error");
        }
    } catch (e) {
        showToast("Error koneksi.", "error");
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

    document.getElementById('qris-amount').innerText = `Rp ${data.total.toLocaleString()}`;
    document.getElementById('qris-id').innerText = data.orderId;

    // Generate QR Code
    const qrContainer = document.getElementById('qris-image');
    qrContainer.innerHTML = ""; 
    new QRCode(qrContainer, {
        text: data.qrString,
        width: 200, height: 200,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // Mulai Cek Status Otomatis (Polling)
    if (window.checkInterval) clearInterval(window.checkInterval);
    window.checkInterval = setInterval(checkPaymentStatus, 3000); // Cek tiap 3 detik
}

// 3. CEK STATUS
async function checkPaymentStatus() {
    if (!window.currentOrderId) return;
    try {
        const res = await fetch(`/api/topup/check/${window.currentOrderId}`);
        const data = await res.json();
        if (data.success && data.status === 'success') {
            finishTopUp();
        }
    } catch (e) {}
}

function finishTopUp() {
    if (window.checkInterval) clearInterval(window.checkInterval);
    document.getElementById('topup-qr-area').classList.add('hidden');
    document.getElementById('topup-success-area').classList.remove('hidden');
    showToast("✅ Pembayaran Berhasil!", "success");
    if (typeof checkUserLogin === "function") checkUserLogin(); // Update saldo di header
}

function resetTopUpView() {
    if (window.checkInterval) clearInterval(window.checkInterval);
    window.currentOrderId = null;
    document.getElementById('topup-form-area').classList.remove('hidden');
    document.getElementById('topup-qr-area').classList.add('hidden');
    document.getElementById('topup-success-area').classList.add('hidden');
    document.getElementById('topupAmount').value = '';
}