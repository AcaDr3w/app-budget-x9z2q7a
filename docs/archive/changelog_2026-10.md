# Changelog Archiviato - 2026-10

## [2026-10-15] - Config locali strumenti ripulite (solo skills + mcp)

### Completed Changes
- **opencode**: `.opencode/` ripulito dai plugin locali npm (`package.json`, `package-lock.json`, `node_modules` con `@opencode-ai/plugin`) -> backup in `.config-backup-20261015/`. Tenuti: `skills/` (9), `skills-manifest.json`, `instructions.md`, `.gitignore`.
- **pi**: niente `.pi/` nel progetto (gia tutto globale in `~/.pi/agent/`). Skill locale `impeccable` in `.agents/skills/` preservata con `skills-lock.json`.
- **verifica**: `pi mcp list` -> codegraph/sequential-thinking/context7 (global, connected, 0 errori). `opencode debug config` -> config risolta = `~/.config/opencode/opencode.jsonc`, mcp con codegraph/sequential-thinking/context7/bonsai ancora presente.
- **ripristino**: spostare i file indietro da `.config-backup-20261015/` -> `.opencode/`.

### Status: COMPLETATO. Nessun MCP/skill perso; strumenti su config globale.

