---
description: Show the Telegram deep-link to pair this Claude Code session with @claudeconfirmbot
allowed-tools: Bash
---

Run the link helper and print the result:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs link $ARGUMENTS
```

Pass `--reset` to force a fresh pair token if the previous one expired.
