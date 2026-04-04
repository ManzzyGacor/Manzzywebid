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
    startLiveNotif(); 
    setInterval(updateServerStats, 5000);
}



// ==============================
// 2. AUTHENTICATION
// ===============================

const userSession = localStorage.getItem('user_session');
let userBalance = 0;
const ADMIN_WA = "6285815196595";

async function checkUserLogin() {
    // Ambil session terbaru di dalam fungsi
    const currentUser = localStorage.getItem('user_session');

    // 1. JIKA GUEST
    if (!currentUser) {
        if(document.getElementById('login-btn')) document.getElementById('login-btn').style.display = 'block';
        if(document.getElementById('register-btn')) document.getElementById('register-btn').style.display = 'block';
        
        const profile = document.getElementById('user-profile');
        if(profile) { profile.classList.add('hidden'); profile.classList.remove('flex'); }
        
        const cta = document.getElementById('cta-banner');
        if(cta) cta.style.display = 'block';
        return;
    }

    // 2. JIKA LOGIN
    try {
        const res = await fetch(`/api/user/${currentUser}`);
        const data = await res.json();
        
        if (data.success) {
            const formatted = `Rp ${data.balance.toLocaleString()}`;
            
            // Update Profile Box di Navbar (ID: user-profile)
            const profile = document.getElementById('user-profile');
            if(profile) {
                profile.classList.remove('hidden');
                profile.classList.add('flex');
                // Cari span di dalam profile untuk nama
                const nameDisplay = profile.querySelector('span.font-bold');
                if(nameDisplay) nameDisplay.innerText = data.username;
            }

            // Update Saldo (Pastikan ada ID ini di HTML)
            const balanceDisplay = document.getElementById('user-balance-display');
            if(balanceDisplay) balanceDisplay.innerText = formatted;

            // Sembunyikan Tombol Login
            if(document.getElementById('login-btn')) document.getElementById('login-btn').style.display = 'none';
            if(document.getElementById('register-btn')) document.getElementById('register-btn').style.display = 'none';
            
            // Munculkan Menu Member
            const menus = ['menu-topup', 'menu-myservices', 'menu-history', 'menu-nokos', 'review-form-container'];
            menus.forEach(id => document.getElementById(id)?.classList.remove('hidden'));

            // Sembunyikan CTA
            const cta = document.getElementById('cta-banner');
            if(cta) cta.style.display = 'none';
        }
    } catch (e) { console.error("Session Error", e); }
}

// Fungsi Logout global
window.logout = function() {
    localStorage.removeItem('user_session');
    location.reload();
};
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

// ==================================
// ============================================
// NEW NOKOS SYSTEM V3 - STABLE & MODERN
// ============================================

let nokosData = { apps: [], countries: [], selectedApp: {}, tempServer: {} };
let isTransactionProcessing = false;

// 1. Inisialisasi awal
async function initNokos() {
    if(userSession) {
        checkUserLogin(); // Sync saldo terbaru
    }
    fetchNokosHistory(); 
    // Polling history setiap 10 detik
    setInterval(fetchNokosHistory, 10000);
}

// 2. Pilih Aplikasi (Animasi Slide & Header Baru)
async function selectApp(id, name, icon) {
    nokosData.selectedApp = { id, name, icon };
    
    // UI Update
    const headerName = document.getElementById('header-app-name');
    const headerIcon = document.getElementById('header-app-icon');
    if(headerName) headerName.innerText = name;
    if(headerIcon) headerIcon.src = icon;
    
    // Switch View
    document.getElementById('sheet-view-apps').classList.add('-translate-x-full');
    document.getElementById('sheet-view-countries').classList.remove('translate-x-full');
    
    const list = document.getElementById('list-countries');
    list.innerHTML = `
        <div class="flex flex-col items-center py-10">
            <div class="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
            <p class="text-[10px] text-gray-500 mt-4 uppercase tracking-widest">Mencari Stok Negara...</p>
        </div>`;
    
    try {
        const res = await fetch(`/api/nokos/countries?service_id=${id}`);
        const data = await res.json();
        if(data.success && data.data) { 
            nokosData.countries = data.data;
            renderCountriesNew(data.data);
        } else {
            list.innerHTML = '<div class="text-center text-gray-500 py-10 text-xs">Stok aplikasi ini sedang habis.</div>';
        }
    } catch(e) { list.innerHTML = '<div class="text-center text-red-500 py-10 text-xs">Koneksi Bermasalah.</div>'; }
}

// 3. Render Negara dengan Tampilan Modern
function renderCountriesNew(countries) {
    const list = document.getElementById('list-countries');
    list.innerHTML = countries.map(c => {
        const cheapest = c.pricelist && c.pricelist.length > 0 ? c.pricelist.sort((a,b) => a.price - b.price)[0] : null;
        const startPrice = cheapest ? cheapest.price_format : '-';
        
        return `
        <div class="group border border-gray-800/50 rounded-2xl bg-[#131316] mb-3 transition-all hover:border-purple-500/50">
            <div onclick="toggleCountryAccordion(this)" class="p-4 flex items-center justify-between cursor-pointer">
                <div class="flex items-center gap-4">
                    <div class="relative">
                        <img src="${c.img}" class="w-8 h-6 rounded-md object-cover">
                        <div class="absolute -inset-1 bg-white/5 rounded-md blur-sm"></div>
                    </div>
                    <span class="text-sm font-bold text-gray-200">${c.name}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-[11px] font-mono font-bold text-purple-400">${startPrice}</span>
                    <i class="fa-solid fa-chevron-down text-gray-600 transition-transform duration-300 accordion-icon"></i>
                </div>
            </div>
            <div class="accordion-body hidden bg-black/20 border-t border-gray-800/30 p-3 space-y-2">
                ${renderServerListNew(c.pricelist, c.number_id, c.name)}
            </div>
        </div>`;
    }).join('');
}

// 4. Render Server List (Tombol Order Clean)
function renderServerListNew(servers, countryId, countryName) {
    if(!servers || servers.length === 0) return '<div class="text-center text-[10px] text-red-500 py-2">Tidak ada server.</div>';
    return servers.map(s => `
        <div class="flex justify-between items-center p-3 rounded-xl bg-[#1c1c1f] border border-gray-800/50">
            <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-white">Server ${s.server_id || 'Fast'}</span>
                <span class="text-[9px] text-gray-500 font-mono tracking-tighter">ID:${s.provider_id} • STOK:${s.stock}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-xs font-mono font-bold text-gray-400">${s.price_format}</span>
                <button onclick="openOperatorFinal('${countryId}', '${countryName}', ${s.price}, ${s.provider_id}, '${s.server_id || 'Fast'}')" 
                    class="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition active:scale-95 shadow-lg shadow-purple-900/20">
                    ORDER
                </button>
            </div>
        </div>`).join('');
}

// 5. Operator Selection & Checkout Final
async function openOperatorFinal(cId, cName, price, pId, sName) {
    // LOCK DATA: Agar tidak tercecer/undefined
    nokosData.tempServer = { 
        number_id: cId, 
        country_name: cName, 
        price: Number(price), 
        provider_id: pId 
    };

    const sheetOp = document.getElementById('sheet-operator');
    const listOp = document.getElementById('list-operators');
    const infoOp = document.getElementById('op-server-info');

    if(infoOp) infoOp.innerText = `${cName} • ${sName}`;
    
    sheetOp.classList.remove('hidden');
    sheetOp.style.display = 'block';
    listOp.innerHTML = '<div class="col-span-full py-6 text-center animate-pulse text-[10px] text-gray-500">MENGAMBIL PROVIDER...</div>';

    try {
        const res = await fetch(`/api/nokos/operators?country=${encodeURIComponent(cName)}&provider_id=${pId}`);
        const data = await res.json();
        
        let html = `
        <div onclick="processOrder('any')" class="min-w-[80px] h-20 bg-[#1c1c1f] border border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-500 transition flex-none">
            <div class="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center text-xs font-black">?</div>
            <span class="text-[9px] font-bold text-gray-400">ANY</span>
        </div>`;

        if(data.success && data.data) {
            html += data.data.map(op => `
                <div onclick="processOrder('${op.id}')" class="min-w-[80px] h-20 bg-[#1c1c1f] border border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-500 transition flex-none px-2 text-center">
                    <img src="${op.image}" onerror="this.style.display='none'" class="w-7 h-7 object-contain">
                    <span class="text-[8px] font-bold text-gray-300 leading-tight">${op.name}</span>
                </div>`).join('');
        }
        listOp.innerHTML = html;
    } catch(e) { listOp.innerHTML = 'Gagal.'; }
}

// 6. Eksekusi Pembelian
async function processOrder(opId) {
    if (isTransactionProcessing) return;

    const data = nokosData.tempServer;
    const app = nokosData.selectedApp;

    if (!data.country_name || data.price <= 0) return alert("Sesi kadaluarsa.");

    if(!confirm(`Konfirmasi: ${app.name} (${data.country_name})\nBiaya: Rp ${data.price.toLocaleString()}`)) return;

    isTransactionProcessing = true;
    closeOperatorSheet();
    showToast("Memproses nomor...", "info");

    try {
        const payload = {
            username: localStorage.getItem('user_session'),
            service_name: app.name,
            number_id: data.number_id,
            provider_id: data.provider_id,
            operator_id: opId,
            country_name: data.country_name,
            user_price: data.price
        };

        const res = await fetch('/api/nokos/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const d = await res.json();
        if (d.success) {
            showToast("✅ Berhasil!", "success");
            checkUserLogin(); // Update Saldo
            fetchNokosHistory();
            // Tutup Sheet
            const nks = document.getElementById('sheet-nokos');
            if(nks) { nks.classList.add('translate-y-full'); setTimeout(() => nks.classList.add('hidden'), 300); }
        } else {
            showToast(d.msg || "Gagal.", "error");
        }
    } catch (e) { showToast("Error koneksi.", "error"); }
    finally { setTimeout(() => { isTransactionProcessing = false; }, 3000); }
}

// ============================================
// 7. HISTORY & SERVICES
// =========================================
let globalHistoryData = [];

async function fetchHistory() {
    if(!userSession) return;
    const list = document.getElementById('history-list'); 
    list.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500 text-xs"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading...</td></tr>';
    
    try {
        const [resGen, resNok] = await Promise.all([
            fetch(`/api/history/${userSession}`), 
            fetch(`/api/nokos/history/${userSession}`)
        ]);
        
        const dataGen = await resGen.json(); // Produk Manual & TopUp
        const dataNok = await resNok.json(); // Nokos
        
        // Format Data Nokos agar seragam
        const formattedNokos = dataNok.map(tx => ({
            raw: tx, // Simpan data asli untuk modal
            date: tx.createdAt,
            invoiceId: tx.invoiceId,
            desc: `Nokos ${tx.serviceName} (${tx.country})`,
            detail: tx.phoneNumber + (tx.smsCode ? ` | OTP: ${tx.smsCode}` : ''),
            amount: tx.price,
            type: 'OUT',
            status: tx.status === 'success' ? 'success' : (tx.status === 'canceled' ? 'canceled' : 'pending'),
            category: 'NOKOS'
        }));

        // Format Data General
        const formattedGen = dataGen.map(tx => ({
            raw: tx,
            date: tx.date,
            invoiceId: tx.invoiceId || 'INV-???', // Pastikan backend kirim invoiceId
            desc: tx.desc,
            detail: tx.desc === 'Deposit' ? 'Top Up Saldo via QRIS' : (tx.formData || '-'),
            amount: tx.amount,
            type: tx.type,
            status: tx.status,
            category: tx.type === 'IN' ? 'TOPUP' : 'PRODUCT'
        }));

        // Gabung & Sortir
        globalHistoryData = [...formattedGen, ...formattedNokos].sort((a, b) => new Date(b.date) - new Date(a.date));

        if (globalHistoryData.length === 0) { 
            list.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-500 italic text-xs">Belum ada riwayat.</td></tr>'; 
            return; 
        }

        // Render Table
        list.innerHTML = globalHistoryData.slice(0, 20).map((item, index) => {
            const d = new Date(item.date); 
            const dateStr = `${d.getDate()}/${d.getMonth()+1} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            const isTopup = item.type === 'IN'; 
            const colorClass = isTopup ? 'text-green-400' : 'text-red-400'; 
            const symbol = isTopup ? '+' : '-';
            
            let badgeColor = item.status === 'success' ? 'text-green-500 bg-green-900/20' : 
                             item.status === 'canceled' ? 'text-red-400 bg-red-900/20' : 
                             'text-yellow-500 bg-yellow-900/20';

            return `
            <tr onclick="openInvoiceModal(${index})" class="hover:bg-white/5 transition border-b border-gray-800/50 cursor-pointer group">
                <td class="p-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                    ${dateStr}
                    <div class="text-[9px] text-purple-500 group-hover:text-purple-300">#${(item.invoiceId||'').substr(-6)}</div>
                </td>
                <td class="p-3">
                    <div class="font-medium text-white text-xs">${item.desc}</div>
                    <div class="md:hidden text-[10px] text-gray-600">${item.detail.substring(0,20)}...</div>
                </td>
                <td class="p-3 text-right font-mono font-bold text-xs ${colorClass}">${symbol}Rp ${item.amount.toLocaleString()}</td>
                <td class="p-3 text-center">
                    <span class="text-[10px] font-bold px-2 py-1 rounded ${badgeColor}">${item.status.toUpperCase()}</span>
                </td>
            </tr>`;
        }).join('');

    } catch (err) { 
        console.error(err);
        list.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-red-500 text-xs">Gagal memuat riwayat.</td></tr>'; 
    }
}

// --- FUNGSI MODAL INVOICE ---
function openInvoiceModal(index) {
    const data = globalHistoryData[index];
    if(!data) return;

    const modal = document.getElementById('modal-invoice');
    
    // Set Data
    document.getElementById('inv-id').innerText = data.invoiceId || 'UNKNOWN';
    document.getElementById('inv-date').innerText = new Date(data.date).toLocaleString();
    document.getElementById('inv-product').innerText = data.desc;
    document.getElementById('inv-desc').innerText = data.category === 'TOPUP' ? 'Deposit Saldo Otomatis' : data.detail;
    document.getElementById('inv-price').innerText = `Rp ${data.amount.toLocaleString()}`;
    
    // Status Badge
    const stEl = document.getElementById('inv-status');
    stEl.innerText = data.status.toUpperCase();
    stEl.className = `text-xs font-mono font-bold mt-2 inline-block px-3 py-1 rounded-full relative z-10 text-white ${
        data.status === 'success' ? 'bg-green-600' : data.status === 'canceled' ? 'bg-red-600' : 'bg-yellow-600'
    }`;

    // Menampilkan Data Penting (OTP / SN / Token)
    const dataBox = document.getElementById('inv-data-box');
    const dataText = document.getElementById('inv-data-text');
    
    // Logic Data Khusus
    if (data.category === 'NOKOS' && data.raw.smsCode) {
        dataBox.classList.remove('hidden');
        dataText.innerText = `OTP: ${data.raw.smsCode}`;
    } else if (data.category === 'PRODUCT' && data.status === 'success') {
        // Cek apakah ada data SN/Akun di deskripsi (biasanya backend simpan di formData atau note)
        // Disini kita tampilkan detail user input / balasan admin
        dataBox.classList.remove('hidden');
        dataText.innerText = data.detail || '-';
    } else {
        dataBox.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeInvoice() {
    const modal = document.getElementById('modal-invoice');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function copyInvoiceData() {
    const text = document.getElementById('inv-data-text').innerText;
    navigator.clipboard.writeText(text).then(() => showToast("Data disalin!", "success"));
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
// 8. CUSTOMER SERVICE WIDGET
// ============================================

function toggleCS() {
    const menu = document.getElementById('cs-menu');
    
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        setTimeout(() => menu.classList.remove('scale-0'), 10);
    } else {
        menu.classList.add('scale-0');
        setTimeout(() => menu.classList.add('hidden'), 300);
    }
}

function contactWA(topic) {
    const currentUser = userSession || "Guest/Tamu";
    const text = `Halo Admin Manzzy ID 👋\nSaya butuh bantuan.\n\n👤 *Username:* ${currentUser}\n📝 *Kendala:* ${topic}\n\nMohon dibantu pengecekannya. Terima kasih!`;
    window.open(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(text)}`, '_blank');
    toggleCS();
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('cs-menu');
    const btn = document.querySelector('button[onclick="toggleCS()"]');
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
        toggleCS();
    }
});
// ============================================
// 9. LIVE SOCIAL PROOF (REAL DATA DARI DATABASE)
// ============================================

let liveQueue = [];     // Penampung data dari server
let queueIndex = 0;     // Penunjuk giliran data

// 1. Ambil Data Real dari Server Backend
async function fetchRealActivities() {
    try {
        const res = await fetch('/api/public/recent-activities');
        const data = await res.json();
        
        if (data && data.length > 0) {
            liveQueue = data;
            // Reset index jika data berubah drastis
            if (queueIndex >= liveQueue.length) queueIndex = 0;
        }
    } catch (e) {
        console.log("Menunggu data live...");
    }
}

// 2. Tampilkan Notifikasi (Satu per satu)
function showLiveNotification() {
    // Kalau belum ada data transaksi, jangan muncul dulu
    if (liveQueue.length === 0) return;

    // Ambil data antrian
    const item = liveQueue[queueIndex];
    
    // Buat elemen HTML jika belum ada
    if(!document.getElementById('live-notification')) {
        const div = document.createElement('div');
        div.id = 'live-notification';
        div.className = "fixed bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none transition-all duration-500 transform translate-y-20 opacity-0";
        div.innerHTML = `
            <div class="glass-card p-3 rounded-xl border-l-4 flex items-center gap-3 w-72 shadow-2xl bg-black/90 backdrop-blur-md border-white/10">
                <div id="notif-icon-bg" class="w-10 h-10 rounded-full flex items-center justify-center shrink-0">
                    <i id="notif-icon"></i>
                </div>
                <div>
                    <h4 id="notif-title" class="text-xs font-bold text-white mb-0.5">Title</h4>
                    <p id="notif-desc" class="text-[10px] text-gray-300 leading-tight line-clamp-2">Desc</p>
                    <p id="notif-time" class="text-[9px] text-gray-500 mt-1 font-mono">Baru saja</p>
                </div>
            </div>`;
        document.body.appendChild(div);
    }

    const container = document.getElementById('live-notification');
    const cardEl = container.querySelector('.glass-card');
    const iconBg = document.getElementById('notif-icon-bg');
    const iconEl = document.getElementById('notif-icon');
    
    // Isi Konten dengan Data Asli
    document.getElementById('notif-desc').innerText = `${item.user} • ${item.desc}`;
    document.getElementById('notif-time').innerText = timeAgo(item.time);

    // Ganti Style Sesuai Tipe (Beli / Topup)
    if (item.type === 'topup') {
        document.getElementById('notif-title').innerText = "Deposit Masuk";
        cardEl.className = "glass-card p-3 rounded-xl border-l-4 border-l-green-500 flex items-center gap-3 w-72 shadow-2xl bg-black/90 backdrop-blur-md border-white/10";
        iconBg.className = "w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 shrink-0";
        iconEl.className = "fa-solid fa-wallet";
    } else {
        document.getElementById('notif-title').innerText = "Pembelian Sukses";
        cardEl.className = "glass-card p-3 rounded-xl border-l-4 border-l-purple-500 flex items-center gap-3 w-72 shadow-2xl bg-black/90 backdrop-blur-md border-white/10";
        iconBg.className = "w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0";
        iconEl.className = "fa-solid fa-cart-shopping";
    }

    // Animasi Masuk (Slide Up)
    container.classList.remove('translate-y-20', 'opacity-0');
    
    // Animasi Keluar (Slide Down) setelah 4 detik
    setTimeout(() => { 
        container.classList.add('translate-y-20', 'opacity-0'); 
    }, 4000);

    // Pindah ke data berikutnya (Looping)
    queueIndex = (queueIndex + 1) % liveQueue.length;
}

// Helper Waktu (biar terlihat real: "2 menit lalu")
function timeAgo(dateString) {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (seconds < 60) return "Baru saja";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return "Kemarin";
}

// 3. Jalankan Loop Notifikasi
function startLiveNotif() {
    fetchRealActivities(); // Tarik data pertama kali
    
    // Update data dari server tiap 30 detik (biar transaksi baru masuk antrian)
    setInterval(fetchRealActivities, 30000);

    // Loop Tampilan (Muncul random tiap 8-15 detik)
    loopDisplay();
}

function loopDisplay() {
    // Delay random antara 8 sampai 15 detik biar gak spamming
    const randomDelay = Math.floor(Math.random() * (15000 - 8000 + 1) + 8000);
    setTimeout(() => {
        showLiveNotification();
        loopDisplay(); // Panggil diri sendiri terus menerus
    }, randomDelay);
}

initData();
