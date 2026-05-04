---
description: Switch between shared (@claudeconfirmbot) and self-hosted (your own bot) modes
allowed-tools: Bash
---

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs mode $ARGUMENTS
```

Examples: `/confirm-mode shared`, `/confirm-mode self-hosted`.
With no argument, prints the current mode and how to switch.
