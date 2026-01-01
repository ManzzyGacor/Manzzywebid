// ============================================
// MANZZY ID - STORE & PPOB LOGIC (FULL)
// ============================================

let allData = [];
let selectedProduct = null;
const userSession = localStorage.getItem('user_session');

// --- 1. SYSTEM INITIALIZATION ---
window.addEventListener('load', async () => {
    // Cek Login & Load Data
    if(userSession) fetchUserProfile();
    await fetchProducts();
    
    // Matikan Loader Bawaan HTML (Jika ada)
    const loader = document.getElementById('loader');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
});

// --- 2. FETCH USER PROFILE ---
async function fetchUserProfile() {
    try {
        // Mengambil data user terbaru (saldo, username)
        const res = await fetch(`/api/user/${userSession}`);
        const data = await res.json();
        
        if(data.username) {
            // Update Tampilan Nama & Saldo di Home
            const nameEl = document.getElementById('user-name-display');
            const balEl = document.getElementById('user-balance-display');
            
            if(nameEl) nameEl.innerText = data.username;
            if(balEl) balEl.innerText = `Rp ${data.balance.toLocaleString()}`;
        }
    } catch(e) {
        console.error("Gagal load profile", e);
    }
}

// --- 3. FETCH PRODUCTS (DARI BACKEND H2H) ---
async function fetchProducts() {
    try {
        // Panggil endpoint backend yang sudah kita buat (h2h.js)
        // Pastikan route di index.js mengarah ke /api
        const res = await fetch('/api/products/h2h-list'); 
        const json = await res.json();
        
        if(json.success && Array.isArray(json.data)) {
            allData = json.data;
            renderCategoryGrid();
        } else {
            console.error("Data produk kosong/error", json);
            document.getElementById('category-grid').innerHTML = '<div class="col-span-full text-center text-xs text-red-500">Gagal memuat layanan.</div>';
        }
    } catch(e) {
        console.error("Connection error", e);
    }
}

// --- 4. RENDER KATEGORI (BERANDA) ---
function renderCategoryGrid() {
    // Ambil daftar brand unik (contoh: dana, gopay, freefire)
    const brands = [...new Set(allData.map(p => p.brand))];
    const container = document.getElementById('category-grid');
    if(!container) return;
    
    container.innerHTML = brands.map(brand => {
        // Ambil 1 produk sebagai sampel untuk gambar icon
        const sample = allData.find(p => p.brand === brand);
        const imgUrl = sample?.img_url || 'https://via.placeholder.com/100';
        // Format Nama: freefire -> Freefire
        const name = brand.charAt(0).toUpperCase() + brand.slice(1);

        return `
        <div onclick="openOrderPage('${brand}', '${imgUrl}')" class="flex flex-col items-center gap-2 cursor-pointer group">
            <div class="menu-icon-box w-16 h-16 rounded-2xl flex items-center justify-center p-3 shadow-lg bg-[#18181b] border border-white/5 group-hover:border-blue-500 transition duration-300">
                <img src="${imgUrl}" class="w-full h-full object-contain drop-shadow-sm group-hover:scale-110 transition duration-300">
            </div>
            <span class="text-[10px] font-bold text-gray-400 group-hover:text-white text-center leading-tight transition">${name}</span>
        </div>
        `;
    }).join('');
}

// --- 5. OPEN ORDER PAGE (ANIMASI) ---
function openOrderPage(brand, imgUrl) {
    const home = document.getElementById('view-home');
    const order = document.getElementById('view-order');
    
    // Set Header Halaman Order
    document.getElementById('order-page-title').innerText = brand.toUpperCase();
    document.getElementById('order-brand-logo').src = imgUrl;
    
    // Animasi Transisi
    home.classList.add('hidden');
    order.classList.remove('hidden');
    order.classList.add('page-enter');
    
    // Filter Produk Sesuai Brand
    const products = allData.filter(p => p.brand === brand);
    renderProductList(products);
    
    // Reset State Input & Tombol
    selectedProduct = null;
    document.getElementById('btn-process').disabled = true;
    document.getElementById('total-price-display').innerText = 'Rp 0';
    document.getElementById('target-input').value = '';
    
    // Sembunyikan Hasil Cek ID Lama
    const infoBox = document.getElementById('account-info-box');
    if(infoBox) infoBox.classList.add('hidden');
}

function closeOrderPage() {
    const home = document.getElementById('view-home');
    const order = document.getElementById('view-order');
    
    order.classList.add('hidden');
    home.classList.remove('hidden');
    home.classList.add('page-enter');
}

// --- 6. RENDER DAFTAR PRODUK ---
function renderProductList(products) {
    const list = document.getElementById('product-list-container');
    
    // Urutkan dari harga termurah ke termahal
    products.sort((a, b) => a.price - b.price);

    list.innerHTML = products.map(item => {
        const price = item.price; // Harga Jual (Sudah dimarkup di backend)
        const original = Math.ceil(price * 1.2); // Harga coret dummy (biar kelihatan diskon)
        
        // Hitung persentase diskon
        const discount = Math.round(((original - price) / original) * 100);

        return `
        <div onclick="selectItem(this, '${item.code}', ${price}, '${item.brand}')" 
             class="product-item rounded-xl p-4 cursor-pointer relative overflow-hidden group bg-[#18181b] border border-white/5 hover:border-blue-500 transition duration-200">
            
            <div class="flex justify-between items-center">
                <div class="flex-1 pr-2">
                    <h4 class="font-bold text-white text-sm mb-1">${item.name}</h4>
                    <p class="text-[10px] text-gray-500 line-clamp-1">${item.note || 'Layanan otomatis 24 Jam'}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-500 line-through mb-0.5">Rp ${original.toLocaleString()}</p>
                    <p class="text-base font-bold text-blue-400 font-mono">Rp ${price.toLocaleString()}</p>
                </div>
            </div>
            
            ${discount > 0 ? `<div class="absolute top-0 right-0 bg-red-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg shadow-sm">-${discount}%</div>` : ''}
        </div>
        `;
    }).join('');
}

// --- 7. PILIH ITEM (SELEKSI) ---
function selectItem(el, code, price, brand) {
    // Hapus seleksi lama
    document.querySelectorAll('.product-item').forEach(i => i.classList.remove('selected', 'border-blue-500', 'bg-blue-900/10'));
    
    // Tambah seleksi baru
    el.classList.add('selected', 'border-blue-500', 'bg-blue-900/10');
    
    selectedProduct = { code, price, brand };
    document.getElementById('total-price-display').innerText = `Rp ${price.toLocaleString()}`;
    document.getElementById('btn-process').disabled = false;
}

// --- 8. CEK NAMA AKUN / ID (VALIDASI) ---
async function checkAccountName() {
    const target = document.getElementById('target-input').value;
    if(!target) return alert("Masukkan Nomor/ID Tujuan dulu!");
    
    // Harus pilih produk dulu biar tau tipenya (Game/Ewallet)
    if(!selectedProduct) return alert("Pilih salah satu nominal produk dulu!");

    const btn = document.getElementById('btn-check-id');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;
    
    // Tentukan Tipe (Game atau E-Wallet)
    // Logika sederhana: jika kategori ada kata 'game' atau 'voucher', anggap game. Sisanya ewallet/pulsa.
    const sample = allData.find(p => p.brand === selectedProduct.brand);
    const type = (sample.category === 'game' || sample.category === 'voucher_game') ? 'game' : 'ewallet';
    
    try {
        const res = await fetch('/api/check-account', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                type: type, 
                code: selectedProduct.brand, // misal: 'dana', 'freefire'
                target: target 
            })
        });
        const json = await res.json();
        
        const infoBox = document.getElementById('account-info-box');
        
        if(json.success && json.data.status === 'valid') {
            // Tampilkan Hasil Valid
            if(infoBox) {
                document.getElementById('account-name-result').innerText = json.data.account_name;
                infoBox.classList.remove('hidden');
                infoBox.classList.add('flex');
            } else {
                alert(`Valid: ${json.data.account_name}`);
            }
        } else {
            alert("❌ ID/Nomor Tidak Ditemukan atau Salah Format!");
            if(infoBox) infoBox.classList.add('hidden');
        }
    } catch(e) {
        alert("Gagal mengecek ID. Pastikan koneksi aman.");
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}

// --- 9. PROSES TRANSAKSI (BELI) ---
async function processTransaction() {
    // 1. Validasi Login
    if(!userSession) {
        alert("Silakan Login Terlebih Dahulu!");
        window.location.href = '/login_user.html';
        return;
    }
    
    const target = document.getElementById('target-input').value;
    if(!target) return alert("Masukkan ID / Nomor Tujuan dengan benar!");
    
    // 2. Konfirmasi User
    const confirmMsg = `
    KONFIRMASI PEMBELIAN
    --------------------
    Item   : ${selectedProduct.code}
    Tujuan : ${target}
    Harga  : Rp ${selectedProduct.price.toLocaleString()}
    
    Lanjutkan pembayaran?
    `;
    if(!confirm(confirmMsg)) return;

    // 3. UI Loading
    const btn = document.getElementById('btn-process');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> MEMPROSES...';
    btn.disabled = true;

    try {
        // 4. Request ke Backend Real
        const res = await fetch('/api/buy-ppob', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: userSession,
                productCode: selectedProduct.code,
                target: target,
                expectedPrice: selectedProduct.price
            })
        });

        const json = await res.json();

        // 5. Handle Response
        if (json.success) {
            // SUKSES
            alert(`✅ TRANSAKSI BERHASIL!\n\nInvoice: ${json.invoiceId}\nStatus: Sedang Diproses\n\nSilakan cek menu 'Transaksi' untuk melihat status terbaru.`);
            
            closeOrderPage();
            fetchUserProfile(); // Refresh saldo otomatis
        } else {
            // GAGAL (Saldo kurang / Gangguan)
            alert(`❌ GAGAL: ${json.msg}`);
        }

    } catch(e) {
        alert("Terjadi kesalahan koneksi ke server.");
        console.error(e);
    } finally {
        btn.innerHTML = 'BELI SEKARANG';
        btn.disabled = false;
    }
} 