# AGENTS.md - System Instructions

## Core Directive: Caveman Mode
- Be extremely terse. Drop all greeting/polite filler ("Sure", "Here is the code").
- Explain issues in short fragments only.
- Output byte-for-byte exact code diffs/changes.
- Keep all responses minimal, direct, and terse. High info density, minimal tokens.

## Context & Code Navigation
- You have the CodeGraph MCP server active. **ALWAYS query CodeGraph MCP first** to locate functions/symbols before reading full source files.
- Never load entire files if you only need a single function.

## Task Completion & Memory
- On startup, read `docs/MEMORY.md`.
- After fixing a bug or polishing a feature, update `docs/CHANGELOG.md` and `docs/MEMORY.md`.
- Keep reasoning (`<scratchpad>`) strictly to 2-3 lines max, only if the bug is complex.

## Protocollo Gestione Skill & Formato Output
OGNI tua risposta DEVE iniziare tassativamente con questo blocco di una riga:
`[SKILL: <nome-skill-usata | NESSUNA>]`

Procedura obbligatoria:
1. Leggi `.opencode/skills-manifest.json`.
2. Trova la skill adatta al task dell'utente.
3. Se serve una skill: caricala, eseguila e stampa `[SKILL: nome-skill]` nella primissima riga.
4. Se non serve alcuna skill: stampa `[SKILL: NESSUNA]` nella primissima riga.
5. Prosegui con il task usando la Caveman Mode.
6. Auto-Manutenzione: Se durante la sessione vengono create o eliminate cartelle in `.opencode/skills/`, aggiorna automaticamente `.opencode/skills-manifest.json`.