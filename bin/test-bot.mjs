#!/usr/bin/env node
// Smoke test: simulates a PreToolUse Bash event and prints the hook's stdout.
// Works for both shared and self-hosted modes — uses whatever is in config.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const hook = resolve(new URL("../hook.mjs", import.meta.url).pathname);

const event = {
  hook_event_name: "PreToolUse",
  session_id: "test-session",
  cwd: process.cwd(),
  tool_name: "Bash",
  tool_input: {
    command: "echo 'hello from claude-confirmator test'",
    description: "smoke test command",
  },
};

const child = spawn(process.execPath, [hook], { stdio: ["pipe", "pipe", "inherit"] });
let out = "";
child.stdout.on("data", (c) => (out += c));
child.on("close", (code) => {
  console.log("\n— hook exit:", code);
  console.log("— hook stdout:", out || "(empty — passthrough/timeout)");
});

child.stdin.write(JSON.stringify(event));
child.stdin.end();
