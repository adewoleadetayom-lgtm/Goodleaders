const fs = require("fs");
const { pool } = require("./database");

async function migrateDatabase() {
    const client = await pool.connect();

    try {
        const data = JSON.parse(
            fs.readFileSync("data/db.json", "utf8")
        );

        console.log("Starting safe GoodLeaders data migration...");

        await client.query("BEGIN");

        // USERS
        for (const user of data.users || []) {
            await client.query(
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

        // POSTS
        for (const post of data.posts || []) {
            const exists = await client.query(
                `SELECT 1 FROM posts
                 WHERE title = $1
                 AND content = $2
                 AND author IS NOT DISTINCT FROM $3
                 AND date IS NOT DISTINCT FROM $4
                 LIMIT 1`,
                [
                    post.title,
                    post.content,
                    post.author || null,
                    post.date || null
                ]
            );

            if (exists.rowCount === 0) {
                await client.query(
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
        }

        // ANNOUNCEMENTS
        for (const announcement of data.announcements || []) {
            const exists = await client.query(
                `SELECT 1 FROM announcements
                 WHERE title = $1
                 AND content = $2
                 AND author IS NOT DISTINCT FROM $3
                 AND date IS NOT DISTINCT FROM $4
                 LIMIT 1`,
                [
                    announcement.title,
                    announcement.content,
                    announcement.author || null,
                    announcement.date || null
                ]
            );

            if (exists.rowCount === 0) {
                await client.query(
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
        }

        // LIBRARY
        for (const item of data.library || []) {
            const exists = await client.query(
                `SELECT 1 FROM library
                 WHERE title = $1
                 AND description IS NOT DISTINCT FROM $2
                 AND type IS NOT DISTINCT FROM $3
                 AND file IS NOT DISTINCT FROM $4
                 AND author IS NOT DISTINCT FROM $5
                 AND date IS NOT DISTINCT FROM $6
                 LIMIT 1`,
                [
                    item.title,
                    item.description || null,
                    item.type || null,
                    item.file || null,
                    item.author || null,
                    item.date || null
                ]
            );

            if (exists.rowCount === 0) {
                await client.query(
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
        }

        // MESSAGES
        for (const message of data.messages || []) {
            const exists = await client.query(
                `SELECT 1 FROM messages
                 WHERE sender IS NOT DISTINCT FROM $1
                 AND receiver IS NOT DISTINCT FROM $2
                 AND content IS NOT DISTINCT FROM $3
                 AND date IS NOT DISTINCT FROM $4
                 AND read = $5
                 LIMIT 1`,
                [
                    message.sender || null,
                    message.receiver || null,
                    message.content || null,
                    message.date || null,
                    message.read || false
                ]
            );

            if (exists.rowCount === 0) {
                await client.query(
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
        }

        // CONTACT MESSAGES
        for (const message of data.contactMessages || []) {
            const exists = await client.query(
                `SELECT 1 FROM contact_messages
                 WHERE name IS NOT DISTINCT FROM $1
                 AND email IS NOT DISTINCT FROM $2
                 AND message IS NOT DISTINCT FROM $3
                 AND date IS NOT DISTINCT FROM $4
                 LIMIT 1`,
                [
                    message.name || null,
                    message.email || null,
                    message.message || null,
                    message.date || null
                ]
            );

            if (exists.rowCount === 0) {
                await client.query(
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
        }

        await client.query("COMMIT");

        console.log("✅ Safe GoodLeaders data migration completed!");
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("❌ Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateDatabase();
