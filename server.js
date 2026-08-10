const express = require("express");
const session = require("express-session");
const path = require("path");
const multer = require("multer");
const { pool, testDatabase } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

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

const upload = multer({ storage });

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
// HELPERS
// =========================

async function getUser(email) {
    const result = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
    );

    return result.rows[0] || null;
}

async function isAdmin(email) {
    const user = await getUser(email);
    return user && user.role === "admin";
}

function requireLogin(req, res) {
    if (!req.session.user) {
        res.redirect("/login");
        return false;
    }

    return true;
}

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
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

        res.render("dashboard", {
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
            WHERE email = $1
            AND password = $2
            `,
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.send("Invalid email or password.");
        }

        req.session.user = result.rows[0].email;

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
        const {
            email,
            username,
            phone,
            country,
            bio
        } = req.body;

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

        res.redirect("/users");

    } catch (error) {
        console.error("Edit user error:", error);
        res.status(500).send("Could not update user.");
    }
});

// =========================
// MAKE ADMIN
// =========================

onapp.post("/make-admin/:email", async (req, res) => {
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
// ANNOUNCEMENTS PAGE
// =========================

app.get("/announcements", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const result = await pool.query(
            "SELECT * FROM announcements ORDER BY id DESC"
        );

        res.render("announcements", {
            announcements: result.rows
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
// CHAT
// =========================

app.get("/chat", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const users = await pool.query(
            "SELECT * FROM users ORDER BY username ASC"
        );

        const messages = await pool.query(
            "SELECT * FROM messages ORDER BY id ASC"
        );

        res.render("chat", {
            user: req.session.user,
            users: users.rows,
            messages: messages.rows
        });

    } catch (error) {
        console.error("Chat error:", error);
        res.status(500).send("Could not load chat.");
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
// ARTICLE
// =========================

app.get("/article/:id", async (req, res) => {
    if (!requireLogin(req, res)) return;

    try {
        const postResult = await pool.query(
            "SELECT * FROM posts WHERE id = $1",
            [req.params.id]
        );

        if (postResult.rows.length === 0) {
            return res.status(404).send("Article not found.");
        }

        const postsResult = await pool.query(
            "SELECT * FROM posts ORDER BY id DESC"
        );

        res.render("article", {
            post: postResult.rows[0],
            dbPosts: postsResult.rows
        });

    } catch (error) {
        console.error("Article error:", error);
        res.status(500).send("Could not load article.");
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
        await testDatabase();
    } else {
        console.log(
            "⚠️ DATABASE_URL is not set in this environment."
        );
    }
});









/* TEMPORARY: Admin-only PostgreSQL duplicate checker */
app.get("/admin/library-duplicates", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    try {
        const userResult = await pool.query(
            "SELECT role FROM users WHERE email = $1",
            [req.session.user]
        );

        if (
            userResult.rows.length === 0 ||
            userResult.rows[0].role !== "admin"
        ) {
            return res.status(403).send("Access denied. Admins only.");
        }

        const result = await pool.query(`
            SELECT
                id,
                title,
                description,
                type,
                file,
                author,
                date,
                COUNT(*) OVER (
                    PARTITION BY title, file
                ) AS duplicate_count
            FROM library
            ORDER BY title, id
        `);

        const duplicates = result.rows.filter(
            item => Number(item.duplicate_count) > 1
        );

        res.json({
            totalLibraryRecords: result.rows.length,
            duplicateRecords: duplicates.length,
            duplicates
        });

    } catch (error) {
        console.error("Duplicate checker error:", error);
        res.status(500).json({
            error: "Could not check library duplicates",
            details: error.message
        });
    }
});

/* TEMPORARY: Admin-only Library duplicate cleanup */
app.get("/admin/library-cleanup", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    if (req.query.confirm !== "DELETE_DUPLICATES") {
        return res.status(400).send(
            "Cleanup not executed. Add ?confirm=DELETE_DUPLICATES to the URL."
        );
    }

    const client = await pool.connect();

    try {
        const userResult = await client.query(
            "SELECT role FROM users WHERE email = $1",
            [req.session.user]
        );

        if (
            userResult.rows.length === 0 ||
            userResult.rows[0].role !== "admin"
        ) {
            return res.status(403).send("Access denied. Admins only.");
        }

        await client.query("BEGIN");

        const result = await client.query(`
            DELETE FROM library
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY title, file
                            ORDER BY id
                        ) AS row_number
                    FROM library
                ) duplicates
                WHERE row_number > 1
            )
            RETURNING id, title, file
        `);

        await client.query("COMMIT");

        res.json({
            success: true,
            deletedRecords: result.rowCount,
            deleted: result.rows
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Library cleanup error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {
        client.release();
    }
});

