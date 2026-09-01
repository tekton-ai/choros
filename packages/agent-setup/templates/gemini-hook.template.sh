#!/bin/bash
{{MARKER}}
# Gemini CLI lifecycle hook. JSON in via stdin; MUST print valid JSON to
# stdout before exit so gemini doesn't block on the hook.

INPUT=$(cat)

EVENT_TYPE=$(printf '%s' "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

case "$EVENT_TYPE" in
  BeforeAgent)              EVENT_TYPE="Start" ;;
  AfterAgent)               EVENT_TYPE="Stop"  ;;
  AfterTool)                EVENT_TYPE="Start" ;;
  SessionStart|SessionEnd)  ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

printf '{}\n'

# ~/.gemini/settings.json is global, so this also fires in sessions launched
# outside Choros terminals; only those terminals set CHOROS_* vars.
[ -n "$CHOROS_TERMINAL_ID" ] || [ -n "$CHOROS_TAB_ID" ] || exit 0

V1_EVENT_TYPE="$EVENT_TYPE"
case "$V1_EVENT_TYPE" in
  SessionStart) V1_EVENT_TYPE="Start" ;;
  SessionEnd)   V1_EVENT_TYPE="Stop" ;;
esac

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Resolve the host-service endpoint at call time: the env URL is frozen at
# terminal creation and goes stale when the host-service restarts on a new
# port, while each org manifest is rewritten with the live endpoint on every
# start. Only the host that owns this terminal answers "ignored":false.
if [ -n "$CHOROS_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$CHOROS_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$CHOROS_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

  HOOK_CANDIDATE_URLS="$CHOROS_HOST_AGENT_HOOK_URL"
  for MANIFEST_FILE in "${CHOROS_HOME_DIR:-$HOME/.choros}"/host/*/manifest.json; do
    [ -f "$MANIFEST_FILE" ] || continue
    MANIFEST_ENDPOINT=$(grep -oE '"endpoint"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST_FILE" | head -1 | grep -oE '"[^"]*"$' | tr -d '"')
    [ -n "$MANIFEST_ENDPOINT" ] || continue
    HOOK_CANDIDATE_URLS="$HOOK_CANDIDATE_URLS $MANIFEST_ENDPOINT/trpc/notifications.hook"
  done

  HOOK_DELIVERED_2XX="0"
  SEEN_HOOK_URLS=""
  for HOOK_URL in $HOOK_CANDIDATE_URLS; do
    case " $SEEN_HOOK_URLS " in *" $HOOK_URL "*) continue ;; esac
    SEEN_HOOK_URLS="$SEEN_HOOK_URLS $HOOK_URL"

    RESPONSE=$(curl -sX POST "$HOOK_URL" \
      --connect-timeout 2 --max-time 5 \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      -w "|%{http_code}" 2>/dev/null)
    STATUS_CODE="${RESPONSE##*|}"
    BODY="${RESPONSE%|*}"

    case "$BODY" in
      *'"ignored":false'*|*'"ignored": false'*) exit 0 ;;
    esac
    case "$STATUS_CODE" in
      2*) HOOK_DELIVERED_2XX="1" ;;
      *) echo "[gemini-hook] host-service dispatch failed status=$STATUS_CODE url=$HOOK_URL" >&2 ;;
    esac
  done

  [ "$HOOK_DELIVERED_2XX" = "1" ] && exit 0
  echo "[gemini-hook] no host-service accepted the event; falling back to v1" >&2
fi

[ -z "$CHOROS_TAB_ID" ] && [ -z "$CHOROS_TERMINAL_ID" ] && exit 0

curl -sG "http://127.0.0.1:${CHOROS_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$CHOROS_PANE_ID" \
  --data-urlencode "tabId=$CHOROS_TAB_ID" \
  --data-urlencode "workspaceId=$CHOROS_WORKSPACE_ID" \
  --data-urlencode "terminalId=$CHOROS_TERMINAL_ID" \
  --data-urlencode "sessionId=$HOOK_SESSION_ID" \
  --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
  --data-urlencode "eventType=$V1_EVENT_TYPE" \
  --data-urlencode "rawEventType=$EVENT_TYPE" \
  --data-urlencode "agentId=$CHOROS_AGENT_ID" \
  --data-urlencode "env=$CHOROS_ENV" \
  --data-urlencode "version=$CHOROS_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
