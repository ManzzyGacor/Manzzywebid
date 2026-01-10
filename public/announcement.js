// --- ANNOUNCEMENT SYSTEM ---
        async function fetchAnnouncement() {
            try {
                const res = await fetch('/api/announcement');
                const data = await res.json();
                
                const container = document.getElementById('announcement-container');
                const textEl = document.getElementById('user-announcement-text');
                
                if (data.isActive && data.text) {
                    textEl.innerText = data.text;
                    container.classList.remove('hidden');
                    
                    // Sesuaikan kecepatan marquee berdasarkan panjang teks
                    // Semakin panjang teks, semakin lama durasinya agar enak dibaca
                    const duration = Math.max(10, data.text.length * 0.2); 
                    textEl.style.animationDuration = `${duration}s`;
                } else {
                    container.classList.add('hidden');
                }
            } catch (e) {
                console.error("Gagal load pengumuman");
            }
        }

        // Panggil saat web diload
        fetchAnnouncement();

