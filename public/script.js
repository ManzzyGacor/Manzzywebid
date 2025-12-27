// =========================================
// 1. LOADER SYSTEM (ANTI-STUCK GUARANTEE)
// =========================================
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');

function removeLoader() {
    if (!loader) return;
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    setTimeout(() => { loader.style.display = 'none'; }, 800);
}

// ANIMASI ROBOT (Visual Saja)
async function runBootSequence() {
    const steps = ["BOOTING SYSTEM...", "CONNECTING...", "SYNC DATA...", "ACCESS GRANTED"];
    if(loaderText) {
        for (let i = 0; i < steps.length; i++) {
            loaderText.innerText = steps[i];
            await new Promise(r => setTimeout(r, 800)); // Durasi per teks
        }
    }
    removeLoader(); // Selesai animasi -> Hapus Loader
}

// SAFETY NET: Paksa hapus loader setelah 5 detik max (Apapun yang terjadi)
setTimeout(removeLoader, 5000);

// =========================================
// 2. AUTH & USER DATA
// =========================================
const userSession = localStorage.getItem('user_session');
let userBalance = 0;

async function checkUserLogin() {
    if (!userSession) return;

    try {
        const res = await fetch(`/api/user/${userSession}`);
        const data = await res.json();

        if (data.username) {
            userBalance = data.balance || 0;
            const formatted = `Rp ${userBalance.toLocaleString()}`;

            // Update UI Sidebar
            const sidebarStatus = document.getElementById('user-status-sidebar');
            if(sidebarStatus) sidebarStatus.innerHTML = `Hi, ${userSession}<br><span class="text-green-400 font-bold font-mono">${formatted}</span>`;

            // Update UI Navbar (Dompet)
            const headerBal = document.getElementById('header-balance');
            if(headerBal) {
                headerBal.innerHTML = `<i class="fa-solid fa-wallet text-green-400 animate-pulse"></i><span class="text-sm text-white font-mono font-bold tracking-wide">${formatted}</span>`;
                headerBal.classList.remove('hidden');
            }

            // Show Menus
            document.getElementById('review-form-container')?.classList.remove('hidden');
            document.getElementById('login-prompt')?.classList.add('hidden');
            document.getElementById('menu-topup')?.classList.remove('hidden');
            
            const authMenu = document.getElementById('auth-menu');
            if(authMenu) authMenu.innerHTML = `<a href="#" onclick="doLogout()" class="flex items-center gap-4 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/5 transition"><i class="fa-solid fa-sign-out-alt text-red-500 w-6 text-center"></i><span class="font-medium">Logout</span></a>`;
        }
    } catch (e) {
        console.error("Gagal load user data:", e);
    }
}

function doLogout() {
    localStorage.removeItem('user_session');
    window.location.reload();
}

// =========================================
// 3. CORE UI FUNCTIONS
// =========================================
function toggleSidebar() { document.body.classList.toggle('sidebar-active'); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('modal-active'); }
function closeModal(e) { if (e.target.id === 'modal-overlay') closeModalDirect(); }
function toggleFaq(header) { header.parentElement.classList.toggle('faq-active'); }

// Scroll Top Button
const scrollBtn = document.getElementById('btn-scroll');
window.onscroll = function() {
    if(scrollBtn) scrollBtn.classList.toggle('show-scroll-btn', window.scrollY > 300);
};
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// Switch View (Landing / Store / TopUp)
function switchView(target) {
    const views = {
        landing: document.getElementById('view-landing'),
        store: document.getElementById('view-store'),
        topup: document.getElementById('view-topup')
    };

    document.body.classList.remove('sidebar-active');

    // Hide All
    Object.values(views).forEach(el => {
        if(el) {
            el.style.opacity = '0';
            el.classList.remove('view-active');
        }
    });

    // Show Target
    setTimeout(() => {
        const el = views[target];
        if(el) {
            el.classList.add('view-active');
            el.style.opacity = '1';
            if(target === 'store') loadStoreData();
        }
    }, 400);
}

// =========================================
// 4. STORE & ORDER LOGIC
// =========================================
let allProducts = [], allCategories = [], currentProduct = null;
const ADMIN_WA = "6287756632352";

async function loadStoreData() {
    if (allCategories.length > 0) return; // Sudah load sebelumnya
    
    document.getElementById('loading-store')?.classList.remove('hidden');
    document.getElementById('section-categories')?.classList.add('hidden');

    try {
        const [catRes, prodRes] = await Promise.all([
            fetch('/api/categories'),
            fetch('/api/products')
        ]);
        allCategories = await catRes.json();
        allProducts = await prodRes.json();
        renderCategories();
    } catch (e) {
        console.log("Gagal load store:", e);
    } finally {
        document.getElementById('loading-store')?.classList.add('hidden');
    }
}

function renderCategories() {
    const grid = document.getElementById('grid-categories');
    document.getElementById('section-categories').classList.remove('hidden');
    document.getElementById('section-products').classList.add('hidden');

    if (allCategories.length === 0) {
        grid.innerHTML = '<p class="text-gray-500">Belum ada kategori.</p>';
        return;
    }
    
    let html = allCategories.map(c => `
        <div class="cat-card group" onclick="openCategory('${c.name}')">
            <div class="cat-bg" style="background-image: url('${c.imageUrl}');"></div>
            <div class="cat-overlay"><h3 class="text-white font-bold text-lg group-hover:text-purple-400 transition">${c.name}</h3></div>
        </div>
    `).join('');
    
    html += `<div class="cat-card group" onclick="openCategory('ALL')"><div class="cat-bg bg-purple-900"></div><div class="cat-overlay"><h3 class="text-white font-bold text-lg">Semua</h3></div></div>`;
    grid.innerHTML = html;
}

function openCategory(name) {
    document.getElementById('section-categories').classList.add('hidden');
    document.getElementById('section-products').classList.remove('hidden');
    document.getElementById('current-category-name').innerText = name === 'ALL' ? 'Semua Produk' : name;
    document.getElementById('searchInput').value = ''; 
    filterProducts(name);
}

function backToCategories() {
    document.getElementById('section-products').classList.add('hidden');
    document.getElementById('section-categories').classList.remove('hidden');
}

function filterProducts(catFilter = null) {
    const keyword = document.getElementById('searchInput').value.toLowerCase();
    let filtered = allProducts;

    // Filter by Category first (if provided or stored)
    const activeCatText = document.getElementById('current-category-name').innerText;
    const activeCat = activeCatText === 'Semua Produk' ? 'ALL' : activeCatText;
    
    if (activeCat !== 'ALL') {
        filtered = filtered.filter(p => p.category === activeCat);
    }

    // Filter by Keyword
    if (keyword) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(keyword));
    }

    renderProducts(filtered);
}

function renderProducts(products) {
    const grid = document.getElementById('grid-products');
    if (products.length === 0) {
        grid.innerHTML = '<p class="text-gray-500 col-span-full text-center">Produk tidak ditemukan.</p>';
        return;
    }

    grid.innerHTML = products.map(p => {
        const isAvailable = p.isAvailable !== false;
        const imgUrl = p.imageUrl || 'https://via.placeholder.com/400x200';
        const cardClass = isAvailable ? '' : 'unavailable';
        const btnClass = isAvailable ? 'bg-white/5 border-white/10 group-hover:bg-purple-600 group-hover:border-purple-600' : 'bg-red-900/20 cursor-not-allowed';
        const btnText = isAvailable ? 'Lihat Detail' : 'Stok Habis';
        const action = isAvailable ? `onclick="openModal('${p._id}')"` : '';

        return `
            <div class="product-card group flex flex-col h-full ${cardClass}">
                ${!isAvailable ? '<div class="badge-unavailable">HABIS</div>' : ''}
                <div class="product-img-wrapper"><img src="${imgUrl}" class="product-img"><div class="absolute top-3 right-3"><span class="price-badge">Rp ${p.price.toLocaleString()}</span></div></div>
                <div class="p-5 flex flex-col flex-1">
                    <h3 class="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition">${p.name}</h3>
                    <p class="text-sm text-gray-400 mb-6 line-clamp-3 leading-relaxed flex-1">${p.desc}</p>
                    <button ${action} class="w-full py-3 rounded-lg border text-white font-bold flex items-center justify-center gap-2 transition-all duration-300 ${btnClass}">
                        <i class="fa-solid fa-eye text-lg"></i> ${btnText}
                    </button>
                </div>
            </div>`;
    }).join('');
}

// MODAL ORDER FORM
function openModal(id) {
    const p = allProducts.find(x => x._id === id);
    if (!p) return;
    currentProduct = p;

    document.getElementById('modal-content-product').classList.remove('hidden');
    document.getElementById('modal-content-receipt').classList.add('hidden');

    document.getElementById('modal-title').innerText = p.name;
    document.getElementById('modal-price').innerText = `Rp ${p.price.toLocaleString()}`;
    document.getElementById('modal-desc').innerText = p.desc;
    document.getElementById('modal-img').src = p.imageUrl || 'https://via.placeholder.com/400x200';

    const balText = userSession ? `Rp ${userBalance.toLocaleString()}` : 'Login Dulu';
    const balEl = document.getElementById('user-balance-display');
    balEl.innerText = balText;
    balEl.className = (userSession && userBalance >= p.price) ? 'font-bold font-mono text-green-400' : 'font-bold font-mono text-red-500';

    // Generate Dynamic Inputs
    const formContainer = document.getElementById('dynamic-inputs');
    formContainer.innerHTML = '';
    const fields = (p.formFields || 'Nomor WhatsApp').split(',');
    
    fields.forEach(f => {
        const clean = f.trim();
        if (clean) {
            formContainer.innerHTML += `
                <div>
                    <label class="text-[10px] text-gray-500 font-bold uppercase block mb-1">${clean}</label>
                    <input type="text" name="${clean}" class="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-purple-500 transition" required placeholder="...">
                </div>`;
        }
    });

    document.getElementById('modal-overlay').classList.add('modal-active');
}

async function processOrder(e) {
    e.preventDefault();
    if (!userSession) return alert("Silakan Login terlebih dahulu!");
    if (userBalance < currentProduct.price) return alert("Saldo tidak cukup! Silakan Top Up dulu.");

    const btn = document.getElementById('btn-buy');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    btn.disabled = true;

    const inputs = document.querySelectorAll('#orderForm input');
    let formData = "";
    inputs.forEach(i => formData += `${i.name}: ${i.value}\n`);

    try {
        const res = await fetch('/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userSession, productId: currentProduct._id, formData })
        });
        const result = await res.json();

        if (result.success) {
            userBalance -= currentProduct.price;
            checkUserLogin(); // Refresh tampilan saldo

            document.getElementById('modal-content-product').classList.add('hidden');
            document.getElementById('modal-content-receipt').classList.remove('hidden');

            document.getElementById('rec-inv').innerText = result.invoiceId;
            document.getElementById('rec-item').innerText = result.productName;
            document.getElementById('rec-mode').innerText = result.mode === 'manual' ? 'Manual (WA)' : 'Otomatis';

            if (result.mode === 'manual') {
                const btnC = document.getElementById('btn-continue');
                btnC.innerText = "Lanjut ke WhatsApp Admin";
                btnC.onclick = function () {
                    const waMsg = `Halo Admin, saya order via web.\n\nInv: *${result.invoiceId}*\nItem: ${result.productName}\n\nData:\n${formData}`;
                    window.open(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(waMsg)}`, '_blank');
                    closeModalDirect();
                };
            } else {
                document.getElementById('btn-continue').innerText = "Tutup";
                document.getElementById('btn-continue').onclick = closeModalDirect;
            }
        } else {
            alert("Gagal: " + result.msg);
        }
    } catch (e) {
        alert("Error koneksi ke server.");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Bayar Sekarang';
        btn.disabled = false;
    }
}

// =========================================
// 5. TOP UP SYSTEM
// =========================================
async function submitTopUp(e) {
    e.preventDefault();
    if (!userSession) return alert("Silakan Login Dulu!");

    const btn = document.getElementById('btn-topup');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
    btn.disabled = true;

    const amount = document.getElementById('topupAmount').value;
    const file = document.getElementById('topupProof').files[0];

    if (!file) {
        alert("Pilih foto bukti transfer!");
        btn.innerHTML = 'Kirim Bukti Transfer';
        btn.disabled = false;
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async function () {
        try {
            const res = await fetch('/api/topup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userSession, amount, proofImage: reader.result })
            });
            if (res.ok) {
                alert("Bukti Terkirim! Admin akan mengeceknya.");
                switchView('landing');
            } else {
                alert("Gagal mengirim (File mungkin terlalu besar > 4MB)");
            }
        } catch (e) {
            alert("Error saat mengirim data.");
        } finally {
            btn.innerHTML = 'Kirim Bukti Transfer';
            btn.disabled = false;
        }
    };
}

// =========================================
// 6. SERVER MONITOR & TESTIMONIALS
// =========================================
async function updateServerStats() {
    try {
        // Ambil Config di DB
        const configRes = await fetch('/api/ptero/config');
        const config = await configRes.json();
        
        if (!config.panelUrl) return;

        // Fetch Client Side (Bypass Cloudflare via Browser)
        const response = await fetch(`${config.panelUrl}/api/client/servers/${config.serverId}/resources`, {
            headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error("Panel Error");
        
        const data = await response.json();
        const stats = data.attributes.resources;
        const state = data.attributes.current_state;

        // UI Update
        const badge = document.getElementById('status-badge');
        if(badge) {
            if (state === 'running') { badge.innerText = "● ONLINE"; badge.className = "text-green-500 font-bold border px-2 rounded border-green-500/30"; }
            else { badge.innerText = "● OFFLINE"; badge.className = "text-red-500 font-bold border px-2 rounded border-red-500/30"; }
        }

        document.getElementById('bar-cpu').style.width = Math.min(stats.cpu_absolute, 100) + "%";
        document.getElementById('text-cpu').innerText = stats.cpu_absolute.toFixed(1) + "%";
        
        const maxRam = 16; 
        document.getElementById('bar-ram').style.width = Math.min(((stats.memory_bytes/1024/1024/1024)/maxRam)*100, 100) + "%";
        document.getElementById('text-ram').innerText = (stats.memory_bytes/1024/1024/1024).toFixed(1) + "G";

        // Runtime Bot
        if (stats.uptime > 0) {
            const sec = Math.floor(stats.uptime / 1000);
            const bh = Math.floor(sec / 3600);
            const bm = Math.floor((sec % 3600) / 60);
            document.getElementById('runtime-bot').innerText = `${bh}h ${bm}m`;
            document.getElementById('runtime-bot').className = "text-blue-400 font-bold font-mono text-xl";
        } else {
            document.getElementById('runtime-bot').innerText = "Offline";
            document.getElementById('runtime-bot').className = "text-red-500 font-bold font-mono text-xl";
        }

    } catch (e) {
        // Silent error, biar gak spam console
    }
}

async function fetchTestimonials() {
    try {
        const res = await fetch('/api/testimonials');
        const reviews = await res.json();
        const grid = document.getElementById('testimonial-grid');
        if (reviews.length === 0) {
            grid.innerHTML = '<p class="text-center text-gray-500 w-full py-10">Belum ada ulasan.</p>';
            return;
        }
        grid.innerHTML = reviews.map(r => `
            <div class="glass-card p-6 rounded-xl review-card bg-gradient-to-br from-gray-900 to-black w-[85vw] md:w-[350px] snap-center border border-gray-800 flex flex-col justify-between h-auto min-h-[160px]">
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-white font-bold text-lg">${r.username.charAt(0).toUpperCase()}</div>
                            <div><h4 class="font-bold text-white text-sm">${r.username}</h4><p class="text-[10px] text-gray-500">${new Date(r.date).toLocaleDateString()}</p></div>
                        </div>
                        <div class="text-yellow-500 text-xs">${Array(r.rating).fill('<i class="fa-solid fa-star"></i>').join('')}</div>
                    </div>
                    <div class="text-gray-300 text-sm italic limit-text">"${r.comment}"</div>
                </div>
            </div>`).join('');
    } catch (e) {}
}

async function submitReview(e) {
    e.preventDefault();
    await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userSession, rating: currentRating, comment: document.getElementById('reviewComment').value })
    });
    document.getElementById('reviewComment').value = '';
    alert("Ulasan terkirim!");
    fetchTestimonials();
}

let startTime = new Date(); startTime.setDate(startTime.getDate()-12);
setInterval(() => {
    const d = Math.floor((new Date() - startTime) / 86400000);
    document.getElementById('runtime-vps').innerText = `${d}d 4h`;
}, 1000);

// =========================================
// 7. INITIALIZATION (MAIN ENTRY POINT)
// =========================================
window.addEventListener('load', () => {
    // 1. Jalankan Animasi Boot
    runBootSequence();
    
    // 2. Jalankan semua fetch data
    checkUserLogin();
    fetchTestimonials();
    updateServerStats();
    
    // 3. Set Interval Monitor
    setInterval(updateServerStats, 5000);
});