---
description: "Rules ensuring metagame validity for the Pokémon Champions format"
trigger: always_on
---
# Domain Context: Pokémon Champions

This entire application strictly targets "Pokémon Champions", which is EXCLUSIVELY a Double Battle (VGC) format.
1. **Strict Metagame Validity (No Hallucinated Combinations)**: The Pokémon Champions metagame is a highly restricted custom format. Do NOT rely on general Pokémon knowledge (e.g., assuming Zapdos or Tapu Lele exists). You MUST verify that ANY Pokémon, item, or move you use in tests, quizzes, code, or seed data actually exists in this specific environment.
   - **MANDATORY COMBINATION CHECK**: When creating tests or mock data, you are **STRICTLY FORBIDDEN** from assigning arbitrary abilities or moves to a Pokémon (even for dummy/target Pokémon). For example, you cannot give Pikachu `runaway` or Mega Lucario `waterfall`. You **MUST** ensure that the specific Pokémon actually possesses that specific ability or move according to `pokemon.json` and `moves.json`. Do not invent valid-looking but technically impossible combinations.
2. **Source of Truth & Banned Entities**: Always check the explicit data files before referencing entities.
   - **Banned**: Do NOT use **Ditto (メタモン)** in any quizzes or examples due to ambiguity, and NEVER invent or use Pokémon that are not strictly present in the allowed pool (e.g., Crobat).
   - Pokémon: `packages/data/champions/pokemon.json` and `apps/web/src/data/regulations.ts`
   - Items: `packages/data/champions/items.json`
   - Moves: `packages/data/champions/moves.json`
3. **Champions EV Format**: EVs in this domain are capped at **32 per stat** and **66 in total** (unlike standard Pokémon EVs of 252/510). Whenever you write EV data (e.g., in quizzes, mock data, or tests), you MUST use this 32-based scale. For example, use `"A32+"` or `"H32 B32+"` instead of `"A252+"`, and use `"H2"` for leftovers instead of `"H4"`.
4. **Double Battle Primitives**: Do not assume 1v1/Singles contexts. Quiz schemas explicitly use 2v2 concepts (`playerSide` arrays, `ally`, `opponentAlly`). Whenever you update a schema or data structure, you MUST proactively ensure that any validation scripts are also updated to parse the new fields. Silent validation failures will lead to domain contamination.
5. **NO GUESSING MECHANICS & EXCLUSIVE RESEARCH SOURCE (ポケモンWiki ONLY)**:
   - You are strictly forbidden from implementing complex mechanics (e.g., specific abilities, redirection, immunities, move effects) based on your pre-trained memory.
   - **ABSOLUTE PROHIBITION ON ALL OTHER DOMAINS**: You are **STRICTLY FORBIDDEN** from searching, reading, citing, or consulting ANY website other than **`https://wiki.pokemonwiki.com/`**.
     - Forbidden examples include: `pokewiki.net`, `pokemon-wiki.net`, `gamewith.jp`, `game8.jp`, `gamerch.com`, `kamigame.jp`, `wikiwiki.jp`, Bulbapedia, Serebii, Smogon, etc. ("`https://wiki.pokemonwiki.com/` 以外調べるな").
     - If a web search returns results from any domain other than `https://wiki.pokemonwiki.com/`, you **MUST completely discard and ignore them**. Never quote or rely on non-`wiki.pokemonwiki.com` search snippets.
   - **Mandatory Reference**: Before writing engine logic, quiz content, or Japanese/English move details, you **MUST** consult `https://wiki.pokemonwiki.com/wiki/` (using `/browser` to bypass Cloudflare).
   - Pay special attention to edge cases documented on Pokémon Wiki: exact Japanese move names, failure conditions, type loss/change mechanics, redirection interactions, and multi-hit behavior.
