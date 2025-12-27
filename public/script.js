// 1. LOADER CLEANUP
window.addEventListener('load', () => {
    // Apapun yang terjadi, loader hilang dalam 3 detik
    // (Script ini dijalankan oleh browser, tidak ada blocking)
});

async function initData() {
    // Fungsi ini dijalankan oleh inline script di HTML
    checkUserLogin();
    fetchTestimonials();
    updateServerStats();
    setInterval(updateServerStats, 5000);
}

// 2. AUTH
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
            
            // Header
            const headerBal = document.getElementById('header-balance');
            if(headerBal) {
                headerBal.innerHTML = `<i class="fa-solid fa-wallet text-green-400 animate-pulse"></i><span class="text-sm text-white font-mono font-bold tracking-wide">${formatted}</span>`;
                headerBal.classList.remove('hidden');
            }
            
            // Sidebar
            const sidebar = document.getElementById('user-status-sidebar');
            if(sidebar) sidebar.innerHTML = `Hi, ${userSession}<br><span class="text-green-400 font-bold font-mono">${formatted}</span>`;
            
            // Menus
            document.getElementById('review-form-container')?.classList.remove('hidden');
            document.getElementById('login-prompt')?.classList.add('hidden');
            document.getElementById('menu-topup')?.classList.remove('hidden');
            document.getElementById('menu-myservices')?.classList.remove('hidden');
            document.getElementById('auth-menu').innerHTML = `<a href="#" onclick="doLogout()" class="flex items-center gap-4 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/5 transition"><i class="fa-solid fa-sign-out-alt text-red-500 w-6 text-center"></i><span class="font-medium">Logout</span></a>`;
        }
    } catch(e) {}
}
function doLogout() { localStorage.removeItem('user_session'); window.location.reload(); }

// 3. UI
function toggleSidebar() { document.body.classList.toggle('sidebar-active'); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('modal-active'); }
function closeModal(e) { if(e.target.id === 'modal-overlay') closeModalDirect(); }
function toggleFaq(h){ h.parentElement.classList.toggle('faq-active'); }
const scrollBtn = document.getElementById('btn-scroll'); window.onscroll = function() { if(scrollBtn) scrollBtn.classList.toggle('show-scroll-btn', window.scrollY > 300); };
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function switchView(target) {
    const views = { landing: document.getElementById('view-landing'), store: document.getElementById('view-store'), topup: document.getElementById('view-topup'), myservices: document.getElementById('view-myservices') };
    document.body.classList.remove('sidebar-active');
    Object.values(views).forEach(el => { if(el) { el.style.opacity='0'; el.classList.remove('view-active'); } });
    setTimeout(() => { 
        if(views[target]) { views[target].classList.add('view-active'); views[target].style.opacity='1'; 
        if(target === 'store') loadStoreData();
        if(target === 'myservices') fetchMyServices();
    }}, 400);
}

// 4. STORE
let allProducts=[], allCategories=[], currentProduct=null;
const ADMIN_WA = "6287756632352";

async function loadStoreData() {
    if(allCategories.length > 0) return;
    document.getElementById('loading-store')?.classList.remove('hidden');
    document.getElementById('section-categories')?.classList.add('hidden');
    try { const [c, p] = await Promise.all([fetch('/api/categories'), fetch('/api/products')]); allCategories = await c.json(); allProducts = await p.json(); renderCategories(); } catch(e){} finally { document.getElementById('loading-store')?.classList.add('hidden'); }
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
function openCategory(n) { document.getElementById('section-categories').classList.add('hidden'); document.getElementById('section-products').classList.remove('hidden'); document.getElementById('current-category-name').innerText = n === 'ALL' ? 'Semua Produk' : n; document.getElementById('searchInput').value=''; filterProducts(n); }
function backToCategories() { document.getElementById('section-products').classList.add('hidden'); document.getElementById('section-categories').classList.remove('hidden'); }
function filterProducts(f=null) { const k=document.getElementById('searchInput').value.toLowerCase(); let d=allProducts; const c=document.getElementById('current-category-name').innerText; const ac=c==='Semua Produk'?'ALL':c; if(ac!=='ALL') d=d.filter(p=>p.category===ac); if(k) d=d.filter(p=>p.name.toLowerCase().includes(k)); renderProducts(d); }
function renderProducts(p) { const g=document.getElementById('grid-products'); if(p.length===0){g.innerHTML='<p class="text-gray-500 col-span-full text-center">Tidak ditemukan.</p>';return;} g.innerHTML=p.map(x=>{ const a=x.isAvailable!==false, u=x.imageUrl||'https://via.placeholder.com/400', c=a?'':'unavailable', b=a?'bg-white/5 border-white/10 group-hover:bg-purple-600':'bg-red-900/20 cursor-not-allowed', act=a?`onclick="openModal('${x._id}')"`:''; return `<div class="product-card group flex flex-col h-full ${c}"><div class="product-img-wrapper"><img src="${u}" class="product-img"><div class="absolute top-3 right-3"><span class="price-badge">Rp ${x.price.toLocaleString()}</span></div></div><div class="p-5 flex flex-col flex-1"><h3 class="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition">${x.name}</h3><p class="text-sm text-gray-400 mb-6 line-clamp-3 flex-1">${x.desc}</p><button ${act} class="w-full py-3 rounded-lg border text-white font-bold ${b}">${a?'Lihat Detail':'Stok Habis'}</button></div></div>`; }).join(''); }

function openModal(id) {
    const p = allProducts.find(x => x._id === id); if(!p) return; currentProduct = p;
    document.getElementById('modal-content-product').classList.remove('hidden'); document.getElementById('modal-content-receipt').classList.add('hidden');
    document.getElementById('modal-title').innerText = p.name; document.getElementById('modal-price').innerText = `Rp ${p.price.toLocaleString()}`; document.getElementById('modal-desc').innerText = p.desc; document.getElementById('modal-img').src = p.imageUrl || 'https://via.placeholder.com/400';
    const bal = userSession ? `Rp ${userBalance.toLocaleString()}` : 'Login Dulu';
    document.getElementById('user-balance-display').innerText = bal;
    const form = document.getElementById('dynamic-inputs'); form.innerHTML = '';
    (p.formFields||'No WA').split(',').forEach(f => { if(f.trim()) form.innerHTML += `<div><label class="text-[10px] text-gray-500 font-bold block mb-1">${f.trim()}</label><input type="text" name="${f.trim()}" class="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white text-sm" required></div>`; });
    document.getElementById('modal-overlay').classList.add('modal-active');
}

async function processOrder(e) {
    e.preventDefault(); if(!userSession) return alert("Login dulu!"); if(userBalance < currentProduct.price) return alert("Saldo kurang!");
    const btn=document.getElementById('btn-buy'); btn.innerHTML='Proses...'; btn.disabled=true;
    const inputs=document.querySelectorAll('#orderForm input'); let fd=""; inputs.forEach(i=>fd+=`${i.name}: ${i.value}\n`);
    try { const res=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:userSession,productId:currentProduct._id,formData:fd})}); const r=await res.json(); if(r.success){ userBalance-=currentProduct.price; checkUserLogin(); document.getElementById('modal-content-product').classList.add('hidden'); document.getElementById('modal-content-receipt').classList.remove('hidden'); document.getElementById('rec-inv').innerText=r.invoiceId; document.getElementById('rec-item').innerText=r.productName; document.getElementById('rec-mode').innerText=r.mode; if(r.mode==='manual'){ const b=document.getElementById('btn-continue'); b.innerText="Lanjut WA"; b.onclick=()=>{ window.open(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(`Order:\nInv: ${r.invoiceId}\n${fd}`)}`,'_blank'); closeModalDirect(); }; } else { document.getElementById('btn-continue').innerText="Tutup"; document.getElementById('btn-continue').onclick=closeModalDirect; } } else { alert(r.msg); } } catch(e){alert("Error");} finally { btn.innerHTML='Bayar'; btn.disabled=false; }
}

// 5. TOP UP & SERVICES
async function submitTopUp(e) {
    e.preventDefault(); if(!userSession) return alert("Login dulu!");
    const btn=document.getElementById('btn-topup'); btn.innerHTML='Mengirim...'; btn.disabled=true;
    const reader=new FileReader(); reader.readAsDataURL(document.getElementById('topupProof').files[0]);
    reader.onload=async()=>{ try{ const res=await fetch('/api/topup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:userSession,amount:document.getElementById('topupAmount').value,proofImage:reader.result})}); if(res.ok){ alert("Terkirim!"); switchView('landing'); } else { alert("Gagal"); } }catch(e){} finally{ btn.innerHTML='Kirim'; btn.disabled=false; } };
}

async function fetchMyServices() {
    if(!userSession) return;
    const c=document.getElementById('myservices-list'); c.innerHTML='<div class="col-span-full text-center">Loading...</div>';
    try { const res=await fetch(`/api/services/${userSession}`); const s=await res.json();
        if(s.length===0) { c.innerHTML=`<div class="col-span-full text-center py-10 glass-card rounded-xl"><p class="text-gray-400">Belum ada layanan.</p></div>`; return; }
        c.innerHTML=s.map(i=>{ const exp=new Date(i.expiredDate); const diff=Math.ceil((exp-new Date())/(1000*60*60*24)); let st='ACTIVE', cl='text-green-400'; if(diff<=0){st='EXPIRED';cl='text-red-500';} else if(diff<=3){st=`EXP ${diff} HARI`;cl='text-yellow-400';} return `<div class="glass-card p-6 rounded-xl border border-white/10 relative group hover:bg-white/5 transition"><div class="flex justify-between items-start mb-4"><div><h3 class="text-lg font-bold text-white">${i.productName}</h3><p class="text-xs text-gray-400 font-mono mt-1">ID: ${i._id.substr(-6)}</p></div><span class="text-xs font-bold px-2 py-1 rounded bg-black/50 ${cl} border border-white/10">● ${st}</span></div><div class="space-y-3 mb-6"><div class="flex justify-between text-sm"><span class="text-gray-500">Target</span><span class="text-white font-mono">${i.targetNumber}</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">IP</span><span class="text-blue-400 font-mono">${i.serverIp}</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">Expired</span><span class="text-white font-mono">${exp.toLocaleDateString()}</span></div></div><a href="https://wa.me/${ADMIN_WA}?text=Perpanjang%20${i.productName}" target="_blank" class="block w-full py-2 text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition">Perpanjang</a></div>`; }).join('');
    } catch(e){}
}

// 6. MONITOR & ETC
async function updateServerStats() { try { const r=await fetch('/api/ptero/config'); const c=await r.json(); if(!c.panelUrl)return; const res=await fetch(`${c.panelUrl}/api/client/servers/${c.serverId}/resources`,{headers:{'Authorization':`Bearer ${c.apiKey}`,'Accept':'application/json'}}); const d=await res.json(); const s=d.attributes.resources; document.getElementById('bar-cpu').style.width=Math.min(s.cpu_absolute,100)+"%"; document.getElementById('text-cpu').innerText=s.cpu_absolute.toFixed(1)+"%"; } catch(e){} }
async function fetchTestimonials() { try { const r=await fetch('/api/testimonials'); const d=await r.json(); document.getElementById('testimonial-grid').innerHTML=d.map(x=>`<div class="glass-card p-6 rounded-xl w-[85vw] md:w-[350px] snap-center flex-none"><div><h4 class="font-bold text-white">${x.username}</h4><div class="text-yellow-500 text-xs">${"★".repeat(x.rating)}</div><p class="text-gray-300 text-sm mt-2">"${x.comment}"</p></div></div>`).join(''); } catch(e){} }
async function submitReview(e) { e.preventDefault(); await fetch('/api/testimonials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:userSession,rating:currentRating,comment:document.getElementById('reviewComment').value})}); alert("Terkirim!"); fetchTestimonials(); }

// INIT (JALAN SAAT SCRIPT LOAD)
initData();