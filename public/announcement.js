(async function() {
    try {
        console.log("🔄 Memuat Pengumuman...");
        const res = await fetch('/api/announcement');
        
        // Kalau server belum siap/error, stop
        if (!res.ok) return console.log("Gagal load API Announcement");

        const data = await res.json();
        
        // Cek ID elemen di HTML (Harus ada ann-box & ann-text)
        const box = document.getElementById('ann-box');
        const txt = document.getElementById('ann-text');

        if (!box || !txt) return console.error("Element HTML pengumuman hilang!");

        // Ambil teksnya
        const textContent = data.text || (data.data ? data.data.text : "");

        if (textContent && textContent.trim() !== "") {
            // Tampilkan kotak
            box.classList.remove('hidden');
            txt.innerText = textContent;
            
            // Atur kecepatan teks jalan
            txt.classList.add('marquee-anim');
            const duration = Math.max(10, textContent.length * 0.2);
            txt.style.animationDuration = `${duration}s`;
        } else {
            // Kalau kosong, sembunyikan
            box.classList.add('hidden');
        }
    } catch (e) {
        console.error("Announcement Error:", e);
        // Sembunyikan kalau error agar tidak jelek
        const box = document.getElementById('ann-box');
        if(box) box.classList.add('hidden');
    }
})();