# Claude Confirmator

Approve Claude Code tool requests on your phone via Telegram.
When Claude wants to run `Bash`, `WebFetch`, `WebSearch`, `Write`, `Edit`, or `MultiEdit`, you get an interactive card with three buttons — **✅ Approve**, **❌ Reject**, **💬 Comment**. Your decision flows back as the hook response.

- 🇬🇧 English · 🇷🇺 Русский · 🇨🇳 中文 — chosen on first start.
- Two modes: **shared** (free public bot **@claudeconfirmbot**, recommended) or **self-hosted** (your own bot from BotFather).
- Falls back to Claude Code's local prompt on timeout / network error / pause.
- Node.js ≥ 20, zero npm dependencies.

## Quick Start (shared mode, recommended)

1. Add the marketplace and install:

   ```
   /plugin marketplace add github.com/alexeysorochan/claude-confirmator-plugin
   /plugin install claude-confirmator
   ```

2. Run any gated command in Claude Code (e.g. ask it to execute a Bash command). The hook will show a permission prompt with a **deep link** to Telegram.
   Or get the link any time:

   ```
   /confirm-link
   ```

3. Open the link → press **Start** in @claudeconfirmbot → pick your language.
4. Done — every gated tool call now waits for your tap in Telegram.

## Slash commands

| Command              | What it does                                                         |
|----------------------|----------------------------------------------------------------------|
| `/confirm-link`      | Show pairing deep link (or status). `--reset` rotates it.            |
| `/confirm-language`  | Set hook UI language: `en`, `ru`, `zh`.                              |
| `/confirm-mode`      | Switch between `shared` and `self-hosted`.                           |
| `/confirm-status`    | Print mode, pairing, language.                                       |

## Telegram bot commands

`/language` · `/pause` · `/resume` · `/unlink` · `/help` — all localized.

## Self-hosted mode

If you want to run your own bot:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/install.mjs --self-hosted
```

Provide bot token (BotFather) and your numeric chat ID (@userinfobot). Then `/confirm-mode self-hosted`.

## Config — `~/.claude/claude-confirmator.json`

```json
{
  "mode": "shared",
  "language": "en",
  "tools": ["Bash", "WebFetch", "WebSearch"],
  "timeoutSeconds": 300,
  "redactSecrets": true,
  "shared": {
    "api_base": "https://claudeconfirm.productlab.one",
    "client_id": "...",
    "client_secret": "...",
    "paired": true
  },
  "selfHosted": { "botToken": "...", "chatId": 12345678 }
}
```

Old configs from v0.x (`{ botToken, chatId, … }`) are migrated automatically into `selfHosted: { … }` with `mode: "self-hosted"`.

## Privacy

In **shared** mode the plugin sends to `claudeconfirm.productlab.one`:
- the tool name, working directory, and tool input (with secrets redacted client-side when `redactSecrets: true` — patterns: `sk-…`, `xoxb-…`, `AKIA…`, `Bearer …`, `ghp_…`, `gho_…`).
- a `client_id` you generated on first run (no email, no IP retention beyond rate limiting).

The backend stores the request only until you respond or it times out, then deletes it. HTTPS-only.

In **self-hosted** mode no third-party server is used — your hook talks directly to Telegram with your bot token.

## How decisions map back to Claude Code

| Telegram action | Hook response                                                  |
|-----------------|----------------------------------------------------------------|
| ✅ Approve      | `permissionDecision: "allow"`                                  |
| ❌ Reject       | `permissionDecision: "deny"`, reason `"Rejected via Telegram"` |
| 💬 Comment      | `permissionDecision: "deny"` with your comment as reason       |
| ⌛ Timeout       | empty stdout → Claude shows local prompt                       |
| ⏸ Paused        | empty stdout → Claude shows local prompt                       |

## Files

- [hook.mjs](hook.mjs) — entrypoint (PreToolUse).
- [lib/api.mjs](lib/api.mjs) — public API client (shared mode).
- [lib/pairing.mjs](lib/pairing.mjs) — credential lifecycle.
- [lib/telegram.mjs](lib/telegram.mjs) — Bot API client (self-hosted).
- [lib/format.mjs](lib/format.mjs) — card rendering + secret redaction.
- [lib/i18n.mjs](lib/i18n.mjs) — locale loader.
- [locales/](locales/) — `en.json`, `ru.json`, `zh.json`.
- [bin/cli.mjs](bin/cli.mjs) — `link` / `language` / `mode` / `status` subcommands behind slash commands.

## License

MIT — see [LICENSE](LICENSE).
