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

module.exports = {
    pool,
    testDatabase
};
