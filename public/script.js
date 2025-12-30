// ============================================
// 1. SYSTEM INITIALIZATION & LOADER
// ============================================

window.addEventListener('load', () => {
    setTimeout(() => {
        const l = document.getElementById('loader');
        if(l) { 
            l.style.opacity = '0'; 
            l.style.pointerEvents = 'none'; 
            setTimeout(() => l.style.display = 'none', 500); 
        }
    }, 1500);
});

async function initData() {
    checkUserLogin();
    fetchTestimonials();
    updateServerStats();
    startLiveNotif(); // Jalankan notifikasi sosial proof
    setInterval(updateServerStats, 5000);
}

// ============================================
// 2. AUTHENTICATION
// ============================================

const userSession = localStorage.getItem('user_session');
let userBalance = 0;
const ADMIN_WA = "6287756632352";

async function checkUserLogin() {
    if (!userSession) return;
    try {
        const res = await fetch(`/api/user/${userSession}`);
        const data = await res.json();
        if (data.username) {
            userBalance = data.balance || 0;
            const formatted = `Rp ${userBalance.toLocaleString()}`;
            
            // Header Balance
            const headerBal = document.getElementById('header-balance');
            if(headerBal) {
                headerBal.innerHTML = `<i class="fa-solid fa-wallet text-green-400 animate-pulse"></i><span class="text-sm text-white font-mono font-bold tracking-wide">${formatted}</span>`;
                headerBal.classList.remove('hidden');
            }
            
            // Sidebar User Info
            const sidebar = document.getElementById('user-status-sidebar');
            if(sidebar) sidebar.innerHTML = `Hi, ${userSession}<br><span class="text-green-400 font-bold font-mono">${formatted}</span>`;
            
            // Show Member Menus
            document.getElementById('review-form-container')?.classList.remove('hidden');
            document.getElementById('login-prompt')?.classList.add('hidden');
            document.getElementById('menu-topup')?.classList.remove('hidden');
            document.getElementById('menu-myservices')?.classList.remove('hidden');
            document.getElementById('menu-history')?.classList.remove('hidden');
            document.getElementById('menu-nokos')?.classList.remove('hidden');
            
            // Logout Button
            document.getElementById('auth-menu').innerHTML = `<a href="#" onclick="doLogout()" class="flex items-center gap-4 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/5 transition"><i class="fa-solid fa-sign-out-alt text-red-500 w-6 text-center"></i><span class="font-medium">Logout</span></a>`;
        }
    } catch(e) {}
}

function doLogout() { 
    localStorage.removeItem('user_session'); 
    window.location.reload(); 
}

// ============================================
// 3. UI HELPER (TOAST, SIDEBAR, MODAL)
// ============================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let colors = type === 'success' ? 'border-green-500 bg-green-900/90 text-green-100' : 
                 type === 'error' ? 'border-red-500 bg-red-900/90 text-red-100' : 
                 'border-blue-500 bg-blue-900/90 text-blue-100';
    
    let icon = type === 'success' ? '<i class="fa-solid fa-check-circle text-green-400 text-xl"></i>' : 
               type === 'error' ? '<i class="fa-solid fa-circle-exclamation text-red-400 text-xl"></i>' : 
               '<i class="fa-solid fa-circle-info text-blue-400 text-xl"></i>';

    toast.className = `flex items-center gap-4 p-4 rounded-xl border-l-4 shadow-2xl backdrop-blur-md transition-all duration-500 toast-enter ${colors} pointer-events-auto min-w-[320px] max-w-md`;
    toast.innerHTML = `<div>${icon}</div><div class="text-sm font-medium leading-snug">${message}</div>`;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('toast-enter'));
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 500); }, 4000);
}

function toggleSidebar() { document.body.classList.toggle('sidebar-active'); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('modal-active'); }
function closeModal(e) { if(e.target.id === 'modal-overlay') closeModalDirect(); }
function toggleFaq(h){ h.parentElement.classList.toggle('faq-active'); }
const scrollBtn = document.getElementById('btn-scroll'); 
window.onscroll = function() { if(scrollBtn) scrollBtn.classList.toggle('show-scroll-btn', window.scrollY > 300); };
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function switchView(viewId) {
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
        view.classList.remove('view-active');
        view.style.display = 'none'; 
        view.style.opacity = '0'; 
    });

    document.body.classList.remove('sidebar-active');
    const overlay = document.getElementById('sidebar-overlay');
    if(overlay) overlay.classList.remove('active');

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.add('view-active');
        target.style.display = 'block';
        setTimeout(() => target.style.opacity = '1', 50);

        if (viewId === 'store') loadStoreData();
        if (viewId === 'myservices') fetchMyServices();
        if (viewId === 'history') fetchHistory();
        if (viewId === 'nokos') initNokos();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// 4. STORE, VOUCHER & KATALOG
// ============================================

let allProducts=[], allCategories=[], currentProduct=null, activeVoucher=null;

async function loadStoreData() {
    if(allCategories.length > 0) return;
    document.getElementById('loading-store')?.classList.remove('hidden');
    document.getElementById('section-categories')?.classList.add('hidden');
    try { 
        const [c, p] = await Promise.all([fetch('/api/categories'), fetch('/api/products')]); 
        allCategories = await c.json(); 
        allProducts = await p.json(); 
        renderCategories(); 
    } catch(e){} 
    finally { document.getElementById('loading-store')?.classList.add('hidden'); }
}

function renderCategories() {
    const grid = document.getElementById('grid-categories');
    document.getElementById('section-categories').classList.remove('hidden');
    document.getElementById('section-products').classList.add('hidden');
    if(allCategories.length === 0) { grid.innerHTML = '<p class="text-gray-500">Kosong.</p>'; return; }
    let html = allCategories.map(c => `<div class="cat-card group" onclick="openCategory('${c.name}')"><div class="cat-bg" style="background-image: url('${c.imageUrl}');"></div><div class="cat-overlay"><h3 class="text-white font-bold text-lg group-hover:text-purple-400 transition">${c.name}</h3></div></div>`).join('');
    html += `<div class="cat-card group" onclick="openCategory('ALL')"><div class="cat-bg bg-purple-900"></div><div class="cat-overlay"><h3 class="text-white font-bold text-lg">Semua</h3></div></div>`;
    grid.innerHTML = html;
}

function openCategory(n) { 
    document.getElementById('section-categories').classList.add('hidden'); 
    document.getElementById('section-products').classList.remove('hidden'); 
    document.getElementById('current-category-name').innerText = n === 'ALL' ? 'Semua Produk' : n; 
    document.getElementById('searchInput').value=''; 
    filterProducts(n); 
}

function backToCategories() { 
    document.getElementById('section-products').classList.add('hidden'); 
    document.getElementById('section-categories').classList.remove('hidden'); 
}

function filterProducts(f=null) { 
    const k=document.getElementById('searchInput').value.toLowerCase(); 
    let d=allProducts; 
    const c=document.getElementById('current-category-name').innerText; 
    const ac=c==='Semua Produk'?'ALL':c; 
    if(ac!=='ALL') d=d.filter(p=>p.category===ac); 
    if(k) d=d.filter(p=>p.name.toLowerCase().includes(k)); 
    renderProducts(d); 
}

function renderProducts(p) { 
    const g=document.getElementById('grid-products'); 
    if(p.length===0){g.innerHTML='<p class="text-gray-500 col-span-full text-center">Tidak ditemukan.</p>';return;} 
    g.innerHTML=p.map(x=>{ 
        const a=x.isAvailable!==false, u=x.imageUrl||'https://via.placeholder.com/400', c=a?'':'unavailable', b=a?'bg-white/5 border-white/10 group-hover:bg-purple-600':'bg-red-900/20 cursor-not-allowed', act=a?`onclick="openModal('${x._id}')"`:''; 
        return `<div class="product-card group flex flex-col h-full ${c}"><div class="product-img-wrapper"><img src="${u}" class="product-img"><div class="absolute top-3 right-3"><span class="price-badge">Rp ${x.price.toLocaleString()}</span></div></div><div class="p-5 flex flex-col flex-1"><h3 class="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition">${x.name}</h3><p class="text-sm text-gray-400 mb-6 line-clamp-3 flex-1">${x.desc}</p><button ${act} class="w-full py-3 rounded-lg border text-white font-bold ${b}">${a?'Lihat Detail':'Stok Habis'}</button></div></div>`; 
    }).join(''); 
}

function openModal(id) {
    const p = allProducts.find(x => x._id === id); if(!p) return; currentProduct = p;
    document.getElementById('modal-content-product').classList.remove('hidden'); 
    document.getElementById('modal-content-receipt').classList.add('hidden');
    document.getElementById('modal-title').innerText = p.name; 
    
    // RESET VOUCHER UI
    activeVoucher = null;
    document.getElementById('voucherInput').value = '';
    document.getElementById('voucher-msg').classList.add('hidden');
    document.getElementById('price-original').classList.add('hidden');
    
    document.getElementById('price-final').innerText = `Rp ${p.price.toLocaleString()}`; 
    document.getElementById('price-final').className = "font-bold font-mono text-white";
    document.getElementById('modal-price').innerText = `Rp ${p.price.toLocaleString()}`; 
    document.getElementById('modal-desc').innerText = p.desc; 
    document.getElementById('modal-img').src = p.imageUrl || 'https://via.placeholder.com/400';
    document.getElementById('user-balance-display').innerText = userSession ? `Rp ${userBalance.toLocaleString()}` : 'Login Dulu';
    
    const form = document.getElementById('dynamic-inputs'); form.innerHTML = '';
    (p.formFields||'No WA').split(',').forEach(f => { if(f.trim()) form.innerHTML += `<div><label class="text-[10px] text-gray-500 font-bold block mb-1">${f.trim()}</label><input type="text" name="${f.trim()}" class="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white text-sm" required></div>`; });
    document.getElementById('modal-overlay').classList.add('modal-active');
}

async function checkVoucher() {
    const code = document.getElementById('voucherInput').value.trim();
    const msgEl = document.getElementById('voucher-msg');
    
    if(!code) { msgEl.innerText="Masukkan kode."; msgEl.className="text-red-500 text-[10px] block"; return; }
    
    // Loading state
    msgEl.innerHTML = "<i class='fa-solid fa-circle-notch fa-spin'></i> Cek..."; 
    msgEl.className="text-yellow-500 text-[10px] block";
    msgEl.classList.remove('hidden');
    
    try {
        const res = await fetch('/api/check-voucher', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code})});
        const d = await res.json();
        if(d.success) {
            activeVoucher = code;
            const disc = Math.ceil(currentProduct.price * (d.percent/100));
            const final = currentProduct.price - disc;
            
            document.getElementById('price-original').innerText = `Rp ${currentProduct.price.toLocaleString()}`;
            document.getElementById('price-original').classList.remove('hidden');
            document.getElementById('price-final').innerText = `Rp ${final.toLocaleString()}`;
            document.getElementById('price-final').className = "font-bold font-mono text-green-400";
            
            msgEl.innerText = `✅ Hemat ${d.percent}%`; msgEl.className="text-green-500 text-[10px] block";
        } else {
            msgEl.innerText = "❌ Kode salah."; msgEl.className="text-red-500 text-[10px] block";
            activeVoucher = null;
            
            // Reset
            document.getElementById('price-original').classList.add('hidden');
            document.getElementById('price-final').innerText = `Rp ${currentProduct.price.toLocaleString()}`;
            document.getElementById('price-final').className = "font-bold font-mono text-white";
        }
    } catch(e) { msgEl.innerText = "Error koneksi."; }
}

async function processOrder(e) {
    e.preventDefault(); 
    if(!userSession) return showToast("Login dulu!", "error"); 
    
    const btn=document.getElementById('btn-buy'); btn.innerHTML='Proses...'; btn.disabled=true;
    const inputs=document.querySelectorAll('#orderForm input'); 
    let fd=""; inputs.forEach(i=> { if(i.id!=='voucherInput') fd+=`${i.name}: ${i.value}\n` });
    
    try { 
        const res=await fetch('/api/order',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({username:userSession, productId:currentProduct._id, formData:fd, voucherCode:activeVoucher})
        }); 
        const r=await res.json(); 
        if(r.success){ 
            checkUserLogin(); 
            document.getElementById('modal-content-product').classList.add('hidden'); 
            document.getElementById('modal-content-receipt').classList.remove('hidden'); 
            document.getElementById('rec-inv').innerText=r.invoiceId; 
            document.getElementById('rec-item').innerText=r.productName; 
            document.getElementById('rec-mode').innerText=r.mode; 
            
            const b=document.getElementById('btn-continue'); 
            if(r.mode==='manual'){ 
                b.innerText="Lanjut WA"; 
                b.onclick=()=>{ window.open(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(`Order:\nInv: ${r.invoiceId}\n${fd}`)}`,'_blank'); closeModalDirect(); }; 
            } else { b.innerText="Tutup"; b.onclick=closeModalDirect; } 
        } else { showToast(r.msg, "error"); } 
    } catch(e){showToast("Error", "error");} 
    finally { btn.innerHTML='Bayar Sekarang'; btn.disabled=false; }
}

// ============================================
// 5. TOP UP (MANUAL ONLY)
// ============================================

async function submitTopUp(e) {
    e.preventDefault(); if(!userSession) return showToast("Login dulu!", "error");
    const btn=document.getElementById('btn-topup'); btn.innerHTML='Mengirim...'; btn.disabled=true;
    const reader=new FileReader(); reader.readAsDataURL(document.getElementById('topupProof').files[0]);
    reader.onload=async()=>{ 
        try{ 
            const res=await fetch('/api/topup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:userSession,amount:document.getElementById('topupAmount').value,proofImage:reader.result})}); 
            if(res.ok){ showToast("Terkirim! Tunggu admin cek.", "success"); switchView('landing'); } 
        }catch(e){} finally{ btn.innerHTML='Kirim Bukti Transfer'; btn.disabled=false; } 
    };
}

// ============================================


function selectOperator(el, opId, opName) {
    document.querySelectorAll('.operator-card').forEach(c => c.classList.remove('active-card'));
    el.classList.add('active-card');
    currentNokos.operatorId = opId;
    document.getElementById('step-checkout').classList.remove('hidden');
    document.getElementById('display-price').innerText = `Rp ${currentNokos.serverPrice.toLocaleString()}`;
    document.getElementById('display-info').innerText = opName;
    document.getElementById('display-server').innerText = `ID: ${currentNokos.providerId}`;
    document.getElementById('step-checkout').scrollIntoView({ behavior: 'smooth' });
}

async function executeBuyNokos() {
    if(!confirm(`Beli nomor ${currentNokos.serviceName}?\nPastikan saldo cukup.`)) return;
    const btn = document.getElementById('btn-buy-nokos');
    const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> PROSES...'; btn.disabled = true;
    try {
        const payload = { username: userSession, service_id: currentNokos.serviceId, service_name: currentNokos.serviceName, number_id: currentNokos.countryId, provider_id: currentNokos.providerId, operator_id: currentNokos.operatorId };
        const res = await fetch('/api/nokos/buy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
        const d = await res.json();
        if(d.success) { showToast("SUKSES! Menunggu SMS...", "success"); checkUserLogin(); fetchNokosHistory(); resetSteps(['step-checkout']); } 
        else { let msg = d.msg || "Gagal"; if(d.msg && d.msg.includes("Pusat:")) msg = "GAGAL DARI PUSAT: Saldo/Stok Habis."; showToast(msg, "error"); }
    } catch(e) { showToast("Koneksi Error.", "error"); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}

function resetSteps(ids) { ids.forEach(id => document.getElementById(id).classList.add('hidden')); }
function buyNokosAgain() { document.getElementById('view-nokos').scrollIntoView({ behavior: 'smooth' }); initNokos(); }
// ============================================
// 6. NOKOS SYSTEM (FIXED UI & ERROR MSG)
// ============================================

let nokosData = { apps: [], countries: [], selectedApp: null, tempServer: null };
let nokosInterval = null;

async function initNokos() {
    if(userSession) {
        document.getElementById('nokos-username').innerText = userSession;
        // Update saldo visual dari navbar
        const balText = document.getElementById('header-balance').innerText; 
        document.getElementById('nokos-balance-display').innerText = balText || "Rp 0";
    }
    fetchNokosHistory(); 
    clearInterval(nokosInterval);
    // Refresh otomatis setiap 10 detik tanpa popup error
    nokosInterval = setInterval(fetchNokosHistory, 10000);
}

// --- SHEET CONTROLS (FIXED ANIMATION) ---
function openNokosSheet() {
    const sheet = document.getElementById('nokos-sheet');
    const overlay = document.getElementById('nokos-sheet-overlay');
    
    // 1. Hapus class hidden & Paksa display flex dulu
    sheet.classList.remove('hidden');
    sheet.style.display = 'flex'; 
    
    overlay.classList.remove('hidden');
    overlay.style.display = 'block';
    
    // 2. Beri jeda 50ms agar browser "sadar" elemen sudah ada, baru slide naik
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        sheet.classList.remove('translate-y-full');
    }, 50); 
    
    loadNokosApps();
}

function closeNokosSheet() {
    const sheet = document.getElementById('nokos-sheet');
    const overlay = document.getElementById('nokos-sheet-overlay');
    
    // 1. Slide Turun Dulu
    sheet.classList.add('translate-y-full');
    overlay.classList.add('opacity-0');
    
    // 2. Tunggu animasi selesai (500ms) baru sembunyikan total
    setTimeout(() => {
        overlay.classList.add('hidden');
        sheet.classList.add('hidden');
        sheet.style.display = 'none'; // Pastikan hilang total
        
        backToApps();
        closeOperatorSheet();
    }, 500);
}

// --- LOAD APPS ---
async function loadNokosApps() {
    if(nokosData.apps.length > 0) return; // Pakai cache jika sudah ada
    
    // Tampilkan loading di grid populer
    const gridPop = document.getElementById('grid-popular-apps');
    gridPop.innerHTML = '<div class="col-span-full text-center py-4 text-gray-500"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>';
    
    try {
        const res = await fetch('/api/nokos/services');
        const data = await res.json();
        
        // Handle format data (adaptif jika struktur beda dikit)
        const apps = data.data || data; 
        if(Array.isArray(apps)) {
            nokosData.apps = apps;
            renderApps(nokosData.apps);
        } else {
            throw new Error("Format data salah");
        }
    } catch(e) { 
        console.error(e);
        gridPop.innerHTML = '<div class="text-xs text-red-500 col-span-full text-center">Gagal memuat aplikasi.</div>'; 
    }
}

function renderApps(apps) {
    const gridPop = document.getElementById('grid-popular-apps');
    const listAll = document.getElementById('list-all-apps');
    
    const iconMap = { 
        'WhatsApp': 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg', 
        'Telegram': 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg', 
        'Instagram': 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg', 
        'TikTok': 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uhtyvueh7nulogpoguhm/tiktok-icon2.png', 
        'Shopee': 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopee_logo.svg', 
        'Facebook': 'https://upload.wikimedia.org/wikipedia/commons/b/b8/2021_Facebook_icon.svg', 
        'Google': 'https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg', 
        'Gojek': 'https://upload.wikimedia.org/wikipedia/commons/8/86/Gojek_logo_2019.svg'
    };
    
    const popularKeys = ['WhatsApp', 'Telegram', 'Instagram', 'TikTok', 'Shopee', 'Facebook'];
    const popularApps = apps.filter(a => popularKeys.includes(a.service_name));
    
    // Render Grid Populer (6 Ikon Besar)
    gridPop.innerHTML = popularApps.map(a => `
        <div onclick="selectApp('${a.service_code}', '${a.service_name}', '${iconMap[a.service_name]}')" 
             class="bg-[#1c1c1f] border border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-purple-500 hover:bg-[#25252a] transition group h-28">
            <img src="${iconMap[a.service_name]}" class="w-10 h-10 object-contain group-hover:scale-110 transition">
            <span class="text-[10px] font-bold text-gray-300 uppercase tracking-wide group-hover:text-white">${a.service_name}</span>
        </div>
    `).join('');

    // Render List Semua
    listAll.innerHTML = apps.map(a => {
        const img = iconMap[a.service_name] || a.service_img || 'https://via.placeholder.com/30';
        return `
        <div onclick="selectApp('${a.service_code}', '${a.service_name}', '${img}')" 
             class="flex items-center gap-4 p-4 bg-[#1c1c1f] border border-gray-800 rounded-2xl hover:bg-[#25252a] cursor-pointer transition">
            <div class="w-10 h-10 rounded-xl bg-black/50 flex items-center justify-center p-1.5"><img src="${img}" class="w-full h-full object-contain"></div>
            <span class="text-sm font-bold text-gray-200">${a.service_name}</span>
            <i class="fa-solid fa-chevron-right ml-auto text-gray-600 text-xs"></i>
        </div>`;
    }).join('');
}

function filterApps() {
    const k = document.getElementById('searchAppInput').value.toLowerCase();
    const f = nokosData.apps.filter(a => a.service_name.toLowerCase().includes(k));
    renderApps(f);
    document.getElementById('section-popular-apps').style.display = k ? 'none' : 'block';
}

// --- SELECT COUNTRY ---
async function selectApp(id, name, icon) {
    nokosData.selectedApp = { id, name, icon };
    
    // Update Header
    document.getElementById('header-app-name').innerText = name;
    document.getElementById('header-app-icon').src = icon;
    
    // Slide Animation
    document.getElementById('sheet-view-apps').classList.add('-translate-x-full');
    document.getElementById('sheet-view-countries').classList.remove('translate-x-full');
    
    // Load Data
    const list = document.getElementById('list-countries');
    list.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-purple-500"></i> Memuat Data...</div>';
    
    try {
        const res = await fetch(`/api/nokos/countries?service_id=${id}`);
        const data = await res.json();
        
        if(data.success || data.status) { // Handle response format
            nokosData.countries = data.data;
            renderCountries(nokosData.countries);
        } else {
            list.innerHTML = '<div class="text-center text-gray-500 py-10">Gagal memuat negara.</div>';
        }
    } catch(e) { 
        list.innerHTML = '<div class="text-center text-red-500 py-10">Error koneksi.</div>';
    }
}

function backToApps() {
    document.getElementById('sheet-view-apps').classList.remove('-translate-x-full');
    document.getElementById('sheet-view-countries').classList.add('translate-x-full');
    document.getElementById('searchCountryInput').value = '';
}

function renderCountries(countries) {
    const list = document.getElementById('list-countries');
    if(!countries || countries.length === 0) { list.innerHTML = '<div class="text-center text-gray-500 py-10">Tidak ada data.</div>'; return; }
    
    list.innerHTML = countries.map(c => {
        // Ambil harga termurah untuk display
        const cheapest = c.pricelist && c.pricelist.length > 0 ? c.pricelist.sort((a,b) => a.price - b.price)[0] : null;
        const startPrice = cheapest ? cheapest.price_format : '-';
        
        return `
        <div class="border border-gray-800 rounded-2xl bg-[#1c1c1f] overflow-hidden transition-all duration-300 country-item">
            <div onclick="toggleCountryAccordion(this)" class="p-4 flex items-center justify-between cursor-pointer hover:bg-[#25252a]">
                <div class="flex items-center gap-3">
                    <img src="${c.img}" class="w-8 h-6 rounded object-cover shadow-sm">
                    <span class="text-sm font-bold text-white">${c.name}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right">
                        <div class="text-[10px] text-gray-500">Mulai</div>
                        <div class="text-xs font-bold text-gray-300">${startPrice}</div>
                    </div>
                    <i class="fa-solid fa-chevron-down text-gray-600 transition-transform duration-300 accordion-icon"></i>
                </div>
            </div>
            <div class="accordion-body hidden bg-[#141416] border-t border-gray-800 p-3 space-y-2">
                ${renderServerList(c.pricelist, c.number_id, c.name)}
            </div>
        </div>`;
    }).join('');
}

function toggleCountryAccordion(el) {
    const p = el.parentElement;
    const b = p.querySelector('.accordion-body');
    const i = p.querySelector('.accordion-icon');
    
    // Tutup yang lain (opsional)
    document.querySelectorAll('.accordion-body').forEach(box => { if(box!==b) box.classList.add('hidden'); });
    document.querySelectorAll('.accordion-icon').forEach(icon => { if(icon!==i) icon.classList.remove('rotate-180'); });
    
    b.classList.toggle('hidden');
    i.classList.toggle('rotate-180');
}

function renderServerList(servers, countryId, countryName) {
    if(!servers || servers.length === 0) return '<div class="text-center text-xs text-red-500">Stok habis.</div>';
    
    return servers.map(s => `
        <div class="flex justify-between items-center p-3 rounded-xl bg-[#1f1f23] border border-gray-800 hover:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="text-[10px] font-mono text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded">ID:${s.provider_id}</div>
                <div>
                    <div class="text-xs font-bold text-white">Server ${s.server_id || 'Fast'}</div>
                    <div class="text-[10px] text-gray-500">Stok: ${s.stock}</div>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-white">${s.price_format}</span>
                <button onclick="openOperatorSelection('${countryId}', '${countryName}', '${s.price}', '${s.provider_id}', '${s.server_id}')" 
                    class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-lg shadow-blue-900/30">
                    Order
                </button>
            </div>
        </div>
    `).join('');
}

function filterCountries() {
    const k = document.getElementById('searchCountryInput').value.toLowerCase();
    const f = nokosData.countries.filter(c => c.name.toLowerCase().includes(k));
    renderCountries(f);
}

// --- SELECT OPERATOR (FIXED VISIBILITY) ---
async function openOperatorSelection(countryId, countryName, price, providerId, serverName) {
    nokosData.tempServer = { countryId, countryName, price, providerId };
    
    document.getElementById('op-server-info').innerText = `${countryName} • Server ${serverName || 'X'} (ID: ${providerId})`;
    const sheetOp = document.getElementById('sheet-operator');
    const listOp = document.getElementById('list-operators');
    
    // [FIX UTAMA] Hapus class hidden & ubah display sebelum animasi
    sheetOp.classList.remove('hidden');
    sheetOp.style.display = 'block';
    
    requestAnimationFrame(() => {
        sheetOp.classList.remove('translate-y-full');
    });
    
    listOp.innerHTML = '<div class="text-xs text-gray-500 p-2">Memuat operator...</div>';
    
    try {
        const cNameEnc = encodeURIComponent(countryName);
        const res = await fetch(`/api/nokos/operators?country=${cNameEnc}&provider_id=${providerId}`);
        const data = await res.json();
        
        let ops = [];
        if(data.status || data.success) ops = data.data;
        
        // Selalu tampilkan ANY
        let html = `
        <div onclick="selectOperatorAndCheckout('any', 'Acak / Any')" 
             class="min-w-[80px] h-24 bg-[#25252a] border border-gray-700 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-green-500 hover:bg-[#2a2a30] transition snap-start flex-none">
            <div class="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center font-bold text-xs">?</div>
            <span class="text-[10px] font-bold text-white">ANY</span>
        </div>`;
        
        if(ops.length > 0) {
            html += ops.map(op => `
            <div onclick="selectOperatorAndCheckout('${op.id}', '${op.name}')" 
                 class="min-w-[80px] h-24 bg-[#25252a] border border-gray-700 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-green-500 hover:bg-[#2a2a30] transition snap-start relative overflow-hidden px-2 text-center flex-none">
                <img src="${op.image}" onerror="this.style.display='none'" class="w-6 h-6 object-contain">
                <span class="text-[9px] font-bold text-gray-300 leading-tight line-clamp-2">${op.name}</span>
            </div>`).join('');
        }
        
        listOp.innerHTML = html;
    } catch(e) { 
        listOp.innerHTML = '<div class="text-xs text-red-500">Gagal load operator.</div>'; 
    }
}

function closeOperatorSheet() {
    const sheetOp = document.getElementById('sheet-operator');
    sheetOp.classList.add('translate-y-full');
    
    // Sembunyikan total setelah animasi slide turun selesai
    setTimeout(() => { 
        sheetOp.style.display = 'none';
        sheetOp.classList.add('hidden');
    }, 300);
}

// --- CHECKOUT & ERROR MESSAGE FIX ---
async function selectOperatorAndCheckout(opId, opName) {
    if(!confirm(`Beli ${nokosData.selectedApp.name} (${nokosData.tempServer.countryName})?\nHarga: Rp ${parseInt(nokosData.tempServer.price).toLocaleString()}`)) return;
    
    closeOperatorSheet();
    closeNokosSheet();
    showToast("Memproses pesanan...", "info");
    
    try {
        const payload = {
            username: userSession,
            service_id: nokosData.selectedApp.id,
            service_name: nokosData.selectedApp.name,
            number_id: nokosData.tempServer.countryId,
            provider_id: nokosData.tempServer.providerId,
            operator_id: opId
        };
        
        const res = await fetch('/api/nokos/buy', { 
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
        });
        const d = await res.json();
        
        if(d.success) {
            showToast("✅ Order Berhasil!", "success");
            checkUserLogin();
            fetchNokosHistory();
        } else {
            // [FIX] PESAN ERROR CUSTOM
            showToast("Stok kosong atau gagal mengambil stok, silahkan tunggu beberapa saat.", "error");
        }
    } catch(e) { 
        showToast("Gagal terhubung ke server.", "error"); 
    }
}

// --- FETCH HISTORY (FIXED: FILTER EXPIRED) ---
async function fetchNokosHistory() {
    if(!userSession) return;
    const container = document.getElementById('nokos-active-container');
    
    try {
        const res = await fetch(`/api/nokos/history/${userSession}`);
        if(!res.ok) throw new Error("Gagal");
        const list = await res.json();
        
        // [FIX] Filter pesanan yang statusnya 'waiting' DAN waktunya BELUM habis
        const now = new Date();
        const activeList = list.filter(tx => {
            const exp = new Date(tx.expiresAt);
            return tx.status === 'waiting' && exp > now; // Hanya tampilkan jika belum expired
        });
        
        if(activeList.length === 0) { 
            container.innerHTML = '<div class="text-center py-12 border border-dashed border-gray-800 rounded-2xl bg-[#0a0a0a]"><p class="text-gray-600 text-xs italic">Tidak ada pesanan aktif.</p><button onclick="openNokosSheet()" class="mt-4 text-xs text-blue-500 font-bold border border-blue-500/30 px-4 py-2 rounded-lg hover:bg-blue-500/10">+ Buat Pesanan</button></div>'; 
            return; 
        }
        
        // Render Active List
        container.innerHTML = activeList.map(tx => {
            // Panggil cek status ke backend untuk tiap item (silent check)
            // Agar jika expired di backend, saldo user direfund
            fetch(`/api/nokos/status/${tx.invoiceId}`); 

            const exp = new Date(tx.expiresAt);
            const timeLeft = Math.floor((exp - now) / 1000);
            
            // Format menit:detik
            let timeDisplay = timeLeft > 0 ? 
                `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}` : 
                '00:00';
            
            let smsSection = tx.smsCode ? 
                `<div class="flex flex-col"><span class="text-[10px] text-gray-400">Kode OTP:</span><span class="text-2xl font-mono font-bold text-green-400 tracking-[0.2em] select-all cursor-pointer bg-green-900/20 px-2 rounded">${tx.smsCode}</span></div>` : 
                `<div class="flex items-center gap-2 text-yellow-500 animate-pulse"><i class="fa-regular fa-envelope"></i><span class="text-xs font-bold">menunggu sms...</span></div>`;
            
            let footerBtn = tx.smsCode ? 
                `<button onclick="nokosAction('${tx.invoiceId}', 'done')" class="flex-1 py-2 rounded-lg border border-green-500 text-green-500 text-xs font-bold hover:bg-green-500/10"><i class="fa-solid fa-check mr-1"></i> Selesai</button>` :
                `<button onclick="nokosAction('${tx.invoiceId}', 'resend')" class="flex-1 py-2 rounded-lg border border-blue-500/50 text-blue-400 text-xs font-bold hover:bg-blue-500/10"><i class="fa-solid fa-rotate-right mr-1"></i> Resend</button>
                 <button onclick="nokosAction('${tx.invoiceId}', 'cancel')" class="flex-1 py-2 rounded-lg border border-red-500/50 text-red-500 text-xs font-bold hover:bg-red-500/10"><i class="fa-solid fa-xmark mr-1"></i> Batal</button>`;

            return `
            <div class="bg-[#1a1a1d] border border-gray-800 rounded-2xl p-4 relative overflow-hidden">
                <div class="flex justify-between items-start mb-3 border-b border-gray-800 pb-3">
                    <div class="flex items-center gap-2"><span class="font-mono text-lg text-white font-bold tracking-wide select-all">${tx.phoneNumber}</span></div>
                    <div class="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-xs font-mono font-bold flex items-center gap-1"><i class="fa-regular fa-clock"></i> ${timeDisplay}</div>
                </div>
                <div class="flex justify-between items-center mb-4">
                    <div><div class="text-white font-bold text-sm">${tx.serviceName}</div><div class="text-[10px] text-gray-400">${tx.country}</div></div>
                    <div class="text-right">${smsSection}</div>
                </div>
                <div class="flex gap-2">${footerBtn}</div>
            </div>`;
        }).join('');
        
    } catch(e) {
        // Silent error
    }
}
// ============================================
// 7. ACTION BUTTONS (RESEND/CANCEL/DONE)
// ============================================

async function nokosAction(invId, actionType) {
    let msg = "Proses...";
    
    // Konfirmasi User
    if(actionType === 'cancel') { 
        if(!confirm("Yakin batalkan nomor ini? Saldo akan direfund.")) return; 
        msg = "Membatalkan..."; 
    }
    if(actionType === 'done') { 
        if(!confirm("Sudah dapat SMS? Selesaikan pesanan ini?")) return; 
        msg = "Menyelesaikan..."; 
    }
    if(actionType === 'resend') { 
        msg = "Meminta SMS ulang..."; 
    }

    showToast(msg, "info");

    try {
        const res = await fetch('/api/nokos/action', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ 
                invoiceId: invId, 
                username: userSession, 
                action: actionType 
            }) 
        });
        
        const d = await res.json();
        
        if(d.success) { 
            showToast("✅ " + d.msg, "success"); 
            fetchNokosHistory(); // Refresh list setelah aksi
            
            // Jika cancel, refresh saldo juga
            if(actionType === 'cancel') checkUserLogin(); 
        } else { 
            showToast("❌ " + d.msg, "error"); 
        }
    } catch(e) { 
        showToast("Gagal terhubung.", "error"); 
    }
}

// ============================================
// 8. HISTORY & SERVICES
// ============================================

async function fetchHistory() {
    if(!userSession) return;
    const list = document.getElementById('history-list'); list.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500 text-xs"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading...</td></tr>';
    try {
        const [resGen, resNok] = await Promise.all([fetch(`/api/history/${userSession}`), fetch(`/api/nokos/history/${userSession}`)]);
        const dataGen = await resGen.json(); const dataNok = await resNok.json();
        const finishedNokos = dataNok.filter(tx => tx.status !== 'waiting').map(tx => ({ date: tx.createdAt, desc: `Nokos ${tx.serviceName} (${tx.phoneNumber})`, amount: tx.price, type: 'OUT', status: tx.status === 'success' ? 'success' : 'canceled' }));
        const combined = [...dataGen, ...finishedNokos].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
        if (combined.length === 0) { list.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-500 italic text-xs">Belum ada riwayat.</td></tr>'; return; }
        list.innerHTML = combined.map(item => {
            const d = new Date(item.date); const dateStr = `${d.getDate()}/${d.getMonth()+1} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            const isTopup = item.type === 'IN'; const colorClass = isTopup ? 'text-green-400' : 'text-red-400'; const symbol = isTopup ? '+' : '-';
            let badge = ''; if(item.status === 'success') badge = '<span class="text-[10px] font-bold text-green-500 bg-green-900/20 px-2 py-1 rounded">SUKSES</span>'; else if(item.status === 'canceled') badge = '<span class="text-[10px] font-bold text-red-400 bg-red-900/20 px-2 py-1 rounded">REFUND</span>'; else badge = '<span class="text-[10px] font-bold text-yellow-500 bg-yellow-900/20 px-2 py-1 rounded">PROSES</span>';
            return `<tr class="hover:bg-white/5 transition border-b border-gray-800/50"><td class="p-3 text-gray-500 font-mono text-xs whitespace-nowrap">${dateStr}</td><td class="p-3"><div class="font-medium text-white text-xs">${item.desc}</div><div class="md:hidden text-[10px] text-gray-600">${isTopup ? 'Deposit' : 'Pembelian'}</div></td><td class="p-3 text-right font-mono font-bold text-xs ${colorClass}">${symbol}Rp ${item.amount.toLocaleString()}</td><td class="p-3 text-center">${badge}</td></tr>`;
        }).join('');
    } catch (err) { list.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-red-500 text-xs">Gagal.</td></tr>'; }
}

async function fetchMyServices() {
    if(!userSession) return;
    const c=document.getElementById('myservices-list'); c.innerHTML='<div class="col-span-full text-center">Loading...</div>';
    try { const res=await fetch(`/api/services/${userSession}`); const s=await res.json();
        if(s.length===0) { c.innerHTML=`<div class="col-span-full text-center py-10 glass-card rounded-xl"><p class="text-gray-400">Belum ada layanan.</p></div>`; return; }
        c.innerHTML=s.map(i=>{ const exp=new Date(i.expiredDate); const diff=Math.ceil((exp-new Date())/(1000*60*60*24)); let st='ACTIVE', cl='text-green-400'; if(diff<=0){st='EXPIRED';cl='text-red-500';} else if(diff<=3){st=`EXP ${diff} HARI`;cl='text-yellow-400';} return `<div class="glass-card p-6 rounded-xl border border-white/10 relative group hover:bg-white/5 transition"><div class="flex justify-between items-start mb-4"><div><h3 class="text-lg font-bold text-white">${i.productName}</h3><p class="text-xs text-gray-400 font-mono mt-1">ID: ${i._id.substr(-6)}</p></div><span class="text-xs font-bold px-2 py-1 rounded bg-black/50 ${cl} border border-white/10">● ${st}</span></div><div class="space-y-3 mb-6"><div class="flex justify-between text-sm"><span class="text-gray-500">Target</span><span class="text-white font-mono">${i.targetNumber}</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">IP</span><span class="text-blue-400 font-mono">${i.serverIp}</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">Expired</span><span class="text-white font-mono">${exp.toLocaleDateString()}</span></div></div><a href="https://wa.me/${ADMIN_WA}?text=Perpanjang%20${i.productName}" target="_blank" class="block w-full py-2 text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition">Perpanjang</a></div>`; }).join('');
    } catch(e){}
}

async function updateServerStats() {
    try {
        const res = await fetch('/api/system/status');
        const data = await res.json();
        const vpsEl = document.getElementById('runtime-vps'); const statusBadge = document.getElementById('status-badge'); const botEl = document.getElementById('runtime-bot');
        if (data.vpsActive && vpsEl) {
            const start = new Date(data.vpsStartTime).getTime(); const diff = new Date().getTime() - start;
            const days = Math.floor(diff/(1000*60*60*24)); const hours = Math.floor((diff%(1000*60*60*24))/(1000*60*60));
            vpsEl.innerText = `${days}d ${hours}h`; statusBadge.innerText = "ONLINE"; statusBadge.className = "text-green-400 text-[10px] bg-green-900/50 px-2 py-1 rounded border border-green-500 font-bold";
            const cpuBar = document.getElementById('bar-cpu'), cpuTxt = document.getElementById('text-cpu');
            if(cpuBar) { const r = Math.floor(Math.random()*30)+10; cpuBar.style.width = r+"%"; cpuTxt.innerText = r+"%"; }
        }
        if (data.botActive && botEl) {
            const start = new Date(data.botStartTime).getTime(); const diff = new Date().getTime() - start;
            const days = Math.floor(diff/(1000*60*60*24)); const hours = Math.floor((diff%(1000*60*60*24))/(1000*60*60));
            botEl.innerHTML = `<span class="text-blue-400">${days}d ${hours}h</span>`;
        }
    } catch(e) {}
}

async function submitReview(e) { e.preventDefault(); if(!userSession) return showToast("Login dulu.", "error"); const btn=document.getElementById('btn-submit-review'); btn.innerHTML='Mengirim...'; btn.disabled=true; try { const res=await fetch('/api/testimonials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:userSession,rating:parseInt(document.getElementById('ratingValue').value),comment:document.getElementById('reviewComment').value})}); if((await res.json()).success){showToast("Ulasan terkirim!", "success"); document.getElementById('reviewComment').value=''; setRating(5); fetchTestimonials();} else showToast("Gagal.", "error"); } catch(e){} finally{ btn.innerHTML='Kirim Ulasan'; btn.disabled=false; } }
function setRating(n) { document.getElementById('ratingValue').value = n; document.getElementById('rating-text').innerText = n + ".0"; for (let i = 1; i <= 5; i++) { const s=document.getElementById(`star-${i}`); if(i<=n){s.classList.remove('text-gray-600');s.classList.add('text-yellow-500');}else{s.classList.remove('text-yellow-500');s.classList.add('text-gray-600');} } }
async function fetchTestimonials() { try { const d = await (await fetch('/api/testimonials')).json(); const g=document.getElementById('testimonial-grid'); if(d.length===0){g.innerHTML='<div class="w-full text-center text-gray-500 italic py-10">Belum ada ulasan.</div>';return;} g.innerHTML=d.map(x=>`<div class="glass-card p-5 rounded-xl w-[85vw] md:w-[320px] flex-none snap-center border-l-2 border-l-purple-500"><div class="flex justify-between mb-2"><h4 class="font-bold text-white text-sm">${x.username}</h4><span class="text-yellow-500 text-xs">★ ${x.rating}.0</span></div><p class="text-gray-300 text-sm italic">"${x.comment}"</p></div>`).join(''); } catch(e){} }

// ============================================
// 10. CUSTOMER SERVICE WIDGET
// ============================================

function toggleCS() {
    const menu = document.getElementById('cs-menu');
    
    if (menu.classList.contains('hidden')) {
        // Buka Menu (Animasi Pop Up)
        menu.classList.remove('hidden');
        // Jeda dikit biar animasi scale jalan
        setTimeout(() => menu.classList.remove('scale-0'), 10);
    } else {
        // Tutup Menu
        menu.classList.add('scale-0');
        setTimeout(() => menu.classList.add('hidden'), 300);
    }
}

function contactWA(topic) {
    const adminNumber = "6287756632352"; // Nomor Kamu
    const currentUser = userSession || "Guest/Tamu";
    
    // Template Pesan Rapi
    const text = `Halo Admin Manzzy ID 👋\nSaya butuh bantuan.\n\n👤 *Username:* ${currentUser}\n📝 *Kendala:* ${topic}\n\nMohon dibantu pengecekannya. Terima kasih!`;
    
    // Redirect ke WA
    window.open(`https://wa.me/${adminNumber}?text=${encodeURIComponent(text)}`, '_blank');
    
    // Tutup menu setelah klik
    toggleCS();
}

// Tutup menu CS kalau klik di luar area
document.addEventListener('click', function(e) {
    const menu = document.getElementById('cs-menu');
    const btn = document.querySelector('button[onclick="toggleCS()"]');
    
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
        toggleCS();
    }
});
// ============================================
// 9. LIVE SOCIAL PROOF (NOTIFIKASI PALSU)
// ============================================

const fakeNames = ["Rizky", "Dimas", "Bayu", "Sultan_Indo", "Anonim", "Dika", "Fajar", "Admin", "User123", "GamerID", "Putri", "ManzzyFan"];
const fakeProducts = [{ name: "Nokos WhatsApp", type: "buy" }, { name: "Nokos Telegram", type: "buy" }, { name: "Nokos Shopee", type: "buy" }, { name: "Top Up Rp 20.000", type: "topup" }, { name: "Top Up Rp 50.000", type: "topup" }, { name: "VPS Murah", type: "buy" }, { name: "Panel Pterodactyl", type: "buy" }];

function showLiveNotification() {
    // Inject HTML jika belum ada
    if(!document.getElementById('live-notification')) {
        const div = document.createElement('div');
        div.id = 'live-notification';
        div.className = "fixed bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none transition-all duration-500 transform translate-y-20 opacity-0";
        div.innerHTML = `<div class="glass-card p-3 rounded-xl border-l-4 border-l-green-500 flex items-center gap-3 w-72 shadow-2xl bg-black/80 backdrop-blur-md"><div class="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400"><i id="notif-icon" class="fa-solid fa-cart-shopping"></i></div><div><h4 id="notif-title" class="text-xs font-bold text-white mb-0.5">Pembelian Baru</h4><p id="notif-desc" class="text-[10px] text-gray-300">Rizky membeli WhatsApp ID</p><p class="text-[9px] text-gray-500 mt-0.5">Baru saja</p></div></div>`;
        document.body.appendChild(div);
    }

    const container = document.getElementById('live-notification');
    const titleEl = document.getElementById('notif-title');
    const descEl = document.getElementById('notif-desc');
    const iconEl = document.getElementById('notif-icon');
    const cardEl = container.querySelector('.glass-card');

    const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    const prod = fakeProducts[Math.floor(Math.random() * fakeProducts.length)];

    if (prod.type === 'topup') {
        titleEl.innerText = "Deposit Berhasil"; descEl.innerText = `${name} baru saja deposit saldo.`; iconEl.className = "fa-solid fa-wallet";
        cardEl.className = "glass-card p-3 rounded-xl border-l-4 border-l-green-500 flex items-center gap-3 w-72 shadow-2xl bg-black/80 backdrop-blur-md";
        iconEl.parentElement.className = "w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400";
    } else {
        titleEl.innerText = "Pembelian Sukses"; descEl.innerText = `${name} membeli ${prod.name}.`; iconEl.className = "fa-solid fa-cart-shopping";
        cardEl.className = "glass-card p-3 rounded-xl border-l-4 border-l-purple-500 flex items-center gap-3 w-72 shadow-2xl bg-black/80 backdrop-blur-md";
        iconEl.parentElement.className = "w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400";
    }

    container.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => { container.classList.add('translate-y-20', 'opacity-0'); }, 4000);
}

function startLiveNotif() {
    setTimeout(() => { showLiveNotification(); setInterval(() => { showLiveNotification(); }, Math.floor(Math.random() * (15000 - 8000 + 1) + 8000)); }, 5000);
}

initData();