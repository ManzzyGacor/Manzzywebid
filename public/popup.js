// Fungsi untuk menampilkan pengumuman
function showAnnouncement() {
    const modal = document.getElementById('announcement-modal');
    const card = document.getElementById('announcement-card');
    
    if(modal && card) {
        // Hapus class hidden, tambahkan flex agar ke tengah
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Jeda 50ms untuk memberikan waktu render animasi CSS
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100');
            card.classList.remove('scale-95');
            card.classList.add('scale-100');
        }, 50);
    } else {
        console.error("Elemen modal tidak ditemukan di HTML.");
    }
}

// Fungsi untuk menutup pengumuman
function closeAnnouncement() {
    const modal = document.getElementById('announcement-modal');
    const card = document.getElementById('announcement-card');
    
    // Menjalankan efek transisi menghilang
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0', 'pointer-events-none');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    
    // Hapus total dari display setelah efek CSS selesai (300ms)
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

// Eksekusi otomatis setelah loading website selesai
window.addEventListener('load', () => {
    // Muncul setelah 3.5 detik (menyesuaikan hilangnya loader bawaan)
    setTimeout(() => {
        showAnnouncement();
    }, 3500); 
});

