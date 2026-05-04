#!/usr/bin/env node
// Unified CLI behind the slash commands. Subcommands: link, language, status.

import { loadConfig, saveConfig } from "../lib/config.mjs";
import { ensurePaired, refreshPairStatus, rotateDeepLink, buildDeepLink, DEFAULT_API_BASE } from "../lib/pairing.mjs";
import { SUPPORTED_LANGS, listLanguages, t } from "../lib/i18n.mjs";

const [, , sub, ...rest] = process.argv;

async function cmdLink() {
  const reset = rest.includes("--reset");
  let config = await loadConfig();
  const { config: c1 } = await ensurePaired(config);
  config = c1;

  if (reset) {
    const link = await rotateDeepLink(config);
    console.log("Fresh pair link:\n  " + link);
    return;
  }

  let status = null;
  try { status = await refreshPairStatus(config); } catch { /* ignore */ }

  const link = config.shared.deep_link || buildDeepLink(config.shared.pair_token);
  if (status?.paired) {
    console.log("✅ Already paired with Telegram.");
    console.log(`   Language: ${status.language ?? config.language}`);
    if (status.telegram_user_id) console.log(`   Telegram user: ${status.telegram_user_id}`);
    console.log("\nIf you need to re-pair on a new device, run: /confirm-link --reset");
  } else {
    console.log("Open this link in Telegram, press Start, and pick your language:");
    console.log("  " + link);
    console.log("\nThen re-run any command — Claude will now wait for confirmation in Telegram.");
  }
}

async function cmdLanguage() {
  const config = await loadConfig();
  const want = (rest[0] ?? "").toLowerCase();
  if (!want) {
    const langs = await listLanguages();
    console.log(`Current: ${config.language}`);
    console.log("Supported: " + langs.map((l) => `${l.flag} ${l.code} (${l.name})`).join(", "));
    return;
  }
  if (!SUPPORTED_LANGS.includes(want)) {
    console.error(`Unsupported language: ${want}. Use one of: ${SUPPORTED_LANGS.join(", ")}`);
    process.exit(1);
  }
  config.language = want;
  await saveConfig(config);
  console.log(await t("bot.language_changed", want, { lang: want }));
}

async function cmdStatus() {
  const config = await loadConfig();
  console.log(`Language: ${config.language}`);
  console.log(`Tools:    ${config.tools.join(", ")}`);
  console.log(`Timeout:  ${config.timeoutSeconds}s`);
  console.log(`Redact:   ${config.redactSecrets}`);
  const s = config.shared ?? {};
  console.log(`API:      ${s.api_base || DEFAULT_API_BASE}`);
  console.log(`Client:   ${s.client_id ?? "(not initialized)"}`);
  console.log(`Paired:   ${s.paired ? "yes" : "no"}`);
  if (!s.paired && s.pair_token) {
    console.log(`Link:     ${s.deep_link || buildDeepLink(s.pair_token)}`);
  }
}

async function main() {
  switch (sub) {
    case "link":     return cmdLink();
    case "language": return cmdLanguage();
    case "status":   return cmdStatus();
    default:
      console.error("Usage: cli.mjs <link|language|status> [args]");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
