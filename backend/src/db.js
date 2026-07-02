const { Pool } = require('pg');

// Small connection pool: this dashboard only stores a handful of user rows
// and typically serves a small number of concurrent staff, so a large pool
// just wastes memory on both the Node process and the Postgres server
// (each server-side connection holds its own backend process/buffers).
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'n8n_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: Number(process.env.DB_POOL_MAX) || 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado em cliente PostgreSQL ocioso:', err);
});

module.exports = pool;

