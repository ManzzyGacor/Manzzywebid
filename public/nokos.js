// ==========================================
// 1. DATA STATE & CONFIG
// ==========================================
let currentOrderStep = 1;
// TAMBAHKAN STATE BARU
let selectedOperatorId = 1; 
let selectedOrder = {
    service_id: '',
    service_name: '',
    country_name: '',
    provider_id: '', // Ini ID Negara dari RumahOTP
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
    updateOrderHeader();
}

function resetOrderSteps() {
    currentOrderStep = 1;
    nextOrderStep(1);
}

function updateOrderHeader() {
    const titles = ["", "Pilih Aplikasi", "Pilih Negara", "Pilih Server", "Konfirmasi"];
    document.getElementById('modal-order-title').innerText = titles[currentOrderStep];
}

// ==========================================
// 3. INTEGRASI API (STEP 1 - 4)
// ==========================================

// STEP 1: Load Apps
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

// STEP 2: Select App -> Load Countries
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
                <div onclick="selectCountry('${c.name}', ${JSON.stringify(c.pricelist).replace(/"/g, '&quot;')})" class="galaxy-card p-4 rounded-2xl flex justify-between items-center cursor-pointer mb-3">
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



// STEP 3: Pilih Country -> SEKARANG LOAD OPERATOR DULU (Bukan langsung Server)
async function selectCountry(cname, pricelist) {
    selectedOrder.country_name = cname;
    selectedOrder.pricelist_temp = pricelist; // Simpan sementara
    nextOrderStep(3);

    const container = document.getElementById('list-servers-modal');
    container.innerHTML = '<div class="text-center py-5 opacity-50 text-[10px]">MEMUAT OPERATOR...</div>';

    try {
        // Ambil list operator sesuai negara dan provider_id pertama
        const pId = pricelist[0].provider_id;
        const res = await fetch(`/api/nokos/operators?country=${cname}&provider_id=${pId}`);
        const result = await res.json();

        if (result.success) {
            // Tampilkan list operator
            container.innerHTML = `
                <div class="text-[9px] font-bold text-gray-500 mb-2 px-1">PILIH OPERATOR:</div>
                <div class="grid grid-cols-3 gap-2 mb-4">
                    ${result.data.map(op => `
                        <div onclick="setOperator(${op.id}, this)" class="op-card bg-white/5 border border-white/10 p-2 rounded-xl text-center cursor-pointer transition">
                            <img src="${op.image}" class="w-6 h-6 mx-auto mb-1 rounded-full object-cover">
                            <div class="text-[8px] font-bold uppercase">${op.name}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="text-[9px] font-bold text-gray-500 mb-2 px-1">PILIH SERVER:</div>
                <div id="inner-server-list">
                    ${renderServers(pricelist)}
                </div>
            `;
        }
    } catch (e) { 
        container.innerHTML = renderServers(pricelist); // Fallback kalau operator gagal load
    }
}

function setOperator(id, el) {
    selectedOperatorId = id;
    document.querySelectorAll('.op-card').forEach(c => c.classList.remove('border-purple-500', 'bg-purple-500/10'));
    el.classList.add('border-purple-500', 'bg-purple-500/10');
}

function renderServers(pricelist) {
    return pricelist.map(p => `
        <div onclick="confirmStep('${p.server_id}', '${p.provider_id}', ${p.price_user || p.price})" class="galaxy-card p-4 rounded-2xl flex justify-between items-center cursor-pointer border-l-4 border-purple-500 mb-2">
            <div>
                <div class="text-xs font-bold text-white uppercase">SERVER ${p.server_id}</div>
                <div class="text-[9px] text-gray-500">Stok: ${p.stock}</div>
            </div>
            <div class="text-sm font-bold text-purple-400 font-mono">Rp ${(p.price_user || p.price).toLocaleString()}</div>
        </div>
    `).join('');
}

// UPDATE FUNGSI CONFIRM PURCHASE (BIAR GAK ERROR)
async function confirmPurchase() {
    const btn = document.getElementById('btn-final-buy');
    btn.disabled = true;
    btn.innerHTML = 'MEMPROSES...';

    // FIX: Ambil number_id dari pricelist (TADI INI YANG KOSONG)
    // number_id RumahOTP v2 itu ada di dalam pricelist negara
    const dataToSend = {
        number_id: selectedOrder.number_id_from_pricelist, // ID unik negara
        provider_id: selectedOrder.provider_id,
        operator_id: selectedOperatorId,
        price: selectedOrder.price,
        service_name: selectedOrder.service_name
    };

    console.log("Mengirim data ke backend:", dataToSend);

    try {
        const res = await fetch('/api/nokos/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });

        const result = await res.json();

        if (result.success) {
            alert("Berhasil!");
            location.reload();
        } else {
            alert(result.msg || "Gagal Membeli");
            btn.disabled = false;
            btn.innerText = "BELI SEKARANG";
        }
    } catch (e) {
        alert("Koneksi Error! Cek terminal VPS lo.");
        btn.disabled = false;
        btn.innerText = "BELI SEKARANG";
    }
}

// TAMBAHKAN INI DI confirmStep
function confirmStep(serverId, providerId, price) {
    selectedOrder.server_id = serverId;
    selectedOrder.provider_id = providerId;
    selectedOrder.price = price;
    
    // AMBIL number_id dari pricelist yang lagi aktif
    const countryData = selectedOrder.pricelist_temp.find(p => p.provider_id == providerId);
    selectedOrder.number_id_from_pricelist = countryData?.number_id || providerId;

    document.getElementById('res-app').innerText = selectedOrder.service_name;
    document.getElementById('res-country').innerText = selectedOrder.country_name;
    document.getElementById('res-server').innerText = "SERVER " + serverId;
    document.getElementById('res-price').innerText = "Rp " + price.toLocaleString();
    
    nextOrderStep(4);
}

// FINAL: PROSES BELI (FIXED)
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
                operator_id: selectedOperatorId, // Sekarang sudah ada nilainya (1)
                price: selectedOrder.price,
                service_name: selectedOrder.service_name
            })
        });

        const result = await res.json();

        if (result.success) {
            // Masukkan ke List Pending
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
            switchView('order'); // Pindah ke tab order otomatis
            renderPendingOrders(); 
            startOtpPolling(newOrder.order_id);
            startTimer(newOrder.order_id, 1200);

            alert("Pesanan Berhasil!");
        } else {
            alert("Gagal: " + (result.msg || result.message));
            btn.disabled = false;
            btn.innerText = "BELI SEKARANG";
        }
    } catch (e) {
        alert("Koneksi Error! Cek Backend.");
        btn.disabled = false;
        btn.innerText = "BELI SEKARANG";
    }
}

// ==========================================
// 4. PESANAN PENDING & POLLING (RE-RENDER)
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
                <span class="text-[8px] text-gray-500 block mb-1 uppercase">Kode OTP</span>
                <div class="text-xl font-bold text-white" id="otp-${order.order_id}">${order.otp_code || '---'}</div>
            </div>
            <div class="mt-3 flex justify-between items-center text-[9px]">
                <div id="timer-${order.order_id}" class="text-gray-500 font-mono italic">20:00</div>
                <button onclick="cancelOrder('${order.order_id}')" class="text-red-500 font-bold uppercase hover:underline">Batalkan</button>
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
                    alert("OTP Masuk untuk " + order.service);
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

async function cancelOrder(orderId) {
    if (!confirm("Batalkan pesanan ini? Saldo akan dikembalikan.")) return;
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
        } else {
            alert(result.msg);
        }
    } catch (e) { alert("Error koneksi"); }
}