const express = require("express");
const session = require("express-session");
const path = require("path");

const multer = require("multer");

const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");

const adapter = new JSONFile("data/db.json");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage: storage });

const db = new Low(adapter, {
    users: [],
    posts: [],
    announcements: [],
    library: [],
    messages: []
});

async function initDB() {
    await db.read();
    db.data ||= { users: [] };
    await db.write();
}

initDB();

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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

    res.render("dashboard", {
    user: req.session.user,
    posts: db.data.posts,
    announcements: db.data.announcements,
    usersCount: db.data.users.length,
    postsCount: db.data.posts.length,
    announcementsCount: db.data.announcements.length,
    libraryCount: db.data.library.length
});
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

    res.render("profile", { user });
});

app.get("/admin", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    // Only the administrator can access this page
    const currentUser = db.data.users.find(
    u => u.email === req.session.user
);

if (!currentUser || currentUser.role !== "admin") {
    return res.send("❌ Access Denied. Admins only.");
}

    await db.read();

    res.render("admin", {
        users: db.data.users.length,
        posts: db.data.posts.length,
        announcements: db.data.announcements.length,
        library: db.data.library.length
    });
});

// View all registered users
app.get("/users", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

    res.render("users", {
        users: db.data.users
    });
});

// Delete a user
app.post("/delete-user/:email", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

    db.data.users = db.data.users.filter(
        user => user.email !== req.params.email
    );

    await db.write();

    res.redirect("/users");
});

// Edit Profile page
app.get("/edit-profile", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

    const user = db.data.users.find(
        u => u.email === req.session.user
    );

    res.render("edit-profile", { user });
});

// Save profile
app.post("/edit-profile", upload.single("photo"), async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { phone, country, bio } = req.body;

    await db.read();

    const user = db.data.users.find(
        u => u.email === req.session.user
    );

    if (user) {
    user.phone = phone;
    user.country = country;
    user.bio = bio;

    if (req.file) {
        user.photo = "/uploads/" + req.file.filename;
    }
}

    await db.write();

    res.redirect("/profile");
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
    password,
    role: email === "adewoleadetayom@gmail.com" ? "admin" : "member"
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

// Announcements page
app.get("/announcements", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

    res.render("announcements", {
        announcements: db.data.announcements
    });
});

// Library page
app.get("/library", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    await db.read();

    res.render("library", {
        library: db.data.library
    });
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

// Publish Announcement
app.post("/admin/announcement", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { title, content } = req.body;

    await db.read();

    db.data.announcements.push({
        title,
        content,
        author: req.session.user,
        date: new Date().toLocaleString()
    });

    await db.write();

    res.redirect("/announcements");
});

// Add to Leadership Library
app.post("/admin/library", upload.single("file"), async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { title, description, type, link } = req.body;

let file = "";

if (type === "link") {
    file = link;
} else if (req.file) {
    file = "/uploads/" + req.file.filename;
}

    await db.read();

    db.data.library.push({
        title,
        description,
        type,
        file,
        author: req.session.user,
        date: new Date().toLocaleString()
    });

    await db.write();

    res.redirect("/library");
});

// Publish Announcement
app.post("/admin/announcement", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const { title, content } = req.body;

    await db.read();

    db.data.announcements.push({
        title,
        content,
        author: req.session.user,
        date: new Date().toLocaleString()
    });

    await db.write();

    res.redirect("/announcements");
});


// Start the server
app.listen(PORT, () => {
    console.log(`GoodLeaders server is running at http://localhost:${PORT}`);
});









