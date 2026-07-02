// Authenticated HTTP client for the dashboard's own backend.
// All n8n communication happens server-side now — the browser never sees
// the n8n API key. See backend/src/routes/n8n.js for the proxy endpoints.
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const getToken = () => localStorage.getItem('token');

const buildHeaders = (extraHeaders) => {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers: buildHeaders(options.headers),
  });

  if (response.status === 401) {
    // Session expired or invalid — force back to the login screen.
    localStorage.removeItem('token');
    window.location.reload();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '');
    let message = rawBody;
    try {
      const parsed = JSON.parse(rawBody);
      message = parsed?.message || rawBody;
    } catch {
      // response wasn't JSON, keep raw text
    }
    throw new Error(message || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export { backendUrl, requestJson };
