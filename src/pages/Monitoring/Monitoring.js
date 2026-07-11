import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '../../services/api';
import './Monitoring.css';

// Near-real-time polling: fast enough to feel "live" without hammering the
// n8n API/backend on the memory-constrained production host. Paused while
// the tab isn't visible (background tabs don't need live updates) and while
// a request is already in flight, so a slow response can't pile up parallel
// requests once the interval ticks again.
const REFRESH_INTERVAL_MS = 5000;
const HISTORY_PAGE_SIZE = 50;
const STATS_WINDOW = 500;

const STATUS_LABELS = {
  success: 'Sucesso',
  error: 'Erro',
  crashed: 'Crash',
  canceled: 'Cancelado',
  running: 'Executando',
  waiting: 'Aguardando',
  new: 'Novo',
  unknown: 'Desconhecido',
};

function formatDuration(startedAt, stoppedAt) {
  if (!startedAt || !stoppedAt) return '—';
  const ms = new Date(stoppedAt) - new Date(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function getStatusClass(status) {
  const s = (status || 'unknown').toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'error' || s === 'crashed') return 'error';
  if (s === 'running' || s === 'waiting' || s === 'new') return 'running';
  return 'unknown';
}

function StatusBreakdownChart({ data, total }) {
  const entries = Object.entries(data || {}).filter(([, count]) => count > 0);
  const maxCount = Math.max(1, ...entries.map(([, count]) => count));

  return (
    <div className="chart-card">
      <h3>Status das execuções</h3>
      {entries.length === 0 ? (
        <p className="chart-empty">Sem dados suficientes.</p>
      ) : (
        <div className="bar-list">
          {entries.map(([status, count]) => (
            <div className="bar-row" key={status}>
              <span className="bar-label">{STATUS_LABELS[status] || status}</span>
              <div className="bar-track">
                <div
                  className={`bar-fill status-${getStatusClass(status)}`}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="bar-count">
                {count}
                <span className="bar-pct">
                  {' '}
                  ({total ? Math.round((count / total) * 100) : 0}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineChart({ data }) {
  const maxTotal = Math.max(1, ...data.map((day) => day.total));

  return (
    <div className="chart-card wide">
      <h3>Execuções por dia</h3>
      {data.length === 0 ? (
        <p className="chart-empty">Sem dados suficientes.</p>
      ) : (
        <div className="timeline-chart">
          {data.map((day) => (
            <div className="timeline-bar-group" key={day.date}>
              <div className="timeline-bar-track" title={`${day.total} execuções, ${day.error} com erro`}>
                <div
                  className="timeline-bar total"
                  style={{ height: `${(day.total / maxTotal) * 100}%` }}
                />
                {day.error > 0 && (
                  <div
                    className="timeline-bar error"
                    style={{ height: `${(day.error / maxTotal) * 100}%` }}
                  />
                )}
              </div>
              <span className="timeline-label">
                {new Date(`${day.date}T00:00:00`).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopWorkflowsChart({ data }) {
  const maxTotal = Math.max(1, ...data.map((wf) => wf.total));

  return (
    <div className="chart-card wide">
      <h3>Top workflows por execuções</h3>
      {data.length === 0 ? (
        <p className="chart-empty">Sem dados suficientes.</p>
      ) : (
        <div className="bar-list">
          {data.map((wf) => (
            <div className="bar-row" key={wf.workflowId}>
              <span className="bar-label workflow-name" title={wf.workflowName}>
                {wf.workflowName}
              </span>
              <div className="bar-track">
                <div
                  className="bar-fill status-success"
                  style={{ width: `${(wf.total / maxTotal) * 100}%` }}
                />
                {wf.error > 0 && (
                  <div
                    className="bar-fill status-error overlay"
                    style={{ width: `${(wf.error / maxTotal) * 100}%` }}
                  />
                )}
              </div>
              <span className="bar-count">
                {wf.total}
                {wf.error > 0 && <span className="bar-pct"> ({wf.error} erros)</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Monitoring({ onBack }) {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [executions, setExecutions] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const isRefreshingRef = useRef(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const payload = await requestJson(`/api/n8n/executions/stats?maxItems=${STATS_WINDOW}`);
      setStats(payload);
      setError('');
    } catch (err) {
      setError(err?.message || 'Falha ao carregar estatísticas.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const payload = await requestJson(`/api/n8n/executions/all?limit=${HISTORY_PAGE_SIZE}`);
      setExecutions(Array.isArray(payload?.data) ? payload.data : []);
      setNextCursor(payload?.nextCursor || null);
      setError('');
    } catch (err) {
      setError(err?.message || 'Falha ao carregar histórico de execuções.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadMoreHistory = async () => {
    if (!nextCursor) return;
    setHistoryLoading(true);
    try {
      const payload = await requestJson(
        `/api/n8n/executions/all?limit=${HISTORY_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`
      );
      const items = Array.isArray(payload?.data) ? payload.data : [];
      setExecutions((prev) => [...prev, ...items]);
      setNextCursor(payload?.nextCursor || null);
    } catch (err) {
      setError(err?.message || 'Falha ao carregar mais execuções.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const refreshAll = useCallback(async () => {
    // Guards against overlapping requests: if a refresh is still in flight
    // when the next interval tick fires (e.g. a slow n8n response), skip
    // this tick instead of piling up parallel requests.
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      await Promise.all([loadStats(), loadHistory()]);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [loadStats, loadHistory]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(() => {
      // Skip polling while the tab is in the background — no one is
      // watching, so there's no point spending backend/n8n API calls on it.
      if (document.visibilityState === 'visible') {
        refreshAll();
      }
    }, REFRESH_INTERVAL_MS);

    // Refresh immediately when the tab regains focus so the view doesn't
    // show stale data after being backgrounded for a while.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshAll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshAll]);

  const loading = statsLoading || historyLoading;

  return (
    <div className="app">
      <div className="app-shell">
        <header className="executions-header">
          <div className="executions-header-top">
            <button className="btn ghost" onClick={onBack}>
              ← Voltar
            </button>
            <button className="btn ghost" onClick={refreshAll} disabled={loading}>
              {loading ? 'Carregando...' : 'Atualizar'}
            </button>
            <span className="live-indicator" title={`Atualização automática a cada ${REFRESH_INTERVAL_MS / 1000}s`}>
              <span className="live-dot" /> Tempo real
            </span>
          </div>
          <div className="executions-title-row">
            <div>
              <p className="eyebrow">Administração</p>
              <h1>Monitoramento de execuções</h1>
              <p className="subtitle">
                Histórico e estatísticas de todas as execuções de todos os workflows, atualizadas
                automaticamente a cada {REFRESH_INTERVAL_MS / 1000} segundos.
              </p>
            </div>
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}

        <section className="kpi-grid">
          <div className="kpi-card">
            <span className="label">Analisadas</span>
            <strong>{stats?.totalAnalyzed ?? '—'}</strong>
          </div>
          <div className="kpi-card">
            <span className="label">Taxa de sucesso</span>
            <strong>{stats?.successRate != null ? `${stats.successRate}%` : '—'}</strong>
          </div>
          <div className="kpi-card">
            <span className="label">Duração média</span>
            <strong>
              {stats?.avgDurationMs != null ? formatDuration(0, stats.avgDurationMs) : '—'}
            </strong>
          </div>
          <div className="kpi-card">
            <span className="label">Erros</span>
            <strong className="kpi-danger">
              {stats ? (stats.statusBreakdown.error || 0) + (stats.statusBreakdown.crashed || 0) : '—'}
            </strong>
          </div>
        </section>

        <section className="charts-grid">
          <StatusBreakdownChart data={stats?.statusBreakdown} total={stats?.totalAnalyzed} />
          <TimelineChart data={stats?.timeline || []} />
          <TopWorkflowsChart data={stats?.topWorkflows || []} />
        </section>

        <section>
          <h2 className="section-title">Histórico de execuções</h2>

          {historyLoading && executions.length === 0 && (
            <div className="empty-state">Carregando histórico...</div>
          )}

          {!historyLoading && executions.length === 0 && !error && (
            <div className="empty-state">Nenhuma execução encontrada.</div>
          )}

          {executions.length > 0 && (
            <>
              <div className="executions-table-wrapper">
                <table className="executions-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Workflow</th>
                      <th>Status</th>
                      <th>Início</th>
                      <th>Duração</th>
                      <th>Modo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((exec) => {
                      const statusValue = exec.status || (exec.finished ? 'success' : 'running');
                      return (
                        <tr key={exec.id} className={`exec-row status-${getStatusClass(statusValue)}`}>
                          <td className="exec-id">#{exec.id}</td>
                          <td>{exec.workflowName || exec.workflowId || '—'}</td>
                          <td>
                            <span className={`exec-status ${getStatusClass(statusValue)}`}>
                              {STATUS_LABELS[statusValue?.toLowerCase()] || statusValue}
                            </span>
                          </td>
                          <td className="exec-date">
                            {exec.startedAt ? new Date(exec.startedAt).toLocaleString() : '—'}
                          </td>
                          <td className="exec-duration">{formatDuration(exec.startedAt, exec.stoppedAt)}</td>
                          <td className="exec-mode">{exec.mode || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {nextCursor && (
                <div className="load-more-row">
                  <button className="btn ghost" onClick={loadMoreHistory} disabled={historyLoading}>
                    {historyLoading ? 'Carregando...' : 'Carregar mais'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default Monitoring;
