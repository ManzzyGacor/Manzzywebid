// Fungsi untuk buka-tutup Accordion di dalam Pop-up
function toggleModalFaq(button) {
    const content = button.nextElementSibling;
    const icon = button.querySelector('.fa-chevron-down');
    
    // Cek apakah konten sedang disembunyikan
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)'; // Putar ikon panah ke atas
    } else {
        content.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)'; // Kembalikan ikon panah ke bawah
    }
}

// Fungsi untuk menampilkan pengumuman utama
function showAnnouncement() {
    const modal = document.getElementById('announcement-modal');
    const card = document.getElementById('announcement-card');
    
    if(modal && card) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100');
            card.classList.remove('scale-95');
            card.classList.add('scale-100');
        }, 50);
    }
}

// Fungsi untuk menutup pengumuman
function closeAnnouncement() {
    const modal = document.getElementById('announcement-modal');
    const card = document.getElementById('announcement-card');
    
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0', 'pointer-events-none');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

// Trigger otomatis setelah loading (3.5 detik)
window.addEventListener('load', () => {
    setTimeout(() => {
        showAnnouncement();
    }, 1000); 
});