let currentNominal = 0;
let checkInterval = null;

function setNominal(val) {
    currentNominal = val;
    document.getElementById('input-nominal').value = val;
}

async function confirmTopup() {
    const nominal = document.getElementById('input-nominal').value;
    if (nominal < 2000) return Swal.fire('Gagal', 'Minimal top up Rp 2.000', 'error');

    Swal.fire({
        title: 'Memproses QRIS...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
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
        cancelButtonText: 'Batal',
        background: '#0c0c0e',
        color: '#fff'
    }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
            clearInterval(checkInterval);
        }
    });
}

function startCheckingStatus(depId) {
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/topup/status/${depId}`);
            const result = await res.json();

            if (result.success && result.status === 'success') {
                clearInterval(checkInterval);
                Swal.fire({
                    icon: 'success',
                    title: 'Top Up Berhasil!',
                    text: 'Saldo Anda telah ditambahkan.',
                    background: '#0c0c0e',
                    color: '#fff'
                });
                // Update tampilan saldo di navbar
                updateUserBalance(); 
            }
        } catch (e) { console.error("Cek status error"); }
    }, 5000); // Cek tiap 5 detik
}