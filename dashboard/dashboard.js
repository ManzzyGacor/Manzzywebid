// --- dashboard/dashboard.js ---

const API_BASE_URL = 'https://apiman-gamma.vercel.app'; // Ganti dengan URL Vercel Anda yang sebenarnya
const logoutBtn = document.getElementById('logout-btn');
const usernameDisplay = document.getElementById('username-display');
const toggleAdminFormBtn = document.getElementById('toggle-admin-form');
const addFormPanel = document.getElementById('add-form-panel');
const addPostForm = document.getElementById('add-post-form');
const postsList = document.getElementById('posts-list');
const noPostsMessage = document.getElementById('no-posts-message');

// --- Fungsi Logout ---
function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    window.location.href = 'index.html'; // Arahkan kembali ke halaman login
}
logoutBtn.addEventListener('click', handleLogout);

// --- Cek Token & Tampilkan User ---
async function verifyTokenAndLoadUser() {
    const token = localStorage.getItem('authToken');
    const storedUsername = localStorage.getItem('username');

    if (!token) {
        handleLogout();
        return;
    }

    // Tampilkan username dari local storage
    if (storedUsername) {
        usernameDisplay.textContent = storedUsername;
    } else {
        usernameDisplay.textContent = 'User';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
            method: 'GET',
            headers: {
                'x-auth-token': token,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Token tidak valid atau kadaluarsa.');
            handleLogout();
            return;
        }

        const data = await response.json();
        if (data.user && !storedUsername) {
            usernameDisplay.textContent = data.user;
            localStorage.setItem('username', data.user);
        }

        // --- Cek Role Admin ---
        // Placeholder: Di real app, Anda akan cek data.user.role === 'admin'
        const isAdmin = true; 
        if (isAdmin) {
            toggleAdminFormBtn.style.display = 'block';
        }

    } catch (error) {
        console.error('Error saat verifikasi token atau memuat dashboard:', error);
        handleLogout();
    }
}

// --- Tampilkan/Sembunyikan Form Admin ---
toggleAdminFormBtn.addEventListener('click', () => {
    addFormPanel.classList.toggle('active');
    if (addFormPanel.classList.contains('active')) {
        toggleAdminFormBtn.textContent = 'Sembunyikan Form';
    } else {
        toggleAdminFormBtn.textContent = 'Tambah Post Admin';
    }
});

// --- Logika Post ---
const posts = JSON.parse(localStorage.getItem('adminPosts')) || [];
const MAX_DISPLAY_POSTS = 3;

function renderPosts() {
    postsList.innerHTML = '';
    
    if (posts.length === 0) {
        noPostsMessage.style.display = 'block';
        return;
    } else {
        noPostsMessage.style.display = 'none';
    }

    const postsToDisplay = posts.slice(0, MAX_DISPLAY_POSTS);

    postsToDisplay.forEach((post, index) => {
        const postCard = document.createElement('div');
        postCard.className = 'form-card';
        // Menggunakan innerHTML agar tag HTML di konten bisa dirender
        let imageHtml = post.imageUrl ? `<img src="${post.imageUrl}" alt="${post.title}">` : '';
        
        postCard.innerHTML = `
            ${imageHtml}
            <h3>${post.title}</h3>
            <div class="content">${post.content}</div>
        `;
        postsList.appendChild(postCard);
    });
}

addPostForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('post-title').value;
    const imageUrl = document.getElementById('post-image-url').value;
    const content = document.getElementById('post-content').value;

    const newPost = {
        id: Date.now(),
        title,
        imageUrl,
        content
    };
    
    posts.unshift(newPost);
    localStorage.setItem('adminPosts', JSON.stringify(posts));
    addPostForm.reset();
    addFormPanel.classList.remove('active');
    toggleAdminFormBtn.textContent = 'Tambah Post Admin';
    renderPosts();
});

// --- Inisialisasi ---
document.addEventListener('DOMContentLoaded', () => {
    verifyTokenAndLoadUser();
    renderPosts();
});
