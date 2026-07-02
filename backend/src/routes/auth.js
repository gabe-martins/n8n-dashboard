const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Rate limiting configuration
const MAX_LOGIN_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const loginAttempts = new Map();

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of loginAttempts.entries()) {
    if (now - data.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

function checkRateLimit(identifier) {
  const now = Date.now();
  const data = loginAttempts.get(identifier);

  if (!data) {
    return { allowed: true, attemptsLeft: MAX_LOGIN_ATTEMPTS - 1 };
  }

  // Reset if window has passed
  if (now - data.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(identifier);
    return { allowed: true, attemptsLeft: MAX_LOGIN_ATTEMPTS - 1 };
  }

  if (data.attempts >= MAX_LOGIN_ATTEMPTS) {
    const timeLeft = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - data.firstAttempt)) / 60000);
    return { allowed: false, timeLeft };
  }

  return { allowed: true, attemptsLeft: MAX_LOGIN_ATTEMPTS - data.attempts - 1 };
}

function recordFailedAttempt(identifier) {
  const now = Date.now();
  const data = loginAttempts.get(identifier);

  if (!data || now - data.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(identifier, { attempts: 1, firstAttempt: now });
  } else {
    data.attempts++;
  }
}

function clearAttempts(identifier) {
  loginAttempts.delete(identifier);
}

// Login
router.post('/login', async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios' });
  }

  // Validate email format
  if (!EMAIL_REGEX.test(login)) {
    return res.status(400).json({ message: 'Por favor, insira um email válido' });
  }

  // Check rate limit using email as identifier
  const rateLimitCheck = checkRateLimit(login.toLowerCase());
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({ 
      message: `Muitas tentativas de login. Tente novamente em ${rateLimitCheck.timeLeft} minuto(s).` 
    });
  }

  try {
    const db = req.app.locals.db;
    const result = await db.query(
      'SELECT id, name, login, password, tag, activated FROM users WHERE login = $1',
      [login.toLowerCase()]
    );

    if (result.rows.length === 0) {
      recordFailedAttempt(login.toLowerCase());
      const check = checkRateLimit(login.toLowerCase());
      const attemptsMsg = check.attemptsLeft > 0 
        ? ` (${check.attemptsLeft} tentativa(s) restante(s))` 
        : '';
      return res.status(401).json({ message: `Credenciais inválidas${attemptsMsg}` });
    }

    const user = result.rows[0];

    // Check if user is activated
    if (!user.activated) {
      return res.status(403).json({ message: 'Usuário desativado. Entre em contato com o administrador.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      recordFailedAttempt(login.toLowerCase());
      const check = checkRateLimit(login.toLowerCase());
      const attemptsMsg = check.attemptsLeft > 0 
        ? ` (${check.attemptsLeft} tentativa(s) restante(s))` 
        : '';
      return res.status(401).json({ message: `Credenciais inválidas${attemptsMsg}` });
    }

    // Clear rate limit on successful login
    clearAttempts(login.toLowerCase());

    const token = jwt.sign(
      {
        id: user.id,
        login: user.login,
        name: user.name,
        tag: user.tag,
        activated: user.activated,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        tag: user.tag,
        activated: user.activated,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Verify token
router.get('/verify', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Re-check if user is still active in database
    const db = req.app.locals.db;
    const result = await db.query(
      'SELECT activated FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].activated) {
      return res.status(403).json({ message: 'Usuário desativado' });
    }

    res.json({
      valid: true,
      user: {
        id: decoded.id,
        name: decoded.name,
        login: decoded.login,
        tag: decoded.tag,
        activated: result.rows[0].activated,
      },
    });
  } catch (err) {
    res.status(401).json({ message: 'Token inválido ou expirado' });
  }
});

module.exports = router;
