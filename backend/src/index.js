require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const authRoutes = require('./routes/auth');
const n8nRoutes = require('./routes/n8n');
const pool = require('./db');
const { runMigrations } = require('./db/migrate');

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 4000;

// Make pool available to routes
app.locals.db = pool;

// Security headers
app.use(helmet());

// Compress JSON responses (workflow/execution payloads from n8n can be large) —
// cuts response size and the memory/time spent moving those buffers over the wire.
app.use(compression());

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS configuration - supports multiple origins separated by comma
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/n8n', n8nRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' });
});

// Centralized error handler (catches anything not handled by route try/catch)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits for Postgres to accept connections before proceeding. On `docker
// compose restart` (or a host reboot) all containers can start concurrently,
// so Postgres may still be in "starting up" for a few seconds — retrying
// here avoids an unnecessary crash/restart-loop and its log noise.
async function waitForDatabase(retries = 15, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT NOW()');
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(
        `Banco de dados ainda não disponível (tentativa ${attempt}/${retries}): ${err.message}`
      );
      await sleep(delayMs);
    }
  }
}

// Initialize database and start server
async function init() {
  try {
    await waitForDatabase();
    console.log('Database connected');

    await runMigrations(pool);
    console.log('Database schema up to date');

    if (
      process.env.NODE_ENV === 'production' &&
      (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-this'))
    ) {
      console.warn(
        'AVISO: JWT_SECRET não está definido com um valor seguro para produção. Defina uma string aleatória longa na variável de ambiente JWT_SECRET.'
      );
    }

    const HOST = process.env.HOST || '0.0.0.0';
    const server = app.listen(PORT, HOST, () => {
      console.log(`Backend running on ${HOST}:${PORT}`);
    });

    // Graceful shutdown so in-flight requests finish and the DB pool closes
    // cleanly when Docker stops/restarts the container.
    const shutdown = (signal) => {
      console.log(`Recebido ${signal}, encerrando servidor...`);
      server.close(async () => {
        try {
          await pool.end();
        } catch (err) {
          console.error('Erro ao encerrar pool do banco:', err);
        } finally {
          process.exit(0);
        }
      });
      // Force-exit if graceful shutdown hangs
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to initialize:', err);
    process.exit(1);
  }
}

init();
