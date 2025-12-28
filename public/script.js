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
            document.getElementById('menu-history').classList.remove('hidden'); // <-- TAMBAHKAN INI
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

// --- NAVIGASI HALAMAN (SWITCH VIEW) ---
function switchView(viewId) {
    // 1. Sembunyikan Semua Halaman
    // (Otomatis cari semua elemen yang punya class 'view-section')
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
        view.classList.remove('view-active');
        view.style.display = 'none'; 
    });

    // 2. Tutup Sidebar (Jika sedang terbuka di mobile)
    document.body.classList.remove('sidebar-active');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarMenu = document.getElementById('sidebar-menu');
    if(sidebarOverlay) sidebarOverlay.classList.remove('active');
    if(sidebarMenu) sidebarMenu.classList.remove('active');

    // 3. Tampilkan Halaman Tujuan
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.add('view-active');
        target.style.display = 'block';
        
        // Efek Fade In Halus
        target.style.opacity = '0';
        setTimeout(() => target.style.opacity = '1', 50);
    }

    // 4. Scroll ke Atas
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 5. Auto Refresh Data (Logika Baru)
    if (viewId === 'store') {
        // Panggil fungsi load produk jika ada (opsional, tergantung script kamu sebelumnya)
        if (typeof loadStoreData === 'function') loadStoreData();
        if (typeof filterProducts === 'function') filterProducts(); 
    }
    
    if (viewId === 'myservices') {
        if (typeof fetchMyServices === 'function') fetchMyServices();
    }
    
    if (viewId === 'history') {
        if (typeof fetchHistory === 'function') fetchHistory();
    }
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

// --- LOGIKA REDEEM CODE ---
async function redeemCode(e) {
    e.preventDefault();
    
    // 1. Cek Login
    if(!userSession) return alert("Silakan login member terlebih dahulu!");

    const input = document.getElementById('redeemInput');
    const btn = document.getElementById('btn-redeem');
    const code = input.value.trim(); // Hapus spasi

    if(!code) return;

    // 2. Loading State
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    btn.disabled = true;

    try {
        // 3. Kirim ke Backend
        const res = await fetch('/api/redeem', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                username: userSession, 
                code: code 
            })
        });
        
        const data = await res.json();
        
        if(data.success) {
            // 4. Sukses
            // Play sound effect kalau mau (opsional)
            alert(`🎉 SELAMAT! Voucher berhasil diklaim.\nSaldo bertambah: Rp ${data.amount.toLocaleString()}`);
            
            input.value = ''; // Kosongkan input
            checkUserLogin(); // Refresh saldo di header otomatis
        } else {
            // 5. Gagal (Exp/Habis/Salah)
            alert("❌ GAGAL: " + data.msg);
        }
    } catch(err) {
        alert("Terjadi kesalahan koneksi.");
    } finally {
        // 6. Reset Tombol
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- [NEW] LOGIKA HISTORY ---

// 1. Panggil fungsi ini saat switchView('history') dipanggil
// (Nanti kita update switchView dikit)

async function fetchHistory() {
    if(!userSession) return;
    
    const list = document.getElementById('history-list');
    list.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-500"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</td></tr>';

    try {
        const res = await fetch(`/api/history/${userSession}`);
        const data = await res.json();

        if (data.length === 0) {
            list.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-500 italic">Belum ada transaksi.</td></tr>';
            return;
        }

        list.innerHTML = data.map(item => {
            const date = new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute:'2-digit' });
            
            // Warna & Simbol beda buat Masuk vs Keluar
            const isIn = item.type === 'IN';
            const colorClass = isIn ? 'text-green-400' : 'text-red-400';
            const symbol = isIn ? '+' : '-';
            
            // Badge Status
            let statusBadge = '';
            if(item.status === 'success') statusBadge = '<span class="bg-green-900/50 text-green-400 px-2 py-1 rounded text-[10px] font-bold">SUKSES</span>';
            else if(item.status === 'pending') statusBadge = '<span class="bg-yellow-900/50 text-yellow-400 px-2 py-1 rounded text-[10px] font-bold">PROSES</span>';
            else statusBadge = '<span class="bg-red-900/50 text-red-400 px-2 py-1 rounded text-[10px] font-bold">GAGAL</span>';

            return `
            <tr class="hover:bg-white/5 transition">
                <td class="p-4 text-gray-400 font-mono text-xs whitespace-nowrap">${date}</td>
                <td class="p-4 font-bold text-white">
                    ${item.desc}
                    <div class="md:hidden text-[10px] text-gray-500 mt-1">${item.type === 'IN' ? 'Uang Masuk' : 'Pembelian'}</div>
                </td>
                <td class="p-4 text-right font-mono font-bold ${colorClass}">
                    ${symbol} Rp ${item.amount.toLocaleString()}
                </td>
                <td class="p-4 text-center">${statusBadge}</td>
            </tr>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
        list.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-red-500">Gagal memuat data.</td></tr>';
    }
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

// 1. Fungsi Set Rating (Visual Bintang & Input Value)
function setRating(n) {
    const inputVal = document.getElementById('ratingValue');
    const textVal = document.getElementById('rating-text');
    
    // Cek elemen ada atau tidak untuk mencegah error
    if(inputVal) inputVal.value = n;
    if(textVal) textVal.innerText = n + ".0";
    
    // Loop 5 bintang untuk ubah warna
    for (let i = 1; i <= 5; i++) {
        const star = document.getElementById(`star-${i}`);
        if(star) {
            if (i <= n) {
                star.classList.remove('text-gray-600');
                star.classList.add('text-yellow-500');
                // Efek animasi "Pop" saat diklik
                star.style.transform = "scale(1.4)";
                setTimeout(() => star.style.transform = "scale(1)", 200);
            } else {
                star.classList.remove('text-yellow-500');
                star.classList.add('text-gray-600');
            }
        }
    }
}

// 2. Fungsi Submit Review (Perbaikan Bug currentRating)
async function submitReview(e) {
    e.preventDefault();
    if(!userSession) return alert("Sesi habis, silakan login ulang.");

    const btn = document.getElementById('btn-submit-review');
    const originalText = btn ? btn.innerHTML : 'Kirim';
    const ratingEl = document.getElementById('ratingValue');
    const commentEl = document.getElementById('reviewComment');

    if(!ratingEl || !commentEl) return; // Safety check

    const ratingVal = ratingEl.value;
    const commentVal = commentEl.value;

    // UI Loading
    if(btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Mengirim...';
        btn.disabled = true;
    }

    try {
        const res = await fetch('/api/testimonials', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: userSession,
                rating: parseInt(ratingVal),
                comment: commentVal
            })
        });

        const data = await res.json();
        
        if (data.success) {
            alert("Terima kasih! Ulasan berhasil dikirim.");
            commentEl.value = ''; // Reset form
            setRating(5); // Reset bintang ke 5
            fetchTestimonials(); // Refresh list ulasan
        } else {
            alert("Gagal mengirim ulasan.");
        }
    } catch (err) {
        alert("Error koneksi server.");
    } finally {
        if(btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// 3. Update Fetch Testimonials (Tampilan Lebih Rapi)
async function fetchTestimonials() {
    try {
        const r = await fetch('/api/testimonials');
        const d = await r.json();
        const grid = document.getElementById('testimonial-grid');
        
        if(!grid) return;

        if(d.length === 0) {
            grid.innerHTML = '<div class="w-full text-center text-gray-500 italic py-10">Belum ada ulasan. Jadilah yang pertama!</div>';
            return;
        }

        grid.innerHTML = d.map(x => {
            // Generate bintang kuning vs abu-abu utk display
            let starsHtml = '';
            for(let i=1; i<=5; i++) {
                starsHtml += `<i class="fa-solid fa-star text-[10px] ${i <= x.rating ? 'text-yellow-500' : 'text-gray-700'}"></i>`;
            }

            // Ambil inisial nama
            const initial = x.username ? x.username.charAt(0).toUpperCase() : '?';

            return `
            <div class="glass-card p-5 rounded-xl w-[85vw] md:w-[320px] flex-none snap-center border-l-2 border-l-purple-500 relative flex flex-col h-auto">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center font-bold text-xs text-white shadow-lg shadow-purple-500/30">
                            ${initial}
                        </div>
                        <div>
                            <h4 class="font-bold text-white text-sm leading-none">${x.username}</h4>
                            <span class="text-[10px] text-gray-500">${new Date(x.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="flex gap-0.5 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                        ${starsHtml}
                    </div>
                </div>
                <p class="text-gray-300 text-sm leading-relaxed italic">"${x.comment}"</p>
            </div>
            `;
        }).join('');
        
    } catch(e){ console.log("Error fetch testi:", e); } 
}
// INIT (JALAN SAAT SCRIPT LOAD)
initData();