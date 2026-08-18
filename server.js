const express = require("express");
const session = require("express-session");
const path = require("path");
const multer = require("multer");
const { pool, testDatabase, addOnlineStatusColumn } = require("./database");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 3000;

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

// =========================
// PASSWORD RESET MIGRATION
// =========================

async function addPasswordResetColumns() {
    if (!process.env.DATABASE_URL) {
        console.log("⚠️ Skipping password reset migration: DATABASE_URL is not set.");
        return;
    }

    try {
        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
            ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;
        `);

        console.log("✅ Password reset columns are ready.");
    } catch (error) {
        console.error(
            "❌ Password reset migration failed:",
            error.message
        );
    }
}



// =========================
// FILE UPLOAD
// =========================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});

// =========================
// EXPRESS SETUP
// =========================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "goodleaders-secret-key",
    resave: false,
    saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, "public")));

// =========================
// ONLINE STATUS
// =========================

app.use(async (req, res, next) => {
    if (req.session.user && process.env.DATABASE_URL) {
        try {
            await pool.query(
                "UPDATE users SET last_seen = NOW() WHERE email = $1",
                [req.session.user]
            );
        } catch (error) {
            console.error(
                "Online status update failed:",
                error.message
            );
        }
    }

    next();
});


// =========================
// GROUP CHAT FILE UPLOADS
// =========================

const groupUpload = multer({
    dest: "public/group-uploads/",
    limits: {
        fileSize: 25 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {

        const allowed = [
            "application/pdf",

            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",

            "video/mp4",
            "video/webm",
            "video/quicktime",

            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",

            "text/plain"
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("This file type is not allowed."));
        }
    }
});

// =========================
// PRIVATE CHAT FILE UPLOADS
// =========================

const privateUpload = multer({
    dest: "public/private-uploads/",
    limits: {
        fileSize: 25 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {

        const allowed = [
            "application/pdf",

            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",

            "video/mp4",
            "video/webm",
            "video/quicktime",

            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",

            "text/plain"
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("This file type is not allowed."));
        }
    }
});

// =========================
// PRIVATE UPLOAD FILE ACCESS
// =========================

app.use(
    "/private-uploads",
    express.static(
        path.join(__dirname, "public", "private-uploads")
    )
);

// =========================
// HELPERS
// =========================

async function getUser(email) {
    const result = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
    );

    return result.rows[0] || null;
}

// Main administrators whose admin access is always recognized.
const MAIN_ADMIN_EMAILS = [
    "adewoleadetayom@gmail.com",
    "arowologoodluck2@gmail.com"
];

async function isAdmin(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (MAIN_ADMIN_EMAILS.includes(normalizedEmail)) {
        return true;
    }

    const user = await getUser(email);
    return !!(user && user.role === "admin");
}

function requireLogin(req, res) {
    if (!req.session.user) {
        res.redirect("/login");
        return false;
    }

    return true;
}


// =========================
// GROUP UPLOAD FILE ACCESS
// =========================

app.use(
    "/group-uploads",
    express.static(
        path.join(__dirname, "public", "group-uploads")
    )
);

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

// =========================
// JESUS / FAITH REGISTRATION FLOW
// =========================

app.get("/faith-before-register", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "views",
            "faith-before-register.html"
        )
    );
});

app.post("/faith-before-register", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).send("Please complete all registration fields.");
    }

    req.session.pendingRegistration = {
        username,
        email,
        password
    };

    res.sendFile(
        path.join(
            __dirname,
            "views",
            "faith-before-register.html"
        )
    );
});

app.get("/faith-prayer", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "views",
            "faith-prayer.html"
        )
    );
});

app.get("/faith-continue", async (req, res) => {
    try {
        const pending = req.session.pendingRegistration;

        if (!pending) {
            return res.redirect("/register");
        }

        const { username, email, password } = pending;

        const existingUser = await getUser(email);

        if (existingUser) {
            delete req.session.pendingRegistration;
            return res.send("This email is already registered.");
        }

        const role =
            email === "adewoleadetayom@gmail.com"
                ? "admin"
                : "member";

        await pool.query(
            `
            INSERT INTO users
            (username, email, password, role)
            VALUES ($1, $2, $3, $4)
            `,
            [
                username,
                email,
                password,
                role
            ]
        );

        req.session.user = email;
        delete req.session.pendingRegistration;

        res.redirect("/dashboard");

    } catch (error) {
        console.error("Faith registration error:", error);
        res.status(500).send("Registration failed.");
    }
});

// =========================
// REGISTER PAGE
// =========================


app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register.html"));
});

// =========================
// DASHBOARD
// =========================

app.get("/dashboard", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const postsResult = await pool.query(
            "SELECT * FROM posts ORDER BY id DESC"
        );

        const announcementsResult = await pool.query(
            "SELECT * FROM announcements ORDER BY id DESC"
        );

        const usersResult = await pool.query(
            "SELECT COUNT(*)::int AS count FROM users"
        );

        const postsCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM posts"
        );

        const announcementsCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM announcements"
        );

        const libraryCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM library"
        );


        const dashboardEmail =
            typeof req.session.user === "string"
                ? req.session.user
                : req.session.user.email;

        const usernameResult = await pool.query(
            "SELECT username FROM users WHERE email = $1 LIMIT 1",
            [dashboardEmail]
        );

        const dashboardUsername =
            usernameResult.rows.length > 0
                ? usernameResult.rows[0].username
                : dashboardEmail;

        res.render("dashboard", {
            username: dashboardUsername,
            user: req.session.user,
            posts: postsResult.rows,
            announcements: announcementsResult.rows,
            usersCount: usersResult.rows[0].count,
            postsCount: postsCount.rows[0].count,
            announcementsCount: announcementsCount.rows[0].count,
            libraryCount: libraryCount.rows[0].count
        });

    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).send("Dashboard error.");
    }
});

// =========================
// PROFILE
// =========================

app.get("/profile", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const user = await getUser(req.session.user);

        if (!user) {
            return res.send("User not found.");
        }

        res.render("profile", { user });

    } catch (error) {
        console.error("Profile error:", error);
        res.status(500).send("Profile error.");
    }
});

// =========================
// EDIT PROFILE PAGE
// =========================

app.get("/edit-profile", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const user = await getUser(req.session.user);

        res.render("edit-profile", { user });

    } catch (error) {
        console.error("Edit profile error:", error);
        res.status(500).send("Error loading profile.");
    }
});

// =========================
// SAVE PROFILE
// =========================

app.post("/edit-profile", upload.single("photo"), async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const { phone, country, bio } = req.body;

        let query;
        let values;

        if (req.file) {
            query = `
                UPDATE users
                SET phone = $1,
                    country = $2,
                    bio = $3,
                    photo = $4
                WHERE email = $5
            `;

            values = [
                phone || null,
                country || null,
                bio || "",
                "/uploads/" + req.file.filename,
                req.session.user
            ];
        } else {
            query = `
                UPDATE users
                SET phone = $1,
                    country = $2,
                    bio = $3
                WHERE email = $4
            `;

            values = [
                phone || null,
                country || null,
                bio || "",
                req.session.user
            ];
        }

        await pool.query(query, values);

        res.redirect("/profile");

    } catch (error) {
        console.error("Save profile error:", error);
        res.status(500).send("Could not update profile.");
    }
});

// =========================
// REGISTER
// =========================

app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const existingUser = await getUser(email);

        if (existingUser) {
            return res.send("This email is already registered.");
        }

        const role =
            email === "adewoleadetayom@gmail.com"
                ? "admin"
                : "member";

        await pool.query(
            `
            INSERT INTO users
            (username, email, password, role)
            VALUES ($1, $2, $3, $4)
            `,
            [
                username,
                email,
                password,
                role
            ]
        );

        req.session.user = email;

        res.redirect("/dashboard");

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send("Registration failed.");
    }
});

// =========================
// FORGOT PASSWORD
// =========================

app.get("/forgot-password", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Forgot Password - GoodLeaders</title>

<style>
*{
    box-sizing:border-box;
    margin:0;
    padding:0;
    font-family:Arial,Helvetica,sans-serif;
}

body{
    min-height:100vh;
    display:flex;
    justify-content:center;
    align-items:center;
    padding:20px;
    background:
        linear-gradient(135deg,#0d6efd,#4facfe);
}

.container{
    width:100%;
    max-width:430px;
}

.card{
    background:#ffffff;
    border-radius:24px;
    padding:38px 32px;
    box-shadow:0 18px 45px rgba(0,0,0,.22);
}

.logo{
    width:72px;
    height:72px;
    margin:0 auto 18px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#eaf3ff;
    font-size:34px;
}

h1{
    text-align:center;
    color:#123;
    font-size:28px;
    margin-bottom:10px;
}

.subtitle{
    text-align:center;
    color:#6b7280;
    line-height:1.6;
    margin-bottom:28px;
}

label{
    display:block;
    color:#333;
    font-weight:bold;
    margin-bottom:8px;
}

input{
    width:100%;
    padding:15px;
    border:1px solid #d5dbe3;
    border-radius:12px;
    outline:none;
    font-size:16px;
    transition:.2s;
}

input:focus{
    border-color:#0d6efd;
    box-shadow:0 0 0 3px rgba(13,110,253,.12);
}

button{
    width:100%;
    margin-top:18px;
    padding:15px;
    border:0;
    border-radius:12px;
    background:#0d6efd;
    color:white;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
    transition:.2s;
}

button:hover{
    background:#0b5ed7;
    transform:translateY(-1px);
}

.security{
    margin-top:22px;
    padding:14px;
    border-radius:12px;
    background:#f4f8ff;
    color:#596579;
    font-size:13px;
    line-height:1.5;
    text-align:center;
}

.back{
    display:block;
    text-align:center;
    margin-top:22px;
    color:#0d6efd;
    text-decoration:none;
    font-weight:bold;
}

.back:hover{
    text-decoration:underline;
}

.footer{
    text-align:center;
    color:rgba(255,255,255,.9);
    font-size:13px;
    margin-top:18px;
}

@media(max-width:480px){
    .card{
        padding:30px 22px;
        border-radius:20px;
    }

    h1{
        font-size:25px;
    }
}
</style>
</head>

<body>

<div class="container">

    <div class="card">

        <div class="logo">🔐</div>

        <h1>Forgot Password?</h1>

        <p class="subtitle">
            No worries. Enter the email address connected
            to your GoodLeaders account and we'll help you
            get back into your account.
        </p>

        <form action="/forgot-password" method="POST">

            <label for="email">Email Address</label>

            <input
                id="email"
                type="email"
                name="email"
                placeholder="Enter your email address"
                autocomplete="email"
                required
            >

            <button type="submit">
                Send Reset Link
            </button>

        </form>

        <div class="security">
            🔒 Your account security is important to us.
            Password reset links are temporary and expire
            after 30 minutes.
        </div>

        <a class="back" href="/login">
            ← Back to Login
        </a>

    </div>

    <div class="footer">
        © GoodLeaders — Leadership, Growth &amp; Purpose
    </div>

</div>

</body>
</html>
    `);
});

app.post("/forgot-password", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).send("Please enter your email address.");
        }

        const user = await getUser(email);

        /*
         * Do not reveal whether an email is registered.
         * This prevents account enumeration.
         */
        if (!user) {
            return res.send(`
                <h2>Password Recovery</h2>
                <p>
                If an account exists for that email address,
                password recovery instructions can be provided.
                </p>
                <a href="/login">Back to Login</a>
            `);
        }

        const crypto = require("crypto");

        const token = crypto.randomBytes(32).toString("hex");

        const expires = new Date(
            Date.now() + 30 * 60 * 1000
        );

        await pool.query(
            `
            UPDATE users
            SET password_reset_token = $1,
                password_reset_expires = $2
            WHERE email = $3
            `,
            [token, expires, email]
        );

        if (!resend) {
            console.error("RESEND_API_KEY is not configured.");
            return res.status(500).send(
                "Password recovery is temporarily unavailable."
            );
        }

        const resetUrl =
            `https://goodleaders.onrender.com/reset-password/${token}`;

        const { data, error } = await resend.emails.send({
            from: "GoodLeaders <onboarding@resend.dev>",
            to: [email],
            subject: "Reset your GoodLeaders password",
            html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:30px;">
<div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:15px;">

<h2 style="color:#1565c0;">GoodLeaders Password Reset</h2>

<p>Hello,</p>

<p>
We received a request to reset your GoodLeaders account password.
</p>

<p>
Click the button below to create a new password:
</p>

<p>
<a href="${resetUrl}"
style="display:inline-block;padding:14px 22px;background:#1565c0;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
Reset My Password
</a>
</p>

<p>
This link will expire in <strong>30 minutes</strong>.
</p>

<p>
If you did not request a password reset, you can safely ignore this email.
</p>

<p>— GoodLeaders</p>

</div>
</body>
</html>
            `
        });

        if (error) {
            console.error("Resend error:", error);
            return res.status(500).send(
                "We could not send the password reset email. Please try again later."
            );
        }

        console.log("Password reset email sent:", data?.id);

        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>Check Your Email - GoodLeaders</title>

<style>
*{
    box-sizing:border-box;
    margin:0;
    padding:0;
    font-family:Arial,Helvetica,sans-serif;
}

body{
    min-height:100vh;
    display:flex;
    justify-content:center;
    align-items:center;
    padding:20px;
    background:linear-gradient(135deg,#0d6efd,#4facfe);
}

.container{
    width:100%;
    max-width:430px;
}

.card{
    background:#fff;
    border-radius:24px;
    padding:42px 32px;
    text-align:center;
    box-shadow:0 18px 45px rgba(0,0,0,.22);
}

.success-icon{
    width:82px;
    height:82px;
    margin:0 auto 20px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#e8f8ee;
    color:#28a745;
    font-size:42px;
}

h1{
    color:#123;
    font-size:27px;
    margin-bottom:14px;
}

.message{
    color:#667085;
    line-height:1.7;
    margin-bottom:24px;
}

.email-box{
    background:#f4f8ff;
    border-radius:14px;
    padding:16px;
    margin-bottom:20px;
    color:#596579;
    font-size:14px;
    line-height:1.6;
}

.email-box strong{
    color:#1565c0;
}

.security{
    background:#fff8e8;
    border-radius:14px;
    padding:15px;
    color:#765b16;
    font-size:13px;
    line-height:1.6;
    margin-bottom:25px;
}

.login-button{
    display:block;
    width:100%;
    padding:15px;
    border-radius:12px;
    background:#0d6efd;
    color:white;
    text-decoration:none;
    font-weight:bold;
    font-size:16px;
}

.login-button:hover{
    background:#0b5ed7;
}

.footer{
    text-align:center;
    color:rgba(255,255,255,.9);
    font-size:13px;
    margin-top:18px;
}

@media(max-width:480px){
    .card{
        padding:34px 22px;
    }

    h1{
        font-size:24px;
    }
}
</style>
</head>

<body>

<div class="container">

<div class="card">

<div class="success-icon">
✓
</div>

<h1>Check Your Email</h1>

<p class="message">
If the email address is registered with GoodLeaders,
we've sent you a password reset link.
</p>

<div class="email-box">
📧 <strong>Password reset email sent</strong>
<br>
Please open your email inbox and look for a message
from <strong>GoodLeaders</strong>.
</div>

<div class="security">
🔒 <strong>Didn't see it?</strong>
<br>
Please check your Spam, Junk, or Promotions folder.
The reset link will expire after <strong>30 minutes</strong>.
</div>

<a class="login-button" href="/login">
← Back to Login
</a>

</div>

<div class="footer">
© GoodLeaders — Leadership, Growth &amp; Purpose
</div>

</div>

</body>
</html>
        `);

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).send("Password recovery is currently unavailable.");
    }
});

// =========================
// RESET PASSWORD
// =========================

app.get("/reset-password/:token", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT email
            FROM users
            WHERE password_reset_token = $1
              AND password_reset_expires > NOW()
            `,
            [req.params.token]
        );

        if (result.rows.length === 0) {
            return res.status(400).send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Invalid Reset Link - GoodLeaders</title>
<style>
*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
body{
    margin:0;
    min-height:100vh;
    display:flex;
    justify-content:center;
    align-items:center;
    padding:20px;
    background:linear-gradient(135deg,#0d6efd,#4facfe);
}
.card{
    width:100%;
    max-width:430px;
    background:white;
    padding:38px 32px;
    border-radius:24px;
    text-align:center;
    box-shadow:0 18px 45px rgba(0,0,0,.22);
}
.icon{
    font-size:50px;
    margin-bottom:15px;
}
h1{
    color:#dc3545;
    margin-bottom:12px;
}
p{
    color:#666;
    line-height:1.6;
}
a{
    display:block;
    margin-top:24px;
    color:#0d6efd;
    text-decoration:none;
    font-weight:bold;
}
</style>
</head>
<body>
<div class="card">
<div class="icon">⚠️</div>
<h1>Link Expired</h1>
<p>
This password reset link is invalid or has expired.
Please request a new password reset link.
</p>
<a href="/forgot-password">Request a New Link</a>
<a href="/login">← Back to Login</a>
</div>
</body>
</html>
            `);
        }

        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>Reset Password - GoodLeaders</title>

<style>
*{
    box-sizing:border-box;
    margin:0;
    padding:0;
    font-family:Arial,Helvetica,sans-serif;
}

body{
    min-height:100vh;
    display:flex;
    justify-content:center;
    align-items:center;
    padding:20px;
    background:linear-gradient(135deg,#0d6efd,#4facfe);
}

.container{
    width:100%;
    max-width:430px;
}

.card{
    background:#fff;
    border-radius:24px;
    padding:38px 32px;
    box-shadow:0 18px 45px rgba(0,0,0,.22);
}

.logo{
    width:72px;
    height:72px;
    margin:0 auto 18px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#eaf3ff;
    font-size:34px;
}

h1{
    text-align:center;
    color:#123;
    font-size:28px;
    margin-bottom:10px;
}

.subtitle{
    text-align:center;
    color:#6b7280;
    line-height:1.6;
    margin-bottom:25px;
}

label{
    display:block;
    color:#333;
    font-weight:bold;
    margin:15px 0 8px;
}

.password-box{
    position:relative;
}

input{
    width:100%;
    padding:15px;
    border:1px solid #d5dbe3;
    border-radius:12px;
    outline:none;
    font-size:16px;
}

input:focus{
    border-color:#0d6efd;
    box-shadow:0 0 0 3px rgba(13,110,253,.12);
}

button{
    width:100%;
    margin-top:22px;
    padding:15px;
    border:0;
    border-radius:12px;
    background:#0d6efd;
    color:#fff;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
}

button:hover{
    background:#0b5ed7;
}

.requirements{
    margin-top:18px;
    padding:14px;
    border-radius:12px;
    background:#f4f8ff;
    color:#596579;
    font-size:13px;
    line-height:1.6;
}

.footer{
    text-align:center;
    color:rgba(255,255,255,.9);
    font-size:13px;
    margin-top:18px;
}

@media(max-width:480px){
    .card{
        padding:30px 22px;
        border-radius:20px;
    }

    h1{
        font-size:25px;
    }
}
</style>
</head>

<body>

<div class="container">

<div class="card">

<div class="logo">🔐</div>

<h1>Create New Password</h1>

<p class="subtitle">
Choose a new password for your GoodLeaders account.
</p>

<form action="/reset-password" method="POST">

<input
    type="hidden"
    name="token"
    value="${req.params.token}"
>

<label for="password">New Password</label>

<input
    id="password"
    type="password"
    name="password"
    placeholder="Enter your new password"
    minlength="6"
    autocomplete="new-password"
    required
>

<label for="confirmPassword">Confirm Password</label>

<input
    id="confirmPassword"
    type="password"
    name="confirmPassword"
    placeholder="Confirm your new password"
    minlength="6"
    autocomplete="new-password"
    required
>

<button type="submit">
Reset Password
</button>

</form>

<div class="requirements">
🔒 Password must be at least <strong>6 characters</strong>.
<br>
⏱️ This reset link expires after <strong>30 minutes</strong>.
</div>

</div>

<div class="footer">
© GoodLeaders — Leadership, Growth &amp; Purpose
</div>

</div>

</body>
</html>
        `);

    } catch (error) {
        console.error("Reset page error:", error);
        res.status(500).send("Could not load password reset page.");
    }
});

app.post("/reset-password", async (req, res) => {
    try {
        const {
            token,
            password,
            confirmPassword
        } = req.body;

        if (!token || !password || !confirmPassword) {
            return res.status(400).send("Please complete all fields.");
        }

        if (password !== confirmPassword) {
            return res.status(400).send("The passwords do not match.");
        }

        if (password.length < 6) {
            return res.status(400).send(
                "Password must be at least 6 characters long."
            );
        }

        const bcrypt = require("bcryptjs");

        const result = await pool.query(
            `
            SELECT email
            FROM users
            WHERE password_reset_token = $1
              AND password_reset_expires > NOW()
            `,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).send(`
                <h2>Invalid or Expired Link</h2>
                <p>This password reset link is no longer valid.</p>
                <a href="/forgot-password">Request another reset</a>
            `);
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await pool.query(
            `
            UPDATE users
            SET password = $1,
                password_reset_token = NULL,
                password_reset_expires = NULL
            WHERE email = $2
            `,
            [hashedPassword, result.rows[0].email]
        );

        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>Password Reset Successful - GoodLeaders</title>

<style>
*{
    box-sizing:border-box;
    margin:0;
    padding:0;
    font-family:Arial,Helvetica,sans-serif;
}

body{
    min-height:100vh;
    display:flex;
    justify-content:center;
    align-items:center;
    padding:20px;
    background:linear-gradient(135deg,#0d6efd,#4facfe);
}

.container{
    width:100%;
    max-width:430px;
}

.card{
    background:#fff;
    border-radius:24px;
    padding:42px 32px;
    text-align:center;
    box-shadow:0 18px 45px rgba(0,0,0,.22);
}

.success-icon{
    width:78px;
    height:78px;
    margin:0 auto 20px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#e8f8ee;
    color:#28a745;
    font-size:42px;
}

h1{
    color:#123;
    font-size:27px;
    margin-bottom:12px;
}

.message{
    color:#667085;
    line-height:1.7;
    margin-bottom:25px;
}

.login-button{
    display:block;
    width:100%;
    padding:15px;
    border-radius:12px;
    background:#0d6efd;
    color:white;
    text-decoration:none;
    font-weight:bold;
    font-size:16px;
}

.login-button:hover{
    background:#0b5ed7;
}

.security{
    margin-top:20px;
    padding:14px;
    border-radius:12px;
    background:#f4f8ff;
    color:#596579;
    font-size:13px;
    line-height:1.5;
}

.footer{
    text-align:center;
    color:rgba(255,255,255,.9);
    font-size:13px;
    margin-top:18px;
}

@media(max-width:480px){
    .card{
        padding:34px 22px;
    }

    h1{
        font-size:24px;
    }
}
</style>
</head>

<body>

<div class="container">

<div class="card">

<div class="success-icon">
✓
</div>

<h1>Password Reset Successful!</h1>

<p class="message">
Your GoodLeaders password has been changed successfully.
You can now sign in using your new password.
</p>

<a class="login-button" href="/login">
Go to Login
</a>

<div class="security">
🔒 Your new password is securely protected.
<br>
Welcome back to GoodLeaders!
</div>

</div>

<div class="footer">
© GoodLeaders — Leadership, Growth &amp; Purpose
</div>

</div>

</body>
</html>
        `);

    } catch (error) {
        console.error("Password reset error:", error);
        res.status(500).send("Could not reset password.");
    }
});

// =========================
// LOGIN PAGE
// =========================

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "login.html"));
});

// =========================
// LOGIN
// =========================

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            `
            SELECT *
            FROM users
            WHERE LOWER(email) = LOWER($1)
            `,
            [email]
        );

        if (result.rows.length === 0) {
            return res.send("Invalid email or password.");
        }

        const user = result.rows[0];
        const bcrypt = require("bcryptjs");

        let passwordValid = false;

        // Support existing accounts whose passwords were stored
        // before bcrypt was introduced.
        if (
            typeof user.password === "string" &&
            user.password.startsWith("$2")
        ) {
            passwordValid = await bcrypt.compare(
                password,
                user.password
            );
        } else {
            passwordValid = user.password === password;

            // Automatically upgrade an old plain-text password
            // to a secure bcrypt hash after successful login.
            if (passwordValid) {
                const hashedPassword = await bcrypt.hash(password, 12);

                await pool.query(
                    `
                    UPDATE users
                    SET password = $1
                    WHERE email = $2
                    `,
                    [hashedPassword, user.email]
                );
            }
        }

        if (!passwordValid) {
            return res.send("Invalid email or password.");
        }

        req.session.user = user.email;

        res.redirect("/dashboard");

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send("Login failed.");
    }
});

// =========================
// USERS
// =========================

app.get("/users", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const result = await pool.query(
            "SELECT * FROM users ORDER BY id DESC"
        );

        res.render("users", {
            users: result.rows
        });

    } catch (error) {
        console.error("Users error:", error);
        res.status(500).send("Could not load users.");
    }
});

// =========================
// DELETE USER
// =========================

app.post("/delete-user/:email", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        await pool.query(
            "DELETE FROM users WHERE email = $1",
            [req.params.email]
        );

        res.redirect("/users");

    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).send("Could not delete user.");
    }
});

// =========================
// EDIT USER
// =========================

app.get("/edit-user/:email", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const user = await getUser(req.params.email);

        if (!user) {
            return res.send("User not found.");
        }

        res.render("edit-user", { user });

    } catch (error) {
        console.error("Edit user error:", error);
        res.status(500).send("Could not load user.");
    }
});

app.post("/edit-user", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res.status(403).send("Access denied. Admins only.");
        }

        const {
            email,
            username,
            phone,
            country,
            bio,
            newPassword,
            confirmPassword
        } = req.body;

        if (!email || !username) {
            return res.status(400).send("Name and email are required.");
        }

        if (newPassword || confirmPassword) {
            if (newPassword !== confirmPassword) {
                return res.status(400).send("The new passwords do not match.");
            }

            if (newPassword.length < 6) {
                return res.status(400).send("New password must be at least 6 characters long.");
            }

            await pool.query(
                `
                UPDATE users
                SET username = $1,
                    phone = $2,
                    country = $3,
                    bio = $4,
                    password = $5
                WHERE email = $6
                `,
                [
                    username,
                    phone || null,
                    country || null,
                    bio || "",
                    newPassword,
                    email
                ]
            );
        } else {
            await pool.query(
                `
                UPDATE users
                SET username = $1,
                    phone = $2,
                    country = $3,
                    bio = $4
                WHERE email = $5
                `,
                [
                    username,
                    phone || null,
                    country || null,
                    bio || "",
                    email
                ]
            );
        }

        res.redirect("/users");

    } catch (error) {
        console.error("Edit user error:", error);
        res.status(500).send("Could not update user.");
    }
});

// =========================
// MAKE ADMIN
// =========================

app.post("/make-admin/:email", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        await pool.query(
            `
            UPDATE users
            SET role = 'admin'
            WHERE email = $1
            `,
            [req.params.email]
        );

        res.redirect("/users");

    } catch (error) {
        console.error("Make admin error:", error);
        res.status(500).send("Could not make user admin.");
    }
});

// =========================
// ADMIN PAGE
// =========================

app.get("/admin", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res
                .status(403)
                .send("❌ Access Denied. Admins only.");
        }

        const users = await pool.query(
            "SELECT COUNT(*)::int AS count FROM users"
        );

        const posts = await pool.query(
            "SELECT COUNT(*)::int AS count FROM posts"
        );

        const announcements = await pool.query(
            "SELECT COUNT(*)::int AS count FROM announcements"
        );

        const library = await pool.query(
            "SELECT COUNT(*)::int AS count FROM library"
        );

        res.render("admin", {
            users: users.rows[0].count,
            posts: posts.rows[0].count,
            announcements: announcements.rows[0].count,
            library: library.rows[0].count
        });

    } catch (error) {
        console.error("Admin error:", error);
        res.status(500).send("Admin page error.");
    }
});

// =========================
// PUBLISH LEADERSHIP ADVICE
// =========================

app.post("/admin/post", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const { title, content } = req.body;

        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res
                .status(403)
                .send("Access denied. Admins only.");
        }

        await pool.query(
            `
            INSERT INTO posts
            (title, content, author, date)
            VALUES ($1, $2, $3, $4)
            `,
            [
                title,
                content,
                req.session.user,
                new Date().toLocaleString()
            ]
        );

        res.send(`
            Leadership advice published successfully!
            <br><br>
            <a href="/admin">⬅ Back to Admin Panel</a>
        `);

    } catch (error) {
        console.error("Post error:", error);
        res.status(500).send("Could not publish advice.");
    }
});

// =========================
// DELETE LEADERSHIP ADVICE / ARTICLE
// =========================

app.post("/admin/delete-post/:id", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res.status(403).send("Access denied. Admins only.");
        }

        await pool.query(
            "DELETE FROM posts WHERE id = $1",
            [req.params.id]
        );

        res.redirect("/dashboard");

    } catch (error) {
        console.error("Delete post error:", error);
        res.status(500).send("Could not delete article.");
    }
});

// =========================
// ANNOUNCEMENTS PAGE
// =========================

app.get("/announcements", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const result = await pool.query(
            "SELECT * FROM announcements ORDER BY id DESC"
        );

        const admin = await isAdmin(req.session.user);

res.render("announcements", {
    announcements: result.rows,
    isAdmin: admin
});

    } catch (error) {
        console.error("Announcements error:", error);
        res.status(500).send("Could not load announcements.");
    }
});

// =========================
// PUBLISH ANNOUNCEMENT
// =========================

app.post("/admin/announcement", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const { title, content } = req.body;

        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res
                .status(403)
                .send("Access denied. Admins only.");
        }

        await pool.query(
            `
            INSERT INTO announcements
            (title, content, author, date)
            VALUES ($1, $2, $3, $4)
            `,
            [
                title,
                content,
                req.session.user,
                new Date().toLocaleString()
            ]
        );

        res.redirect("/announcements");

    } catch (error) {
        console.error("Announcement error:", error);
        res.status(500).send("Could not publish announcement.");
    }
});

// =========================
// DELETE ANNOUNCEMENT
// =========================

app.post("/admin/delete-announcement/:id", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res.status(403).send("Access denied. Admins only.");
        }

        await pool.query(
            "DELETE FROM announcements WHERE id = $1",
            [req.params.id]
        );

        res.redirect("/announcements");

    } catch (error) {
        console.error("Delete announcement error:", error);
        res.status(500).send("Could not delete announcement.");
    }
});

// =========================
// LIBRARY
// =========================

app.get("/library", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const result = await pool.query(
            "SELECT * FROM library ORDER BY id DESC"
        );

        res.render("library", {
            library: result.rows
        });

    } catch (error) {
        console.error("Library error:", error);
        res.status(500).send("Could not load library.");
    }
});

// =========================
// ADD LIBRARY ITEM
// =========================

app.post("/admin/library", upload.single("file"), async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const {
            title,
            description,
            type,
            link
        } = req.body;

        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res
                .status(403)
                .send("Access denied. Admins only.");
        }

        let file = "";

        if (type === "link") {
            file = link || "";
        } else if (req.file) {
            file = "/uploads/" + req.file.filename;
        }

        await pool.query(
            `
            INSERT INTO library
            (title, description, type, file, author, date)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
                title,
                description || null,
                type || null,
                file,
                req.session.user,
                new Date().toLocaleString()
            ]
        );

        res.redirect("/library");

    } catch (error) {
        console.error("Library upload error:", error);
        res.status(500).send("Could not add library item.");
    }
});

// =========================
// DELETE LIBRARY ITEM
// =========================

app.post("/admin/library/delete/:id", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res.status(403).send("Access denied. Admins only.");
        }

        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM library WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).send("Library item not found.");
        }

        console.log(
            `Library item deleted: ${result.rows[0].title} (ID ${id})`
        );

        res.redirect("/library");

    } catch (error) {
        console.error("Library delete error:", error);
        res.status(500).send("Could not delete library item.");
    }
});


// =========================
// GROUP CHAT DATABASE SETUP
// =========================

async function ensureGroupChatTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_messages (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                date VARCHAR(100) NOT NULL
            )
        `);

        console.log("✅ Group chat table ready.");
    } catch (error) {
        console.error("❌ Group chat table setup failed:", error.message);
    }
}

ensureGroupChatTable();


// =========================
// GROUP CHAT FILE TABLE
// =========================

async function ensureGroupFilesTable() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_files (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(255) NOT NULL,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                mime_type VARCHAR(255) NOT NULL,
                file_size BIGINT NOT NULL,
                date VARCHAR(100) NOT NULL
            )
        `);

        console.log("✅ Group files table ready.");

    } catch (error) {

        console.error(
            "❌ Group files table setup failed:",
            error.message
        );

    }
}

ensureGroupFilesTable();


// =========================
// PRIVATE CHAT FILES TABLE
// =========================

async function ensurePrivateFilesTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS private_files (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(255) NOT NULL,
                receiver VARCHAR(255) NOT NULL,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                mime_type VARCHAR(255) NOT NULL,
                file_size BIGINT NOT NULL,
                date VARCHAR(100) NOT NULL
            )
        `);

        console.log("✅ Private files table ready.");

    } catch (error) {
        console.error(
            "❌ Private files table setup failed:",
            error.message
        );
    }
}

ensurePrivateFilesTable();


// =========================
// CHAT
// =========================

app.get("/chat", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
    const selectedUser = req.query.user || "";
    const groupChat = req.query.group === "main";

        const users = await pool.query(
    `
    SELECT
    u.*,
    COALESCE(unread.unread_count, 0) AS unread_count,
    CASE
        WHEN u.last_seen IS NOT NULL
        AND u.last_seen > NOW() - INTERVAL '2 minutes'
        THEN TRUE
        ELSE FALSE
    END AS is_online
FROM users u
    LEFT JOIN (
        SELECT
            sender,
            COUNT(*) AS unread_count
        FROM messages
        WHERE receiver = $1
        AND read = FALSE
        GROUP BY sender
    ) unread
    ON unread.sender = u.email
    ORDER BY u.username ASC
    `,
    [req.session.user]
);

if (selectedUser) {
    await pool.query(
        `
        UPDATE messages
        SET read = TRUE
        WHERE sender = $1
        AND receiver = $2
        AND read = FALSE
        `,
        [selectedUser, req.session.user]
    );
}
        let messages = { rows: [] };
        let privateFiles = { rows: [] };
        let groupMessages = { rows: [] };
        let groupFiles = { rows: [] };

        if (groupChat) {

            groupMessages = await pool.query(
                `
                SELECT *
                FROM group_messages
                ORDER BY id ASC
                `
            );

            groupFiles = await pool.query(
                `
                SELECT *
                FROM group_files
                ORDER BY id ASC
                `
            );

        } else if (selectedUser) {
            messages = await pool.query(
                `
                SELECT *
                FROM messages
                WHERE
                    (sender = $1 AND receiver = $2)
                    OR
                    (sender = $2 AND receiver = $1)
                ORDER BY id ASC
                `,
                [req.session.user, selectedUser]
            );

            privateFiles = await pool.query(
                `
                SELECT *
                FROM private_files
                WHERE
                    (
                        LOWER(TRIM(sender)) = LOWER(TRIM($1))
                        AND
                        LOWER(TRIM(receiver)) = LOWER(TRIM($2))
                    )
                    OR
                    (
                        LOWER(TRIM(sender)) = LOWER(TRIM($2))
                        AND
                        LOWER(TRIM(receiver)) = LOWER(TRIM($1))
                    )
                ORDER BY id ASC
                `,
                [req.session.user, selectedUser]
            );
        }

        res.render("chat", {
            user: req.session.user,
            users: users.rows,
            messages: messages.rows,
            privateFiles: privateFiles.rows,
            groupMessages: groupMessages.rows,
            groupFiles: groupFiles.rows,
            selectedUser,
            groupChat
        });

    } catch (error) {
        console.error("Chat error:", error);
        res.status(500).send("Could not load chat.");
    }
});


// =========================
// SEND GROUP CHAT FILE
// =========================

app.post(
    "/chat/group-upload",
    groupUpload.single("groupFile"),
    async (req, res) => {

        if (!requireLogin(req, res)) {
            return;
        }

        try {

            if (!req.file) {
                return res.status(400).send(
                    "Please select a file."
                );
            }

            await pool.query(
                `
                INSERT INTO group_files
                (
                    sender,
                    original_name,
                    stored_name,
                    mime_type,
                    file_size,
                    date
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                `,
                [
                    req.session.user,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype,
                    req.file.size,
                    new Date().toLocaleString()
                ]
            );

            res.redirect("/chat?group=main");

        } catch (error) {

            console.error(
                "Group file upload error:",
                error
            );

            res.status(500).send(
                "Could not upload the file."
            );
        }
    }
);

// =========================
// SEND PRIVATE CHAT FILE
// =========================

app.post(
    "/chat/private-upload",
    privateUpload.single("privateFile"),
    async (req, res) => {

        if (!requireLogin(req, res)) {
            return;
        }

        try {

            console.log("===== PRIVATE FILE UPLOAD START =====");
            console.log("Sender:", req.session.user);
            console.log("Receiver:", req.body.receiver);
            console.log("Uploaded file:", req.file ? {
                originalname: req.file.originalname,
                filename: req.file.filename,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : "NO FILE");
            
            const { receiver } = req.body;

            if (!receiver) {
                return res.status(400).send(
                    "Receiver is required."
                );
            }

            if (!req.file) {
                return res.status(400).send(
                    "Please select a file."
                );
            }

            console.log("Saving private file to database...");

            await pool.query(
                `
                INSERT INTO private_files
                (
                    sender,
                    receiver,
                    original_name,
                    stored_name,
                    mime_type,
                    file_size,
                    date
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                `,
                [
                    req.session.user,
                    receiver,
                    req.file.originalname,
                    req.file.filename,
                    req.file.mimetype,
                    req.file.size,
                    new Date().toLocaleString()
                ]
            );

            console.log("===== PRIVATE FILE UPLOAD SUCCESS =====");

            res.redirect(
                "/chat?user=" +
                encodeURIComponent(receiver)
            );

        } catch (error) {

            console.error(
                "Private file upload error:",
                error
            );

            res.status(500).send(
                "Could not upload the private file."
            );
        }
    }
);

// =========================
// SEND GROUP CHAT MESSAGE
// =========================

app.post("/chat/group-send", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).send("Message is required.");
        }

        await pool.query(
            `
            INSERT INTO group_messages
            (sender, content, date)
            VALUES ($1, $2, $3)
            `,
            [
                req.session.user,
                content.trim(),
                new Date().toLocaleString()
            ]
        );

        res.redirect("/chat?group=main");

    } catch (error) {
        console.error("Group chat send error:", error);
        res.status(500).send("Could not send group message.");
    }
});

// =========================
// SEND PRIVATE CHAT MESSAGE
// =========================

app.post("/chat/send", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const { receiver, content } = req.body;

        if (!receiver || !content || !content.trim()) {
            return res.status(400).send("Receiver and message are required.");
        }

        await pool.query(
            `
            INSERT INTO messages
            (sender, receiver, content, date, read)
            VALUES ($1, $2, $3, $4, $5)
            `,
            [
                req.session.user,
                receiver,
                content.trim(),
                new Date().toLocaleString(),
                false
            ]
        );

        res.redirect("/chat");

    } catch (error) {
        console.error("Send message error:", error);
        res.status(500).send("Could not send message.");
    }
});

// =========================
// CONTACT PAGE
// =========================

app.get("/contact", (req, res) => {
    res.render("contact");
});

// =========================
// CONTACT MESSAGE
// =========================

app.post("/contact", async (req, res) => {
    try {
        const {
            name,
            email,
            message
        } = req.body;

        await pool.query(
            `
            INSERT INTO contact_messages
            (name, email, message, date)
            VALUES ($1, $2, $3, $4)
            `,
            [
                name,
                email,
                message,
                new Date().toLocaleString()
            ]
        );

        res.send(`
            <h2 style="font-family:Arial;text-align:center;margin-top:50px;">
            ✅ Your message has been sent successfully!
            </h2>

            <p style="font-family:Arial;text-align:center;">
            Thank you for contacting GoodLeaders.
            </p>

            <p style="text-align:center;">
            <a href="/contact">Send another message</a>
            &nbsp; | &nbsp;
            <a href="/dashboard">Back to Dashboard</a>
            </p>
        `);

    } catch (error) {
        console.error("Contact error:", error);
        res.status(500).send("Could not send message.");
    }
});

// =========================
// CONTACT MESSAGES
// =========================

app.get("/contact-messages", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res
                .status(403)
                .send("Access denied. Admins only.");
        }

        const result = await pool.query(
            "SELECT * FROM contact_messages ORDER BY id DESC"
        );

        res.render("contact-messages", {
            messages: result.rows
        });

    } catch (error) {
        console.error("Contact messages error:", error);
        res.status(500).send("Could not load messages.");
    }
});

// =========================
// DELETE CONTACT MESSAGE
// =========================

app.post("/delete-contact-message/:id", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res
                .status(403)
                .send("Access denied. Admins only.");
        }

        await pool.query(
            "DELETE FROM contact_messages WHERE id = $1",
            [req.params.id]
        );

        res.redirect("/contact-messages");

    } catch (error) {
        console.error("Delete contact message error:", error);
        res.status(500).send("Could not delete message.");
    }
});

// =========================
// ARTICLES
// =========================

app.get("/articles", async (req, res) => {
    try {
        const postsResult = await pool.query(
            "SELECT * FROM posts ORDER BY id DESC"
        );

        const admin = await isAdmin(req.session.user);

        res.render("articles", {
            posts: postsResult.rows,
            dbPosts: postsResult.rows,
            isAdmin: admin
        });

    } catch (error) {
        console.error("Articles error:", error);
        res.status(500).send("Could not load articles.");
    }
});

// =========================
// LEADERSHIP ARTICLE
// =========================

app.get("/article/:id", async (req, res) => {
    try {
        const articleId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(articleId) || articleId < 1) {
            return res.status(400).send("Invalid article ID.");
        }

        const result = await pool.query(
            "SELECT * FROM posts WHERE id = $1",
            [articleId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send("Article not found.");
        }

        const post = result.rows[0];

        const postsResult = await pool.query(
            "SELECT * FROM posts ORDER BY id DESC"
        );

        let admin = false;

        try {
            admin = await isAdmin(req.session.user);
        } catch (error) {
            console.error("Admin check error:", error);
        }

        res.render("article", {
            post: post,
            item: post,
            dbPosts: postsResult.rows,
            posts: postsResult.rows,
            isAdmin: admin
        });

    } catch (error) {
        console.error("Article error:", error);
        res.status(500).send("Could not load article.");
    }
});


// =========================
// ADMIN DELETE ARTICLE
// =========================

app.post("/admin/delete-article/:id", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const admin = await isAdmin(req.session.user);

        if (!admin) {
            return res.status(403).send("Access denied. Admins only.");
        }

        const articleId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(articleId) || articleId < 1) {
            return res.status(400).send("Invalid article ID.");
        }

        await pool.query(
            "DELETE FROM posts WHERE id = $1",
            [articleId]
        );

        res.redirect("/articles");

    } catch (error) {
        console.error("Delete article error:", error);
        res.status(500).send("Could not delete article.");
    }
});

// =========================
// SEARCH
// =========================

app.get("/search", async (req, res) => {
    try {
        const q = (req.query.q || "").trim();

        const search = `%${q}%`;

        const postsResult = await pool.query(
            `
            SELECT *
            FROM posts
            WHERE title ILIKE $1
               OR content ILIKE $1
            ORDER BY id DESC
            `,
            [search]
        );

        const announcementsResult = await pool.query(
            `
            SELECT *
            FROM announcements
            WHERE title ILIKE $1
               OR content ILIKE $1
            ORDER BY id DESC
            `,
            [search]
        );

        const libraryResult = await pool.query(
            `
            SELECT *
            FROM library
            WHERE title ILIKE $1
               OR description ILIKE $1
            ORDER BY id DESC
            `,
            [search]
        );

        const allPosts = await pool.query(
            "SELECT * FROM posts ORDER BY id DESC"
        );

        res.render("search", {
            q,
            posts: postsResult.rows,
            announcements: announcementsResult.rows,
            library: libraryResult.rows,
            dbPosts: allPosts.rows
        });

    } catch (error) {
        console.error("Search error:", error);
        res.status(500).send("Search failed.");
    }
});

// =========================
// ABOUT
// =========================

app.get("/about", (req, res) => {
    res.render("about");
});

// =========================
// POLICIES
// =========================

app.get("/privacy", (req, res) => {
    res.render("privacy");
});

app.get("/terms", (req, res) => {
    res.render("terms");
});

app.get("/cookies", (req, res) => {
    res.render("cookies");
});

// =========================
// LOGOUT
// =========================

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// =========================
// START SERVER
// =========================

app.listen(PORT, async () => {
    console.log(
        `GoodLeaders server is running at http://localhost:${PORT}`
    );

    if (process.env.DATABASE_URL) {
    await addPasswordResetColumns();
    await testDatabase();
    await addOnlineStatusColumn();
} else {
        console.log(
            "⚠️ DATABASE_URL is not set in this environment."
        );
    }
});
