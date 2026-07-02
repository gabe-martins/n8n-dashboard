// Server-side client for the n8n public REST API.
// The API key never reaches the browser: only this backend holds it.
const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'http://localhost:5678').replace(/\/+$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const N8N_API_HEADER = process.env.N8N_API_HEADER || 'X-N8N-API-KEY';
const N8N_REQUEST_TIMEOUT_MS = Number(process.env.N8N_REQUEST_TIMEOUT_MS) || 10000;

class N8nError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'N8nError';
    this.status = status || 502;
  }
}

function buildHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (N8N_API_KEY) {
    headers[N8N_API_HEADER] = N8N_API_KEY;
  }

  return headers;
}

async function n8nRequest(path, options = {}) {
  if (!N8N_API_KEY) {
    throw new N8nError('N8N_API_KEY não está configurada no backend', 503);
  }

  // Guard against a hung n8n instance blocking the request indefinitely,
  // which would otherwise tie up backend resources and degrade performance.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), N8N_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...buildHeaders(),
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new N8nError(
        `Tempo limite excedido ao conectar com o n8n (${N8N_BASE_URL})`,
        504
      );
    }
    throw new N8nError(`Falha ao conectar com o n8n (${N8N_BASE_URL}): ${err.message}`, 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new N8nError(text || `n8n respondeu com status ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function listWorkflows({ limit, cursor } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit || 250));
  if (cursor) params.set('cursor', cursor);
  return n8nRequest(`/workflows?${params.toString()}`);
}

async function getWorkflow(id) {
  return n8nRequest(`/workflows/${encodeURIComponent(id)}`);
}

async function activateWorkflow(id) {
  return n8nRequest(`/workflows/${encodeURIComponent(id)}/activate`, { method: 'POST' });
}

async function deactivateWorkflow(id) {
  return n8nRequest(`/workflows/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
}

async function listExecutions({ workflowId, limit, cursor, status } = {}) {
  const params = new URLSearchParams();
  if (workflowId) params.set('workflowId', workflowId);
  params.set('limit', String(limit || 200));
  if (cursor) params.set('cursor', cursor);
  if (status) params.set('status', status);
  return n8nRequest(`/executions?${params.toString()}`);
}

async function checkStatus() {
  if (!N8N_API_KEY) {
    return { connected: false, message: 'N8N_API_KEY não configurada no backend' };
  }

  try {
    await n8nRequest('/workflows?limit=1');
    return { connected: true, message: 'Conectado ao n8n' };
  } catch (err) {
    return { connected: false, message: err.message };
  }
}

module.exports = {
  N8nError,
  listWorkflows,
  getWorkflow,
  activateWorkflow,
  deactivateWorkflow,
  listExecutions,
  checkStatus,
};
