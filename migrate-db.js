const fs = require("fs");
const { pool } = require("./database");

async function migrateDatabase() {
    try {
        const data = JSON.parse(
            fs.readFileSync("data/db.json", "utf8")
        );

        console.log("Starting GoodLeaders data migration...");

        // Users
        for (const user of data.users || []) {
            await pool.query(
                `INSERT INTO users
                (username, email, password, role, phone, country, bio, photo)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (email) DO NOTHING`,
                [
                    user.username,
                    user.email,
                    user.password,
                    user.role || "user",
                    user.phone || null,
                    user.country || null,
                    user.bio || "",
                    user.photo || null
                ]
            );
        }

        // Posts
        for (const post of data.posts || []) {
            await pool.query(
                `INSERT INTO posts
                (title, content, author, date)
                VALUES ($1,$2,$3,$4)`,
                [
                    post.title,
                    post.content,
                    post.author || null,
                    post.date || null
                ]
            );
        }

        // Announcements
        for (const announcement of data.announcements || []) {
            await pool.query(
                `INSERT INTO announcements
                (title, content, author, date)
                VALUES ($1,$2,$3,$4)`,
                [
                    announcement.title,
                    announcement.content,
                    announcement.author || null,
                    announcement.date || null
                ]
            );
        }

        // Library
        for (const item of data.library || []) {
            await pool.query(
                `INSERT INTO library
                (title, description, type, file, author, date)
                VALUES ($1,$2,$3,$4,$5,$6)`,
                [
                    item.title,
                    item.description || null,
                    item.type || null,
                    item.file || null,
                    item.author || null,
                    item.date || null
                ]
            );
        }

        // Messages
        for (const message of data.messages || []) {
            await pool.query(
                `INSERT INTO messages
                (sender, receiver, content, date, read)
                VALUES ($1,$2,$3,$4,$5)`,
                [
                    message.sender || null,
                    message.receiver || null,
                    message.content || null,
                    message.date || null,
                    message.read || false
                ]
            );
        }

        // Contact messages
        for (const message of data.contactMessages || []) {
            await pool.query(
                `INSERT INTO contact_messages
                (name, email, message, date)
                VALUES ($1,$2,$3,$4)`,
                [
                    message.name || null,
                    message.email || null,
                    message.message || null,
                    message.date || null
                ]
            );
        }

        console.log("✅ GoodLeaders data migrated successfully!");
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrateDatabase();
