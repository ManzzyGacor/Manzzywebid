// ==========================================
// 1. DATA STATE & CONFIG (AUTO LOAD)
// ==========================================
let currentOrderStep = 1;
let selectedOperatorId = 1; 
let selectedOrder = {
    service_id: '', service_name: '', country_name: '',
    provider_id: '', server_id: '', price: 0, number_id: ''
};

// Ambil data pesanan dari LocalStorage biar pas refresh GAK HILANG
let activeOrders = JSON.parse(localStorage.getItem('manzzy_orders')) || []; 

const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false,
    timer: 3000, timerProgressBar: true, background: '#1e1b4b', color: '#fff'
});

// Jalankan polling ulang buat pesanan yang masih pending pas web dibuka
window.onload = () => {
    activeOrders.forEach(order => {
        if (order.status !== 'completed') {
            startOtpPolling(order.order_id);
            // Hitung sisa waktu (asumsi 20 menit dari created_at jika ada)
            startTimer(order.order_id, 1200); 
        }
    });
    renderPendingOrders();
};

// Fungsi simpan ke browser
function saveOrders() {
    localStorage.setItem('manzzy_orders', JSON.stringify(activeOrders));
}

// ==========================================
// 2. LOGIKA MODAL & NAV
// ==========================================
async function openOrderModal() {
    const modal = document.getElementById('modal-order');
    const sheet = document.getElementById('order-sheet');
    modal.classList.remove('hidden');
    setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
    resetOrderSteps();
    await loadServices(); 
}

function closeOrderModal() {
    const sheet = document.getElementById('order-sheet');
    sheet.classList.add('translate-y-full');
    setTimeout(() => document.getElementById('modal-order').classList.add('hidden'), 500);
}

function nextOrderStep(step) {
    document.querySelectorAll('.order-step').forEach(s => s.classList.add('hidden'));
    currentOrderStep = step;
    document.getElementById(`order-step-${step}`).classList.remove('hidden');
    const titles = ["", "Pilih Aplikasi", "Pilih Negara", "Pilih Server", "Konfirmasi"];
    document.getElementById('modal-order-title').innerText = titles[step];
}

function resetOrderSteps() {
    currentOrderStep = 1;
    nextOrderStep(1);
}

// ==========================================
// 3. INTEGRASI API
// ==========================================

async function loadServices() {
    const container = document.getElementById('list-apps-modal');
    container.innerHTML = '<div class="col-span-3 text-center py-10 opacity-50 text-[10px]">MEMUAT...</div>';
    try {
        const res = await fetch('/api/nokos/services');
        const result = await res.json();
        if (result.success) {
            container.innerHTML = result.data.map(app => `
                <div onclick="selectService('${app.service_code}', '${app.service_name}')" class="galaxy-card p-4 rounded-2xl flex flex-col items-center gap-2 cursor-pointer transition active:scale-95">
                    <img src="${app.service_img}" class="w-8 h-8 object-contain">
                    <span class="text-[9px] font-bold uppercase text-center">${app.service_name}</span>
                </div>
            `).join('');
        }
    } catch (e) { container.innerHTML = 'Error API'; }
}

async function selectService(sid, sname) {
    selectedOrder.service_id = sid;
    selectedOrder.service_name = sname;
    nextOrderStep(2);
    const container = document.getElementById('list-countries-modal');
    container.innerHTML = '<div class="text-center py-10 opacity-50 text-[10px]">MENCARI NEGARA...</div>';
    try {
        const res = await fetch(`/api/nokos/countries?sid=${sid}`);
        const result = await res.json();
        if (result.success) {
            container.innerHTML = result.data.map(c => `
                <div onclick="selectCountry('${c.name}', ${JSON.stringify(c.pricelist).replace(/"/g, '&quot;')}, '${c.number_id}')" class="galaxy-card p-4 rounded-2xl flex justify-between items-center cursor-pointer mb-3">
                    <div class="flex items-center gap-4">
                        <img src="${c.img}" class="w-6 h-4 object-cover rounded-sm">
                        <div>
                            <div class="text-sm font-bold text-white">${c.name}</div>
                            <div class="text-[9px] text-gray-500">Stok: ${c.stock_total}</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-gray-700"></i>
                </div>
            `).join('');
        }
    } catch (e) { container.innerHTML = 'Error API'; }
}

async function selectCountry(cname, pricelist, countryNumberId) {
    selectedOrder.country_name = cname;
    selectedOrder.number_id = countryNumberId; 
    nextOrderStep(3);
    const container = document.getElementById('list-servers-modal');
    container.innerHTML = '<div class="text-center p-5">MEMUAT...</div>';
    
    try {
        const res = await fetch(`/api/nokos/operators?country=${cname}&provider_id=${pricelist[0].provider_id}`);
        const result = await res.json();
        
        let opHtml = `<div class="grid grid-cols-3 gap-2 mb-4">`;
        if(result.success) {
            result.data.forEach(op => {
                opHtml += `<div onclick="setOp(${op.id}, this)" class="op-item p-2 border border-white/10 rounded-xl text-center cursor-pointer transition">
                    <img src="${op.image}" class="w-6 h-6 mx-auto mb-1 rounded-full object-cover"><div class="text-[8px] font-bold uppercase">${op.name}</div></div>`;
            });
        }
        opHtml += `</div>`;

        // --- BAGIAN VISUAL CORET HARGA ---
        let serverHtml = pricelist.map(p => {
            const hargaFinal = p.price_user || p.price;
            
            // Kita hitung harga "Normal" (asumsi margin 20%) untuk dicoret jika user adalah reseller
            // Rumus: (Harga_Pusat + 20%)
            // Karena p.price adalah harga modal dari pusat:
            const hargaNormal = Math.ceil(p.price + (p.price * 20 / 100));
            
            // Cek apakah harga saat ini lebih murah dari harga normal (berarti diskon reseller aktif)
            const isDiscounted = hargaFinal < hargaNormal;

            return `
            <div onclick="confirmStep('${p.server_id}', '${p.provider_id}', ${hargaFinal})" class="galaxy-card p-4 rounded-2xl mb-2 flex justify-between border-l-4 border-purple-500 cursor-pointer active:scale-95 transition">
                <div>
                    <div class="text-xs font-bold uppercase text-white">Server ${p.server_id}</div>
                    ${isDiscounted ? `<div class="text-[8px] text-gray-500 line-through">Rp ${hargaNormal.toLocaleString()}</div>` : ''}
                </div>
                <div class="text-right">
                    <div class="text-xs font-bold text-purple-400 font-mono">Rp ${hargaFinal.toLocaleString()}</div>
                    ${isDiscounted ? `<div class="text-[7px] bg-green-500/20 text-green-400 px-1 rounded uppercase font-bold mt-1 inline-block">Hemat 12%</div>` : ''}
                </div>
            </div>`;
        }).join('');
        // ---------------------------------

        container.innerHTML = opHtml + serverHtml;
    } catch (e) { 
        container.innerHTML = 'Error'; 
    }
}

function setOp(id, el) {
    selectedOperatorId = id;
    document.querySelectorAll('.op-item').forEach(i => i.classList.remove('bg-purple-600', 'border-purple-600'));
    el.classList.add('bg-purple-600', 'border-purple-600');
}

function confirmStep(serverId, providerId, price) {
    selectedOrder.server_id = serverId;
    selectedOrder.provider_id = providerId;
    selectedOrder.price = price;
    document.getElementById('res-app').innerText = selectedOrder.service_name;
    document.getElementById('res-country').innerText = selectedOrder.country_name;
    document.getElementById('res-server').innerText = "Server " + serverId;
    document.getElementById('res-price').innerText = "Rp " + price.toLocaleString();
    nextOrderStep(4);
}

async function confirmPurchase() {
    const btn = document.getElementById('btn-final-buy');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> MEMPROSES...';
    
    const payload = {
        number_id: selectedOrder.number_id, 
        provider_id: selectedOrder.provider_id,
        operator_id: selectedOperatorId, 
        price: selectedOrder.price, 
        service_name: selectedOrder.service_name
    };

    try {
        const res = await fetch('/api/nokos/order', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.success) {
            const newOrder = {
                // KUNCI UTAMA: Ambil invoiceId dari hasil generate backend pro kita
                order_id: result.invoiceId || result.data.order_id, 
                phone_number: result.data.phone_number,
                service: selectedOrder.service_name, 
                country: selectedOrder.country_name,
                status: 'received', 
                otp_code: null
            };

            activeOrders.unshift(newOrder);
            saveOrders(); // SIMPAN KE BROWSER BIAR GAK HILANG REFRESH
            closeOrderModal();
            switchView('order'); 
            renderPendingOrders(); 
            
            // Polling sekarang pake Invoice ID, database pasti nemu
            startOtpPolling(newOrder.order_id);
            startTimer(newOrder.order_id, 1200);

            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: 'Pesanan masuk, silakan tunggu OTP di halaman order.',
                background: '#0f172a',
                color: '#fff',
                confirmButtonColor: '#7c3aed'
            });
        } else {
            Swal.fire('Gagal', result.msg || "Terjadi kesalahan", 'error');
        }
    } catch (e) { 
        Swal.fire('Error', 'Koneksi Gagal ke Server', 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerText = "BELI SEKARANG"; 
    }
}
// ==========================================
// 4. PESANAN PENDING & POLLING (FIXED)
// ==========================================

function renderPendingOrders() {
    const container = document.getElementById('pending-orders-list');
    if (!container) return;

    if (activeOrders.length === 0) {
        container.innerHTML = '<div class="galaxy-card p-8 rounded-2xl text-center opacity-30 italic text-[10px]">Belum ada pesanan pending.</div>';
        return;
    }

    container.innerHTML = activeOrders.map(order => {
        // Cek apakah OTP sudah ada (handle smsCode dari backend atau otp_code lokal)
        const currentOtp = order.otp_code || order.smsCode;
        const isWaiting = order.status === 'waiting' || order.status === 'received';

        return `
        <div class="galaxy-card p-4 rounded-2xl border-l-4 ${currentOtp ? 'border-green-500' : 'border-purple-500'} mb-3">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="text-[10px] font-bold text-white uppercase">${order.service} • ${order.country}</div>
                    <div class="text-sm font-mono text-purple-400 mt-1">${order.phone_number}</div>
                </div>
                <button onclick="copyText('${order.phone_number}')" class="bg-white/5 p-2 rounded-lg text-[10px]"><i class="fa-solid fa-copy"></i></button>
            </div>
            
            <div class="bg-white/5 rounded-xl p-3 text-center border ${currentOtp ? 'border-green-500/50' : 'border-white/5'}">
                <span class="text-[8px] text-gray-500 block mb-1 uppercase">${currentOtp ? 'OTP DITERIMA' : 'MENUNGGU SMS'}</span>
                <div class="text-xl font-bold ${currentOtp ? 'text-green-400' : 'text-white'}" id="otp-${order.order_id}">
                    ${currentOtp ? currentOtp : '<i class="fa-solid fa-spinner fa-spin text-sm opacity-20"></i>'}
                </div>
            </div>

            <div class="mt-3 flex justify-between items-center text-[9px]">
                <div id="timer-${order.order_id}" class="text-gray-500 font-mono">
                    ${order.status === 'success' ? 'Selesai' : (order.status === 'canceled' ? 'Dibatalkan' : '--:--')}
                </div>
                
                <div class="flex gap-2">
                    ${currentOtp 
                        ? `<button onclick="copyText('${currentOtp}')" class="text-green-500 font-bold uppercase">Salin OTP</button>` 
                        : (isWaiting ? `<button onclick="cancelOrder('${order.order_id}')" class="text-red-500 font-bold uppercase">Batalkan</button>` : '')
                    }
                </div>
            </div>
        </div>
    `}).join('');

    // KUNCI UTAMA: Jalankan polling otomatis untuk semua order yang statusnya masih waiting
    activeOrders.forEach(order => {
        if (order.status === 'waiting' || order.status === 'received') {
            // Kita panggil polling. Polling ini nanti yang bakal panggil startTimer 
            // berdasarkan remainingSeconds dari database.
            startOtpPolling(order.order_id);
        }
    });
}

function startOtpPolling(invoiceId) {
    console.log("Memulai polling untuk:", invoiceId);
    
    const pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/nokos/status/${invoiceId}`);
            const result = await res.json();

            if (result.success && result.data) {
                const order = result.data;

                // 1. UPDATE KODE OTP DI UI
                const otpElement = document.getElementById(`otp-${invoiceId}`);
                if (otpElement && order.smsCode && order.smsCode !== '-') {
                    otpElement.innerText = order.smsCode;
                    otpElement.classList.add('text-green-400', 'font-bold');
                    // Opsional: Berhenti polling kalau OTP sudah dapet biar hemat resource
                    // clearInterval(pollInterval); 
                }

                // 2. UPDATE TIMER (HANYA JIKA BELUM JALAN)
                // Kita cek apakah window[`interval_${invoiceId}`] sudah ada atau belum
                if (order.remainingSeconds > 0 && order.status === 'waiting') {
                    if (!window[`interval_${invoiceId}`]) { 
                        startTimer(invoiceId, order.remainingSeconds);
                    }
                }

                // 3. STOP JIKA SELESAI/BATAL
                if (order.status === 'success' || order.status === 'canceled') {
                    clearInterval(pollInterval);
                    if(window[`interval_${invoiceId}`]) {
                        clearInterval(window[`interval_${invoiceId}`]);
                        window[`interval_${invoiceId}`] = null; // Reset pointer
                    }
                    renderPendingOrders(); 
                }
            }
        } catch (e) {
            console.error("Polling error:", e);
        }
    }, 5000);
}

// Helper buat update data di array lokal biar UI langsung berubah
function updateOrderInList(updatedOrder) {
    const idx = activeOrders.findIndex(o => o.order_id === updatedOrder.invoiceId);
    if (idx !== -1) {
        activeOrders[idx].otp_code = updatedOrder.smsCode;
        activeOrders[idx].status = updatedOrder.status;
        renderPendingOrders(); // Panggil fungsi render HTML lo
    }
}

function startTimer(invoiceId, seconds) {
    const timerElement = document.getElementById(`timer-${invoiceId}`);
    if (!timerElement) return;

    // Bersihkan interval lama jika ada biar gak tumpang tindih
    if (window[`interval_${invoiceId}`]) clearInterval(window[`interval_${invoiceId}`]);

    let timeLeft = seconds;

    window[`interval_${invoiceId}`] = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(window[`interval_${invoiceId}`]);
            timerElement.innerText = "EXPIRED";
            return;
        }

        timeLeft--;
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerElement.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);
}

async function cancelOrder(orderId) {
    Swal.fire({
        title: 'Membatalkan...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        background: '#0c0c0e', color: '#fff'
    });

    try {
        const res = await fetch('/api/nokos/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        const result = await res.json();

        if (result.success) {
            // Hapus data lokal & update UI
            activeOrders = activeOrders.filter(order => order.order_id !== orderId);
            localStorage.setItem('activeNokosOrders', JSON.stringify(activeOrders));
            
            if (typeof renderPendingOrders === 'function') renderPendingOrders();
            if (typeof loadUserProfile === 'function') loadUserProfile();

            Swal.fire({
                icon: 'success',
                title: 'Dibatalkan',
                text: 'Pesanan dibatalkan dan saldo telah dikembalikan.',
                background: '#0c0c0e', color: '#fff'
            });
        } else {
            // LOGIKA BARU: Tangkap kode 'WAIT' (Belum 3 Menit)
            if (result.code === 'WAIT') {
                Swal.fire({
                    icon: 'warning',
                    title: 'Belum Bisa Batal',
                    text: result.msg,
                    background: '#0c0c0e', color: '#fff',
                    confirmButtonColor: '#d97706',
                    confirmButtonText: 'Oke, Saya Tunggu'
                });
            } else {
                // Error biasa
                Swal.fire('Gagal', result.msg, 'error');
            }
        }
    } catch (e) {
        Swal.fire('Error', 'Sistem sedang sibuk', 'error');
    }
}

function copyText(txt) {
    navigator.clipboard.writeText(txt);
    Toast.fire({ icon: 'success', title: 'Teks Disalin!' });
}

// Fungsi untuk Load History dari Database
// ==========================================
// 1. FUNGSI LOAD HISTORY (MUTASI SALDO UI)
// ==========================================
async function loadOrderHistory() {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-10 opacity-50 text-[10px]">MEMUAT RIWAYAT...</div>';

    try {
        const res = await fetch('/api/nokos/history');
        const result = await res.json();

        if (result.success && result.data.length > 0) {
            container.innerHTML = result.data.map(tx => {
                let statusColor = 'text-yellow-500';
                if (tx.status === 'success') statusColor = 'text-green-500';
                else if (tx.status === 'canceled' || tx.status === 'expired') statusColor = 'text-red-500';

                const d = new Date(tx.date);
                const dateStr = `${d.getDate()} ${d.toLocaleString('id-ID', {month:'short'})}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

                if (tx.type === 'topup') {
                    // TAMPILAN TOP UP (UANG MASUK)
                    return `
                    <div class="galaxy-card p-4 rounded-2xl mb-3 border-l-2 border-green-500">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500"><i class="fa-solid fa-arrow-down text-sm"></i></div>
                                <div>
                                    <div class="text-[9px] font-bold text-gray-500 uppercase">${dateStr}</div>
                                    <div class="text-sm font-bold text-white">${tx.title}</div>
                                </div>
                            </div>
                            <div class="text-[9px] font-bold uppercase ${statusColor}">${tx.status}</div>
                        </div>
                        <div class="flex justify-between items-center bg-white/5 p-2 rounded-xl mt-2">
                            <div class="text-xs font-mono text-gray-400">${tx.desc}</div>
                            <div class="text-xs font-bold text-green-400">+ Rp ${tx.amount.toLocaleString('id-ID')}</div>
                        </div>
                    </div>
                    `;
                } else {
                    // TAMPILAN NOKOS (UANG KELUAR)
                    return `
                    <div class="galaxy-card p-4 rounded-2xl mb-3 border-l-2 ${tx.status === 'success' ? 'border-purple-500' : 'border-white/10'}">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500"><i class="fa-solid fa-arrow-up text-sm"></i></div>
                                <div>
                                    <div class="text-[9px] font-bold text-gray-500 uppercase">${dateStr}</div>
                                    <div class="text-sm font-bold text-white">${tx.title}</div>
                                </div>
                            </div>
                            <div class="text-[9px] font-bold uppercase ${statusColor}">${tx.status}</div>
                        </div>
                        <div class="flex justify-between items-center bg-white/5 p-2 rounded-xl mt-2">
                            <div class="text-xs font-mono text-purple-400">${tx.desc}</div>
                            <div class="text-xs font-bold text-red-400">- Rp ${tx.amount.toLocaleString('id-ID')}</div>
                        </div>
                        ${tx.status === 'success' && tx.smsCode ? `
                        <div class="mt-3 text-center bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                            <span class="text-[9px] text-gray-400 uppercase tracking-widest block mb-1">KODE OTP:</span>
                            <div class="text-xl font-bold text-white tracking-widest">${tx.smsCode}</div>
                        </div>
                        <button onclick="copyText('${tx.smsCode}')" class="w-full mt-2 py-3 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-xl transition uppercase tracking-widest shadow-lg shadow-purple-900/40">
                            Salin Kode OTP
                        </button>
                        ` : ''}
                    </div>
                    `;
                }
            }).join('');
        } else {
            container.innerHTML = '<div class="text-center py-10 opacity-30 italic text-[10px]">Belum ada riwayat transaksi.</div>';
        }
    } catch (e) {
        container.innerHTML = '<div class="text-center py-10 text-red-500 text-[10px]">Gagal mengambil data.</div>';
    }
}


// Fungsi untuk update tampilan Card Membership
function updateMembershipUI(userData) {
    const roleBadge = document.getElementById('user-role-badge');
    const title = document.getElementById('membership-title');
    const desc = document.getElementById('membership-desc');
    const price = document.getElementById('membership-price');
    const btn = document.getElementById('btn-upgrade');
    const expiryInfo = document.getElementById('reseller-expiry-info');
    const expiryDate = document.getElementById('expiry-date');
    const statusLabel = document.getElementById('membership-status-label');

    if (userData.role === 'reseller' || userData.role === 'admin') {
        // Tampilan Jika Sudah Reseller
        roleBadge.innerText = 'RESELLER PRO';
        roleBadge.className = 'px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase bg-gradient-to-r from-amber-400 to-yellow-600 text-black shadow-lg shadow-yellow-500/20';
        
        title.innerText = 'Membership Aktif';
        desc.innerText = 'Nikmati harga khusus Reseller pada setiap pembelian layanan Nokos.';
        
        statusLabel.innerText = 'Perpanjang Masa Aktif';
        price.innerText = 'Rp 10.000';
        btn.innerText = 'PERPANJANG';
        btn.className = 'bg-purple-600 text-white text-[10px] font-bold px-4 py-2 rounded-xl active:scale-95 transition';

        if (userData.resellerUntil) {
            expiryInfo.classList.remove('hidden');
            const date = new Date(userData.resellerUntil);
            expiryDate.innerText = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        }
    } else {
        // Tampilan Default (Member Biasa)
        roleBadge.innerText = 'MEMBER BIASA';
        roleBadge.className = 'px-2 py-0.5 rounded-full text-[8px] font-bold tracking-widest uppercase bg-gray-600 text-white';
        expiryInfo.classList.add('hidden');
    }
}


function openUpgradeModal() {
    Swal.fire({
        title: '',
        html: `
            <div class="text-left p-2">
                <div class="relative overflow-hidden rounded-2xl p-6 mb-6 bg-gradient-to-br from-amber-600 to-amber-900 shadow-lg shadow-amber-900/20">
                    <div class="absolute -top-5 -right-5 opacity-20 text-6xl rotate-12">
                        <i class="fa-solid fa-crown"></i>
                    </div>
                    <span class="bg-white/20 text-white text-[8px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">Reseller Tier</span>
                    <h2 class="text-2xl font-bold text-white mt-2">Menjadi Reseller Pro</h2>
                    <p class="text-[10px] text-amber-100/80 mt-1">Tingkatkan profitmu dengan harga layanan termurah.</p>
                </div>

                <div class="space-y-4 mb-8">
                    <div class="flex items-start gap-4">
                        <div class="w-6 h-6 rounded-lg bg-green-500/20 flex-shrink-0 flex items-center justify-center text-green-500 text-xs">
                            <i class="fa-solid fa-check"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-white">Potongan Harga 12%</h4>
                            <p class="text-[9px] text-gray-500">Otomatis mendapatkan margin reseller (8%) di setiap layanan.</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-4">
                        <div class="w-6 h-6 rounded-lg bg-blue-500/20 flex-shrink-0 flex items-center justify-center text-blue-500 text-xs">
                            <i class="fa-solid fa-bolt"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-white">Prioritas Server</h4>
                            <p class="text-[9px] text-gray-500">Akses lebih cepat dan stabil untuk pengambilan nomor OTP.</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-4">
                        <div class="w-6 h-6 rounded-lg bg-purple-500/20 flex-shrink-0 flex items-center justify-center text-purple-500 text-xs">
                            <i class="fa-solid fa-gem"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-white">Masa Aktif 30 Hari</h4>
                            <p class="text-[9px] text-gray-500">Dapat diperpanjang kapan saja dan masa aktif bersifat akumulatif.</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                        <span class="text-[8px] text-gray-500 block uppercase font-bold">Total Biaya</span>
                        <span class="text-lg font-bold text-white font-mono">Rp 10.000</span>
                    </div>
                    <button onclick="processUpgrade()" class="bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] px-6 py-3 rounded-xl transition active:scale-95 shadow-lg shadow-amber-500/20">
                        AKTIFKAN SEKARANG
                    </button>
                </div>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        background: '#0c0c0e',
        color: '#fff',
        width: '400px',
        padding: '1rem',
        customClass: {
            popup: 'rounded-3xl border border-white/10'
        }
    });
}

// Fungsi eksekusi (panggil API yang sudah kita buat tadi)
async function processUpgrade() {
    Swal.fire({
        title: 'Memproses...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        background: '#0c0c0e',
        color: '#fff'
    });

    try {
        const res = await fetch('/api/nokos/upgrade/reseller', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Selamat!',
                text: data.msg,
                background: '#0c0c0e',
                color: '#fff',
                confirmButtonColor: '#d97706'
            }).then(() => location.reload());
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Gagal',
                text: data.msg,
                background: '#0c0c0e',
                color: '#fff'
            });
        }
    } catch (e) {
        Swal.fire('Error', 'Terjadi kesalahan sistem', 'error');
    }
}

async function loadUserProfile() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        
        // Cek apakah kita di halaman auth.html atau bukan
        const isAuthPage = window.location.pathname.includes('auth.html');

        if (data.login && data.user) {
            const user = data.user;
            
            // 1. Update Username & Saldo (Pake Pengecekan Aman)
            const elUsername = document.getElementById('profile-username');
            const elBalance = document.getElementById('profile-balance');
            
            if (elUsername) elUsername.innerText = user.username;
            if (elBalance) elBalance.innerText = `Rp ${user.balance.toLocaleString('id-ID')}`;
            
            // 2. Update Role Badge & Status
            const roleBadge = document.getElementById('user-role-badge');
            const profileStatus = document.getElementById('profile-status');
            
            if (roleBadge) {
                // Reset class biar bersih
                roleBadge.className = "absolute -bottom-2 -right-2 px-3 py-1 text-[10px] font-bold rounded-full border-2 border-[#050505] uppercase tracking-tighter text-white";
                
                if (user.role === 'reseller') {
                    roleBadge.innerText = 'RESELLER PRO';
                    roleBadge.classList.add('bg-amber-500');
                    if (profileStatus && user.resellerUntil) {
                        const d = new Date(user.resellerUntil);
                        profileStatus.innerText = d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
                    }
                } else if (user.role === 'admin') {
                    roleBadge.innerText = 'ADMIN';
                    roleBadge.classList.add('bg-red-500');
                    if (profileStatus) profileStatus.innerText = 'SELAMANYA';
                } else {
                    roleBadge.innerText = 'MEMBER';
                    roleBadge.classList.add('bg-purple-600');
                    if (profileStatus) profileStatus.innerText = 'SELAMANYA';
                }
            }

            // 3. Jalankan UI Upgrade (Jika ada)
            if (typeof updateMembershipUI === "function") {
                updateMembershipUI(user);
            }

            // Kalau di halaman login tapi udah ada sesi, lempar ke dashboard
            if (isAuthPage) {
                window.location.href = 'index.html';
            }

        } else {
            // JIKA TIDAK LOGIN:
            // Lempar ke auth.html HANYA JIKA sedang tidak di halaman auth
            if (!isAuthPage) {
                window.location.href = 'auth.html';
            }
        }
    } catch (e) {
        console.error("Gagal memuat profil:", e);
    }
}