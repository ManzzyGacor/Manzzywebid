// ============================================
// 1. SYSTEM INITIALIZATION & LOADER
// ============================================

window.addEventListener('load', () => {
    // Hilangkan loader setelah halaman selesai dimuat
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
    // Update status server setiap 5 detik
    setInterval(updateServerStats, 5000);
}

// ============================================
// 2. AUTHENTICATION (LOGIN/LOGOUT)
// ============================================

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
            
            // Update Header Balance
            const headerBal = document.getElementById('header-balance');
            if(headerBal) {
                headerBal.innerHTML = `<i class="fa-solid fa-wallet text-green-400 animate-pulse"></i><span class="text-sm text-white font-mono font-bold tracking-wide">${formatted}</span>`;
                headerBal.classList.remove('hidden');
            }
            
            // Update Sidebar User Info
            const sidebar = document.getElementById('user-status-sidebar');
            if(sidebar) sidebar.innerHTML = `Hi, ${userSession}<br><span class="text-green-400 font-bold font-mono">${formatted}</span>`;
            
            // Tampilkan Menu Khusus Member
            document.getElementById('review-form-container')?.classList.remove('hidden');
            document.getElementById('login-prompt')?.classList.add('hidden');
            document.getElementById('menu-topup')?.classList.remove('hidden');
            document.getElementById('menu-myservices')?.classList.remove('hidden');
            document.getElementById('menu-history')?.classList.remove('hidden');
            document.getElementById('menu-nokos')?.classList.remove('hidden'); // Menu Nokos
            
            // Ganti tombol login jadi logout
            document.getElementById('auth-menu').innerHTML = `<a href="#" onclick="doLogout()" class="flex items-center gap-4 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/5 transition"><i class="fa-solid fa-sign-out-alt text-red-500 w-6 text-center"></i><span class="font-medium">Logout</span></a>`;
        }
    } catch(e) {}
}

function doLogout() { 
    localStorage.removeItem('user_session'); 
    window.location.reload(); 
}

// ============================================
// 3. UI NAVIGATION (SWITCH VIEW)
// ============================================

function toggleSidebar() { document.body.classList.toggle('sidebar-active'); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('modal-active'); }
function closeModal(e) { if(e.target.id === 'modal-overlay') closeModalDirect(); }
function toggleFaq(h){ h.parentElement.classList.toggle('faq-active'); }

// Scroll to Top Button
const scrollBtn = document.getElementById('btn-scroll'); 
window.onscroll = function() { if(scrollBtn) scrollBtn.classList.toggle('show-scroll-btn', window.scrollY > 300); };
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function switchView(viewId) {
    // 1. Sembunyikan Semua Halaman
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
        view.classList.remove('view-active');
        view.style.display = 'none'; 
        view.style.opacity = '0'; 
    });

    // 2. Tutup Sidebar Mobile
    document.body.classList.remove('sidebar-active');
    const overlay = document.getElementById('sidebar-overlay');
    if(overlay) overlay.classList.remove('active');

    // 3. Tampilkan Halaman Tujuan
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.add('view-active');
        target.style.display = 'block';
        setTimeout(() => target.style.opacity = '1', 50);

        // --- UPDATE DATA PER HALAMAN ---
        if (viewId === 'store') loadStoreData();
        if (viewId === 'myservices') fetchMyServices();
        if (viewId === 'history') fetchHistory();
        if (viewId === 'nokos') initNokos(); // Load Nokos saat dibuka
    }
    
    // 4. Scroll ke Atas
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// 4. STORE / KATALOG LOGIC
// ============================================

let allProducts=[], allCategories=[], currentProduct=null;
const ADMIN_WA = "6287756632352";

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
    document.getElementById('modal-price').innerText = `Rp ${p.price.toLocaleString()}`; 
    document.getElementById('modal-desc').innerText = p.desc; 
    document.getElementById('modal-img').src = p.imageUrl || 'https://via.placeholder.com/400';
    document.getElementById('user-balance-display').innerText = userSession ? `Rp ${userBalance.toLocaleString()}` : 'Login Dulu';
    
    const form = document.getElementById('dynamic-inputs'); form.innerHTML = '';
    (p.formFields||'No WA').split(',').forEach(f => { 
        if(f.trim()) form.innerHTML += `<div><label class="text-[10px] text-gray-500 font-bold block mb-1">${f.trim()}</label><input type="text" name="${f.trim()}" class="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white text-sm" required></div>`; 
    });
    document.getElementById('modal-overlay').classList.add('modal-active');
}

async function processOrder(e) {
    e.preventDefault(); 
    if(!userSession) return alert("Login dulu!"); 
    if(userBalance < currentProduct.price) return alert("Saldo kurang!");
    
    const btn=document.getElementById('btn-buy'); btn.innerHTML='Proses...'; btn.disabled=true;
    const inputs=document.querySelectorAll('#orderForm input'); let fd=""; inputs.forEach(i=>fd+=`${i.name}: ${i.value}\n`);
    
    try { 
        const res=await fetch('/api/order',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({username:userSession,productId:currentProduct._id,formData:fd})
        }); 
        const r=await res.json(); 
        
        if(r.success){ 
            userBalance-=currentProduct.price; 
            checkUserLogin(); 
            document.getElementById('modal-content-product').classList.add('hidden'); 
            document.getElementById('modal-content-receipt').classList.remove('hidden'); 
            document.getElementById('rec-inv').innerText=r.invoiceId; 
            document.getElementById('rec-item').innerText=r.productName; 
            document.getElementById('rec-mode').innerText=r.mode; 
            
            if(r.mode==='manual'){ 
                const b=document.getElementById('btn-continue'); b.innerText="Lanjut WA"; 
                b.onclick=()=>{ window.open(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(`Order:\nInv: ${r.invoiceId}\n${fd}`)}`,'_blank'); closeModalDirect(); }; 
            } else { 
                document.getElementById('btn-continue').innerText="Tutup"; 
                document.getElementById('btn-continue').onclick=closeModalDirect; 
            } 
        } else { alert(r.msg); } 
    } catch(e){alert("Error");} 
    finally { btn.innerHTML='Bayar'; btn.disabled=false; }
}

// ============================================
// 5. TOP UP & REDEEM CODE
// ============================================

async function submitTopUp(e) {
    e.preventDefault(); if(!userSession) return alert("Login dulu!");
    const btn=document.getElementById('btn-topup'); btn.innerHTML='Mengirim...'; btn.disabled=true;
    const reader=new FileReader(); reader.readAsDataURL(document.getElementById('topupProof').files[0]);
    
    reader.onload=async()=>{ 
        try{ 
            const res=await fetch('/api/topup',{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({username:userSession,amount:document.getElementById('topupAmount').value,proofImage:reader.result})
            }); 
            if(res.ok){ alert("Terkirim! Saldo masuk setelah dicek admin."); switchView('landing'); } else { alert("Gagal"); } 
        }catch(e){} finally{ btn.innerHTML='Kirim'; btn.disabled=false; } 
    };
}

async function redeemCode(e) {
    e.preventDefault(); if(!userSession) return alert("Silakan login member terlebih dahulu!");
    const input = document.getElementById('redeemInput'); const btn = document.getElementById('btn-redeem'); 
    const code = input.value.trim(); if(!code) return;
    
    const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>'; btn.disabled = true;
    try { 
        const res = await fetch('/api/redeem', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: userSession, code: code })}); 
        const data = await res.json();
        if(data.success) { alert(`🎉 Voucher Sukses! Saldo +Rp ${data.amount.toLocaleString()}`); input.value = ''; checkUserLogin(); } else { alert("❌ GAGAL: " + data.msg); }
    } catch(err) { alert("Error koneksi."); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

// ============================================
// 6. HISTORY & MY SERVICES
// ============================================

async function fetchHistory() {
    if(!userSession) return;
    const list = document.getElementById('history-list'); 
    list.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500 text-xs"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading...</td></tr>';
    
    try { 
        const res = await fetch(`/api/history/${userSession}`); 
        const data = await res.json();
        
        if (data.length === 0) { list.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-500 italic text-xs">Belum ada transaksi.</td></tr>'; return; }
        
        list.innerHTML = data.map(item => {
            const d = new Date(item.date); const dateStr = `${d.getDate()}/${d.getMonth()+1} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            const colorClass = item.type === 'IN' ? 'text-green-400' : 'text-red-400';
            const symbol = item.type === 'IN' ? '+' : '-';
            
            let badge = '';
            if(item.status === 'success') badge = '<span class="text-green-500 bg-green-900/20 px-2 py-1 rounded text-[10px] font-bold">SUKSES</span>';
            else if(item.status === 'failed' || item.status === 'canceled') badge = '<span class="text-red-500 bg-red-900/20 px-2 py-1 rounded text-[10px] font-bold">GAGAL</span>';
            else badge = '<span class="text-yellow-500 bg-yellow-900/20 px-2 py-1 rounded text-[10px] font-bold">PROSES</span>';
            
            return `<tr class="hover:bg-white/5 transition"><td class="p-3 text-gray-500 font-mono text-xs whitespace-nowrap align-middle">${dateStr}</td><td class="p-3 font-medium text-white text-xs align-middle">${item.desc}<div class="md:hidden text-[10px] text-gray-600 mt-0.5">${item.type==='IN'?'Top Up':'Order'}</div></td><td class="p-3 text-right font-mono font-bold text-xs align-middle ${colorClass}">${symbol}Rp ${item.amount.toLocaleString()}</td><td class="p-3 text-center align-middle">${badge}</td></tr>`;
        }).join('');
    } catch (err) { list.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-red-500 text-xs">Gagal memuat data.</td></tr>'; }
}

async function fetchMyServices() {
    if(!userSession) return;
    const c=document.getElementById('myservices-list'); c.innerHTML='<div class="col-span-full text-center">Loading...</div>';
    
    try { 
        const res=await fetch(`/api/services/${userSession}`); const s=await res.json();
        if(s.length===0) { c.innerHTML=`<div class="col-span-full text-center py-10 glass-card rounded-xl"><p class="text-gray-400">Belum ada layanan.</p></div>`; return; }
        
        c.innerHTML=s.map(i=>{ 
            const exp=new Date(i.expiredDate); const diff=Math.ceil((exp-new Date())/(1000*60*60*24)); 
            let st='ACTIVE', cl='text-green-400'; 
            if(diff<=0){st='EXPIRED';cl='text-red-500';} else if(diff<=3){st=`EXP ${diff} HARI`;cl='text-yellow-400';} 
            
            return `<div class="glass-card p-6 rounded-xl border border-white/10 relative group hover:bg-white/5 transition"><div class="flex justify-between items-start mb-4"><div><h3 class="text-lg font-bold text-white">${i.productName}</h3><p class="text-xs text-gray-400 font-mono mt-1">ID: ${i._id.substr(-6)}</p></div><span class="text-xs font-bold px-2 py-1 rounded bg-black/50 ${cl} border border-white/10">● ${st}</span></div><div class="space-y-3 mb-6"><div class="flex justify-between text-sm"><span class="text-gray-500">Target</span><span class="text-white font-mono">${i.targetNumber}</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">IP</span><span class="text-blue-400 font-mono">${i.serverIp}</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">Expired</span><span class="text-white font-mono">${exp.toLocaleDateString()}</span></div></div><a href="https://wa.me/${ADMIN_WA}?text=Perpanjang%20${i.productName}" target="_blank" class="block w-full py-2 text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition">Perpanjang</a></div>`; 
        }).join('');
    } catch(e){}
}
// ============================================
// 7. NOKOS SYSTEM (PREMIUM FLOW)
// ============================================

let nokosInterval = null;
let currentNokos = {
    serviceId: null,
    serviceName: null,
    countryId: null,  // number_id (misal: 62 utk indo di API ini)
    countryName: null,
    providerId: null,
    serverPrice: 0,
    operatorId: null
};

// 1. INIT: LOAD APLIKASI
async function initNokos() {
    const grid = document.getElementById('nokos-app-grid');
    if(grid.children.length <= 1) {
        try {
            const res = await fetch('/api/nokos/services');
            const data = await res.json();
            if(data.success) {
                const iconMap = { 'WhatsApp': 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg', 'Telegram': 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg', 'TikTok': 'https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uhtyvueh7nulogpoguhm/tiktok-icon2.png', 'Shopee': 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopee_logo.svg', 'Gojek': 'https://upload.wikimedia.org/wikipedia/commons/8/86/Gojek_logo_2019.svg', 'Facebook': 'https://upload.wikimedia.org/wikipedia/commons/b/b8/2021_Facebook_icon.svg', 'Instagram': 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg', 'Google': 'https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg' };
                grid.innerHTML = data.data.map(s => {
                    const imgUrl = iconMap[s.service_name] || s.service_img || 'https://via.placeholder.com/50';
                    return `
                    <div onclick="selectApp(this, '${s.service_code}', '${s.service_name}')" 
                         class="app-card cursor-pointer bg-black/40 border border-gray-700 rounded-xl p-3 flex flex-col items-center justify-center hover:border-gray-500 transition group h-20">
                        <img src="${imgUrl}" class="w-6 h-6 object-contain mb-1">
                        <span class="text-[9px] text-gray-400 font-bold text-center group-hover:text-white uppercase">${s.service_name}</span>
                    </div>`;
                }).join('');
            }
        } catch(e) { grid.innerHTML = '<div class="col-span-full text-red-500 text-xs">Gagal memuat aplikasi.</div>'; }
    }
    fetchNokosHistory();
    clearInterval(nokosInterval);
    nokosInterval = setInterval(fetchNokosHistory, 5000);
}

// 2. PILIH APLIKASI -> LOAD NEGARA
async function selectApp(el, id, name) {
    document.querySelectorAll('.app-card').forEach(c => c.classList.remove('active-card'));
    el.classList.add('active-card');
    currentNokos.serviceId = id;
    currentNokos.serviceName = name;
    
    // Reset Steps
    resetSteps(['step-country', 'step-server', 'step-operator', 'step-checkout']);
    
    // Show Country Grid
    const countryGrid = document.getElementById('nokos-country-grid');
    document.getElementById('step-country').classList.remove('hidden');
    countryGrid.innerHTML = '<div class="col-span-full text-center text-xs text-yellow-500 animate-pulse">Memuat Negara...</div>';

    try {
        const res = await fetch(`/api/nokos/countries?service_id=${id}`);
        const data = await res.json();
        if(data.success) {
            // Simpan data pricelist di element biar gak request ulang
            countryGrid.innerHTML = data.data.map(c => {
                const priceData = JSON.stringify(c.pricelist).replace(/"/g, '&quot;'); // Encode JSON
                return `
                <div onclick="selectCountry(this, '${c.number_id}', '${c.name}', '${priceData}')" 
                     class="country-card cursor-pointer bg-black/40 border border-gray-700 rounded-lg p-2 flex items-center gap-3 hover:border-gray-500 transition">
                    <img src="${c.img}" class="w-6 h-4 rounded-sm object-cover">
                    <div class="flex-1">
                        <div class="text-xs font-bold text-white leading-tight">${c.name}</div>
                        <div class="text-[9px] text-gray-500">Stok: ${c.stock_total || '∞'}</div>
                    </div>
                </div>`;
            }).join('');
        }
    } catch(e) { countryGrid.innerHTML = '<div class="col-span-full text-red-500 text-xs">Gagal.</div>'; }
}

// 3. PILIH NEGARA -> TAMPILKAN LIST SERVER/HARGA
function selectCountry(el, numId, name, priceDataJson) {
    document.querySelectorAll('.country-card').forEach(c => c.classList.remove('active-card'));
    el.classList.add('active-card');
    currentNokos.countryId = numId;
    currentNokos.countryName = name;

    resetSteps(['step-server', 'step-operator', 'step-checkout']);
    document.getElementById('step-server').classList.remove('hidden');
    
    const serverList = document.getElementById('nokos-server-list');
    const prices = JSON.parse(priceDataJson); // Decode JSON Price List

    serverList.innerHTML = prices.map(p => `
    <div onclick="selectServer(this, '${p.provider_id}', '${p.price}')" 
         class="server-card cursor-pointer bg-black/40 border border-gray-700 rounded-lg p-3 flex justify-between items-center hover:border-green-500 transition group">
        <div class="flex items-center gap-3">
            <div class="bg-gray-800 p-2 rounded text-xs font-mono text-gray-400 group-hover:bg-green-900 group-hover:text-green-400">ID:${p.provider_id}</div>
            <div>
                <div class="text-xs font-bold text-white">Server ${p.server_id || 'Fast'}</div>
                <div class="text-[10px] text-gray-500">Stok: ${p.stock}</div>
            </div>
        </div>
        <div class="text-sm font-bold text-green-400">${p.price_format}</div>
    </div>
    `).join('');
}

// 4. PILIH SERVER -> LOAD OPERATOR
async function selectServer(el, provId, price) {
    document.querySelectorAll('.server-card').forEach(c => c.classList.remove('active-card'));
    el.classList.add('active-card');
    currentNokos.providerId = provId;
    currentNokos.serverPrice = parseInt(price);

    resetSteps(['step-operator', 'step-checkout']);
    document.getElementById('step-operator').classList.remove('hidden');
    
    const opGrid = document.getElementById('nokos-operator-grid');
    opGrid.innerHTML = '<div class="col-span-full text-center text-xs text-yellow-500 animate-pulse">Memuat Operator...</div>';

    try {
        const countryEnc = encodeURIComponent(currentNokos.countryName);
        const res = await fetch(`/api/nokos/operators?country=${countryEnc}&provider_id=${provId}`);
        const data = await res.json();
        
        if(data.status || data.success) {
            let html = `
            <div onclick="selectOperator(this, 'any', 'Any/Acak')" 
                 class="operator-card cursor-pointer bg-black/40 border border-gray-700 rounded-lg p-3 flex flex-col items-center justify-center gap-1 hover:border-green-500 transition">
                <div class="w-6 h-6 rounded-full bg-gray-700 text-white flex items-center justify-center font-bold text-xs">?</div>
                <span class="text-[9px] font-bold text-white">ANY</span>
            </div>`;
            
            html += data.data.map(op => `
            <div onclick="selectOperator(this, '${op.id}', '${op.name}')" 
                 class="operator-card cursor-pointer bg-black/40 border border-gray-700 rounded-lg p-3 flex flex-col items-center justify-center gap-1 hover:border-green-500 transition relative overflow-hidden">
                <img src="${op.image}" onerror="this.src='https://via.placeholder.com/20'" class="w-5 h-5 object-contain">
                <span class="text-[9px] font-bold text-gray-300 truncate w-full text-center">${op.name}</span>
            </div>`).join('');
            
            opGrid.innerHTML = html;
        } else {
            opGrid.innerHTML = '<div class="col-span-full text-red-500 text-xs">Gagal load operator.</div>';
        }
    } catch(e) { opGrid.innerHTML = '<div class="col-span-full text-red-500 text-xs">Error.</div>'; }
}

// 5. PILIH OPERATOR -> CHECKOUT
function selectOperator(el, opId, opName) {
    document.querySelectorAll('.operator-card').forEach(c => c.classList.remove('active-card'));
    el.classList.add('active-card');
    currentNokos.operatorId = opId;

    document.getElementById('step-checkout').classList.remove('hidden');
    document.getElementById('display-price').innerText = `Rp ${currentNokos.serverPrice.toLocaleString()}`;
    document.getElementById('display-info').innerText = opName;
    document.getElementById('display-server').innerText = `ID: ${currentNokos.providerId}`;
    
    // Scroll ke tombol beli biar user notice
    document.getElementById('step-checkout').scrollIntoView({ behavior: 'smooth' });
}

// 6. EKSEKUSI BELI
async function executeBuyNokos() {
    if(!confirm(`Beli nomor ${currentNokos.serviceName} (${currentNokos.countryName})?\nSaldo akan terpotong.`)) return;
    
    const btn = document.getElementById('btn-buy-nokos');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> PROSES...';
    btn.disabled = true;

    try {
        const payload = {
            username: userSession,
            service_id: currentNokos.serviceId, // Penting buat validasi backend
            service_name: currentNokos.serviceName,
            number_id: currentNokos.countryId,
            provider_id: currentNokos.providerId,
            operator_id: currentNokos.operatorId
        };

        const res = await fetch('/api/nokos/buy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
        const d = await res.json();
        
        if(d.success) {
            alert("✅ SUKSES! Tunggu SMS masuk.");
            checkUserLogin(); fetchNokosHistory();
            resetSteps(['step-checkout']); // Sembunyikan checkout biar gak double buy
        } else {
            // Parsing Error Message biar rapi
            let msg = d.msg || "Gagal";
            if(d.msg && d.msg.includes("Pusat:")) msg = "GAGAL DARI PUSAT: Saldo Server/Stok Habis.";
            alert("❌ " + msg);
        }
    } catch(e) { alert("Error koneksi."); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
}

// UTILS
function resetSteps(ids) {
    ids.forEach(id => document.getElementById(id).classList.add('hidden'));
}

async function fetchNokosHistory() {
    if(!userSession) return;
    const res = await fetch(`/api/nokos/history/${userSession}`); 
    const list = await res.json();
    const tbody = document.getElementById('nokos-active-list');
    
    if(list.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-500 text-xs">Belum ada order.</td></tr>'; return; }
    
    tbody.innerHTML = await Promise.all(list.map(async (tx) => {
        if(tx.status === 'waiting') await fetch(`/api/nokos/status/${tx.invoiceId}`); 
        
        const exp = new Date(tx.expiresAt); const timeLeft = Math.floor((exp - new Date()) / 1000);
        let timeStr = timeLeft > 0 ? `${Math.floor(timeLeft/60)}m ${timeLeft%60}s` : 'Expired';
        let smsDisplay = '<span class="text-yellow-500 animate-pulse text-[10px]">WAITING...</span>';
        if(tx.smsCode) smsDisplay = `<span class="bg-green-900/30 text-green-400 px-2 py-1 rounded border border-green-500/30 font-mono font-bold text-sm tracking-widest select-all">${tx.smsCode}</span>`;
        if(tx.status === 'canceled') smsDisplay = '<span class="text-red-500 text-[10px]">REFUND</span>';
        
        let btnAction = '';
        if(tx.status === 'waiting' && timeLeft > 0) btnAction = `<button onclick="cancelNokos('${tx.invoiceId}')" class="text-red-400 hover:text-white text-[10px] border border-red-500/30 px-2 py-1 rounded bg-red-900/20">CANCEL</button>`;
        else if (tx.status === 'success') btnAction = `<i class="fa-solid fa-check text-green-500"></i>`;

        return `<tr class="hover:bg-white/5 border-b border-gray-800"><td class="p-4 font-bold text-white text-xs">${tx.serviceName}<div class="text-[9px] text-gray-500">${tx.country}</div></td><td class="p-4 font-mono text-xs text-purple-300 select-all">${tx.phoneNumber}</td><td class="p-4">${smsDisplay}</td><td class="p-4 font-mono text-[10px] text-gray-400">${timeStr}</td><td class="p-4 text-right">${btnAction}</td></tr>`;
    })).then(rows => rows.join(''));
}

async function cancelNokos(invId) {
    if(!confirm("Batalkan & Refund?")) return;
    const res = await fetch('/api/nokos/cancel', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({invoiceId:invId, username:userSession})});
    const d=await res.json();
    if(d.success) { alert("Sukses Cancel."); fetchNokosHistory(); checkUserLogin(); } else alert("Gagal.");
}

// ============================================
// 8. SERVER STATS (MANUAL CONTROL) & TESTIMONI
// ============================================

async function updateServerStats() {
    try {
        const res = await fetch('/api/system/status');
        const data = await res.json();
        const vpsEl = document.getElementById('runtime-vps');
        const botEl = document.getElementById('runtime-bot');
        const statusBadge = document.getElementById('status-badge');
        
        if (data.vpsActive) {
            const diff = new Date().getTime() - new Date(data.vpsStartTime).getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            if(vpsEl) vpsEl.innerText = `${days}d ${hours}h ${minutes}m`;
            if(statusBadge) { statusBadge.innerText = "ONLINE"; statusBadge.className = "text-green-400 text-[10px] bg-green-900/50 px-2 py-1 rounded border border-green-500 font-bold"; }
            
            // Fake Animations
            if(document.getElementById('bar-cpu')) document.getElementById('bar-cpu').style.width = (Math.floor(Math.random()*30)+10) + "%";
            if(document.getElementById('text-cpu')) document.getElementById('text-cpu').innerText = (Math.floor(Math.random()*30)+10) + "%";
        } else {
            if(vpsEl) vpsEl.innerText = "OFFLINE";
            if(statusBadge) { statusBadge.innerText = "MAINTENANCE"; statusBadge.className = "text-red-500 text-[10px] bg-red-900/50 px-2 py-1 rounded border border-red-500 font-bold animate-pulse"; }
            if(document.getElementById('bar-cpu')) document.getElementById('bar-cpu').style.width = "0%";
        }

        if (data.botActive) {
            const diff = new Date().getTime() - new Date(data.botStartTime).getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            if(botEl) botEl.innerHTML = `<span class="text-blue-400">${days}d ${hours}h</span>`;
        } else {
            if(botEl) botEl.innerText = "OFFLINE";
        }
    } catch(e) {}
}

// Testimonials
function setRating(n) { document.getElementById('ratingValue').value = n; document.getElementById('rating-text').innerText = n + ".0"; for (let i = 1; i <= 5; i++) { const s=document.getElementById(`star-${i}`); if(i<=n){s.classList.remove('text-gray-600');s.classList.add('text-yellow-500');}else{s.classList.remove('text-yellow-500');s.classList.add('text-gray-600');} } }

async function submitReview(e) { 
    e.preventDefault(); 
    if(!userSession) return alert("Login dulu."); 
    const btn=document.getElementById('btn-submit-review'); btn.innerHTML='Mengirim...'; btn.disabled=true; 
    try { 
        const res=await fetch('/api/testimonials',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({username:userSession,rating:parseInt(document.getElementById('ratingValue').value),comment:document.getElementById('reviewComment').value})
        }); 
        if((await res.json()).success){alert("Terkirim!"); fetchTestimonials();} else alert("Gagal"); 
    } catch(e){} 
    finally{ btn.innerHTML='Kirim Ulasan'; btn.disabled=false; } 
}

async function fetchTestimonials() { 
    try { 
        const d = await (await fetch('/api/testimonials')).json(); 
        const g=document.getElementById('testimonial-grid'); 
        if(d.length===0){g.innerHTML='...';return;} 
        g.innerHTML=d.map(x=>`<div class="glass-card p-5 rounded-xl w-[300px] flex-none snap-center border-l-2 border-l-purple-500"><div class="flex justify-between mb-2"><h4 class="font-bold text-white">${x.username}</h4><span class="text-yellow-500 text-xs">★ ${x.rating}.0</span></div><p class="text-gray-400 text-sm italic">"${x.comment}"</p></div>`).join(''); 
    } catch(e){} 
}

// JALANKAN SAAT SCRIPT DIMUAT
initData();