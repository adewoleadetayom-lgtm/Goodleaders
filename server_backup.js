const express = require("express");
const session = require("express-session");
const path = require("path");

const multer = require("multer");

const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

const adapter = new JSONFile("data/db.json");
const db = new Low(adapter, { users: [] });

async function initDB() {
    await db.read();
    db.data ||= { users: [] };
    await db.write();
}

initDB();

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

const app = express();
const PORT = 3000;
// Temporary user storage
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: "goodleaders-secret-key",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, "public")));
// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

// Registration page
app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "register.html"));
});

// Dashboard page - now protected
app.get("/dashboard", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

    let postsHtml = "";

    db.data.posts.forEach(post => {
        postsHtml += `
        <div style="background:white;padding:20px;margin:20px 0;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.1);">
            <h2>${post.title}</h2>
            <p>${post.content}</p>
            <small>
                Posted by ${post.author}<br>
                ${post.date}
            </small>
        </div>
        `;
    });

    if (postsHtml === "") {
        postsHtml = "<p>No advice has been posted yet.</p>";
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>GoodLeaders Dashboard</title>

<style>
body{
    font-family:Arial,sans-serif;
    background:#f4f7fb;
    padding:20px;
}

h1{
    color:#2563eb;
}

a{
    text-decoration:none;
    margin-right:15px;
}
</style>

</head>

<body>

<h1>GoodLeaders Dashboard</h1>

<p>
<a href="/admin">🛠 Admin Panel</a>
<a href="/profile">👤 Profile</a>
<a href="/logout">🚪 Logout</a>
</p>

<h2>Leadership Advice</h2>

${postsHtml}

</body>
</html>
`);
});

// Handle registration
app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    await db.read();

    const existingUser = db.data.users.find(
        u => u.email === email
    );

    if (existingUser) {
        return res.send("This email is already registered.");
    }

    db.data.users.push({
        username,
        email,
        password
    });

    await db.write();

    req.session.user = email;
    res.redirect("/dashboard");
});
 
// Login page
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "login.html"));
});

// Handle login
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    await db.read();

    const user = db.data.users.find(
        u => u.email === email && u.password === password
    );

    if (!user) {
        return res.send("Invalid email or password.");
    }

    req.session.user = user.email;

    res.redirect("/dashboard");
});

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// Profile page
app.get("/profile", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

const user = db.data.users.find(
    u => u.email === req.session.user
);
    if (!user) {
        return res.send("User not found.");
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>My Profile</title>
<style>
body{
    font-family:Arial,sans-serif;
    background:#f5f5f5;
    display:flex;
    justify-content:center;
    align-items:center;
    height:100vh;
}
.card{
    background:white;
    width:350px;
    padding:30px;
    border-radius:15px;
    box-shadow:0 5px 15px rgba(0,0,0,.2);
    text-align:center;
}
.avatar{
    width:80px;
    height:80px;
    border-radius:50%;
    background:#007bff;
    color:white;
    font-size:40px;
    line-height:80px;
    margin:auto;
}
.info{
    text-align:left;
    margin-top:20px;
}
.button{
    display:inline-block;
    margin-top:20px;
    padding:10px 20px;
    background:#007bff;
    color:white;
    text-decoration:none;
    border-radius:8px;
}
</style>
</head>
<body>

<div class="card">
<div class="avatar">${user.username.charAt(0).toUpperCase()}</div>

<h2>${user.username}</h2>

<div class="info">
<p><strong>Email:</strong> ${user.email}</p>
<p><strong>Status:</strong> Active Member</p>
<p><strong>Role:</strong> Leader</p>
</div>

<a class="button" href="/dashboard">⬅ Back to Dashboard</a>

</div>

</body>
</html>
`);
 
});

// Edit Profile page
app.get("/edit-profile", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "edit-profile.html"));
});

// Admin Panel
app.get("/admin", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    res.sendFile(path.join(__dirname, "views", "admin.html"));
});

// Publish Leadership Advice
app.post("/admin/post", async (req, res) => {
    const { title, content } = req.body;

    await db.read();

    db.data.posts.push({
        title,
        content,
        author: req.session.user,
        date: new Date().toLocaleString()
    });

    await db.write();

    res.send("Leadership advice published successfully! <br><br><a href='/admin'>⬅ Back to Admin Panel</a>");
});


// Start the server
app.listen(PORT, () => {
    console.log(`GoodLeaders server is running at http://localhost:${PORT}`);
});



