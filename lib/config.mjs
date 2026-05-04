import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONFIG_PATH = join(homedir(), ".claude", "claude-confirmator.json");
export const LOG_PATH = join(homedir(), ".claude", "claude-confirmator.log");
export const LOCK_PATH = join(homedir(), ".claude", "claude-confirmator.lock");
export const RELEASED_PATH = join(homedir(), ".claude", "claude-confirmator.released");

export const DEFAULT_TOOLS = ["Bash", "WebFetch", "WebSearch"];
export const DEFAULT_TIMEOUT = 300;

const BASE_DEFAULTS = {
  mode: "shared",            // "shared" | "self-hosted"
  language: "en",            // "en" | "ru" | "zh" — for hook stdout text
  redactSecrets: true,
  tools: DEFAULT_TOOLS,
  timeoutSeconds: DEFAULT_TIMEOUT,
};

export async function loadConfig() {
  let parsed;
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    parsed = JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return { ...BASE_DEFAULTS };
    throw e;
  }
  return migrate(parsed);
}

export async function saveConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Legacy schema: { botToken, chatId, timeoutSeconds, tools, redactSecrets }
// → { mode: "self-hosted", selfHosted: {…}, … }
export function migrate(raw) {
  if (raw && typeof raw === "object" && (raw.mode === "shared" || raw.mode === "self-hosted")) {
    return {
      ...BASE_DEFAULTS,
      ...raw,
      tools: raw.tools ?? BASE_DEFAULTS.tools,
      timeoutSeconds: raw.timeoutSeconds ?? BASE_DEFAULTS.timeoutSeconds,
    };
  }
  if (raw && typeof raw === "object" && raw.botToken) {
    return {
      ...BASE_DEFAULTS,
      mode: "self-hosted",
      tools: raw.tools ?? BASE_DEFAULTS.tools,
      timeoutSeconds: raw.timeoutSeconds ?? BASE_DEFAULTS.timeoutSeconds,
      redactSecrets: raw.redactSecrets ?? true,
      selfHosted: {
        botToken: raw.botToken,
        chatId: raw.chatId,
      },
    };
  }
  return { ...BASE_DEFAULTS };
}

export function assertSelfHosted(config) {
  const sh = config.selfHosted ?? {};
  if (!sh.botToken) throw new Error("selfHosted.botToken missing");
  if (sh.chatId === undefined || sh.chatId === null) throw new Error("selfHosted.chatId missing");
}
