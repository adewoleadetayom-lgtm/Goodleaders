const { pool } = require("./database");

async function addOnlineStatus() {
    try {
        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;
        `);

        console.log("✅ last_seen column is ready.");
    } catch (error) {
        console.error("❌ Migration error:", error);
    } finally {
        await pool.end();
    }
}

addOnlineStatus();
