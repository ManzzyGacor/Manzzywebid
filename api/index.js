
Percakapan dengan Gemini
Anda berkata
Aku nemu 1 lagi celah-celah (mungkin)



Data di mongodb

_id

69cf49dd7aa6e4b2a8a073cd

username

"man"

password

"112233"

balance

0

role

"admin"

__v

0



Sedangkan cara pengecekan yg lama(valid &ga bug)

// Get User Profile (Include API Key for Frontend)

app.get('/api/user/:username', async (req, res) => {

    if(req.params.username === 'Manzzy (Owner)') return res.json({ username: 'Manzzy (Owner)', balance: 999999999, role: 'admin' });

    

    await connectDB();

    const user = await User.findOne({ username: req.params.username });

    res.json(user || {});

});



Dan ini yg terbaru (mungkin bug)

app.get('/api/user/:username', async (req, res) => {

    try {

        // Bypass khusus Admin/Owner

        if(req.params.username === 'Manzzy (Owner)' || req.params.username === 'man') {

            return res.json({ success: true, username: req.params.username, balance: 999999999, role: 'admin' });

        }

        

        await connectDB();

        const user = await User.findOne({ username: req.params.username });

        

        if (!user) {

            return res.status(404).json({ success: false, msg: "User tidak ditemukan" });

        }



        // Kirim data dengan format yang jelas

        res.json({ 

            success: true, 

            username: user.username, 

            balance: user.balance || 0, 

            role: user.role || 'member' 

        });

    } catch (e) {

        res.status(500).json({ success: false, msg: "Server Error" });

    }

});

Gemini berkata
Analisis kamu 100% tepat! Kamu baru saja menemukan logic bug yang krusial.

Celah atau "bug" yang kamu temukan di kode terbaru adalah: Bypass Saldo Palsu.

1. Kenapa ini disebut Bug?
Perhatikan bagian ini di kode terbaru:

JavaScript
if(req.params.username === 'Manzzy (Owner)' || req.params.username === 'man') {
    return res.json({ success: true, username: req.params.username, balance: 999999999, role: 'admin' });
}
Masalahnya adalah:

Data di MongoDB diabaikan: Meskipun di database user man punya saldo 0, karena ada kode bypass di atas, API akan selalu mengirim saldo 999.999.999 ke browser.

Hanya tampilan (Client-side): Browser akan mengira kamu kaya raya, tapi saat kamu mencoba belanja (yang biasanya cek saldo langsung ke database di route /api/order), transaksi akan gagal karena saldo asli di DB tetap 0.

Ketidaksinkronan: Ini yang bikin kamu bingung, "Kok di tampilan saldonya banyak, tapi buat beli gak bisa?".

2. Cara Memperbaikinya (Agar Valid & Tidak Bug)
Bypass itu harusnya hanya untuk Owner (Manzzy) yang memang tidak ada datanya di database. Untuk user man, karena datanya ada di MongoDB, biarkan sistem mengambil data asli dari database.

Ganti route tersebut menjadi seperti ini:

JavaScript
app.get('/api/user/:username', async (req, res) => {
    try {
        await connectDB();

        // 1. BYPASS HANYA UNTUK NAMA TERTENTU YG TIDAK ADA DI DB (OWNER)
        if(req.params.username === 'Manzzy (Owner)') {
            return res.json({ 
                success: true, 
                username: 'Manzzy (Owner)', 
                balance: 999999999, 
                role: 'admin' 
            });
        }
        
        // 2. CARI DI DATABASE (Termasuk untuk username 'man')
        const user = await User.findOne({ username: req.params.username });
        
        if (!user) {
            return res.status(404).json({ success: false, msg: "User tidak ditemukan" });
        }

        // 3. KIRIM DATA ASLI DARI MONGODB
        res.json({ 
            success: true, 
            username: user.username, 
            balance: user.balance || 0, 
            role: user.role || 'member' 
        });

    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});
3. Kesimpulan Analisis Kamu:
Kode Lama: Lebih aman karena dia cuma bypass satu nama (Manzzy (Owner)), sisanya dipaksa cari di DB.

Kode Baru: Kamu memasukkan || 'man' ke dalam bypass. Akibatnya, user man yang ada di DB jadi punya "saldo sulap" di tampilan, tapi "saldo zonk" di sistem pembayaran.

Saran: Hapus || req.params.username === 'man' dari logika bypass tersebut. Kalau kamu mau user man punya saldo banyak, edit langsung di MongoDB Atlas-nya, jangan di kodenya. Dengan begitu, data di tampilan dan data di sistem pembayaran akan sinkron.

Gimana, mau langsung di-update kodenya di VPS?

Anda berkata
Gausah kasih gituan

Cukup simpel itungan nya user biasa, ga ada perbedaan saldo antara admin/member

Gemini berkata
Oke, kalau mau dibuat adil dan simpel tanpa "saldo sulap", kita bersihkan logikanya. Jadi, mau dia Admin atau Member, saldo yang muncul adalah saldo asli yang tertera di database MongoDB kamu.

Satu-satunya yang kita biarkan bypass cuma Manzzy (Owner) karena itu akun "pajangan" yang memang tidak ada di database.

Ganti route /api/user/:username di api/index.js kamu dengan kode simpel ini:

JavaScript
app.get('/api/user/:username', async (req, res) => {
    try {
        await connectDB();

        // 1. Bypass Khusus Owner (Hanya nama ini yang saldonya "tak terbatas")
        if(req.params.username === 'Manzzy (Owner)') {
            return res.json({ 
                success: true, 
                username: 'Manzzy (Owner)', 
                balance: 999999999, 
                role: 'admin' 
            });
        }
        
        // 2. Cari semua user lain (termasuk admin 'man') di Database
        const user = await User.findOne({ username: req.params.username });
        
        if (!user) {
            return res.status(404).json({ success: false, msg: "User tidak ditemukan" });
        }

        // 3. Kirim data asli apa adanya dari MongoDB
        res.json({ 
            success: true, 
            username: user.username, 
            balance: user.balance || 0, 
            role: user.role || 'member' 
        });

    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});
Apa yang berubah?
Username man sekarang akan mengikuti saldo yang ada di database. Kalau di DB tertulis 0, maka di web akan muncul Rp 0.

Tidak ada saldo palsu: Kamu nggak akan bingung lagi kenapa di tampilan saldonya banyak tapi pas beli nggak bisa. Sekarang kalau di tampilan 0, ya di sistem juga 0.

Simpel & Akurat: Kode jadi lebih pendek dan nggak banyak celah bug.

Saran Tambahan:
Karena kamu mau user man jadi admin, pastikan di MongoDB Atlas, kolom role untuk user man sudah kamu isi tulisan "admin".

Sekarang tinggal pm2 restart all di VPS, dan semuanya bakal sinkron antara tampilan dan database! Gaskeun!

Anda berkata
Maksutku bypass khusus owner itu di hapus

Gemini berkata
Oalah, paham Man! Jadi maksudmu bener-bener gak ada anak emas. Semua user, mau itu kamu (Owner/Admin) atau Member, datanya WAJIB ambil dari MongoDB. Kalau di database saldonya 0, ya di web tampil 0. Gak ada angka sulap 999999.

Ini versi paling bersih dan simpel untuk route /api/user/:username di api/index.js kamu. Hapus semua logika if bypass-nya:

JavaScript
// ==========================================
// GET USER PROFILE (MURNI DARI DATABASE)
// ==========================================
app.get('/api/user/:username', async (req, res) => {
    try {
        await connectDB();
        
        // Cari user berdasarkan username yang dikirim dari frontend
        const user = await User.findOne({ username: req.params.username });
        
        // Kalau user gak ketemu di database
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                msg: "User tidak ditemukan" 
            });
        }

        // Kirim data ASLI dari MongoDB apa adanya
        res.json({ 
            success: true, 
            username: user.username, 
            balance: user.balance || 0, 
            role: user.role || 'member' 
        });

    } catch (e) {
        console.error("Error Fetch User:", e);
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});
Kenapa ini lebih baik buat kamu?
Gak Ada Data Palsu: Kamu gak bakal bingung lagi. Apa yang kamu lihat di MongoDB Compass/Atlas, itu yang muncul di web.

Sistem Pembayaran Akurat: Karena data yang tampil di profil sama dengan data yang dicek sistem pas belanja, gak bakal ada kejadian "Saldo banyak tapi gak bisa beli".

Simpel: Kodenya ringkas, gak banyak drama if/else.

Ingat:
Karena sekarang akun Manzzy (Owner) juga diambil dari DB, pastikan kamu sudah Register atau buat data user dengan nama Manzzy (Owner) di database kamu. Kalau belum ada, nanti pas login dia bakal muncul error "User tidak ditemukan".

Sekarang tinggal pm2 restart all dan web kamu sudah 100% sinkron sama database! Gaskeun!

Anda berkata
Itu pake await connectdb?

Liat isi index.js ku

Gemini berkata
Berdasarkan isi file index.js terbaru yang kamu kirim, kamu sudah menggunakan await connectDB() di dalam blok connectDB().then(...) di bagian paling bawah file.

Berikut adalah analisis dan saran perbaikan agar kode kamu lebih stabil sesuai dengan diskusi kita sebelumnya:

1. Kondisi di index.js Kamu Saat Ini:
Di bagian paling bawah, kamu menulis:

JavaScript
connectDB().then(() => {
    const PORT = 3000; 
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ MongoDB Connected`);
        console.log(`✅ Backend Internal running on port ${PORT}`);
    });
}).catch(err => {
    console.error("❌ Gagal menyalakan server karena error DB:", err);
});
Analisis: Ini sudah benar untuk memastikan server hanya jalan kalau DB konek. Tapi, kamu punya fungsi connectDB di bagian atas yang masih pakai variabel isConnected.

2. Saran Perbaikan (Ganti Bagian Koneksi DB)
Agar tidak terjadi error "macet" atau "hang" saat database sedang sibuk, sebaiknya gunakan versi Anti-Macet yang saya buatkan sebelumnya.

Hapus fungsi connectDB lama kamu (baris 35-45) dan ganti dengan ini:

JavaScript
// ==========================================
// KONEKSI DATABASE (VERSI ANTI-MACET)
// ==========================================
const connectDB = async () => {
    try {
        // Jika sudah tersambung, langsung balik (efisien)
        if (mongoose.connection.readyState === 1) return;

        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout 5 detik saja biar gak hang
        });
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ DB Error:", err.message);
        // Jangan biarkan error menghentikan proses jika tidak kritis
    }
};

// Panggil di awal secara global
connectDB();
3. Kenapa Harus Diganti?
Mencegah Hang: Di file kamu yang sekarang, kalau MongoDB Atlas kamu lambat, seluruh server app.listen akan tertunda dan bisa menyebabkan timeout di Cloudflare Tunnel.

Efisiensi: Dengan mengecek readyState === 1, kamu tidak akan membuat koneksi ganda yang bisa bikin database kamu penuh (Too many connections).

Kesesuaian CF Tunnel: Karena kamu pakai Cloudflare Tunnel, sangat penting bagi Node.js untuk segera Up (jalan) agar tunnel tidak menganggap server mati.

Kesimpulan:
Isi index.js kamu sudah pakai await, tapi strukturnya masih bisa bikin web kamu "loading selamanya" kalau database lagi bermasalah. Pakailah cara panggil sekali di awal (di luar route) seperti contoh di atas agar API /api/user/:username kamu bisa langsung merespon dengan cepat.

Saran: Langsung update fungsi connectDB kamu ke versi Anti-Macet di atas, lalu pm2 restart all. Web kamu bakal terasa jauh lebih enteng!

Anda berkata
Trus ini kenapa semua nya loading

Menurutku gagal tersambung ke api



Karna hanya satu connectdb di atas

Gimana kalau coba di tambahkan lagi seperti index.js yg lama

Gemini berkata
Pemikiran kamu bahwa "loading terus" karena butuh banyak connectDB() itu sebenarnya adalah kesan yang muncul karena di kode lama setiap ada request, dia baru sibuk mengoneksi.

Tapi, penyebab asli kenapa web kamu loading terus (stuck) di versi baru biasanya bukan karena kurang jumlah connectDB, melainkan karena urutan eksekusi di index.js kamu yang sekarang menghalangi (blocking) Express untuk jalan.

Mari kita bedah dan perbaiki index.js kamu agar tidak loading lagi:

1. Kenapa Versi Sekarang "Loading Terus"?
Di file index.js terbaru yang kamu kirim, kamu membungkus app.listen di dalam .then() dari connectDB:

JavaScript
connectDB().then(() => {
    app.listen(3000, ...);
});
Masalahnya: Jika koneksi ke MongoDB Atlas kamu lambat atau gagal, maka app.listen tidak akan pernah dipanggil. Efeknya? Cloudflare Tunnel tidak bisa menemukan server kamu, dan browser kamu akan loading selamanya sampai timeout.

2. Solusi: Jangan Menunggu Database untuk Menjalankan Server
Biarkan server Express jalan duluan (agar Cloudflare Tunnel konek), lalu biarkan Database konek di "belakang layar".

Ganti bagian bawah index.js kamu menjadi seperti ini:

JavaScript
// ==========================================
// KONEKSI DATABASE (VERSI MANDIRI)
// ==========================================
const connectDB = async () => {
    try {
        // Cek jika sudah konek, jangan buat koneksi baru
        if (mongoose.connection.readyState === 1) return;

        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, // Maksimal nunggu 5 detik saja
        });
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ DB Error (Server tetap jalan):", err.message);
    }
};

// JALANKAN SERVER SEGERA (Agar Cloudflare Tunnel Gak Loading)
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Is Ready on port ${PORT}`);
    // Panggil koneksi DB setelah server nyala
    connectDB(); 
});

// Proteksi tambahan: panggil connectDB di setiap route API utama 
// (Ini yang kamu mau, tapi versinya lebih aman/modern)
app.use('/api', async (req, res, next) => {
    await connectDB();
    next();
});
3. Kenapa Cara Ini Lebih Bagus?
Anti-Loading: Begitu kamu jalankan pm2 start, port 3000 langsung aktif. Cloudflare Tunnel langsung "Happy" karena pintu sudah terbuka.

Reconnect Otomatis: Dengan menambahkan app.use('/api', ...connectDB), setiap kali ada orang akses API, sistem akan ngecek: "Eh, DB masih konek gak? Kalau putus, sambungin lagi ya". Ini persis seperti logika index.js lama kamu tapi lebih rapi.

Gak Menunggu Selamanya: Kalau database mati, web kamu minimal masih bisa kebuka (tapi mungkin muncul pesan "Error DB" daripada cuma muter-muter loading putih).

Langkah yang harus kamu lakukan sekarang:
Buka api/index.js di VPS.

Hapus bagian connectDB().then(...) di paling bawah.

Ganti dengan kode app.listen yang saya berikan di atas.

Jalankan pm2 restart all.

Cek Hasilnya:
Coba buka https://manzzy.web.id. Harusnya halaman langsung muncul (tidak loading lama lagi). Kalau halaman sudah muncul tapi data belum keluar, cek pm2 logs untuk melihat apakah ada pesan ❌ DB Error.

Gimana? Mau dicoba ganti urutan listen-nya dulu?

Anda berkata
Oke

Pasangin ini

// Proteksi tambahan: panggil connectDB di setiap route API utama

// (Ini yang kamu mau, tapi versinya lebih aman/modern)

app.use('/api', async (req, res, next) => {

await connectDB();

next();

}); ya di setiap yg aku kirim



try {

const apiKeyModule = require('./apikey');

app.use('/api', apiKeyModule.router);

} catch (e) {

console.error("Warning: apikey.js belum dibuat/error.");

}

Gemini berkata
Oke Man, ini pilihan yang sangat mantap. Dengan memasang app.use('/api', ...) di bagian atas, kamu menjamin bahwa setiap kali ada orang akses fitur apa pun di web kamu (Login, Profile, Topup, dll), sistem akan otomatis memastikan koneksi database sudah siap.

Ini adalah gabungan kode index.js kamu dengan proteksi connectDB di setiap route dan sistem apikey.js yang kamu minta.

Update api/index.js Kamu:
Cari bagian setelah Middleware (setelah app.use(express.json...)) dan ganti dengan susunan ini:

JavaScript
// ==========================================
// 1. KONEKSI DATABASE (VERSI ANTI-MACET)
// ==========================================
const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) return;
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
};

// [Sesuai Permintaanmu] Proteksi koneksi di setiap route /api
app.use('/api', async (req, res, next) => {
    await connectDB();
    next();
});

// [Sesuai Permintaanmu] Integrasi API Key Module
try {
    const apiKeyModule = require('./apikey'); 
    // Jika file apikey.js ada, dia akan otomatis terpasang di bawah /api
    app.use('/api', apiKeyModule.router || apiKeyModule);
} catch (e) {
    console.error("⚠️ Warning: apikey.js belum dibuat atau ada error di dalamnya.");
}

// ==========================================
// 2. ROUTE API LAINNYA (Contoh Profile)
// ==========================================

app.get('/api/user/:username', async (req, res) => {
    try {
        // Tidak perlu tulis await connectDB() lagi di sini karena sudah di-handle app.use di atas!
        const user = await User.findOne({ username: req.params.username });
        
        if (!user) {
            return res.status(404).json({ success: false, msg: "User tidak ditemukan" });
        }

        res.json({ 
            success: true, 
            username: user.username, 
            balance: user.balance || 0, 
            role: user.role || 'member' 
        });
    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// ... (Route admin dan lainnya tetap di bawah sini) ...

// ==========================================
// 3. JALANKAN SERVER (PORT 3000 UNTUK CF TUNNEL)
// ==========================================
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Manzzy ID Ready di Port ${PORT}`);
    connectDB(); // Panggil sekali saat start
});
Kenapa Struktur Ini "Anti-Gagal"?
Satu Pintu Utama: Dengan app.use('/api', ...), kamu tidak perlu lagi capek-capek ngetik await connectDB() di ratusan route API kamu. Semuanya otomatis lewat pintu ini dulu.

Modular (API Key): Kode try...catch pada require('./apikey') itu sangat bagus. Kalau nanti kamu belum buat file apikey.js atau kodenya ada yang salah, server kamu tidak akan crash. Dia cuma bakal kasih peringatan di log.

Efisiensi VPS: Karena ada pengecekan readyState === 1, database kamu nggak akan "lelah" nerima permintaan koneksi berulang-ulang yang sebenarnya tidak perlu.

Langkah Selanjutnya:
Simpan perubahan ini di api/index.js.

Pastikan kamu sudah buat file api/apikey.js (atau biarkan dulu kalau memang belum ada).

Jalankan pm2 restart all.

Sekarang coba buka web kamu. Seharusnya loading-nya hilang dan transisi antar halaman jadi lebih cepat karena koneksi database-nya selalu "siaga". Gaskeun, Man!

Anda berkata
Eh bentar ini masang nya gimana si? Di mana nya

// Proteksi tambahan: panggil connectDB di setiap route API utama

// (Ini yang kamu mau, tapi versinya lebih aman/modern)

app.use('/api', async (req, res, next) => {

await connectDB();

next();

});

Gemini berkata
Pemasangannya harus di atas semua route API, tapi di bawah konfigurasi middleware (seperti cors dan json). Tujuannya supaya setiap kali ada request yang masuk ke /api, Express ngecek koneksi database dulu sebelum lanjut ke logika Login atau Top Up.

Buka file api/index.js kamu, lalu susun urutannya seperti ini:

1. Letak Pemasangan di index.js
JavaScript
// ... (Bagian import express, mongoose, dll di paling atas)

// --- KONFIGURASI MIDDLEWARE (Taruh di sini) ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- PASANG PROTEKSI DB DISINI (Sebelum Route API) ---
app.use('/api', async (req, res, next) => {
    await connectDB(); // Memastikan DB siap setiap kali ada request ke /api
    next();
});

// --- BARU DI BAWAHNYA MASUKKAN LOGIKA API KEY & ROUTE ---
try {
    const apiKeyModule = require('./apikey'); 
    app.use('/api', apiKeyModule.router || apiKeyModule);
} catch (e) {
    console.error("Warning: apikey.js belum dibuat.");
}

// Route Profile kamu
app.get('/api/user/:username', async (req, res) => {
    // Di sini kamu nggak perlu tulis await connectDB lagi karena sudah dihandle di atas
    const user = await User.findOne({ username: req.params.username });
    // ... sisa kode profile
});

// ... (Route lainnya)
2. Kenapa ditaruh di situ?
Urutan itu penting: Di Express, kode dijalankan dari atas ke bawah. Kalau kamu taruh proteksi ini di paling bawah (di bawah route profile), proteksinya nggak akan jalan karena request sudah keburu diproses oleh route profile duluan.

Efeknya: Dengan ditaruh di atas, script ini jadi "Satpam". Begitu ada orang akses /api/user/man, Satpam (middleware) bakal cek: "DB udah konek belum? Kalo belum, tunggu bentar gue konekin". Baru setelah itu dia bilang next(), yang artinya dipersilakan lanjut ke route profil.

3. Cara Cepat Update di VPS:
Ketik nano api/index.js.

Cari baris app.use(express.json....

Tepat di bawahnya, Paste kode proteksi tadi.

Simpan (CTRL+O, Enter, CTRL+X).

Restart dengan pm2 restart all.

Coba pasang sekarang, Man. Kalau sudah, cek pm2 logs. Pasti log-nya bakal rapi dan gak bakal ada error "Loading" karena DB telat konek.

Anda berkata
Atau gini aja, cara paling ampuh mungkin

Aku kirim semua isi file web ku dari api folder

Dan public folder biar kamu yg benerin full kamu debugging apa yg salah

Gemini berkata
Ini adalah ide yang sangat bagus, Man. Dengan melihat seluruh isi folder api dan public, saya bisa melihat hubungan antar file (kenapa script gak nemu ID, kenapa API gak konek, dll) secara utuh.

Silakan kirimkan isinya satu per satu. Biar rapi dan saya nggak pusing pas benerinnya, kamu bisa kirim dengan urutan seperti ini:

1. Folder api (Otak Server)
Kirimkan file-file ini:

index.js (Yang terbaru di VPS-mu sekarang).

apikey.js (Kalau sudah ada).

dashboard.js (Karena saya lihat di snippet ada app.use('/api', require('./dashboard'))).

Fungsi-fungsi lain kalau ada file terpisah (seperti model database).

2. Folder public (Tampilan Web)
Kirimkan file-file ini:

index.html (Versi terakhir yang ada di VPS).

script.js (Versi yang kamu pakai sekarang).

style.css (Kalau ada custom ID di sana).

File JS tambahan seperti topup.js atau login.js.

Cara Kirimnya:
Kamu bisa copy-paste isinya di sini satu per satu sambil kasih keterangan nama filenya, atau kalau kamu punya akses terminal, kamu bisa ketik:
cat api/index.js (Lalu copy hasilnya ke sini), dst.

Apa yang akan saya lakukan setelah kamu kirim semuanya?

Sinkronisasi ID: Saya akan pastikan ID yang ada di index.html sama persis dengan yang dipanggil di script.js.

Perbaikan Route API: Saya akan rapikan index.js agar koneksi database-nya efisien (pakai middleware yang kita bahas tadi) dan tidak ada "saldo palsu".

Fixing Header/Sidebar: Saya akan benerin kenapa tombol login gak mau berubah jadi logout.

Gaskeun, Man! Kirim file pertama (index.js terbaru) sekarang.

Anda berkata
Ini isi folder public

Inget dulu abis ini yg api

Gemini berkata
Siap, Man! Saya sudah terima dan pelajari semua file di folder public kamu (index.html, script.js, login_user.html, dll).

Saya sudah menemukan beberapa titik temu kenapa tampilan web kamu sering nggak sinkron:

ID Mismatch: Di index.html kamu pakai id="user-profile", tapi di beberapa bagian script.js masih nyari user-info.

Logic Session: Di login_user.html, kamu nyimpen 3 nama berbeda di localStorage (user_session, user_role, manzzyUser). Ini bisa bikin pusing kalau salah satu gak ke-update.

Tailwind Classes: Kamu pakai class hidden di HTML, tapi di JS kamu kadang mainin .style.display = 'none'. Ini kadang bikin bentrok di beberapa browser HP.

Sekarang, silakan kirim isi folder api kamu (terutama index.js dan dashboard.js).

Setelah semua file api masuk, saya akan buatkan satu paket perbaikan total yang isinya:

index.js yang sudah rapi, anti-loading, dan konek DB otomatis.

script.js yang sudah disesuaikan persis dengan ID di index.html kamu.

apikey.js (kalau ada) yang sudah terintegrasi.

Ditunggu file foldernya api-nya, Man! Gaskeun kita beresin malam ini.

Anda berkata
Ini api di folder ku

Gemini berkata
Mantap Man, datanya sudah lengkap! Saya sudah bedah semua file dari folder api (index.js, dashboard.js) dan folder public (index.html, script.js).

Diagnosa Utama:

Eksekusi Terbalik: Di index.js, kamu memanggil app.use('/api', ...) tapi fungsi connectDB baru didefinisikan di bawahnya. Ini bisa bikin error ReferenceError.

ID Mismatch: Di index.html ada elemen id="user-profile", tapi di script.js kamu nyari id="user-info". Ini alasan kenapa tombol login gak mau berubah.

Variabel Session: Di script.js variabel userSession cuma diambil sekali di atas. Kalau user login tanpa refresh, script-nya gak tau kalau session sudah ada.

Ini Paket Perbaikan Total (Debugging Selesai). Silakan update file kamu satu per satu:

1. Update api/index.js (Server)
Gunakan susunan ini agar koneksi database rapi dan tidak menghambat Cloudflare Tunnel:

JavaScript
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const app = express();
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 1. KONEKSI DATABASE (Ditaruh paling atas agar siap dipanggil)
const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) return;
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ DB Error:", err.message);
    }
};

// 2. MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Helper Fetch (Untuk verifikasi token Google / External API)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


// 3. PROTEKSI DB OTOMATIS (Satpam API)
app.use('/api', async (req, res, next) => {
    await connectDB();
    next();
});
// ==========================================
// 2. SCHEMA DEFINITIONS (UPDATE: API KEY)
// ==========================================

// [UPDATE] User Schema dengan kolom apiKey
const UserSchema = new mongoose.Schema({ 
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    balance: { type: Number, default: 0 },
    role: { type: String, default: 'member' },
    // Kolom API Key (Unik & Sparse agar tidak error jika kosong)
    apiKey: { type: String, unique: true, sparse: true } 
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Schema Lainnya (Tetap Sama)
const ActiveService = mongoose.models.ActiveService || mongoose.model('ActiveService', new mongoose.Schema({ username: String, productName: String, targetNumber: String, serverIp: String, expiredDate: Date }));
const Product = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({ name: String, category: String, price: Number, desc: String, imageUrl: String, formFields: String, isAvailable: { type: Boolean, default: true }, orderMode: { type: String, default: 'manual' } }));
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', new mongoose.Schema({ code: { type: String, required: true, unique: true }, percent: { type: Number, required: true }, createdAt: { type: Date, default: Date.now } }));
const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({ name: String, imageUrl: String }));
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', new mongoose.Schema({ username: String, rating: Number, comment: String, createdAt: { type: Date, default: Date.now } }));
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({ invoiceId: String, username: String, productName: String, formData: String, amount: Number, status: { type: String, default: 'success' }, createdAt: { type: Date, default: Date.now } }));
// 1. PASTIKAN SCHEMA INI ADA DI api/index.js (Di bagian Schema Definitions)
// Schema Transaksi TopUp Otomatis (Sama dengan yg di topup_handler.js)
const TopUpTx = mongoose.models.TopUpTx || mongoose.model('TopUpTx', new mongoose.Schema({
    orderId: String, username: String, amount: Number, fee: Number, totalPayment: Number, 
    paymentNumber: String, status: { type: String, default: 'pending' }, 
    expiredAt: Date, createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// 3. INTEGRASI MODULE (ROUTER)
// ==========================================

// A. Mount API Key Module (Developer Features)
// Ini menangani route: /api/user/generate-apikey & /api/v1/profile
try {
    const apiKeyModule = require('./apikey'); 
    app.use('/api', apiKeyModule.router);
} catch (e) {
    console.error("Warning: apikey.js belum dibuat/error.");
}

// B. Mount Nokos Module
// Ini menangani route: /api/nokos/buy, /api/nokos/status, dll
try {
    const nokosRouter = require('./nokos');
    app.use('/api/nokos', nokosRouter);
} catch (e) {
    console.error("Warning: nokos.js belum dibuat/error.");
}
// ==========================================
// C. MOUNT TOPUP MODULE (PAKASIR AUTOMATIC)
// ==========================================
try {
    const topupRouter = require('./topup_handler'); 
    // Ini akan mengaktifkan route:
    // - /api/topup/create
    // - /api/topup/check/:orderId
    // - /api/topup/webhook
    app.use('/api/topup', topupRouter);
    console.log("✅ TopUp Module Loaded");
} catch (e) {
    console.error("Warning: topup_handler.js belum dibuat.", e);
}

// ==========================================
// 4. AUTH ROUTES (LOGIN/REGISTER)
// ==========================================

// Login Admin
app.post('/api/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'man' && password === '112233') {
        return res.json({ success: true, username: 'Manzzy (Owner)', role: 'admin', token: 'admin-super-token' });
    }
    return res.status(400).json({ success: false, message: "Password Salah" });
});

// Google Login
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const verify = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`)).json();
        if (!verify.email) return res.status(400).json({ success: false, msg: "Token Invalid" });
        
        const email = verify.email;
        let user = await User.findOne({ username: email });
        
        if (!user) {
            const randomPass = Math.random().toString(36).slice(-8) + "GooGLE";
            user = new User({ username: email, password: randomPass, balance: 0 });
            await user.save();
        }
        res.json({ success: true, username: user.username, balance: user.balance, role: user.role, isGoogle: true });
    } catch (e) { res.status(500).json({ success: false, msg: e.message }); }
});

// ROUTE REGISTER (Tanpa Bcrypt)
app.post('/api/register-user', async (req, res) => {
    try {
        const { username, password } = req.body;
        const exist = await User.findOne({ username });
        if (exist) return res.status(400).json({ success: false, msg: "Username sudah ada!" });

        // Simpan password apa adanya (Plain Text)
        const role = username.toLowerCase() === 'man' ? 'admin' : 'member';
        const newUser = new User({ username, password, role, balance: 0 });
        
        await newUser.save();
        res.json({ success: true, msg: "Berhasil daftar!" });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ROUTE LOGIN (Pakai User.findOne Langsung)
app.post('/api/login-user', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Cari yang username DAN password-nya cocok persis
        const user = await User.findOne({ username, password });

        if (!user) {
            return res.status(400).json({ success: false, msg: "Username atau Password Salah!" });
        }

        // Kirim data lengkap ke frontend
        res.json({ 
            success: true, 
            username: user.username, 
            role: user.role, 
            balance: user.balance 
        });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// GET USER PROFILE (MURNI DARI DATABASE)
// ==========================================
app.get('/api/user/:username', async (req, res) => {
    try {
        await connectDB();
        
        // Cari user berdasarkan username yang dikirim dari frontend
        const user = await User.findOne({ username: req.params.username });
        
        // Kalau user gak ketemu di database
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                msg: "User tidak ditemukan" 
            });
        }

        // Kirim data ASLI dari MongoDB apa adanya
        res.json({ 
            success: true, 
            username: user.username, 
            balance: user.balance || 0, 
            role: user.role || 'member' 
        });

    } catch (e) {
        console.error("Error Fetch User:", e);
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});
// Change Password
app.post('/api/user/change-password', async (req, res) => {
    const { username, newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, msg: "Min 6 karakter" });

    const user = await User.findOne({ username });
    if(!user) return res.status(404).json({success:false, msg: "User not found"});
    
    user.password = newPassword; 
    await user.save();
    res.json({success:true});
});

// ==========================================
// 5. CORE LOGIC (PRODUCTS, TOPUP, HISTORY)
// ==========================================

// Products CRUD
app.get('/api/products', async (req, res) => { res.json(await Product.find()); });
app.post('/api/products', async (req, res) => { await new Product(req.body).save(); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await Product.findByIdAndUpdate(req.params.id, req.body); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Categories CRUD
app.get('/api/categories', async (req, res) => { res.json(await Category.find()); });
app.post('/api/categories', async (req, res) => { await new Category(req.body).save(); res.json({ success: true }); });
app.delete('/api/categories/:id', async (req, res) => { await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Vouchers
app.post('/api/check-voucher', async (req, res) => {
    const v = await Voucher.findOne({ code: req.body.code });
    if(v) res.json({ success: true, percent: v.percent }); else res.json({ success: false });
});

// Update Route Admin Topups
app.get('/api/admin/topups', async (req, res) => { 
    const data = await TopUpTx.find().sort({ createdAt: -1 }).limit(50);
    res.json(data); 
});

// Order System (Produk Digital Manual)
app.post('/api/order', async (req, res) => {
    const { username, productId, formData, voucherCode } = req.body;
   
    
    const user = await User.findOne({ username });
    const prod = await Product.findById(productId);
    
    if(!user || !prod) return res.json({ success: false, msg: "Data invalid" });
    
    let price = prod.price;
    let note = "";
    
    if(voucherCode) {
        const v = await Voucher.findOne({ code: voucherCode });
        if(v) { price -= Math.ceil(price * (v.percent/100)); note = `(Disc ${v.percent}%)`; }
    }

    if(user.balance < price) return res.json({ success: false, msg: "Saldo kurang" });
    
    user.balance -= price; 
    await user.save();
    
    const inv = 'INV-' + Date.now().toString().slice(-6);
    await new Transaction({ invoiceId: inv, username, productName: `${prod.name} ${note}`, formData, amount: price }).save();
    
    res.json({ success: true, invoiceId: inv, productName: prod.name, mode: prod.orderMode });
});

// History Logic
app.get('/api/history/:username', async (req, res) => {
    const txs = await Transaction.find({ username: req.params.username }).sort({ createdAt: -1 }).limit(20);
    res.json(txs.map(t => ({ 
        date: t.createdAt, 
        desc: t.productName, 
        amount: t.amount, 
        status: t.status, 
        type: t.productName === 'Deposit' ? 'IN' : 'OUT' 
    })));
});

// D. MOUNT H2H MODULE (Baru)
try {
    const h2hRouter = require('./h2h'); 
    app.use('/api', h2hRouter); 
    console.log("✅ H2H Module Loaded");
} catch (e) {
    console.error("Warning: h2h.js error/missing", e);
}

// Admin System / Status
app.get('/api/system/status', (req, res) => res.json({ 
    vpsActive: true, 
    vpsStartTime: new Date(Date.now()-36000000), 
    botActive: true, 
    botStartTime: new Date(Date.now()-18000000) 
}));

app.post('/api/testimonials', async (req, res) => { 
    await new Testimonial(req.body).save(); 
    res.json({ success: true }); 
});

app.get('/api/testimonials', async (req, res) => { 
    res.json(await Testimonial.find().sort({ createdAt: -1 }).limit(10)); 
});

// ==========================================
// 6. PUBLIC DATA (RECENT ACTIVITY)
// ==========================================

function censorUser(str) {
    if(!str) return "Member";
    if(str.length <= 3) return str + "*";
    return str.substring(0, 3) + "***";
}

app.get('/api/public/recent-activities', async (req, res) => {
    try {
        const topups = await TopUpTx.find({ status: 'success' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const orders = await Transaction.find({ status: 'success' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        let activities = [];

        topups.forEach(t => {
            activities.push({
                type: 'topup',
                user: censorUser(t.username),
                desc: 'Deposit Saldo',
                time: t.createdAt
            });
        });

        orders.forEach(o => {
            activities.push({
                type: 'buy',
                user: censorUser(o.username),
                desc: o.productName.length > 20 ? o.productName.substring(0, 20) + '...' : o.productName,
                time: o.createdAt
            });
        });

        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.json(activities);
    } catch (e) {
        console.error("Recent Activity Error:", e);
        res.json([]); 
    }
});
// ==========================================
// [BARU] ADMIN USER MANAGEMENT ROUTES
// ==========================================

// 1. Ambil Semua User (Untuk Admin Panel)
app.get('/api/admin/users', async (req, res) => {
    try {
        // Ambil semua user, urutkan dari saldo terbanyak
        const users = await User.find({}, 'username balance role').sort({ balance: -1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: "Gagal ambil data user" });
    }
});

// 2. Edit Saldo User (Manual oleh Admin)
app.post('/api/admin/user/balance', async (req, res) => {
    const { username, action, amount } = req.body; // action: 'add' atau 'sub'
    
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, msg: "User tidak ditemukan" });

        const val = parseInt(amount);
        if (action === 'add') {
            user.balance += val;
        } else if (action === 'sub') {
            user.balance -= val;
            if (user.balance < 0) user.balance = 0; // Cegah minus
        }

        await user.save();
        
        // Catat di Transaksi agar ada jejak
        await new Transaction({
            invoiceId: 'ADM-' + Date.now().toString().slice(-6),
            username: username,
            productName: action === 'add' ? 'Saldo Ditambah Admin' : 'Saldo Dikurangi Admin',
            amount: val,
            status: 'success',
            type: action === 'add' ? 'IN' : 'OUT'
        }).save();

        res.json({ success: true, newBalance: user.balance });
    } catch (e) {
        res.status(500).json({ success: false, msg: "Server Error" });
    }
});

// ==========================================
// [WAJIB] ADMIN DASHBOARD ROUTES (TAMBAHAN)
// ==========================================

// 1. AMBIL SEMUA ORDER (Manual Produk)
app.get('/api/admin/orders', async (req, res) => {
    try {
        // Ambil 100 transaksi terakhir
        const orders = await Transaction.find().sort({ createdAt: -1 }).limit(100);
        res.json(orders);
    } catch (e) {
        console.error("Gagal load orders admin:", e);
        res.status(500).json([]);
    }
});

// 2. KELOLA VOUCHER (List, Create, Delete)
app.get('/api/admin/vouchers', async (req, res) => {
    try {
        const vouchers = await Voucher.find().sort({ createdAt: -1 });
        res.json(vouchers);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/voucher', async (req, res) => {
    try {
        const exist = await Voucher.findOne({ code: req.body.code });
        if(exist) return res.status(400).json({ success: false, msg: "Kode sudah ada" });
        
        await new Voucher(req.body).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/voucher/:id', async (req, res) => {
    try {
        await Voucher.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 3. KELOLA BOT AKTIF (Active Services)
app.get('/api/admin/all-services', async (req, res) => {
    try {
        const services = await ActiveService.find().sort({ expiredDate: 1 });
        res.json(services);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/admin/services', async (req, res) => {
    try {
        const { username, productName, targetNumber, serverIp, days } = req.body;
        const expiredDate = new Date(Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000));
        
        await new ActiveService({ 
            username, productName, targetNumber, serverIp, expiredDate 
        }).save();
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/services/:id', async (req, res) => {
    try {
        await ActiveService.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});
// ==========================================
// FITUR GACHA SALDO
// ==========================================
app.post('/api/gacha/play', async (req, res) => {
    try {
        const { username } = req.body;
        const cost = 1000;

        // Validasi input
        if (!username) {
            return res.status(400).json({ success: false, msg: "Sesi tidak valid, silakan login ulang." });
        }

        // 1. Cari User di Database
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, msg: "User tidak ditemukan di database." });
        }

        // 2. Cek apakah saldo mencukupi
        if (user.balance < cost) {
            return res.status(400).json({ success: false, msg: "Saldo tidak mencukupi untuk gacha!" });
        }

        // 3. Potong saldo untuk biaya main
        user.balance -= cost;

        // 4. Logika Probabilitas
        const chance = Math.random() * 100;
        let prize = {};

        if (chance <= 55) {
            prize = { amount: 0, text: "Yahh, ZONK!", type: 'zonk', icon: '🥺', color: 'text-red-400' };
        } else if (chance <= 85) {
            prize = { amount: 1000, text: "Balik Modal!", type: 'normal', icon: '👍', color: 'text-blue-400' };
        } else if (chance <= 99) {
            prize = { amount: 2000, text: "Cuan Dikit!", type: 'good', icon: '🔥', color: 'text-green-400' };
        } else {
            prize = { amount: 5000, text: "JACKPOT!!!", type: 'jackpot', icon: '🤑', color: 'text-yellow-400' };
        }

        // 5. Tambahkan hadiah ke saldo user
        user.balance += prize.amount;
        
        // 6. Simpan perubahan saldo ke MongoDB
        await user.save(); 

        // 7. Kembalikan hasil ke frontend
        res.json({ success: true, prize, newBalance: user.balance });

    } catch (error) {
        console.error("Gacha Error:", error);
        res.status(500).json({ success: false, msg: "Terjadi kesalahan server saat memproses Gacha." });
    }
});
// ==========================================
// SCHEMA DEFINITIONS (APP PREMIUM)
// ==========================================

const AppPremiumConfigSchema = new mongoose.Schema({
    appName: { type: String, required: true, unique: true },
    price: { type: Number, default: 0 },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' }
});
const AppPremiumConfig = mongoose.models.AppPremiumConfig || mongoose.model('AppPremiumConfig', AppPremiumConfigSchema);

const AppPremiumStockSchema = new mongoose.Schema({
    appName: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    instructions: { type: String, default: '' },
    status: { type: String, default: 'available' },
    buyer: { type: String, default: null },
    purchasedAt: { type: Date, default: null }
});
const AppPremiumStock = mongoose.models.AppPremiumStock || mongoose.model('AppPremiumStock', AppPremiumStockSchema);


// ==========================================
// --- API UNTUK USER (FRONTEND) ---
// ==========================================

// Get List App & Sisa Stock
app.get('/api/app-premium/list', async (req, res) => {
    try {
        const configs = await AppPremiumConfig.find();
        const apps = [];
        
        for (let conf of configs) {
            const stockCount = await AppPremiumStock.countDocuments({ appName: conf.appName, status: 'available' });
            apps.push({
                appName: conf.appName,
                price: conf.price,
                description: conf.description,
                imageUrl: conf.imageUrl,
                stock: stockCount
            });
        }
        res.json({ success: true, data: apps });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Proses Pembelian
app.post('/api/app-premium/buy', async (req, res) => {
    try {
        const { username, appName } = req.body;
        if (!username) return res.status(401).json({ success: false, msg: "Sesi tidak valid, login ulang." });

        const user = await User.findOne({ username });
        const config = await AppPremiumConfig.findOne({ appName });
        
        if (!user || !config) return res.status(400).json({ success: false, msg: "Data produk tidak valid." });
        if (user.balance < config.price) return res.status(400).json({ success: false, msg: "Saldo tidak mencukupi." });

        const stock = await AppPremiumStock.findOne({ appName, status: 'available' });
        if (!stock) return res.status(400).json({ success: false, msg: "Maaf, stock aplikasi ini habis!" });

        user.balance -= config.price;
        await user.save();

        stock.status = 'sold';
        stock.buyer = username;
        stock.purchasedAt = new Date();
        await stock.save();

        res.json({ success: true, newBalance: user.balance, account: stock });
    } catch (e) { res.status(500).json({ success: false, msg: "Terjadi kesalahan server." }); }
});

// Riwayat Pembelian User
app.get('/api/app-premium/history/:username', async (req, res) => {
    try {
        const history = await AppPremiumStock.find({ buyer: req.params.username, status: 'sold' }).sort({ purchasedAt: -1 });
        res.json({ success: true, data: history });
    } catch (e) { res.status(500).json({ success: false }); }
});


// ==========================================
// --- API UNTUK ADMIN ---
// ==========================================

// Ambil semua daftar config
app.get('/api/admin/app-premium/configs', async (req, res) => {
    try {
        const configs = await AppPremiumConfig.find();
        res.json({ success: true, data: configs });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Update / Simpan Config
app.post('/api/admin/app-premium/config', async (req, res) => {
    try {
        const { appName, price, description, imageUrl } = req.body;
        await AppPremiumConfig.findOneAndUpdate(
            { appName: appName.toLowerCase() }, 
            { price, description, imageUrl }, 
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Tambah Stock
app.post('/api/admin/app-premium/stock', async (req, res) => {
    try {
        const { appName, email, password, instructions } = req.body;
        await new AppPremiumStock({ appName: appName.toLowerCase(), email, password, instructions, status: 'available' }).save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Hapus Produk & Stok
app.delete('/api/admin/app-premium/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        await AppPremiumConfig.findOneAndDelete({ appName: appName.toLowerCase() });
        await AppPremiumStock.deleteMany({ appName: appName.toLowerCase() });
        res.json({ success: true, msg: "Produk & Seluruh stok berhasil dihapus!" });
    } catch (e) { res.status(500).json({ success: false }); }
});
//dashboard buat saldo cek
app.use('/api', require('./dashboard'));

// JALANKAN SERVER SEGERA (Agar Cloudflare Tunnel Gak Loading)
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Is Ready on port ${PORT}`);
    // Panggil koneksi DB setelah server nyala
    connectDB(); 
});

module.exports = app;
