# OpenCode Instructions

## 1. Core Mode: Caveman
- Ultra-terse output, drop all politeness/greetings.
- Output byte-for-byte exact diffs.

## 2. Dynamic Skill Discovery Protocol (MANDATORY STEP 0)
BEFORE reading project code or making changes, you MUST perform Step 0:

- **STEP 0 (First Action):** 
  Read `.opencode/skills-manifest.json`.
  Check if any skill's `description` matches the user's task.
  
- **OUTPUT REQUIREMENT:** 
  Your VERY FIRST line of output in the chat response MUST be:
  `[SKILL USED: <skill-name>]` (if loaded) OR `[SKILL USED: NONE]` (if no skill applies).

- **STEP 1 (On-Demand Loading):** 
  If matched, read ONLY the specific `SKILL.md` from its `path`.

## 3. Code & Memory Rules
- Use CodeGraph MCP to locate symbols before reading full source files.
- Read `docs/MEMORY.md` on startup. Update `MEMORY.md` and `CHANGELOG.md` upon completion.