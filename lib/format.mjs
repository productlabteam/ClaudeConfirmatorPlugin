import { t } from "./i18n.mjs";

const SECRET_PATTERNS = [
  /\b(sk-[A-Za-z0-9_-]{16,})\b/g,
  /\b(xox[abrs]-[A-Za-z0-9-]{10,})\b/g,
  /\b(AKIA[0-9A-Z]{12,})\b/g,
  /\b(ghp_[A-Za-z0-9]{20,})\b/g,
  /\b(gho_[A-Za-z0-9]{20,})\b/g,
  /\bBearer\s+([A-Za-z0-9._-]{16,})/gi,
];

export function redact(text) {
  let out = String(text);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_, captured) => {
      const head = captured.slice(0, 4);
      return `${head}***REDACTED***`;
    });
  }
  return out;
}

export function escMd(text) {
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (c) => "\\" + c);
}

const TG_MAX = 3500;

// i18n strings in locales/*.json contain pre-formatted MarkdownV2 (`*…*`, backticks).
// We escape only the dynamic interpolated values via escMd() at call sites.
export async function renderToolCard({ toolName, toolInput, cwd, redactSecrets, lang }) {
  const apply = redactSecrets ? redact : (s) => s;

  let body;
  if (toolName === "Bash" && typeof toolInput?.command === "string") {
    body = "```bash\n" + apply(toolInput.command) + "\n```";
    if (toolInput.description) {
      body = `_${escMd(apply(toolInput.description))}_\n` + body;
    }
  } else {
    const json = JSON.stringify(toolInput, null, 2);
    body = "```json\n" + apply(json) + "\n```";
  }

  if (body.length > TG_MAX) {
    body = body.slice(0, TG_MAX) + "\n…(truncated)";
  }

  const title    = await t("bot.notify.title", lang);
  const toolLine = await t("bot.notify.tool",  lang, { tool: escMd(toolName) });
  const cwdLine  = await t("bot.notify.cwd",   lang, { cwd:  escMd(cwd ?? "?") });

  return `${title}\n${toolLine}\n${cwdLine}\n\n${body}`;
}

export async function buildKeyboard(requestId, lang) {
  const [approve, reject, comment] = await Promise.all([
    t("bot.btn.approve", lang),
    t("bot.btn.reject",  lang),
    t("bot.btn.comment", lang),
  ]);
  return {
    inline_keyboard: [[
      { text: approve, callback_data: `cc:${requestId}:approve` },
      { text: reject,  callback_data: `cc:${requestId}:reject` },
      { text: comment, callback_data: `cc:${requestId}:comment` },
    ]],
  };
}
