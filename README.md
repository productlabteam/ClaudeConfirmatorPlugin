# Claude Confirmator

Approve Claude Code tool requests on your phone via Telegram.
When Claude wants to run `Bash`, `WebFetch`, `WebSearch`, `Write`, `Edit`, or `MultiEdit`, you get an interactive card with three buttons — **✅ Approve**, **❌ Reject**, **💬 Comment**. Your decision flows back as the hook response.

- 🇬🇧 English · 🇷🇺 Русский · 🇨🇳 中文 — chosen on first start.
- One-tap pairing with **@claudeconfirmbot**.
- Falls back to Claude Code's local prompt on timeout / network error / pause.
- Node.js ≥ 20, zero npm dependencies.

## Quick Start

1. Add the marketplace and install:

   ```
   /plugin marketplace add github.com/productlabteam/ClaudeConfirmatorPlugin
   /plugin install claude-confirmator
   ```

2. Run any gated command in Claude Code (e.g. ask it to execute a Bash command). The hook returns a permission prompt with a **deep link** to Telegram.
   Or get the link any time:

   ```
   /confirm-link
   ```

3. Open the link → press **Start** in @claudeconfirmbot → pick your language.
4. Done — every gated tool call now waits for your tap in Telegram.

## Slash commands

| Command              | What it does                                                   |
|----------------------|----------------------------------------------------------------|
| `/confirm-link`      | Show pairing deep link (or status). `--reset` rotates it.      |
| `/confirm-language`  | Set hook UI language: `en`, `ru`, `zh`.                        |
| `/confirm-status`    | Print pairing, language, last request.                         |

## Telegram bot commands

`/language` · `/pause` · `/resume` · `/unlink` · `/help` — all localized.

## Config — `~/.claude/claude-confirmator.json`

```json
{
  "language": "en",
  "tools": ["Bash", "WebFetch", "WebSearch"],
  "timeoutSeconds": 300,
  "redactSecrets": true,
  "shared": {
    "api_base": "https://claudeconfirm.productlab.one",
    "client_id": "...",
    "client_secret": "...",
    "paired": true
  }
}
```

## Privacy

The plugin sends to `claudeconfirm.productlab.one`:
- the tool name, working directory, and tool input (with secrets redacted client-side when `redactSecrets: true` — patterns: `sk-…`, `xoxb-…`, `AKIA…`, `Bearer …`, `ghp_…`, `gho_…`).
- a `client_id` you generated on first run (no email, no IP retention beyond rate limiting).

The backend stores the request only until you respond or it times out, then deletes it. HTTPS-only.

## How decisions map back to Claude Code

| Telegram action | Hook response                                                  |
|-----------------|----------------------------------------------------------------|
| ✅ Approve      | `permissionDecision: "allow"`                                  |
| ❌ Reject       | `permissionDecision: "deny"`, reason `"Rejected via Telegram"` |
| 💬 Comment      | `permissionDecision: "deny"` with your comment as reason       |
| ⌛ Timeout       | empty stdout → Claude shows local prompt                       |
| ⏸ Paused        | empty stdout → Claude shows local prompt                       |

## License

MIT — see [LICENSE](LICENSE).
