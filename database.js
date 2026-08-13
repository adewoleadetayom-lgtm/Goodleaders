const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function testDatabase() {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("✅ PostgreSQL connected:", result.rows[0].now);
    } catch (error) {
        console.error("❌ PostgreSQL connection failed:", error.message);
    }
}

async function addOnlineStatusColumn() {
    try {
        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;
        `);

        console.log("✅ last_seen column is ready.");
    } catch (error) {
        console.error(
            "❌ Online status migration failed:",
            error.message
        );
    }
}

module.exports = {
    pool,
    testDatabase,
    addOnlineStatusColumn
};
