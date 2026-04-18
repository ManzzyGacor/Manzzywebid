llet currentNominal = 0;
let checkInterval = null;

function setNominal(val) {
    currentNominal = val;
    document.getElementById('input-nominal').value = val;
}

async function confirmTopup() {
    const nominal = document.getElementById('input-nominal').value;
    if (nominal < 2000) return Swal.fire('Gagal', 'Minimal top up Rp 2.000', 'error');

    // CEK DULU: Jangan biarin user numpuk tagihan
    try {
        const checkRes = await fetch('/api/topup/pending');
        const checkData = await checkRes.json();
        if (checkData.success && checkData.data.length > 0) {
            return Swal.fire('Oops!', 'Anda masih memiliki tagihan top up yang belum dibayar. Silakan selesaikan atau batalkan terlebih dahulu.', 'warning');
        }
    } catch (e) {}

    Swal.fire({
        title: 'Memproses QRIS...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        background: '#0c0c0e', color: '#fff'
    });

    try {
        const res = await fetch('/api/topup/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: nominal })
        });
        const result = await res.json();

        if (result.success) {
            const data = result.data;
            showQRIS(data.qr_image, data.id, data.amount);
            startCheckingStatus(data.id);
        } else {
            Swal.fire('Gagal', result.msg || 'Terjadi kesalahan', 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Gagal koneksi ke server', 'error');
    }
}

function showQRIS(imgUrl, depId, total) {
    Swal.fire({
        title: 'Scan QRIS untuk Bayar',
        html: `
            <div class="text-center">
                <p class="text-[10px] text-gray-400 mb-2">Total Bayar: <b class="text-white text-lg">Rp ${total.toLocaleString()}</b></p>
                <img src="${imgUrl}" class="w-64 h-64 mx-auto rounded-2xl border-4 border-white mb-4">
                <p class="text-[9px] text-purple-400 animate-pulse font-bold">OTOMATIS MASUK SETELAH BAYAR</p>
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Batalkan Top Up',
        cancelButtonColor: '#ef4444',
        background: '#0c0c0e',
        color: '#fff',
        allowOutsideClick: false // Biar gak gampang ke-close nggak sengaja
    }).then(async (result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
            // FUNGSI BARU: Kalau klik batal, API beneran ngebatalin di database
            clearInterval(checkInterval);
            Swal.fire({ title: 'Membatalkan...', didOpen: () => Swal.showLoading(), background: '#0c0c0e', color: '#fff' });
            
            await fetch('/api/topup/cancel', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ depositId: depId })
            });
            
            Swal.fire({ icon: 'info', title: 'Dibatalkan', text: 'Transaksi top up telah dibatalkan.', background: '#0c0c0e', color: '#fff' });
        }
    });
}

function startCheckingStatus(depId) {
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/topup/status/${depId}`);
            const result = await res.json();

            if (result.success) {
                if (result.status === 'success') {
                    clearInterval(checkInterval);
                    Swal.fire({
                        icon: 'success',
                        title: 'Top Up Berhasil!',
                        text: 'Saldo Anda telah ditambahkan.',
                        background: '#0c0c0e', color: '#fff'
                    });
                    
                    // Update tampilan saldo (Tergantung nama fungsi di index lo)
                    if (typeof loadUserProfile === 'function') loadUserProfile();
                } else if (result.status === 'cancel' || result.status === 'canceled' || result.status === 'expired') {
                    // Berhenti nge-cek kalau waktu QRIS habis dari pusat
                    clearInterval(checkInterval);
                    Swal.fire({
                        icon: 'error',
                        title: 'Top Up Kadaluarsa',
                        text: 'Waktu pembayaran telah habis atau dibatalkan otomatis.',
                        background: '#0c0c0e', color: '#fff'
                    });
                }
            }
        } catch (e) { console.error("Cek status error"); }
    }, 5000); // Cek tiap 5 detik
}

// LOGIKA ANTI-REFRESH (PENTING)
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/topup/pending');
        const result = await res.json();
        
        if (result.success && result.data.length > 0) {
            const pending = result.data[0]; // Ambil tagihan paling baru
            
            // 1. Lanjutkan checking di belakang layar
            startCheckingStatus(pending.depositId);

            // 2. Tanya user apakah mau liat QRIS nya lagi
            Swal.fire({
                title: 'Top Up Tertunda',
                text: 'Anda memiliki tagihan top up yang belum dibayar.',
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Lihat QRIS',
                cancelButtonText: 'Nanti saja',
                background: '#0c0c0e', color: '#fff'
            }).then((res) => {
                if (res.isConfirmed) {
                    showQRIS(pending.qr_image, pending.depositId, pending.amount);
                }
            });
        }
    } catch (e) { console.error("Error auto-resume topup"); }
});