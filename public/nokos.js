// ==========================================
// 1. DATA STATE & CONFIG
// ==========================================
let currentOrderStep = 1;
let selectedOperatorId = 1; // Default: Any Operator
let selectedOrder = {
    service_id: '',
    service_name: '',
    country_name: '',
    provider_id: '',
    server_id: '',
    price: 0
};
let activeOrders = []; // List pesanan pending

// ==========================================
// 2. LOGIKA MODAL & STEP NAVIGATION
// ==========================================

async function openOrderModal() {
    const modal = document.getElementById('modal-order');
    const sheet = document.getElementById('order-sheet');
    if(!modal || !sheet) return;

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
    const targetStep = document.getElementById(`order-step-${step}`);
    if(targetStep) targetStep.classList.remove('hidden');
    updateOrderHeader();
}

function resetOrderSteps() {
    currentOrderStep = 1;
    nextOrderStep(1);
}

function updateOrderHeader() {
    const titles = ["", "Pilih Aplikasi", "Pilih Negara", "Pilih Server", "Konfirmasi"];
    document.getElementById('modal-order-title').innerText = titles[currentOrderStep];
    const btnBack = document.getElementById('btn-back-order');
    if (currentOrderStep > 1) btnBack.classList.remove('opacity-0', 'pointer-events-none');
    else btnBack.classList.add('opacity-0', 'pointer-events-none');
}

// ==========================================
// 3. INTEGRASI API (STEP 1 - 4)
// ==========================================

async function loadServices() {
    const container = document.getElementById('list-apps-modal');
    container.innerHTML = '<div class="col-span-3 text-center py-10 opacity-50 text-[10px] uppercase">Memuat Layanan...</div>';
    
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
    container.innerHTML = '<div class="text-center py-10 opacity-50 text-[10px] uppercase">Mencari Negara...</div>';
    
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

function selectCountry(cname, pricelist) {
    selectedOrder.country_name = cname;
    nextOrderStep(3);

    const container = document.getElementById('list-servers-modal');
    container.innerHTML = pricelist.map(p => `
        <div onclick="confirmStep('${p.server_id}', '${p.provider_id}', ${p.price_user || p.price})" class="galaxy-card p-4 rounded-2xl flex justify-between items-center cursor-pointer border-l-4 border-purple-500 bg-purple-500/5 transition mb-2">
            <div>
                <div class="text-xs font-bold text-white uppercase">SERVER ${p.server_id}</div>
                <div class="text-[9px] text-gray-500">ID Provider: ${p.provider_id}</div>
            </div>
            <div class="text-sm font-bold text-purple-400 font-mono">Rp ${(p.price_user || p.price).toLocaleString()}</div>
        </div>
    `).join('');
}

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

// FINAL: Proses Beli
async function confirmPurchase() {
    const btn = document.getElementById('btn-final-buy');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> MEMPROSES...';

    try {
        const res = await fetch('/api/nokos/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                number_id: selectedOrder.service_id, 
                provider_id: selectedOrder.provider_id,
                operator_id: selectedOperatorId,
                price: selectedOrder.price,
                service_name: selectedOrder.service_name
            })
        });

        const result = await res.json();

        if (result.success) {
            const newOrder = {
                order_id: result.data.order_id,
                phone_number: result.data.phone_number,
                service: selectedOrder.service_name,
                country: selectedOrder.country_name,
                status: 'received',
                otp_code: null
            };
            
            activeOrders.unshift(newOrder);
            closeOrderModal();
            switchView('order'); 
            renderPendingOrders(); 
            startOtpPolling(newOrder.order_id);
            startTimer(newOrder.order_id, 1200);

            alert("Pesanan Berhasil!");
        } else {
            alert("Gagal: " + (result.msg || result.message));
        }
    } catch (e) {
        alert("Koneksi Error!");
    } finally {
        btn.disabled = false;
        btn.innerText = "BELI SEKARANG";
    }
}

// ==========================================
// 4. PESANAN PENDING & POLLING
// ==========================================

function renderPendingOrders() {
    const container = document.getElementById('pending-orders-list');
    if (!container) return;

    if (activeOrders.length === 0) {
        container.innerHTML = '<div class="galaxy-card p-8 rounded-2xl text-center opacity-30 italic text-[10px]">Belum ada pesanan pending.</div>';
        return;
    }

    container.innerHTML = activeOrders.map(order => `
        <div class="galaxy-card p-4 rounded-2xl border-l-4 border-purple-500 mb-3">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="text-[10px] font-bold text-white uppercase">${order.service} • ${order.country}</div>
                    <div class="text-sm font-mono text-purple-400 mt-1">${order.phone_number}</div>
                </div>
                <button onclick="navigator.clipboard.writeText('${order.phone_number}')" class="bg-white/5 p-2 rounded-lg text-[10px]"><i class="fa-solid fa-copy"></i></button>
            </div>
            <div class="bg-white/5 rounded-xl p-3 text-center">
                <span class="text-[8px] text-gray-500 block mb-1">KODE OTP</span>
                <div class="text-xl font-bold text-white" id="otp-${order.order_id}">${order.otp_code || '---'}</div>
            </div>
            <div class="mt-3 flex justify-between items-center text-[9px]">
                <div id="timer-${order.order_id}" class="text-gray-500 font-mono">20:00</div>
                <button onclick="cancelOrder('${order.order_id}')" class="text-red-500 font-bold uppercase">Batalkan</button>
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
                    renderPendingOrders();
                    clearInterval(poll);
                }
            }
            if (!activeOrders.find(o => o.order_id === orderId)) clearInterval(poll);
        } catch (e) { }
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

// Fungsi Batal
async function cancelOrder(orderId) {
    if (!confirm("Batalkan pesanan? Saldo akan kembali.")) return;
    try {
        const res = await fetch('/api/nokos/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        });
        const result = await res.json();
        if (result.success) {
            activeOrders = activeOrders.filter(o => o.order_id !== orderId);
            renderPendingOrders();
            location.reload(); 
        }
    } catch (e) { alert("Error koneksi"); }
}