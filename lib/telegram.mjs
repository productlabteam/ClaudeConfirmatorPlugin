import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseModeCommand, applyModeCommand } from "./mode.mjs";
import { escMd } from "./format.mjs";

const OFFSET_PATH = join(homedir(), ".claude", "claude-confirmator.offset");

export class Telegram {
  constructor(botToken) {
    this.base = `https://api.telegram.org/bot${botToken}`;
  }

  async call(method, params) {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params ?? {}),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    }
    return json.result;
  }

  sendMessage(chat_id, text, extra = {}) {
    return this.call("sendMessage", {
      chat_id,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      ...extra,
    });
  }

  editMessageText(chat_id, message_id, text, extra = {}) {
    return this.call("editMessageText", {
      chat_id,
      message_id,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      ...extra,
    });
  }

  editMessageReplyMarkup(chat_id, message_id, reply_markup) {
    return this.call("editMessageReplyMarkup", { chat_id, message_id, reply_markup });
  }

  answerCallbackQuery(id, text) {
    return this.call("answerCallbackQuery", { callback_query_id: id, text: text ?? "" });
  }

  async getUpdates(offset, timeoutSec) {
    return this.call("getUpdates", {
      offset,
      timeout: timeoutSec,
      allowed_updates: ["callback_query", "message"],
    });
  }
}

export async function readOffset() {
  try {
    const raw = await readFile(OFFSET_PATH, "utf8");
    const n = parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function writeOffset(offset) {
  try {
    await writeFile(OFFSET_PATH, String(offset));
  } catch {
    /* non-fatal */
  }
}

// buildKeyboard moved to lib/format.mjs (requires i18n)

/**
 * Wait for the user's decision on a specific request.
 * Returns { kind: "approve" } | { kind: "reject" } | { kind: "comment", text } | { kind: "timeout" }.
 */
export async function waitForDecision({ tg, chatId, requestId, deadline }) {
  let offset = await readOffset();
  let awaitingComment = false;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, Math.floor((deadline - Date.now()) / 1000));
    const pollTimeout = Math.min(25, remaining);

    let updates;
    try {
      updates = await tg.getUpdates(offset, pollTimeout);
    } catch (e) {
      // Network blip — back off briefly, keep going.
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    for (const upd of updates) {
      offset = Math.max(offset, upd.update_id + 1);

      if (upd.callback_query) {
        const cq = upd.callback_query;
        const data = cq.data ?? "";
        if (!data.startsWith(`cc:${requestId}:`)) {
          // Not ours — ack it so the user's UI doesn't spin, but ignore.
          try { await tg.answerCallbackQuery(cq.id, ""); } catch {}
          continue;
        }
        const action = data.slice(`cc:${requestId}:`.length);
        try { await tg.answerCallbackQuery(cq.id, ""); } catch {}

        if (action === "approve") { await writeOffset(offset); return { kind: "approve", message: cq.message }; }
        if (action === "reject")  { await writeOffset(offset); return { kind: "reject",  message: cq.message }; }
        if (action === "comment") {
          awaitingComment = true;
          try {
            await tg.sendMessage(
              String(chatId),
              "✏️ Send your comment as the next message\\.",
            );
          } catch {}
          continue;
        }
      }

      if (upd.message?.text && String(upd.message.chat?.id) === String(chatId)) {
        const cmd = parseModeCommand(upd.message.text);
        if (cmd === "release" || cmd === "catch") {
          const result = await applyModeCommand(cmd, { wasReleased: cmd === "catch" ? false : undefined });
          try { await tg.sendMessage(String(chatId), escMd(result.reply)); } catch {}
          if (cmd === "release" && result.ok) {
            await writeOffset(offset);
            return { kind: "released" };
          }
          continue;
        }
        if (awaitingComment) {
          await writeOffset(offset);
          return { kind: "comment", text: upd.message.text };
        }
      }
    }

    await writeOffset(offset);
  }

  return { kind: "timeout" };
}
