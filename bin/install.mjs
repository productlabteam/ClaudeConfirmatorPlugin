#!/usr/bin/env node
// Optional setup wizard. Not required if installed via marketplace —
// the plugin's hooks/hooks.json + first hook invocation handle pairing.
// Useful for: choosing the language up front.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, saveConfig } from "../lib/config.mjs";
import { ensurePaired, buildDeepLink } from "../lib/pairing.mjs";
import { t } from "../lib/i18n.mjs";

async function pickLang(rl, current) {
  const ans = (await rl.question(await t("install.choose_lang", current))).trim();
  if (ans === "1") return "en";
  if (ans === "2") return "ru";
  if (ans === "3") return "zh";
  return current;
}

async function main() {
  const config = await loadConfig();
  const rl = createInterface({ input, output });
  console.log(await t("install.title", config.language) + "\n");

  try {
    const lang = await pickLang(rl, config.language);
    config.language = lang;
    await saveConfig(config);
    const { config: paired } = await ensurePaired(config);
    const link = paired.shared.deep_link || buildDeepLink(paired.shared.pair_token);
    console.log("\n" + (await t("install.shared_done", lang)));
    console.log("\n→ " + link);
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
