#!/usr/bin/env node
// Optional setup wizard. Not required if installed via marketplace —
// the plugin's hooks/hooks.json + first hook invocation handle pairing.
// Useful for: choosing the language up front, or configuring self-hosted mode.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Telegram } from "../lib/telegram.mjs";
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

async function setupShared(rl, config) {
  const lang = await pickLang(rl, config.language);
  config.mode = "shared";
  config.language = lang;
  await saveConfig(config);
  const { config: paired } = await ensurePaired(config);
  const link = paired.shared.deep_link || buildDeepLink(paired.shared.pair_token);
  console.log("\n" + (await t("install.shared_done", lang)));
  console.log("\n→ " + link);
}

async function setupSelfHosted(rl, config) {
  const lang = await pickLang(rl, config.language);
  const botToken = (await rl.question(await t("install.self_token", lang))).trim();
  const chatIdStr = (await rl.question(await t("install.self_chat", lang))).trim();
  const timeoutStr = (await rl.question(await t("install.self_timeout", lang))).trim();
  const chatId = Number(chatIdStr);
  if (!botToken || !Number.isFinite(chatId)) {
    console.error("Invalid input.");
    process.exit(1);
  }
  config.mode = "self-hosted";
  config.language = lang;
  config.timeoutSeconds = Number(timeoutStr) || config.timeoutSeconds;
  config.selfHosted = { botToken, chatId };
  await saveConfig(config);

  const tg = new Telegram(botToken);
  await tg.sendMessage(String(chatId), "✅ *Claude Confirmator connected*");
  await tg.call("setMyCommands", {
    commands: [
      { command: "catch",   description: "Forward confirmations to this chat (default)" },
      { command: "release", description: "Pause forwarding" },
    ],
  }).catch(() => {});
  console.log("\n" + (await t("install.self_done", lang)));
}

async function main() {
  const flagSelfHosted = process.argv.includes("--self-hosted");
  const flagShared = process.argv.includes("--shared");
  const config = await loadConfig();
  const rl = createInterface({ input, output });
  console.log(await t("install.title", config.language) + "\n");

  let mode = flagSelfHosted ? "self-hosted" : flagShared ? "shared" : null;
  if (!mode) {
    const ans = (await rl.question(await t("install.choose_mode", config.language))).trim();
    mode = ans === "2" ? "self-hosted" : "shared";
  }

  try {
    if (mode === "shared") await setupShared(rl, config);
    else                   await setupSelfHosted(rl, config);
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
