// ============================================
// MANZZY ID - STORE & H2H LOGIC
// ============================================

let allProducts = [], allCategories = [], currentProduct = null;

// 1. Load Data Toko (Otomatis deteksi H2H)
async function loadStoreData() {
    const loader = document.getElementById('loading-store');
    const catSection = document.getElementById('section-categories');
    
    if(loader) loader.classList.remove('hidden');
    if(catSection) catSection.classList.add('hidden');
    
    try { 
        // Panggil API Backend H2H yang baru
        const res = await fetch('/api/products/rumahotp'); 
        const json = await res.json();
        
        if (json.success && Array.isArray(json.data)) {
            allProducts = json.data;
            
            // Buat Kategori Otomatis dari Brand (Freefire, Mobilelegends, dll)
            const brands = [...new Set(allProducts.map(p => p.brand))];
            allCategories = brands.map(b => ({
                name: b.charAt(0).toUpperCase() + b.slice(1), 
                originalKey: b,
                imageUrl: allProducts.find(p => p.brand === b)?.img_url || 'https://via.placeholder.com/150'
            }));
            
            renderCategories();
        } else {
            console.error("Data H2H Kosong/Error", json);
            document.getElementById('grid-categories').innerHTML = '<p class="text-center text-red-500">Gagal memuat produk server.</p>';
        }
    } catch(e){ 
        console.error(e);
    } finally { 
        if(loader) loader.classList.add('hidden'); 
    }
}

// 2. Render Kategori
function renderCategories() {
    const grid = document.getElementById('grid-categories');
    document.getElementById('section-categories').classList.remove('hidden');
    document.getElementById('section-products').classList.add('hidden');
    
    if(allCategories.length === 0) return;
    
    let html = allCategories.map(c => `
        <div class="cat-card group" onclick="openCategory('${c.originalKey}')">
            <div class="cat-bg" style="background-image: url('${c.imageUrl}');"></div>
            <div class="cat-overlay">
                <h3 class="text-white font-bold text-lg group-hover:text-purple-400 transition uppercase">${c.name}</h3>
            </div>
        </div>
    `).join('');
    
    // Tambah tombol ALL
    html += `<div class="cat-card group" onclick="openCategory('ALL')"><div class="cat-bg bg-purple-900"></div><div class="cat-overlay"><h3 class="text-white font-bold text-lg">Semua</h3></div></div>`;
    grid.innerHTML = html;
}

// 3. Buka Kategori
function openCategory(key) { 
    document.getElementById('section-categories').classList.add('hidden'); 
    document.getElementById('section-products').classList.remove('hidden'); 
    
    const displayTitle = key === 'ALL' ? 'Semua Produk' : key.toUpperCase();
    document.getElementById('current-category-name').innerText = displayTitle; 
    document.getElementById('searchInput').value = ''; 
    document.body.setAttribute('data-current-category', key);
    
    filterProducts(key); 
}

function backToCategories() { 
    document.getElementById('section-products').classList.add('hidden'); 
    document.getElementById('section-categories').classList.remove('hidden'); 
}

// 4. Filter & Render Produk
function filterProducts(forceKey = null) { 
    const keyword = document.getElementById('searchInput').value.toLowerCase(); 
    const categoryKey = forceKey || document.body.getAttribute('data-current-category') || 'ALL';
    
    let data = allProducts; 
    if(categoryKey !== 'ALL') data = data.filter(p => p.brand === categoryKey); 
    if(keyword) data = data.filter(p => p.name.toLowerCase().includes(keyword)); 
    
    renderProducts(data); 
}

function renderProducts(products) { 
    const grid = document.getElementById('grid-products'); 
    if(products.length === 0){ grid.innerHTML = '<p class="text-gray-500 col-span-full text-center">Produk tidak ditemukan.</p>'; return; } 
    
    grid.innerHTML = products.map(item => { 
        const img = item.img_url || 'https://via.placeholder.com/400';
        const price = item.price;
        const discount = item.price_info?.price_discount_percent || 0;
        const discountBadge = discount > 0 ? `<div class="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">-${discount}%</div>` : '';

        return `
        <div class="product-card group flex flex-col h-full bg-[#0f0f11] border border-white/10 rounded-2xl overflow-hidden hover:border-purple-500 transition duration-300">
            <div class="product-img-wrapper h-40 relative overflow-hidden">
                <img src="${img}" class="w-full h-full object-cover transition transform group-hover:scale-110 duration-500">
                <div class="absolute top-3 right-3"><span class="price-badge bg-black/70 backdrop-blur-md border border-white/20 text-purple-300 px-3 py-1 rounded-full text-xs font-mono font-bold">Rp ${price.toLocaleString()}</span></div>
                ${discountBadge}
            </div>
            <div class="p-5 flex flex-col flex-1">
                <div class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">${item.brand}</div>
                <h3 class="text-lg font-bold text-white mb-2 leading-tight group-hover:text-purple-400 transition">${item.name}</h3>
                <button onclick="openModalExternal('${item.code}')" class="mt-auto w-full py-3 rounded-xl border border-white/10 bg-white/5 text-white font-bold hover:bg-purple-600 hover:border-purple-500 transition shadow-lg">Beli Sekarang</button>
            </div>
        </div>`; 
    }).join(''); 
}

// 5. Modal & Checkout External
function openModalExternal(code) {
    const p = allProducts.find(x => x.code === code); 
    if(!p) return; 
    currentProduct = p; 

    document.getElementById('modal-content-product').classList.remove('hidden'); 
    document.getElementById('modal-content-receipt').classList.add('hidden');
    document.getElementById('modal-title').innerText = p.name; 
    document.getElementById('modal-price').innerText = `Rp ${p.price.toLocaleString()}`; 
    document.getElementById('modal-desc').innerText = p.note || `Top Up ${p.name} (${p.brand})`; 
    document.getElementById('modal-img').src = p.img_url;
    document.getElementById('price-final').innerText = `Rp ${p.price.toLocaleString()}`; 
    document.getElementById('price-original').classList.add('hidden');
    
    // User Balance Check
    const userSession = localStorage.getItem('user_session');
    let bal = "Login Dulu";
    // Kita ambil saldo dari elemen header kalau ada, biar sinkron
    const headerBal = document.getElementById('header-balance');
    if(userSession && headerBal) bal = headerBal.innerText;
    document.getElementById('user-balance-display').innerText = bal;
    
    // Form Input ID
    const form = document.getElementById('dynamic-inputs'); 
    form.innerHTML = `<div><label class="text-[10px] text-gray-500 font-bold block mb-1">ID PLAYER / NOMOR TUJUAN</label><input type="text" name="target" class="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white text-sm focus:border-purple-500 outline-none" placeholder="Masukkan ID / Nomor..." required></div>`;
    
    document.getElementById('modal-overlay').classList.add('modal-active');
}

