---
description: Set hook UI language (en, ru, zh)
allowed-tools: Bash
---

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs language $ARGUMENTS
```

Examples: `/confirm-language en`, `/confirm-language ru`, `/confirm-language zh`.
With no argument, prints the current language and supported list.
