# The wrapper uses Codex's process-scoped TUI session log for Start/permission
# events. Avoid tailing global rollout files: concurrent Codex sessions share
# that directory.
_choros_debug_enabled="0"
case "$CHOROS_DEBUG_HOOKS" in
  1|true|TRUE|True|yes|YES|on|ON) _choros_debug_enabled="1" ;;
esac
if [ "$_choros_debug_enabled" != "1" ] && { [ "$CHOROS_ENV" = "development" ] || [ "$NODE_ENV" = "development" ]; }; then
  _choros_debug_enabled="1"
fi

_choros_notify_path="{{NOTIFY_PATH}}"
_choros_debug_log="${CHOROS_HOOK_DEBUG_LOG:-/tmp/choros-codex-hooks.log}"
_choros_has_choros_context="0"
[ -n "$CHOROS_TERMINAL_ID$CHOROS_TAB_ID$CHOROS_PANE_ID" ] && _choros_has_choros_context="1"
CHOROS_CODEX_SESSION_WATCHER_PID=""
_choros_codex_args=()

_choros_debug() {
  [ "$_choros_debug_enabled" = "1" ] || return 0
  printf '%s [codex-wrapper] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)" "$*" >> "$_choros_debug_log" 2>/dev/null || true
}

_choros_toml_escape() {
  local _choros_value="$1"
  _choros_value="${_choros_value//\\/\\\\}"
  _choros_value="${_choros_value//\"/\\\"}"
  printf '%s' "$_choros_value"
}

_choros_configure_project_trust() {
  [ -n "${CHOROS_WORKSPACE_PATH:-}" ] || return 0

  local _choros_workspace_codex_home="$CHOROS_WORKSPACE_PATH/.codex"
  [ -f "$_choros_workspace_codex_home/config.toml" ] || return 0

  local _choros_workspace_path_toml
  _choros_workspace_path_toml="$(_choros_toml_escape "$CHOROS_WORKSPACE_PATH")"
  _choros_codex_args+=("-c" "projects={\"$_choros_workspace_path_toml\"={trust_level=\"trusted\"}}")
  _choros_debug "using trusted workspace Codex project config path=$CHOROS_WORKSPACE_PATH"
}

_choros_configure_project_trust

_choros_child_pids_for() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -P "$1" 2>/dev/null || true
    return 0
  fi
  ps -axo pid=,ppid= 2>/dev/null | awk -v ppid="$1" '$2 == ppid { print $1 }' 2>/dev/null || true
}

_choros_cleanup_session_watcher() {
  if [ -n "$CHOROS_CODEX_SESSION_WATCHER_PID" ]; then
    _choros_watcher_pid="$CHOROS_CODEX_SESSION_WATCHER_PID"
    _choros_child_pids="$(_choros_child_pids_for "$_choros_watcher_pid" | tr '\n' ' ')"
    for _choros_child_pid in $_choros_child_pids; do
      kill -TERM "$_choros_child_pid" >/dev/null 2>&1 || true
    done
    kill -TERM "$_choros_watcher_pid" >/dev/null 2>&1 || true
    sleep 0.2
    _choros_child_pids="$_choros_child_pids $(_choros_child_pids_for "$_choros_watcher_pid" | tr '\n' ' ')"
    for _choros_child_pid in $_choros_child_pids; do
      kill -KILL "$_choros_child_pid" >/dev/null 2>&1 || true
    done
    kill -KILL "$_choros_watcher_pid" >/dev/null 2>&1 || true
    _choros_debug "session watcher cleanup signaled pid=$_choros_watcher_pid"
    CHOROS_CODEX_SESSION_WATCHER_PID=""
  fi
}

_choros_exit_trap() {
  _choros_status=$?
  trap - EXIT HUP INT TERM
  _choros_cleanup_session_watcher
  exit "$_choros_status"
}

trap _choros_exit_trap EXIT HUP INT TERM

if [ "$_choros_has_choros_context" = "1" ] && [ -f "$_choros_notify_path" ]; then
  export CODEX_TUI_RECORD_SESSION="${CODEX_TUI_RECORD_SESSION:-1}"
  export CODEX_TUI_SESSION_LOG_PATH="${TMPDIR:-/tmp}/choros-codex-session-$$_$(date +%s).jsonl"
  _choros_debug "session watcher starting terminalId=$CHOROS_TERMINAL_ID tabId=$CHOROS_TAB_ID paneId=$CHOROS_PANE_ID log=$CODEX_TUI_SESSION_LOG_PATH notify=$_choros_notify_path"

  (
    _choros_notify="$_choros_notify_path"
    _choros_session_log="$CODEX_TUI_SESSION_LOG_PATH"

    _choros_emit_event() {
      _choros_payload=$(printf '{"hook_event_name":"%s"}' "$1")
      _choros_debug "emitting $1 via $_choros_notify"
      bash "$_choros_notify" "$_choros_payload" >/dev/null 2>&1 || true
    }

    _choros_i=0
    while [ ! -f "$_choros_session_log" ] && [ "$_choros_i" -lt 200 ]; do
      _choros_i=$((_choros_i + 1))
      sleep 0.1
    done
    if [ ! -f "$_choros_session_log" ]; then
      _choros_debug "session log not found path=$_choros_session_log"
      exit 0
    fi
    _choros_debug "watching session=$_choros_session_log"

    tail -n +1 -F "$_choros_session_log" 2>/dev/null | while IFS= read -r _choros_line; do
      case "$_choros_line" in
        *'"dir":"from_tui"'*'"kind":"op"'*'"UserTurn"'*) _choros_emit_event "Start" ;;
        *'_approval_request"'*) _choros_emit_event "PermissionRequest" ;;
      esac
    done
  ) 2>/dev/null &
  CHOROS_CODEX_SESSION_WATCHER_PID=$!
  _choros_debug "session watcher pid=$CHOROS_CODEX_SESSION_WATCHER_PID"
else
  _choros_notify_exists="0"
  [ -f "$_choros_notify_path" ] && _choros_notify_exists="1"
  _choros_debug "session watcher disabled hasChorosContext=$_choros_has_choros_context terminalId=$CHOROS_TERMINAL_ID tabId=$CHOROS_TAB_ID paneId=$CHOROS_PANE_ID notifyExists=$_choros_notify_exists notify=$_choros_notify_path"
fi

# Native hooks separate the main Stop event from SubagentStop. Do not inject
# Codex's legacy notify callback: it reports both as agent-turn-complete without
# parent metadata, so Choros cannot filter subagent completions.
#
# Codex gates each hooks.json entry behind per-hook trust, and an untrusted
# hook is silently skipped — losing the Stop hook, Choros's only completion
# signal for Codex, while the session watcher above still reports Start. The
# builtin launch commands pass the bypass themselves; append it for every
# other launch (manual `codex`, stale host agent configs, custom presets)
# unless the caller already did — codex rejects the flag when repeated. Hooks
# the user explicitly disabled stay disabled; the bypass only skips the trust
# gate.
_choros_bypass_hook_trust="--dangerously-bypass-hook-trust"
for _choros_arg in "$@"; do
  # Tokens past `--` are prompt text, never flags — stop scanning there so a
  # prompt that mentions the flag doesn't suppress the real one.
  [ "$_choros_arg" = "--" ] && break
  if [ "$_choros_arg" = "--dangerously-bypass-hook-trust" ]; then
    _choros_bypass_hook_trust=""
    break
  fi
done
"$REAL_BIN" "${_choros_codex_args[@]}" --enable hooks ${_choros_bypass_hook_trust:+"$_choros_bypass_hook_trust"} "$@"
CHOROS_CODEX_STATUS=$?
_choros_debug "codex exited status=$CHOROS_CODEX_STATUS"

_choros_cleanup_session_watcher

# Current Codex releases have a native SessionEnd hook. Keep this wrapper
# report as a compatibility fallback for older releases that do not: v2
# binding teardown is idempotent, so a duplicate from a current release is
# harmless. Only report a normal exit (status < 128); a signal death (SIGHUP
# from a killed pty/daemon) must stay unreported so the session remains a
# resume candidate. The signal traps above bypass this line entirely.
if [ "$_choros_has_choros_context" = "1" ] && [ -f "$_choros_notify_path" ] && [ "$CHOROS_CODEX_STATUS" -lt 128 ]; then
  _choros_debug "emitting SessionEnd status=$CHOROS_CODEX_STATUS"
  bash "$_choros_notify_path" '{"hook_event_name":"SessionEnd"}' >/dev/null 2>&1 || true
fi

trap - EXIT HUP INT TERM
exit "$CHOROS_CODEX_STATUS"
