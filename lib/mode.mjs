import { stat, writeFile, unlink } from "node:fs/promises";
import { RELEASED_PATH } from "./config.mjs";

export async function isReleased() {
  try {
    await stat(RELEASED_PATH);
    return true;
  } catch {
    return false;
  }
}

export async function setReleased(on) {
  if (on) {
    await writeFile(RELEASED_PATH, String(Date.now()));
  } else {
    try { await unlink(RELEASED_PATH); } catch {}
  }
}

// Parse a Telegram message into a mode command, or null.
// Accepts /catch, /release, and the @botname-suffixed variants.
export function parseModeCommand(text) {
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^\/(catch|release)(?:@\w+)?\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Apply a mode command. Returns a status object with a human-readable reply
 * suitable for sending back to Telegram (plain text — caller must escape for
 * MarkdownV2 if needed).
 */
export async function applyModeCommand(cmd, { wasReleased } = {}) {
  try {
    if (cmd === "release") {
      const already = wasReleased ?? (await isReleased());
      await setReleased(true);
      return {
        ok: true,
        cmd,
        reply: already
          ? "⏸ Already released — Claude Code is handling confirmations locally."
          : "⏸ Released — confirmations now go to Claude Code's local prompt.",
      };
    }
    if (cmd === "catch") {
      const already = !(wasReleased ?? (await isReleased()));
      await setReleased(false);
      return {
        ok: true,
        cmd,
        reply: already
          ? "▶️ Already catching — confirmations are being forwarded to Telegram."
          : "▶️ Caught — confirmations are forwarded to Telegram.",
      };
    }
    return { ok: false, cmd, reply: `❓ Unknown command: ${cmd}` };
  } catch (e) {
    return { ok: false, cmd, reply: `⚠️ Failed to apply /${cmd}: ${e.message}` };
  }
}

/**
 * Drain pending Telegram updates and apply any /catch /release commands.
 * Advances the offset past everything seen. Returns the final result, or null.
 */
export async function drainModeCommands({ tg, chatId, readOffset, writeOffset, sendReply }) {
  let offset = await readOffset();
  let updates;
  try {
    updates = await tg.getUpdates(offset, 0);
  } catch {
    return null;
  }
  let last = null;
  for (const upd of updates) {
    offset = Math.max(offset, upd.update_id + 1);
    const msg = upd.message;
    if (!msg || String(msg.chat?.id) !== String(chatId)) continue;
    const cmd = parseModeCommand(msg.text);
    if (!cmd) continue;
    const result = await applyModeCommand(cmd);
    last = result;
    if (sendReply) {
      try { await sendReply(result.reply); }
      catch (e) { /* logged by caller if needed */ }
    }
  }
  await writeOffset(offset);
  return last;
}
