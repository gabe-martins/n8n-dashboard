#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcrypt');
const readline = require('readline');
const pool = require('../src/db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => rl.question(prompt, resolve));

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  console.log('\n=== Criar novo usuário ===\n');

  try {
    const name = await question('Nome: ');
    const login = await question('Email: ');
    const password = await question('Senha: ');
    const tag = await question('Tag (opcional): ');
    const activatedInput = await question('Ativo? (s/n, padrão: s): ');
    const activated = activatedInput.toLowerCase() !== 'n';

    if (!name || !login || !password) {
      console.error('\nErro: Nome, email e senha são obrigatórios.');
      process.exit(1);
    }

    if (!EMAIL_REGEX.test(login)) {
      console.error('\nErro: Por favor, insira um email válido.');
      process.exit(1);
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      `INSERT INTO users (name, login, password, tag, activated, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, login, tag, activated, created_at`,
      [name, login, hashedPassword, tag || null, activated]
    );

    console.log('\nUsuário criado com sucesso!');
    console.log('ID:', result.rows[0].id);
    console.log('Nome:', result.rows[0].name);
    console.log('Email:', result.rows[0].login);
    console.log('Tag:', result.rows[0].tag || '(nenhuma)');
    console.log('Ativo:', result.rows[0].activated ? 'Sim' : 'Não');
    console.log('Criado em:', result.rows[0].created_at);
  } catch (err) {
    if (err.code === '23505') {
      console.error('\nErro: Este email já existe.');
    } else {
      console.error('\nErro ao criar usuário:', err.message);
    }
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
