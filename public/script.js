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
async function handleAuthSubmit() {
    const u = document.getElementById('auth-username').value;
    const p = document.getElementById('auth-password').value;
    
    // Validasi simpel biar gak kosong
    if (!u || !p) {
        return alert("Username dan Password wajib diisi!");
    }

    // PINTU UTAMA: Kita pake satu endpoint /api/auth/submit
    // isLoginMode ? 'login' : 'register' bakal nentuin status di server
    try {
        const res = await fetch('/api/auth/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: u, 
                password: p, 
                type: isLoginMode ? 'login' : 'register' 
            })
        });
        
        const data = await res.json();

        if (data.success) {
            if (isLoginMode) {
                alert("Login Berhasil!");
                // Sesi otomatis tersimpan di cookie browser
                location.reload(); 
            } else {
                alert("Pendaftaran Sukses! Silakan Login.");
                toggleAuthMode(); // Balikin tampilan ke mode Login
            }
        } else {
            // Munculin pesan error dari server (misal: 'Password salah' atau 'User sudah ada')
            alert(data.msg || "Terjadi kesalahan.");
        }
    } catch (err) {
        console.error(err);
        alert("Gagal terhubung ke server. Pastikan Node.js jalan!");
    }
}

window.addEventListener('load', async () => {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.login) {
            // 1. Isi Data di Profile View
            document.getElementById('profile-name').innerText = data.user.username;
            document.getElementById('profile-balance').innerText = "Rp " + data.user.balance.toLocaleString();
            
            // 2. Set Huruf Inisial (Contoh: 'Manzzy' jadi 'M')
            const initial = data.user.username.charAt(0).toUpperCase();
            document.querySelectorAll('.user-initial').forEach(el => el.innerText = initial);

            // 3. Set Badge Role (Admin/Member)
            const badge = document.getElementById('profile-role-badge');
            if (data.user.role === 'admin') {
                badge.innerHTML = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-wider"><i class="fa-solid fa-crown text-[8px]"></i> ADMINISTRATOR</span>`;
            } else {
                badge.innerHTML = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-wider"><i class="fa-solid fa-user text-[8px]"></i> MEMBER</span>`;
            }

            // 4. Isi Data di Header (Navigasi Atas)
            document.getElementById('nokos-username').innerText = data.user.username;
            document.getElementById('user-balance').innerText = "Rp " + data.user.balance.toLocaleString();

            // Masuk ke Home
            switchView('home');
        } else {
            // BELUM LOGIN? Langsung tendang ke auth.html
            window.location.href = 'auth.html';
        }
    } catch (e) {
        window.location.href = 'auth.html';
    }
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