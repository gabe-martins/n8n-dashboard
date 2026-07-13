import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { requestJson } from '../../services/api';
import './Dashboard.css';

const REFRESH_INTERVAL_MS = 30000;

function Dashboard({ user, onLogout, onSelectWorkflow, onOpenMonitoring, onOpenUsers }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [n8nStatus, setN8nStatus] = useState({ connected: true, message: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = (user?.tag || '').toLowerCase() === 'admin';

  const markBusy = (id, isBusy) => {
    setBusyIds((prev) => ({
      ...prev,
      [id]: isBusy,
    }));
  };

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await requestJson('/api/n8n/workflows?limit=250');
      const items = Array.isArray(payload?.data) ? payload.data : [];

      setWorkflows(items);
      setN8nStatus({ connected: true, message: '' });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || 'Falha ao carregar workflows.');
      setN8nStatus({ connected: false, message: err?.message || '' });
    } finally {
      setLoading(false);
    }
  }, []);

  const sortedWorkflows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const base = term
      ? workflows.filter((wf) => (wf.name || '').toLowerCase().includes(term))
      : workflows;
    return [...base].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [workflows, searchTerm]);

  useEffect(() => {
    loadWorkflows();

    // Keep the dashboard reasonably fresh without requiring a manual refresh.
    const interval = setInterval(loadWorkflows, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadWorkflows]);

  const handleToggle = async (workflow) => {
    const targetAction = workflow.active ? 'deactivate' : 'activate';
    markBusy(workflow.id, true);
    setError('');

    try {
      await requestJson(`/api/n8n/workflows/${workflow.id}/${targetAction}`, {
        method: 'POST',
      });

      setWorkflows((prev) =>
        prev.map((item) =>
          item.id === workflow.id
            ? {
                ...item,
                active: !workflow.active,
              }
            : item
        )
      );
      toast.success(
        `Workflow "${workflow.name || 'Untitled'}" ${targetAction === 'activate' ? 'ativado' : 'desativado'} com sucesso.`
      );
    } catch (err) {
      setError(err?.message || 'Falha ao atualizar workflow.');
    } finally {
      markBusy(workflow.id, false);
    }
  };

  // Admin-only: archive/unarchive is a soft-delete on the n8n side, kept
  // separate from the tag-scoped activate/deactivate flow above.
  const handleArchiveToggle = async (workflow) => {
    const targetAction = workflow.isArchived ? 'unarchive' : 'archive';
    markBusy(workflow.id, true);
    setError('');

    try {
      const updated = await requestJson(`/api/n8n/workflows/${workflow.id}/${targetAction}`, {
        method: 'POST',
      });

      setWorkflows((prev) =>
        prev.map((item) =>
          item.id === workflow.id
            ? {
                ...item,
                isArchived: updated?.isArchived ?? !workflow.isArchived,
                active: updated?.active ?? item.active,
              }
            : item
        )
      );
      toast.success(
        `Workflow "${workflow.name || 'Untitled'}" ${targetAction === 'archive' ? 'arquivado' : 'desarquivado'} com sucesso.`
      );
    } catch (err) {
      setError(err?.message || 'Falha ao arquivar/desarquivar workflow.');
    } finally {
      markBusy(workflow.id, false);
    }
  };

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">N8N control</p>
            <h1>Workflows dashboard</h1>
            <p className="subtitle">
              Olá, <strong>{user.name}</strong>
            </p>
          </div>
          <div className="header-actions">
            <button
              className="btn ghost"
              onClick={loadWorkflows}
              disabled={loading}
            >
              {loading ? 'Carregando...' : 'Atualizar'}
            </button>
            {isAdmin && (
              <button className="btn ghost" onClick={onOpenMonitoring}>
                Monitoramento
              </button>
            )}
            {isAdmin && (
              <button className="btn ghost" onClick={onOpenUsers}>
                Usuários
              </button>
            )}
            <button className="btn ghost" onClick={onLogout}>
              Sair
            </button>
            <div className={`status-chip ${n8nStatus.connected ? 'ok' : 'warn'}`}>
              {n8nStatus.connected ? 'Ready' : 'Indisponível'}
            </div>
            {lastUpdated && (
              <span className="timestamp">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </header>

        {!n8nStatus.connected && (
          <div className="banner" role="alert">
            Não foi possível conectar ao n8n. Verifique `N8N_API_KEY` e `N8N_BASE_URL`
            na configuração do backend.
          </div>
        )}

        {error && <div className="banner error" role="alert">{error}</div>}

        <div className="search-row">
          <label htmlFor="workflow-search" className="sr-only">
            Buscar workflow por nome
          </label>
          <input
            id="workflow-search"
            type="search"
            className="workflow-search-input"
            placeholder="Buscar workflow por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar workflow por nome"
          />
        </div>

        <section className="cards-grid">
          {sortedWorkflows.map((workflow) => {
            const isBusy = Boolean(busyIds[workflow.id]);
            return (
              <article
                key={workflow.id}
                className={`card clickable ${workflow.active ? 'active' : 'inactive'}`}
                onClick={() => onSelectWorkflow && onSelectWorkflow(workflow)}
              >
                <div className="card-header">
                  <h2>{workflow.name || 'Untitled workflow'}</h2>
                  <div className="pill-group">
                    {workflow.isArchived && (
                      <span className="pill pill-archived">Archived</span>
                    )}
                    <span
                      className={`pill ${workflow.active ? 'pill-active' : 'pill-inactive'}`}
                    >
                      {workflow.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="meta">
                  <div>
                    <span className="label">Updated</span>
                    <span>
                      {workflow.updatedAt
                        ? new Date(workflow.updatedAt).toLocaleString()
                        : 'Unknown'}
                    </span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className="btn ghost"
                    onClick={(e) => { e.stopPropagation(); handleToggle(workflow); }}
                    disabled={isBusy || workflow.isArchived}
                  >
                    {isBusy ? 'Working...' : workflow.active ? 'Deactivate' : 'Activate'}
                  </button>
                  {isAdmin && (
                    <button
                      className="btn ghost"
                      onClick={(e) => { e.stopPropagation(); handleArchiveToggle(workflow); }}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Working...' : workflow.isArchived ? 'Unarchive' : 'Archive'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {!loading && sortedWorkflows.length === 0 && !error && (
            <div className="empty-state">
              {searchTerm ? 'Nenhum workflow corresponde à busca.' : 'No workflows found.'}
            </div>
          )}

          {loading && workflows.length === 0 && (
            <div className="empty-state" role="status" aria-live="polite">
              Loading workflows...
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
