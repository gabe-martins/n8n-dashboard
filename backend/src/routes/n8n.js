const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const n8nClient = require('../services/n8nClient');

const router = express.Router();

const STATUS_KEYS = ['success', 'error', 'crashed', 'canceled', 'running', 'waiting', 'new', 'unknown'];

function isAdmin(user) {
  return (user.tag || '').toLowerCase() === 'admin';
}

function buildWorkflowNameMap(workflows) {
  const map = new Map();
  workflows.forEach((wf) => map.set(wf.id, wf.name));
  return map;
}

// Mirrors the fallback used by the per-workflow executions view: n8n's
// public API doesn't always populate `status` on older executions, so we
// derive it from `finished` when missing.
function normalizeStatus(exec) {
  let status = exec.status;
  if (!status) {
    status = exec.finished ? 'success' : 'running';
  }
  status = String(status).toLowerCase();
  if (status === 'finished') return 'success';
  if (status === 'failed') return 'error';
  return STATUS_KEYS.includes(status) ? status : 'unknown';
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

// Admin-only: archiving/unarchiving is a more destructive action than a
// simple activate/deactivate toggle, so it is restricted to admins
// regardless of the workflow's tag, unlike the tag-based access above.
router.post('/workflows/:id/archive', requireAdmin, async (req, res) => {
  try {
    const workflow = await n8nClient.archiveWorkflow(req.params.id);
    res.json(workflow);
  } catch (err) {
    handleN8nError(res, err, 'Falha ao arquivar workflow');
  }
});

router.post('/workflows/:id/unarchive', requireAdmin, async (req, res) => {
  try {
    const workflow = await n8nClient.unarchiveWorkflow(req.params.id);
    res.json(workflow);
  } catch (err) {
    handleN8nError(res, err, 'Falha ao desarquivar workflow');
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

// Admin-only: execution history across ALL workflows (not restricted to the
// caller's own tag), enriched with the workflow name for display.
router.get('/executions/all', requireAdmin, async (req, res) => {
  try {
    const { limit, cursor, status } = req.query;

    const [payload, workflowsPayload] = await Promise.all([
      n8nClient.listExecutions({ limit, cursor, status }),
      n8nClient.listWorkflows({ limit: 250 }),
    ]);

    const workflowNames = buildWorkflowNameMap(
      Array.isArray(workflowsPayload?.data) ? workflowsPayload.data : []
    );

    const items = (Array.isArray(payload?.data) ? payload.data : []).map((exec) => ({
      ...exec,
      workflowName: workflowNames.get(exec.workflowId) || exec.workflowId,
    }));

    res.json({ data: items, nextCursor: payload?.nextCursor || null });
  } catch (err) {
    handleN8nError(res, err, 'Falha ao carregar histórico de execuções');
  }
});

// Admin-only: aggregated stats (status breakdown, daily timeline, top
// workflows, average duration) computed server-side over a bounded window
// of the most recent executions, so the frontend only needs to render charts.
router.get('/executions/stats', requireAdmin, async (req, res) => {
  try {
    const maxItems = Math.min(Number(req.query.maxItems) || 500, 1000);

    const [executions, workflowsPayload] = await Promise.all([
      n8nClient.listExecutionsRange({ maxItems }),
      n8nClient.listWorkflows({ limit: 250 }),
    ]);

    const workflowNames = buildWorkflowNameMap(
      Array.isArray(workflowsPayload?.data) ? workflowsPayload.data : []
    );

    const statusBreakdown = STATUS_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    const timelineMap = new Map();
    const workflowCounts = new Map();
    let durationTotal = 0;
    let durationCount = 0;

    executions.forEach((exec) => {
      const status = normalizeStatus(exec);
      statusBreakdown[status] += 1;

      const isError = status === 'error' || status === 'crashed';

      const day = exec.startedAt ? exec.startedAt.slice(0, 10) : null;
      if (day) {
        const dayEntry = timelineMap.get(day) || { date: day, total: 0, success: 0, error: 0 };
        dayEntry.total += 1;
        if (status === 'success') dayEntry.success += 1;
        if (isError) dayEntry.error += 1;
        timelineMap.set(day, dayEntry);
      }

      const wfId = exec.workflowId || 'unknown';
      const wfEntry = workflowCounts.get(wfId) || {
        workflowId: wfId,
        workflowName: workflowNames.get(wfId) || wfId,
        total: 0,
        error: 0,
      };
      wfEntry.total += 1;
      if (isError) wfEntry.error += 1;
      workflowCounts.set(wfId, wfEntry);

      if (exec.startedAt && exec.stoppedAt) {
        const ms = new Date(exec.stoppedAt) - new Date(exec.startedAt);
        if (Number.isFinite(ms) && ms >= 0) {
          durationTotal += ms;
          durationCount += 1;
        }
      }
    });

    const timeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const topWorkflows = Array.from(workflowCounts.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    res.json({
      totalAnalyzed: executions.length,
      statusBreakdown,
      timeline,
      topWorkflows,
      avgDurationMs: durationCount ? Math.round(durationTotal / durationCount) : null,
      successRate: executions.length
        ? Math.round((statusBreakdown.success / executions.length) * 1000) / 10
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleN8nError(res, err, 'Falha ao calcular estatísticas de execuções');
  }
});

module.exports = router;
