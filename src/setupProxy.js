const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Dashboard backend routes (includes the /api/n8n/* proxy to n8n)
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000',
      changeOrigin: true,
    })
  );
};
