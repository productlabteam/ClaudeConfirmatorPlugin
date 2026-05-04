import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONFIG_PATH = join(homedir(), ".claude", "claude-confirmator.json");
export const LOG_PATH = join(homedir(), ".claude", "claude-confirmator.log");
export const LOCK_PATH = join(homedir(), ".claude", "claude-confirmator.lock");

export const DEFAULT_TOOLS = ["Bash", "WebFetch", "WebSearch"];
export const DEFAULT_TIMEOUT = 300;

const BASE_DEFAULTS = {
  language: "en",        // "en" | "ru" | "zh"
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
  return { ...BASE_DEFAULTS, ...parsed };
}

export async function saveConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}
