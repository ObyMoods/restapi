const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const session = require('express-session');
const crypto = require('crypto');
const os = require('os');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL_USER = process.env.EMAIL_USER;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Session
app.use(session({
    secret: 'xyroo_secret_key_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// ==================== DATABASE ====================
let users = [];
let otpStorage = {};

// Helper: Generate API Key (6 huruf)
function generateApiKey() {
    return crypto.randomBytes(3).toString('hex').substring(0, 6);
}

// Helper: Reset API Key
function resetApiKey(oldKey) {
    const user = users.find(u => u.apiKey === oldKey);
    if (user) {
        user.apiKey = generateApiKey();
        return user.apiKey;
    }
    return null;
}

// ==================== FUNGSI STATISTIK ====================

function getUptime() {
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    return `${days} hari, ${hours} jam, ${minutes} menit, ${seconds} detik`;
}

function getServerLocation() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone.includes('Asia/Jakarta')) return 'Jakarta, Indonesia';
    if (timezone.includes('Asia/Singapore')) return 'Singapura, SG';
    if (timezone.includes('Asia/Tokyo')) return 'Tokyo, Japan';
    return 'Unknown, ' + timezone;
}

function getSpeed() {
    return new Promise((resolve) => {
        const start = Date.now();
        setTimeout(() => {
            const latency = Date.now() - start;
            const speed = Math.floor(100 + (Math.random() * 50));
            resolve({
                latency: latency + ' ms',
                speed: speed + ' Mbps'
            });
        }, 10);
    });
}

function getTotalEndpoints() {
    let count = 0;
    app._router.stack.forEach(middleware => {
        if (middleware.route) {
            count++;
        } else if (middleware.name === 'router') {
            middleware.handle.stack.forEach(handler => {
                if (handler.route) {
                    count++;
                }
            });
        }
    });
    return count;
}

// ==================== ROUTES ====================

// 1. Beranda
app.get('/', async (req, res) => {
    const user = req.session.user || null;
    const speedData = await getSpeed();
    
    res.render('index', { 
        user: user,
        currentPage: 'home',
        stats: {
            endpoint: getTotalEndpoints(),
            uptime: getUptime(),
            location: getServerLocation(),
            speed: speedData.speed,
            latency: speedData.latency,
            totalCategories: 14,
            provider: 'Xyroo',
            serverName: os.hostname()
        }
    });
});

// 2. Profil
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    getSpeed().then(speedData => {
        res.render('profile', { 
            user: req.session.user,
            currentPage: 'profile',
            stats: {
                endpoint: getTotalEndpoints(),
                uptime: getUptime(),
                location: getServerLocation(),
                speed: speedData.speed,
                latency: speedData.latency,
                totalCategories: 14,
                provider: 'Xyroo',
                serverName: os.hostname()
            }
        });
    });
});

// 3. Update Profil
app.post('/profile/update', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const { username, avatar } = req.body;
    const email = req.session.user.email;
    
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex !== -1) {
        users[userIndex].username = username || users[userIndex].email.split('@')[0];
        if (avatar) {
            users[userIndex].avatar = avatar;
        }
        req.session.user = users[userIndex];
        res.json({ success: true, message: 'Profil berhasil diperbarui!' });
    } else {
        res.json({ success: false, message: 'User tidak ditemukan!' });
    }
});

// 4. Reset API Key
app.post('/profile/reset-key', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const oldKey = req.session.user.apiKey;
    const newKey = resetApiKey(oldKey);
    
    if (newKey) {
        const user = users.find(u => u.apiKey === newKey);
        if (user) {
            req.session.user = user;
        }
        res.json({ success: true, newApiKey: newKey, message: 'API Key berhasil direset!' });
    } else {
        res.json({ success: false, message: 'Gagal reset API Key' });
    }
});

// 5. Endpoint Cek User
app.get('/api/users/check', (req, res) => {
    const { apikey } = req.query;
    
    if (!apikey) {
        return res.status(400).json({
            status: 400,
            message: 'API Key diperlukan'
        });
    }
    
    const user = users.find(u => u.apiKey === apikey);
    if (!user) {
        return res.status(401).json({
            status: 401,
            message: 'API Key tidak valid'
        });
    }
    
    res.json({
        status: 200,
        author: 'Xyroo',
        data: {
            email: user.email,
            username: user.username || user.email.split('@')[0],
            apiKey: user.apiKey,
            limit: user.limit,
            used: user.used,
            remaining: user.limit - user.used,
            percentage: Math.round((user.used / user.limit) * 100) + '%',
            verified: user.verified,
            role: user.role
        }
    });
});

// 6. Login
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/profile');
    }
    res.render('login', { 
        error: null,
        user: null,
        currentPage: 'login'
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.render('login', { 
            error: "Email atau password salah!",
            user: null,
            currentPage: 'login'
        });
    }
    
    if (!user.verified) {
        return res.render('login', { 
            error: "Akun belum diverifikasi. Cek email Anda.",
            user: null,
            currentPage: 'login'
        });
    }
    
    req.session.user = user;
    res.redirect('/profile');
});

// 7. Register
app.get('/register', (req, res) => {
    res.render('register', { 
        message: null,
        user: null,
        currentPage: 'register'
    });
});

app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    
    if (users.find(u => u.email === email)) {
        return res.render('register', { 
            message: "Email sudah terdaftar!",
            user: null,
            currentPage: 'register'
        });
    }
    
    const apiKey = generateApiKey();
    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiryMinutes = 5;
    otpStorage[email] = otp;
    
    const newUser = {
        email: email,
        password: password,
        apiKey: apiKey,
        username: email.split('@')[0],
        avatar: null,
        verified: false,
        registeredAt: new Date().toLocaleString('id-ID'),
        limit: 100,
        used: 0,
        role: 'REGULAR'
    };
    users.push(newUser);
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    
    const verifyLink = `${BASE_URL}/verify-email?code=${otp}&email=${email}`;
    const verifyPage = `${BASE_URL}/verify?email=${email}`;
    
    const mailOptions = {
        from: `"Xyroo Api's" <${EMAIL_USER}>`,
        to: email,
        subject: '🔐 Verifikasi Akun Xyroo Api\'s',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Xyroo Api's</h1>
                    </div>
                    <div style="padding: 32px;">
                        <h2 style="margin-top: 0; color: #333;">Verifikasi Akun Anda</h2>
                        <p style="color: #666; margin-bottom: 24px;">Gunakan salah satu metode di bawah untuk memverifikasi akun Anda:</p>
                        
                        <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 12px; margin-bottom: 24px;">
                            <h3 style="margin-top: 0; color: #333;">Metode 1: Klik Link</h3>
                            <p style="color: #666;">Klik tombol di bawah untuk verifikasi otomatis:</p>
                            <a href="${verifyLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">✅ Verifikasi Sekarang</a>
                        </div>
                        
                        <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 12px; margin-bottom: 24px;">
                            <h3 style="margin-top: 0; color: #333;">Metode 2: Masukkan Kode OTP</h3>
                            <p style="color: #666;">Kode OTP Anda: <strong style="font-size: 24px; letter-spacing: 4px;">${otp}</strong></p>
                            <p style="color: #666;">Atau kunjungi halaman verifikasi:</p>
                            <a href="${verifyPage}" style="display: inline-block; background: #764ba2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">🔑 Masukkan Kode OTP</a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px;">Kode ini berlaku selama <strong>5 menit</strong>.</p>
                        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
                        <p style="color: #999; font-size: 12px; margin-bottom: 0;">
                            Jika Anda tidak meminta kode ini, abaikan email ini.<br>
                            © 2026 - Xyroo Api's
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `Verifikasi Akun Xyroo Api's\n\nMetode 1: Klik link berikut\n${verifyLink}\n\nMetode 2: Masukkan kode OTP\nKode OTP: ${otp}\nKunjungi: ${verifyPage}\n\nKode berlaku 5 menit.`
    };
    
    try {
        await transporter.sendMail(mailOptions);
        res.render('verify-email', { 
            email: email,
            message: `Kode OTP telah dikirim ke ${email}. Cek Gmail/Spam.`,
            user: null,
            currentPage: 'verify'
        });
    } catch (error) {
        console.error('Email error:', error);
        res.render('register', { 
            message: "Gagal mengirim email. Cek konfigurasi Gmail Anda.",
            user: null,
            currentPage: 'register'
        });
    }
});

// 8. Verifikasi Link
app.get('/verify-email', (req, res) => {
    const { code, email } = req.query;
    
    if (otpStorage[email] && String(otpStorage[email]) === String(code)) {
        const index = users.findIndex(u => u.email === email);
        if (index !== -1) {
            users[index].verified = true;
            delete otpStorage[email];
            return res.send(`
                <h1>✅ Akun Berhasil Diverifikasi!</h1>
                <p>Silakan <a href="/login">Login</a> sekarang.</p>
                <p>API Key Anda: <strong>${users[index].apiKey}</strong></p>
            `);
        }
    }
    res.send("❌ Kode verifikasi salah atau sudah kadaluarsa.");
});

// 9. Verifikasi OTP (Input Manual)
app.get('/verify', (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.redirect('/register');
    }
    res.render('verify-otp', { 
        email: email,
        error: null,
        user: null,
        currentPage: 'verify'
    });
});

app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    
    if (!otpStorage[email]) {
        return res.render('verify-otp', { 
            email: email,
            error: "Kode OTP sudah kadaluarsa atau tidak ditemukan. Minta kirim ulang.",
            user: null,
            currentPage: 'verify'
        });
    }
    
    if (String(otpStorage[email]) === String(otp)) {
        const index = users.findIndex(u => u.email === email);
        if (index !== -1) {
            users[index].verified = true;
            delete otpStorage[email];
            return res.send(`
                <h1>✅ Akun Berhasil Diverifikasi!</h1>
                <p>Silakan <a href="/login">Login</a> sekarang.</p>
                <p>API Key Anda: <strong>${users[index].apiKey}</strong></p>
            `);
        }
    }
    
    res.render('verify-otp', { 
        email: email,
        error: "Kode OTP salah. Coba lagi.",
        user: null,
        currentPage: 'verify'
    });
});

// 10. Kirim Ulang OTP
app.post('/resend-otp', async (req, res) => {
    const { email } = req.body;
    
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.render('verify-email', { 
            email: email,
            message: "Email tidak ditemukan. Silakan daftar ulang.",
            user: null,
            currentPage: 'verify'
        });
    }
    
    if (user.verified) {
        return res.render('verify-email', { 
            email: email,
            message: "Akun Anda sudah diverifikasi. Silakan login.",
            user: null,
            currentPage: 'verify'
        });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiryMinutes = 5;
    otpStorage[email] = otp;
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    
    const verifyLink = `${BASE_URL}/verify-email?code=${otp}&email=${email}`;
    const verifyPage = `${BASE_URL}/verify?email=${email}`;
    
    const mailOptions = {
        from: `"Xyroo Api's" <${EMAIL_USER}>`,
        to: email,
        subject: '🔐 Verifikasi Akun Xyroo Api\'s (Kirim Ulang)',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Xyroo Api's</h1>
                    </div>
                    <div style="padding: 32px;">
                        <h2 style="margin-top: 0; color: #333;">Verifikasi Akun Anda</h2>
                        <p style="color: #666; margin-bottom: 24px;">Gunakan salah satu metode di bawah untuk memverifikasi akun Anda:</p>
                        
                        <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 12px; margin-bottom: 24px;">
                            <h3 style="margin-top: 0; color: #333;">Metode 1: Klik Link</h3>
                            <p style="color: #666;">Klik tombol di bawah untuk verifikasi otomatis:</p>
                            <a href="${verifyLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">✅ Verifikasi Sekarang</a>
                        </div>
                        
                        <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 12px; margin-bottom: 24px;">
                            <h3 style="margin-top: 0; color: #333;">Metode 2: Masukkan Kode OTP</h3>
                            <p style="color: #666;">Kode OTP Anda: <strong style="font-size: 24px; letter-spacing: 4px;">${otp}</strong></p>
                            <p style="color: #666;">Atau kunjungi halaman verifikasi:</p>
                            <a href="${verifyPage}" style="display: inline-block; background: #764ba2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">🔑 Masukkan Kode OTP</a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px;">Kode ini berlaku selama <strong>5 menit</strong>.</p>
                        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
                        <p style="color: #999; font-size: 12px; margin-bottom: 0;">
                            Jika Anda tidak meminta kode ini, abaikan email ini.<br>
                            © 2026 - Xyroo Api's
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `Verifikasi Akun Xyroo Api's\n\nMetode 1: Klik link berikut\n${verifyLink}\n\nMetode 2: Masukkan kode OTP\nKode OTP: ${otp}\nKunjungi: ${verifyPage}\n\nKode berlaku 5 menit.`
    };
    
    try {
        await transporter.sendMail(mailOptions);
        res.render('verify-email', { 
            email: email,
            message: `Kode OTP telah dikirim ulang ke ${email}. Cek Gmail/Spam.`,
            user: null,
            currentPage: 'verify'
        });
    } catch (error) {
        console.error('Resend error:', error);
        res.render('verify-email', { 
            email: email,
            message: "Gagal mengirim ulang email. Cek konfigurasi Gmail Anda.",
            user: null,
            currentPage: 'verify'
        });
    }
});

// 11. Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 12. Dokumentasi API
app.get('/doc/get', (req, res) => {
    const user = req.session.user || null;
    
    const apiList = [
        { name: 'AI FELO', method: 'GET', endpoint: '/api/ai/felo', category: 'AI' },
        { name: 'AI GITA', method: 'GET', endpoint: '/api/ai/gita', category: 'AI' },
        { name: 'INSTAGRAM STALK', method: 'GET', endpoint: '/api/stalk/instagram', category: 'AI' },
        { name: 'GEMINI LTS', method: 'GET', endpoint: '/api/gemini/lite', category: 'AI' },
        { name: 'TIKTOK STALK', method: 'GET', endpoint: '/api/stalk/tiktok', category: 'AI' }
    ];
    
    res.render('docs', { 
        apiList: apiList,
        user: user,
        currentPage: 'docs',
        BASE_URL: BASE_URL
    });
});

// ==================== API ENDPOINTS REAL ====================

// Endpoint TikTok Stalk (Real) + Limit -1
app.get('/api/stalk/tiktok', async (req, res) => {
    const { username, apikey } = req.query;
    
    if (!username) {
        return res.status(400).json({ 
            status: 400, 
            message: "Parameter 'username' diperlukan" 
        });
    }
    
    if (!apikey) {
        return res.status(401).json({
            status: 401,
            message: "API Key diperlukan"
        });
    }
    
    const user = users.find(u => u.apiKey === apikey);
    if (!user) {
        return res.status(401).json({
            status: 401,
            message: "API Key tidak valid"
        });
    }
    
    if (user.used >= user.limit) {
        return res.status(403).json({
            status: 403,
            message: "Limit API habis. Hubungi admin untuk menambah limit."
        });
    }
    
    user.used += 1;
    
    try {
        const apiUrl = `https://www.tikwm.com/api/user/info?unique_id=${username}`;
        const response = await axios.get(apiUrl, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const data = response.data;
        
        if (data.code !== 0 || !data.data) {
            user.used -= 1;
            return res.status(404).json({
                status: 404,
                message: "User TikTok tidak ditemukan"
            });
        }
        
        const userData = data.data.user;
        const stats = data.data.stats || {};
        
        res.json({
            status: 200,
            author: 'Xyroo',
            data: {
                username: userData.unique_id,
                fullname: userData.nickname || userData.unique_id,
                avatar: userData.avatar_larger || "",
                bio: userData.signature || "No bio",
                region: userData.region || "ID",
                private: userData.private_account === true,
                verified: userData.verified === true,
                stats: {
                    followers: stats.follower_count || 0,
                    following: stats.following_count || 0,
                    likes: stats.heart_count || 0,
                    videos: stats.video_count || 0
                }
            }
        });
        
    } catch (error) {
        user.used -= 1;
        console.error('TikTok Error:', error.message);
        res.status(500).json({
            status: 500,
            message: "Terjadi kesalahan pada server",
            error: error.message
        });
    }
});

// Server Info
app.get('/api/server-info', (req, res) => {
    res.json({
        status: 200,
        server: {
            name: os.hostname(),
            platform: os.platform(),
            uptime: getUptime(),
            memory: {
                total: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
                free: Math.round(os.freemem() / 1024 / 1024) + ' MB'
            },
            cpu: os.cpus().length + ' core',
            location: getServerLocation()
        }
    });
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Xyroo Api's running at ${BASE_URL}`);
    console.log(`📊 Total Endpoints: ${getTotalEndpoints()}`);
    console.log(`📍 Location: ${getServerLocation()}`);
    console.log(`⏱️ Uptime: ${getUptime()}`);
});