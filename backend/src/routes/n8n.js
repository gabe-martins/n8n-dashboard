const express = require('express');
const { requireAuth } = require('../middleware/auth');
const n8nClient = require('../services/n8nClient');

const router = express.Router();

function isAdmin(user) {
  return (user.tag || '').toLowerCase() === 'admin';
}

function matchesUserTag(tags, user) {
  const userTag = (user.tag || '').toLowerCase();
  if (!userTag) return false;
  return (tags || []).some((tag) => (tag.name || '').toLowerCase() === userTag);
}

function filterWorkflowsByTag(workflows, user) {
  if (isAdmin(user)) return workflows;
  return workflows.filter((workflow) => matchesUserTag(workflow.tags, user));
}

// Confirms the authenticated user is allowed to act on a given workflow.
// Non-admin users are restricted to workflows tagged with their own tag,
// enforced here server-side so it cannot be bypassed by calling the API directly.
async function assertWorkflowAccess(id, user) {
  if (isAdmin(user)) return;

  const workflow = await n8nClient.getWorkflow(id);
  if (!matchesUserTag(workflow.tags, user)) {
    throw new n8nClient.N8nError('Acesso negado a este workflow', 403);
  }
}

function handleN8nError(res, err, fallbackMessage) {
  const status = err instanceof n8nClient.N8nError ? err.status : 502;
  console.error(fallbackMessage, err.message || err);
  res.status(status).json({ message: err.message || fallbackMessage });
}

// All routes below require a valid, active dashboard session.
router.use(requireAuth);

router.get('/status', async (req, res) => {
  try {
    const status = await n8nClient.checkStatus();
    res.json(status);
  } catch (err) {
    handleN8nError(res, err, 'Falha ao verificar status do n8n');
  }
});

router.get('/workflows', async (req, res) => {
  try {
    const { limit, cursor } = req.query;
    const payload = await n8nClient.listWorkflows({ limit, cursor });
    const items = Array.isArray(payload?.data) ? payload.data : [];

    res.json({
      data: filterWorkflowsByTag(items, req.user),
      nextCursor: payload?.nextCursor || null,
    });
  } catch (err) {
    handleN8nError(res, err, 'Falha ao carregar workflows');
  }
});

router.post('/workflows/:id/activate', async (req, res) => {
  try {
    await assertWorkflowAccess(req.params.id, req.user);
    const workflow = await n8nClient.activateWorkflow(req.params.id);
    res.json(workflow);
  } catch (err) {
    handleN8nError(res, err, 'Falha ao ativar workflow');
  }
});

router.post('/workflows/:id/deactivate', async (req, res) => {
  try {
    await assertWorkflowAccess(req.params.id, req.user);
    const workflow = await n8nClient.deactivateWorkflow(req.params.id);
    res.json(workflow);
  } catch (err) {
    handleN8nError(res, err, 'Falha ao desativar workflow');
  }
});

router.get('/executions', async (req, res) => {
  try {
    const { workflowId, limit, cursor, status } = req.query;

    if (!workflowId) {
      return res.status(400).json({ message: 'workflowId é obrigatório' });
    }

    await assertWorkflowAccess(workflowId, req.user);

    const payload = await n8nClient.listExecutions({ workflowId, limit, cursor, status });
    res.json(payload);
  } catch (err) {
    handleN8nError(res, err, 'Falha ao carregar execuções');
  }
});

module.exports = router;
