function switchView(viewId) {
    // 1. Sembunyikan SEMUA view tanpa terkecuali
    document.querySelectorAll('.spa-view').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('active');
    });
    
    // 2. Tampilkan cuma satu yang kita pilih
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }

    // 3. Update warna icon navigasi
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-purple-500');
        btn.classList.add('text-gray-600');
    });

    const activeNav = document.getElementById(`nav-${viewId}`);
    if (activeNav) {
        activeNav.classList.remove('text-gray-600');
        activeNav.classList.add('text-purple-500');
    }
}

// login regster
let isLoginMode = true;

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const btnPrimary = document.getElementById('btn-auth-primary');
    const btnToggle = document.getElementById('btn-auth-toggle');

    if (isLoginMode) {
        title.innerText = "MASUK KE AKUN";
        subtitle.innerText = "Silakan masuk untuk mulai transaksi.";
        btnPrimary.innerText = "MASUK SEKARANG";
        btnToggle.innerText = "Belum punya akun? Daftar";
    } else {
        title.innerText = "DAFTAR AKUN";
        subtitle.innerText = "Buat akun baru Manzzy ID kamu.";
        btnPrimary.innerText = "DAFTAR SEKARANG";
        btnToggle.innerText = "Sudah punya akun? Login";
    }
}

async function handleAuthSubmit() {
    const u = document.getElementById('auth-username').value;
    const p = document.getElementById('auth-password').value;
    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();

        if (data.success) {
            if (isLoginMode) {
                alert("Login Berhasil!");
                location.reload(); // Reload buat aktifin session & ambil data 'me'
            } else {
                alert("Pendaftaran Sukses! Silakan Login.");
                toggleAuthMode();
            }
        } else {
            alert(data.msg || "Terjadi kesalahan.");
        }
    } catch (err) {
        alert("Gagal terhubung ke server.");
    }
}

window.addEventListener('load', async () => {
    // Update Branding Nama Web dulu
    await updateWebBranding();

    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.login) {
        // Jika sudah login, tampilkan Home & Footer
        switchView('home');
        document.getElementById('main-footer').classList.remove('hidden');
        
        // Isi data profil
        document.getElementById('nokos-username').innerText = data.user.username;
        document.getElementById('user-balance').innerText = "Rp " + data.user.balance.toLocaleString();
        document.querySelectorAll('.web-user-display').forEach(el => el.innerText = data.user.username);
    } else {
        // Jika belum login, paksa ke halaman Auth & sembunyikan footer
        switchView('auth');
        document.getElementById('main-footer').classList.add('hidden');
    }

    // Hilangkan Loader
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if(loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 700);
        }
    }, 1500);
});
// ADMIN KONTROL
// Fungsi Update Nama Web secara Dinamis
async function updateWebBranding() {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if(data.web_name) {
        document.querySelectorAll('.web-logo-name').forEach(el => el.innerText = data.web_name);
        document.title = data.web_name;
    }
}

// Fungsi Admin: Tambah Saldo
async function adminEditBalance(targetUsername, amount) {
    const res = await fetch(`/api/admin/users/search?username=${targetUsername}`);
    const data = await res.json();
    if(data.success) {
        await fetch('/api/admin/users/balance', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: data.user._id, amount: amount })
        });
        alert("Saldo Berhasil Diperbarui!");
    } else {
        alert("User tidak ditemukan!");
    }
}