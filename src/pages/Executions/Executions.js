import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestJson } from '../../services/api';
import './Executions.css';

const REFRESH_INTERVAL_MS = 15000;

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'success', label: 'Sucesso' },
  { value: 'error', label: 'Erro' },
  { value: 'running', label: 'Executando' },
  { value: 'unknown', label: 'Desconhecido' },
];

function Executions({ workflow, onBack }) {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadExecutions = useCallback(async () => {
    if (!workflow?.id) return;

    setLoading(true);
    setError('');

    try {
      const payload = await requestJson(
        `/api/n8n/executions?workflowId=${workflow.id}&limit=200`
      );

      const items = Array.isArray(payload?.data) ? payload.data : [];

      setExecutions(items);
    } catch (err) {
      setError(err?.message || 'Failed to load executions.');
    } finally {
      setLoading(false);
    }
  }, [workflow]);

  useEffect(() => {
    loadExecutions();

    const interval = setInterval(loadExecutions, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadExecutions]);

  const formatDuration = (startedAt, stoppedAt) => {
    if (!startedAt || !stoppedAt) return '—';
    const ms = new Date(stoppedAt) - new Date(startedAt);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const getStatusClass = (status) => {
    if (!status) return 'unknown';
    const s = status.toLowerCase();
    if (s === 'success' || s === 'finished') return 'success';
    if (s === 'error' || s === 'failed' || s === 'crashed') return 'error';
    if (s === 'running' || s === 'waiting' || s === 'new') return 'running';
    return 'unknown';
  };

  const getStatusLabel = (status) => {
    if (!status) return 'Unknown';
    const s = status.toLowerCase();
    if (s === 'success' || s === 'finished') return 'Sucesso';
    if (s === 'error' || s === 'failed') return 'Erro';
    if (s === 'crashed') return 'Crash';
    if (s === 'running') return 'Executando';
    if (s === 'waiting') return 'Aguardando';
    if (s === 'new') return 'Novo';
    return status;
  };

  const filteredExecutions = useMemo(() => {
    if (statusFilter === 'all') return executions;
    return executions.filter(
      (exec) => getStatusClass(exec.status || (exec.finished ? 'success' : 'running')) === statusFilter
    );
  }, [executions, statusFilter]);

  return (
    <div className="app">
      <div className="app-shell">
        <header className="executions-header">
          <div className="executions-header-top">
            <button className="btn ghost" onClick={onBack}>
              ← Voltar
            </button>
            <button
              className="btn ghost"
              onClick={loadExecutions}
              disabled={loading}
            >
              {loading ? 'Carregando...' : 'Atualizar'}
            </button>
          </div>
          <div className="executions-title-row">
            <div>
              <p className="eyebrow">Execuções</p>
              <h1>{workflow.name || 'Untitled workflow'}</h1>
              <p className="subtitle">
                Mostrando {filteredExecutions.length} de {executions.length} execuções
                <span className={`pill-inline ${workflow.active ? 'pill-active' : 'pill-inactive'}`}>
                  {workflow.active ? 'Active' : 'Inactive'}
                </span>
              </p>
            </div>
            <div className="status-filter-group">
              <label htmlFor="status-filter">Filtrar por status</label>
              <select
                id="status-filter"
                className="status-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}

        {loading && executions.length === 0 && (
          <div className="empty-state">Carregando execuções...</div>
        )}

        {!loading && executions.length === 0 && !error && (
          <div className="empty-state">Nenhuma execução encontrada para este workflow.</div>
        )}

        {!loading && executions.length > 0 && filteredExecutions.length === 0 && (
          <div className="empty-state">Nenhuma execução encontrada para este filtro.</div>
        )}

        {filteredExecutions.length > 0 && (
          <div className="executions-table-wrapper">
            <table className="executions-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Início</th>
                  <th>Duração</th>
                  <th>Modo</th>
                </tr>
              </thead>
              <tbody>
                {filteredExecutions.map((exec) => (
                  <tr key={exec.id} className={`exec-row status-${getStatusClass(exec.status || (exec.finished ? 'success' : 'running'))}`}>
                    <td className="exec-id">#{exec.id}</td>
                    <td>
                      <span className={`exec-status ${getStatusClass(exec.status || (exec.finished ? 'success' : 'running'))}`}>
                        {getStatusLabel(exec.status || (exec.finished ? 'success' : 'running'))}
                      </span>
                    </td>
                    <td className="exec-date">
                      {exec.startedAt
                        ? new Date(exec.startedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="exec-duration">
                      {formatDuration(exec.startedAt, exec.stoppedAt)}
                    </td>
                    <td className="exec-mode">
                      {exec.mode || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Executions;
