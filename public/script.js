// ==========================================
// 1. SYSTEM CONFIG & DARK MODE (Jalan Duluan)
// ==========================================
const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
const currentTheme = localStorage.getItem('theme') ? localStorage.getItem('theme') : 'dark';

// Set tema saat load
document.documentElement.setAttribute('data-theme', currentTheme);

if (currentTheme === 'light') {
    if(toggleSwitch) toggleSwitch.checked = true;
}

// Event Listener Ganti Tema
if(toggleSwitch) {
    toggleSwitch.addEventListener('change', function(e) {
        if (e.target.checked) {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }    
    });
}

// ==========================================
// 2. SESSION & NAVIGATION
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    // Cek Session
    const session = localStorage.getItem('user_session');

    if (!session) {
        // Redirect ke login jika bukan di halaman user.html
        if (!window.location.pathname.includes('user.html')) {
            window.location.href = 'user.html';
        }
        return;
    }

    const userData = JSON.parse(session);

    // ISI DATA USER KE UI
    const saldoEl = document.getElementById('display-saldo');
    const namaEl = document.getElementById('display-username');
    const profileName = document.getElementById('profile-name');
    const profileRole = document.getElementById('profile-role');

    if (saldoEl) saldoEl.innerText = `Rp ${userData.balance.toLocaleString('id-ID')}`;
    if (namaEl) namaEl.innerText = userData.username;
    if (profileName) profileName.innerText = userData.username;
    if (profileRole) profileRole.innerText = userData.role;

    // KHUSUS ADMIN (User: man)
    if (userData.username.toLowerCase() === 'man' || userData.role === 'Admin') {
        const adminArea = document.getElementById('admin-area');
        if (adminArea) adminArea.style.display = 'block';
    }
});

function handleLogout() {
    if(confirm("Yakin ingin keluar?")) {
        localStorage.removeItem('user_session');
        window.location.href = 'user.html';
    }
}

// Navigasi Halaman (SPA)
function showPage(pageId, element) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const target = document.getElementById(pageId);
    if(target) target.classList.add('active');

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    if (element) {
        if(element.classList.contains('nav-item')) {
            element.classList.add('active');
        } else if (element.closest('.nav-item')) {
            element.closest('.nav-item').classList.add('active');
        }
    }
}

// ==========================================
// 3. ORDER SERVICE (SELECT2 + SEARCH)
// ==========================================
let allServicesData = []; 

// Setup Select2 saat dokumen siap
$(document).ready(function() {
    // Inisialisasi Select2
    $('.select2-enable').select2({
        width: '100%',
        dropdownParent: $('#services') // Penting agar search bar bisa diketik
    });

    // Load Data Awal
    loadCategories();

    // Event Listener Select2
    $('#category-select').on('change', function() {
        loadServicesByCategory($(this).val());
    });

    $('#service-select').on('change', function() {
        updateServiceDetails();
    });
});

async function loadCategories() {
    try {
        const res = await fetch('/api/buzzer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: 'services' })
        });
        const result = await res.json();
        
        if (result.status) {
            allServicesData = result.data;
            const categories = [...new Set(allServicesData.map(s => s.category))];
            
            const catSelect = $('#category-select');
            catSelect.empty().append('<option value="">-- Cari Kategori --</option>');
            categories.forEach(cat => catSelect.append(new Option(cat, cat)));
        }
    } catch (err) { console.error("Gagal load layanan"); }
}

function loadServicesByCategory(catName) {
    const filtered = allServicesData.filter(s => s.category === catName);
    const svcSelect = $('#service-select');
    svcSelect.empty().append('<option value="">-- Cari Layanan --</option>');
    
    filtered.forEach(svc => {
        const opt = new Option(svc.name, svc.service);
        $(opt).attr('data-price', svc.price);
        $(opt).attr('data-min', svc.min);
        $(opt).attr('data-desc', svc.note || "-");
        svcSelect.append(opt);
    });
}

function updateServiceDetails() {
    const selected = $('#service-select').find(':selected');
    const price = selected.attr('data-price');
    const min = selected.attr('data-min');
    
    if (price) {
        document.getElementById('price-per-k').value = `Rp ${parseInt(price).toLocaleString('id-ID')}`;
        document.getElementById('min-order').value = min;
        calculateTotal();
    }
}

function calculateTotal() {
    const qty = document.getElementById('order-quantity').value;
    const priceText = document.getElementById('price-per-k').value.replace(/[^0-9]/g, '');
    const totalEl = document.getElementById('total-price');
    
    if (qty && priceText) {
        const total = (qty / 1000) * priceText;
        totalEl.innerText = `Rp ${Math.ceil(total).toLocaleString('id-ID')}`;
    }
}

async function placeOrder() {
    const serviceId = $('#service-select').val();
    const target = document.getElementById('order-target').value;
    const qty = document.getElementById('order-quantity').value;
    
    if(!serviceId || !target || !qty) return alert("Lengkapi data pesanan!");

    const session = JSON.parse(localStorage.getItem('user_session'));
    const btn = document.getElementById('place-order-btn');
    
    btn.innerHTML = "Memproses..."; btn.disabled = true;

    try {
        const res = await fetch('/api/buzzer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                action: 'order',
                userId: session.id,
                service: serviceId,
                data: target,
                quantity: qty
            })
        });
        const result = await res.json();
        
        if (result.status) {
            alert("Pesanan Berhasil!");
            // Update saldo lokal
            // session.balance -= harga... (bisa ditambahkan logika ini)
            location.reload();
        } else {
            alert("Gagal: " + result.data);
        }
    } catch (e) { alert("Error koneksi"); }
    finally { btn.innerHTML = "Submit Pesanan"; btn.disabled = false; }
}

// ==========================================
// 4. TOP UP SYSTEM (QRIS) - FIXED VERSION
// ==========================================
function setAmount(val) {
    const amountInput = document.getElementById('topup-amount');
    if (amountInput) amountInput.value = val;
}

function resetTopUp() {
    if(confirm("Yakin ingin membatalkan pembayaran ini?")) {
        document.getElementById('topup-form-box').style.display = 'block';
        document.getElementById('qris-display').style.display = 'none';
        // Bersihkan area QR agar tidak menumpuk saat buat baru
        const qrContainer = document.getElementById('qrcode');
        if (qrContainer) qrContainer.innerHTML = "";
    }
}

async function processTopUp() {
    const amountInput = document.getElementById('topup-amount');
    const amount = amountInput ? amountInput.value : 0;
    const sessionRaw = localStorage.getItem('user_session');
    
    if (!sessionRaw) return alert("Sesi habis, silakan login kembali.");
    const session = JSON.parse(sessionRaw);

    if (amount < 1000) return alert("Minimal pengisian adalah Rp 1.000");

    const btn = document.querySelector('.btn-pay-now');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyiapkan QRIS...'; 
    btn.disabled = true;

    try {
        const res = await fetch('/api/topup', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                userId: session.id, 
                amount: parseInt(amount) 
            })
        });
        
        const data = await res.json();

        // PASTIKAN data.payment_number adalah string QRIS asli (000201...)
        if (data.payment_number) {
            // Sembunyikan form input, tampilkan area QRIS
            document.getElementById('topup-form-box').style.display = 'none';
            document.getElementById('qris-display').style.display = 'block';
            
            // Hapus isi QR lama sebelum membuat yang baru
            const qrContainer = document.getElementById('qrcode');
            qrContainer.innerHTML = "";

            // LOGIKA PEMBUATAN QRIS YANG MUDAH DI-SCAN
            new QRCode(qrContainer, {
                text: data.payment_number, // Teks mentah dari Pakasir
                width: 256,               // Ukuran lebih besar agar tidak pecah
                height: 256,
                colorDark : "#000000",
                colorLight : "#ffffff",
                // Level H (High) atau M (Medium) membantu scan jika gambar agak buram
                correctLevel : QRCode.CorrectLevel.M 
            });

            // Update info total harga di bawah QR
            const totalDisplay = document.getElementById('qris-total');
            if (totalDisplay) {
                totalDisplay.innerText = `Rp ${data.total_payment.toLocaleString('id-ID')}`;
            }
            
            // Mulai pengecekan saldo otomatis (Polling)
            startPolling(data.order_id);
            
        } else {
            alert("Gagal mendapatkan kode pembayaran dari server Pakasir.");
        }
    } catch (e) { 
        console.error("Topup Error:", e);
        alert("Terjadi kesalahan koneksi ke server."); 
    } finally { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    }
}

function startPolling(orderId) {
    // Cek setiap 5 detik apakah pembayaran sudah masuk
    const pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/check-status?order_id=${orderId}`);
            const data = await res.json();

            // Jika status sukses di database (diupdate oleh webhook.js)
            if (data.status === 'completed' || data.status === 'success') {
                clearInterval(pollInterval);
                alert("Pembayaran Berhasil! Saldo Anda telah diperbarui.");
                location.reload(); // Refresh untuk update angka saldo di header
            }
        } catch (e) {
            console.error("Gagal mengecek status pembayaran...");
        }
    }, 5000); 

    // Berhenti cek otomatis setelah 15 menit agar tidak membebani server
    setTimeout(() => clearInterval(pollInterval), 15 * 60 * 1000);
}