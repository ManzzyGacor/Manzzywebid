// ==========================================
// 1. DATA STATE & CONFIG
// ==========================================
let currentOrderStep = 1;
let selectedOrder = {
    service_id: '',
    service_name: '',
    country_name: '',
    number_id: '',
    provider_id: '',
    server_id: '',
    price: 0
};
let activeOrders = []; // Menampung pesanan yang sedang nunggu OTP

// ==========================================
// 2. LOGIKA MODAL & STEP NAVIGATION
// ==========================================

async function openOrderModal() {
    const modal = document.getElementById('modal-order');
    const sheet = document.getElementById('order-sheet');
    modal.classList.remove('hidden');
    setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
    
    resetOrderSteps();
    await loadServices(); // Langsung load layanan saat buka modal
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
    updateOrderHeader();
}

function prevOrderStep() {
    if (currentOrderStep > 1) {
        currentOrderStep--;
        nextOrderStep(currentOrderStep);
    }
}

function updateOrderHeader() {
    const titles = ["", "Pilih Aplikasi", "Pilih Negara", "Pilih Server", "Konfirmasi"];
    document.getElementById('modal-order-title').innerText = titles[currentOrderStep];
    const btnBack = document.getElementById('btn-back-order');
    if (currentOrderStep > 1) btnBack.classList.remove('opacity-0', 'pointer-events-none');
    else btnBack.classList.add('opacity-0', 'pointer-events-none');
}

function resetOrderSteps() {
    currentOrderStep = 1;
    updateOrderHeader();
}

// ==========================================
// 3. INTEGRASI API RUMAHOTP (STEP 1 - 4)
// ==========================================

// STEP 1: Load Services
async function loadServices() {
    const container = document.getElementById('list-apps-modal');
    container.innerHTML = '<div class="col-span-3 text-center py-10 opacity-50 text-[10px] uppercase tracking-widest">Memuat Layanan...</div>';
    
    try {
        const res = await fetch('/api/nokos/services');
        const result = await res.json();
        if (result.success) {
            container.innerHTML = result.data.map(app => `
                <div onclick="selectService(${app.service_code}, '${app.service_name}')" class="galaxy-card p-4 rounded-2xl flex flex-col items-center gap-2 cursor-pointer transition active:scale-95">
                    <img src="${app.service_img}" class="w-8 h-8 object-contain">
                    <span class="text-[9px] font-bold uppercase tracking-tighter text-center">${app.service_name}</span>
                </div>
            `).join('');
        }
    } catch (e) { container.innerHTML = '<div class="col-span-3 text-red-500 text-[10px]">Gagal memuat API</div>'; }
}

// STEP 2: Select Service -> Load Countries
async function selectService(sid, sname) {
    selectedOrder.service_id = sid;
    selectedOrder.service_name = sname;
    nextOrderStep(2);

    const container = document.getElementById('list-countries-modal');
    container.innerHTML = '<div class="text-center py-10 opacity-50 text-[10px] uppercase tracking-widest">Mencari Negara...</div>';
    
    try {
        const res = await fetch(`/api/nokos/countries?sid=${sid}`);
        const result = await res.json();
        if (result.success) {
            container.innerHTML = result.data.map(c => `
                <div onclick="selectCountry('${c.name}', ${JSON.stringify(c.pricelist).replace(/"/g, '&quot;')})" class="galaxy-card p-4 rounded-2xl flex justify-between items-center cursor-pointer hover:border-purple-500 transition mb-3">
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

// STEP 3: Select Country -> Load Servers/Price
function selectCountry(cname, pricelist) {
    selectedOrder.country_name = cname;
    nextOrderStep(3);

    const container = document.getElementById('list-servers-modal');
    container.innerHTML = pricelist.map(p => `
        <div onclick="confirmStep('${p.server_id}', '${p.provider_id}', ${p.price_user || p.price})" class="galaxy-card p-4 rounded-2xl flex justify-between items-center cursor-pointer border-l-4 border-purple-500 bg-purple-500/5 transition">
            <div>
                <div class="text-xs font-bold text-white uppercase">SERVER ${p.server_id}</div>
                <div class="text-[9px] text-gray-500">ID Provider: ${p.provider_id}</div>
            </div>
            <div class="text-sm font-bold text-purple-400 font-mono">Rp ${(p.price_user || p.price).toLocaleString()}</div>
        </div>
    `).join('');
}

// STEP 4: Confirmation Data Setup
function confirmStep(serverId, providerId, price) {
    selectedOrder.server_id = serverId;
    selectedOrder.provider_id = providerId;
    selectedOrder.price = price;
    
    document.getElementById('res-app').innerText = selectedOrder.service_name;
    document.getElementById('res-country').innerText = selectedOrder.country_name;
    document.getElementById('res-server').innerText = "SERVER " + serverId;
    document.getElementById('res-price').innerText = "Rp " + price.toLocaleString();
    
    nextOrderStep(4);
}

// FINAL: Proses Beli (Confirm Purchase)
async function confirmPurchase() {
    const btn = document.getElementById('btn-final-buy');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> MEMPROSES...';

    try {
        const res = await fetch('/api/nokos/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number_id: selectedOrder.number_id,
                provider_id: selectedOrder.provider_id,
                operator_id: selectedOperatorId,
                price: selectedOrder.price,
                service_name: selectedOrder.service_name
            })
        });

        const result = await res.json();

        if (result.success) {
            // MASUKKAN DATA KE LIST PENDING
            const newOrder = {
                order_id: result.data.order_id,
                phone_number: result.data.phone_number,
                service: result.data.service || selectedOrder.service_name,
                country: result.data.country || selectedOrder.country_name,
                status: 'received',
                otp_code: null
            };
            
            // Tambahkan ke array urutan paling atas
            activeOrders.unshift(newOrder);
            
            // TUTUP MODAL & PINDAH KE HALAMAN ORDER
            closeOrderModal();
            switchView('order'); 
            
            // JALANKAN FUNGSI RENDER & POLLING
            renderPendingOrders(); 
            startOtpPolling(newOrder.order_id);
            startTimer(newOrder.order_id, 1200); // 20 Menit

            alert("Pesanan Berhasil! Silakan tunggu OTP.");
        } else {
            alert("Gagal: " + (result.msg || result.message));
            btn.disabled = false;
            btn.innerText = "BELI SEKARANG";
        }
    } catch (e) {
        alert("Koneksi Error!");
        btn.disabled = false;
        btn.innerText = "BELI SEKARANG";
    }
}
// ==========================================
// 4. PESANAN PENDING, TIMER, & OTP POLLING
// ==========================================

function renderPendingOrders() {
    const container = document.getElementById('pending-orders-list');
    if (!container) return;

    if (activeOrders.length === 0) {
        container.innerHTML = `
            <div class="galaxy-card p-8 rounded-2xl text-center opacity-30 italic text-[10px]">
                Belum ada pesanan pending.
            </div>`;
        return;
    }

    container.innerHTML = activeOrders.map(order => `
        <div class="galaxy-card p-4 rounded-2xl border-l-4 border-purple-500 mb-3 relative overflow-hidden">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="text-[10px] font-bold text-white uppercase tracking-wider">
                        ${order.service} • ${order.country}
                    </div>
                    <div class="text-sm font-mono text-purple-400 mt-1" id="num-${order.order_id}">
                        ${order.phone_number}
                    </div>
                </div>
                <button onclick="copyText('${order.phone_number}')" class="bg-white/5 p-2 rounded-lg text-[10px] hover:bg-purple-600 transition">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>

            <div class="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                <span class="text-[8px] text-gray-500 uppercase block mb-1">Kode OTP</span>
                <div class="text-xl font-bold tracking-[0.3em] text-white" id="otp-${order.order_id}">
                    ${order.otp_code ? order.otp_code : '<i class="fa-solid fa-spinner fa-spin text-sm opacity-20"></i>'}
                </div>
                ${order.otp_code ? `
                    <button onclick="copyText('${order.otp_code}')" class="mt-2 text-[9px] text-purple-400 font-bold uppercase tracking-widest">
                        Salin OTP
                    </button>` : ''}
            </div>

            <div class="mt-3 flex justify-between items-center px-1">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-clock text-[9px] text-gray-600"></i>
                    <div class="text-[9px] text-gray-500 font-mono" id="timer-${order.order_id}">20:00</div>
                </div>
                
                <div class="flex gap-2">
                    ${!order.otp_code ? `
                        <button onclick="cancelOrder('${order.order_id}')" class="text-[9px] text-red-500 font-bold uppercase hover:bg-red-500/10 px-2 py-1 rounded-lg transition">
                            Batalkan
                        </button>
                    ` : `
                        <span class="text-[9px] text-green-500 font-bold uppercase">Selesai</span>
                    `}
                </div>
            </div>
        </div>
    `).join('');
}

function startOtpPolling(orderId) {
    const poll = setInterval(async () => {
        try {
            const res = await fetch(`/api/nokos/status/${orderId}`);
            const result = await res.json();

            if (result.success && result.data.otp_code) {
                const order = activeOrders.find(o => o.order_id === orderId);
                if (order) {
                    order.otp_code = result.data.otp_code;
                    order.status = 'completed';
                    renderPendingOrders();
                    clearInterval(poll);
                    // Update saldo user di UI setelah sukses
                    loadBranding(); 
                }
            }
            
            // Berhenti jika sudah tidak ada di list (expired/cancel)
            if (!activeOrders.find(o => o.order_id === orderId)) clearInterval(poll);
        } catch (e) { console.error("Poll Error"); }
    }, 5000);
}

function startTimer(orderId, duration) {
    let timer = duration;
    const interval = setInterval(() => {
        let m = Math.floor(timer / 60);
        let s = timer % 60;
        const display = document.getElementById(`timer-${orderId}`);
        if (display) display.innerText = `${m}:${s < 10 ? '0'+s : s}`;

        if (--timer < 0) {
            clearInterval(interval);
            activeOrders = activeOrders.filter(o => o.order_id !== orderId);
            renderPendingOrders();
        }
    }, 1000);
}

function copyText(txt) {
    navigator.clipboard.writeText(txt);
    // Tambahkan toast simpel jika ingin
}

// Fungsi Batalkan Pesanan
async function cancelOrder(orderId) {
    if (!confirm("Yakin ingin membatalkan pesanan ini? Saldo akan dikembalikan.")) return;

    try {
        const res = await fetch('/api/nokos/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        const result = await res.json();

        if (result.success) {
            alert(result.msg);
            // Hapus dari list pending lokal
            activeOrders = activeOrders.filter(o => o.order_id !== orderId);
            renderPendingOrders();
            // Update tampilan saldo di header
            loadBranding(); 
        } else {
            alert("Gagal batal: " + result.msg);
        }
    } catch (e) {
        alert("Terjadi kesalahan koneksi.");
    }
}