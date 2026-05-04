import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(HERE, "..", "locales");

export const SUPPORTED_LANGS = ["en", "ru", "zh"];
export const DEFAULT_LANG = "en";

const cache = new Map();

async function loadOne(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const path = join(LOCALES_DIR, `${lang}.json`);
  const raw = await readFile(path, "utf8");
  const dict = JSON.parse(raw);
  cache.set(lang, dict);
  return dict;
}

export async function loadLocales() {
  const out = {};
  for (const l of SUPPORTED_LANGS) out[l] = await loadOne(l);
  return out;
}

function interpolate(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export async function t(key, lang, vars) {
  const want = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  const dict = await loadOne(want);
  if (key in dict) return interpolate(dict[key], vars);
  if (want !== DEFAULT_LANG) {
    const fallback = await loadOne(DEFAULT_LANG);
    if (key in fallback) return interpolate(fallback[key], vars);
  }
  return key;
}

export async function listLanguages() {
  const out = [];
  for (const l of SUPPORTED_LANGS) {
    const d = await loadOne(l);
    out.push({ code: l, name: d["lang.name"], flag: d["lang.flag"] });
  }
  return out;
}
