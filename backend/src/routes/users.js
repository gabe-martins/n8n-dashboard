const express = require('express');
const bcrypt = require('bcrypt');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const SALT_ROUNDS = 10;

const USER_COLUMNS = 'id, name, login, tag, activated, created_at, updated_at';

function isAdminTag(tag) {
  return (tag || '').toLowerCase() === 'admin';
}

// Guards against an admin locking themselves (or everyone) out of the
// admin-only areas of the app: refuses to drop the last remaining admin
// account below one, whether by removing the tag, deactivating it or
// deleting it outright.
async function assertNotLastAdmin(db, excludingUserId) {
  const result = await db.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE LOWER(tag) = 'admin' AND activated = true AND id != $1",
    [excludingUserId]
  );
  if (result.rows[0].count < 1) {
    throw Object.assign(new Error('Não é possível remover o último administrador ativo'), { status: 400 });
  }
}

// All routes here are admin-only user-management endpoints.
router.use(requireAuth, requireAdmin);

// List all dashboard users.
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const result = await db.query(
      `SELECT ${USER_COLUMNS} FROM users ORDER BY name ASC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Falha ao listar usuários:', err.message);
    res.status(500).json({ message: 'Falha ao listar usuários' });
  }
});

// Create a new user.
router.post('/', async (req, res) => {
  const { name, login, password, tag, activated } = req.body;

  if (!name || !login || !password) {
    return res.status(400).json({ message: 'Nome, email e senha são obrigatórios' });
  }

  if (!EMAIL_REGEX.test(login)) {
    return res.status(400).json({ message: 'Por favor, insira um email válido' });
  }

  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }

  try {
    const db = req.app.locals.db;
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const isActivated = activated === undefined ? true : Boolean(activated);

    const result = await db.query(
      `INSERT INTO users (name, login, password, tag, activated)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [name.trim(), login.toLowerCase().trim(), hashedPassword, tag ? tag.trim() : null, isActivated]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Este email já está em uso' });
    }
    console.error('Falha ao criar usuário:', err.message);
    res.status(500).json({ message: 'Falha ao criar usuário' });
  }
});

// Update a user's name, tag and/or activation status.
router.put('/:id', async (req, res) => {
  const userId = Number(req.params.id);
  const { name, tag, activated } = req.body;

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: 'ID de usuário inválido' });
  }

  const isSelf = userId === req.user.id;

  try {
    const db = req.app.locals.db;

    const existingResult = await db.query('SELECT tag, activated FROM users WHERE id = $1', [userId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    const existing = existingResult.rows[0];

    // Prevent an admin from locking themselves out, and prevent the very
    // last active admin account from being demoted/deactivated by anyone.
    const willDeactivate = activated !== undefined && !activated;
    const willDropAdminTag = tag !== undefined && isAdminTag(existing.tag) && !isAdminTag(tag);

    if (isSelf && willDeactivate) {
      return res.status(400).json({ message: 'Você não pode desativar sua própria conta' });
    }
    if (isSelf && willDropAdminTag) {
      return res.status(400).json({ message: 'Você não pode remover sua própria permissão de administrador' });
    }
    if (isAdminTag(existing.tag) && existing.activated && (willDeactivate || willDropAdminTag)) {
      await assertNotLastAdmin(db, userId);
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (tag !== undefined) {
      fields.push(`tag = $${paramIndex++}`);
      values.push(tag ? tag.trim() : null);
    }
    if (activated !== undefined) {
      fields.push(`activated = $${paramIndex++}`);
      values.push(Boolean(activated));
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    values.push(userId);
    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING ${USER_COLUMNS}`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    const status = err.status || 500;
    if (status !== 400) console.error('Falha ao atualizar usuário:', err.message);
    res.status(status).json({ message: err.message || 'Falha ao atualizar usuário' });
  }
});

// Reset a user's password.
router.put('/:id/password', async (req, res) => {
  const userId = Number(req.params.id);
  const { password } = req.body;

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: 'ID de usuário inválido' });
  }

  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }

  try {
    const db = req.app.locals.db;
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await db.query(
      `UPDATE users SET password = $1 WHERE id = $2 RETURNING id`,
      [hashedPassword, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (err) {
    console.error('Falha ao redefinir senha:', err.message);
    res.status(500).json({ message: 'Falha ao redefinir senha' });
  }
});

// Delete a user.
router.delete('/:id', async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: 'ID de usuário inválido' });
  }

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'Você não pode excluir sua própria conta' });
  }

  try {
    const db = req.app.locals.db;

    const existingResult = await db.query('SELECT tag, activated FROM users WHERE id = $1', [userId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    const existing = existingResult.rows[0];

    if (isAdminTag(existing.tag) && existing.activated) {
      await assertNotLastAdmin(db, userId);
    }

    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (err) {
    const status = err.status || 500;
    if (status !== 400) console.error('Falha ao excluir usuário:', err.message);
    res.status(status).json({ message: err.message || 'Falha ao excluir usuário' });
  }
});

module.exports = router;
