#!/usr/bin/env bash
# reload.sh — git pull + reinicia frontend e backend em background

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"
FRONTEND_PID="$PID_DIR/frontend.pid"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_LOG="$LOG_DIR/backend.log"

mkdir -p "$PID_DIR" "$LOG_DIR"

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

log() { echo -e "\033[1;36m[reload]\033[0m $*"; }
ok()  { echo -e "\033[1;32m[  ok  ]\033[0m $*"; }
err() { echo -e "\033[1;31m[ fail ]\033[0m $*"; }

kill_pid_file() {
  local pidfile="$1"
  local name="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && ok "$name (pid $pid) encerrado"
    else
      log "$name não estava rodando"
    fi
    rm -f "$pidfile"
  fi
}

# --------------------------------------------------------------------------
# 1. Git pull
# --------------------------------------------------------------------------
# log "Executando git pull..."
# cd "$SCRIPT_DIR"
# git pull --ff-only
# ok "Repositório atualizado"

# --------------------------------------------------------------------------
# 2. Instala dependências se package.json mudou
# --------------------------------------------------------------------------
log "Verificando dependências do frontend..."
npm install --prefix "$SCRIPT_DIR" --silent
ok "Dependências do frontend OK"

log "Verificando dependências do backend..."
npm install --prefix "$SCRIPT_DIR/backend" --silent
ok "Dependências do backend OK"

# --------------------------------------------------------------------------
# 3. Para processos existentes
# --------------------------------------------------------------------------
log "Encerrando processos anteriores..."
kill_pid_file "$FRONTEND_PID" "Frontend"
kill_pid_file "$BACKEND_PID"  "Backend"

# Aguarda portas liberarem
sleep 1

# --------------------------------------------------------------------------
# 4. Sobe backend em background
# --------------------------------------------------------------------------
log "Iniciando backend..."
cd "$SCRIPT_DIR/backend"
nohup node src/index.js >> "$BACKEND_LOG" 2>&1 &
echo $! > "$BACKEND_PID"
ok "Backend iniciado (pid $(cat "$BACKEND_PID")) → log: $BACKEND_LOG"

# --------------------------------------------------------------------------
# 5. Sobe frontend em background
# --------------------------------------------------------------------------
log "Iniciando frontend..."
cd "$SCRIPT_DIR"
nohup npm start >> "$FRONTEND_LOG" 2>&1 &
echo $! > "$FRONTEND_PID"
ok "Frontend iniciado (pid $(cat "$FRONTEND_PID")) → log: $FRONTEND_LOG"

# --------------------------------------------------------------------------
# 6. Resumo
# --------------------------------------------------------------------------
echo ""
echo -e "\033[1;32m✔ Tudo rodando em background. Terminal liberado.\033[0m"
echo ""
echo "  Frontend  →  http://localhost:3000"
echo "  Backend   →  http://localhost:4000"
echo ""
echo "  Logs em tempo real:"
echo "    Frontend: tail -f $FRONTEND_LOG"
echo "    Backend:  tail -f $BACKEND_LOG"
echo ""
echo "  Para parar tudo:"
echo "    kill \$(cat $FRONTEND_PID) \$(cat $BACKEND_PID)"
echo ""
