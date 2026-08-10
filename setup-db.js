const { pool } = require("./database");

async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                phone TEXT,
                country TEXT,
                bio TEXT,
                photo TEXT
            );

            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                author TEXT,
                date TEXT
            );

            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                author TEXT,
                date TEXT
            );

            CREATE TABLE IF NOT EXISTS library (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                type TEXT,
                file TEXT,
                author TEXT,
                date TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender TEXT,
                receiver TEXT,
                content TEXT,
                date TEXT,
                read BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS contact_messages (
                id SERIAL PRIMARY KEY,
                name TEXT,
                email TEXT,
                message TEXT,
                date TEXT
            );
        `);

        console.log("✅ All GoodLeaders PostgreSQL tables created successfully.");
    } catch (error) {
        console.error("❌ Database setup failed:", error.message);
    } finally {
        await pool.end();
    }
}

setupDatabase();
