import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestJson } from '../../services/api';
import './Monitoring.css';

const MODE_LABELS = {
  manual: 'Manual',
  trigger: 'Trigger',
  webhook: 'Webhook',
  retry: 'Repetição',
  cli: 'CLI',
  error: 'Erro',
  integrated: 'Integrado',
  internal: 'Interno',
  scheduled: 'Agendado',
  evaluation: 'Avaliação',
};

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

function computeStatsFromExecutions(execs) {
  if (!execs.length) return null;
  const statusBreakdown = {};
  let totalDuration = 0;
  let durationCount = 0;
  const timelineMap = {};
  const workflowMap = {};

  for (const exec of execs) {
    const status = (exec.status || (exec.finished ? 'success' : 'running')).toLowerCase();
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;

    if (exec.startedAt && exec.stoppedAt) {
      const ms = new Date(exec.stoppedAt) - new Date(exec.startedAt);
      if (Number.isFinite(ms) && ms >= 0) {
        totalDuration += ms;
        durationCount++;
      }
    }

    if (exec.startedAt) {
      const date = exec.startedAt.slice(0, 10);
      if (!timelineMap[date]) timelineMap[date] = { date, total: 0, error: 0 };
      timelineMap[date].total++;
      if (status === 'error' || status === 'crashed') timelineMap[date].error++;
    }

    const wfId = exec.workflowId || exec.workflowName || 'unknown';
    if (!workflowMap[wfId]) {
      workflowMap[wfId] = { workflowId: wfId, workflowName: exec.workflowName || wfId, total: 0, error: 0 };
    }
    workflowMap[wfId].total++;
    if (status === 'error' || status === 'crashed') workflowMap[wfId].error++;
  }

  const total = execs.length;
  const successCount = statusBreakdown.success || 0;
  return {
    totalAnalyzed: total,
    successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
    avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : null,
    statusBreakdown,
    timeline: Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date)),
    topWorkflows: Object.values(workflowMap).sort((a, b) => b.total - a.total).slice(0, 10),
  };
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

function ModeFilterDropdown({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMode = (mode) => {
    if (selected.includes(mode)) {
      onChange(selected.filter((m) => m !== mode));
    } else {
      onChange([...selected, mode]);
    }
  };

  const label =
    selected.length === 0
      ? 'Todos os modos'
      : selected.length === 1
      ? MODE_LABELS[selected[0]] || selected[0]
      : `${selected.length} modos selecionados`;

  return (
    <div className="mode-filter-group" ref={containerRef}>
      <span className="mode-filter-label">Filtrar por modo de execução</span>
      <button
        type="button"
        className="mode-filter-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{label}</span>
        <span className="mode-filter-caret">▾</span>
      </button>
      {open && (
        <div className="mode-filter-panel" role="listbox" aria-multiselectable="true">
          {options.length === 0 && <p className="mode-filter-empty">Sem modos disponíveis.</p>}
          {options.map((mode) => (
            <label key={mode} className="mode-filter-option">
              <input
                type="checkbox"
                checked={selected.includes(mode)}
                onChange={() => toggleMode(mode)}
              />
              {MODE_LABELS[mode] || mode}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="mode-filter-clear" onClick={() => onChange([])}>
              Limpar filtro
            </button>
          )}
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
  const [modeFilter, setModeFilter] = useState([]);
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

  const availableModes = useMemo(() => {
    const set = new Set();
    executions.forEach((exec) => {
      if (exec.mode) set.add(exec.mode);
    });
    return Array.from(set).sort();
  }, [executions]);

  const filteredExecutions = useMemo(() => {
    if (modeFilter.length === 0) return executions;
    return executions.filter((exec) => modeFilter.includes(exec.mode));
  }, [executions, modeFilter]);

  const displayStats = useMemo(() => {
    if (modeFilter.length === 0) return stats;
    return computeStatsFromExecutions(filteredExecutions);
  }, [modeFilter, stats, filteredExecutions]);

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
            <ModeFilterDropdown options={availableModes} selected={modeFilter} onChange={setModeFilter} />
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}

        <section className="kpi-grid">
          <div className="kpi-card">
            <span className="label">Analisadas</span>
            <strong>{displayStats?.totalAnalyzed ?? '—'}</strong>
          </div>
          <div className="kpi-card">
            <span className="label">Taxa de sucesso</span>
            <strong>{displayStats?.successRate != null ? `${displayStats.successRate}%` : '—'}</strong>
          </div>
          <div className="kpi-card">
            <span className="label">Duração média</span>
            <strong>
              {displayStats?.avgDurationMs != null ? formatDuration(0, displayStats.avgDurationMs) : '—'}
            </strong>
          </div>
          <div className="kpi-card">
            <span className="label">Erros</span>
            <strong className="kpi-danger">
              {displayStats ? (displayStats.statusBreakdown.error || 0) + (displayStats.statusBreakdown.crashed || 0) : '—'}
            </strong>
          </div>
        </section>

        {modeFilter.length > 0 && (
          <p className="filter-stats-note">
            Estatísticas calculadas a partir das {filteredExecutions.length} execuções carregadas com o filtro ativo.
          </p>
        )}

        <section className="charts-grid">
          <StatusBreakdownChart data={displayStats?.statusBreakdown} total={displayStats?.totalAnalyzed} />
          <TimelineChart data={displayStats?.timeline || []} />
          <TopWorkflowsChart data={displayStats?.topWorkflows || []} />
        </section>

        <section>
          <h2 className="section-title">Histórico de execuções</h2>

          {historyLoading && executions.length === 0 && (
            <div className="empty-state">Carregando histórico...</div>
          )}

          {!historyLoading && executions.length === 0 && !error && (
            <div className="empty-state">Nenhuma execução encontrada.</div>
          )}

          {!historyLoading && executions.length > 0 && filteredExecutions.length === 0 && (
            <div className="empty-state">Nenhuma execução encontrada para este filtro.</div>
          )}

          {filteredExecutions.length > 0 && (
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
                    {filteredExecutions.map((exec) => {
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
