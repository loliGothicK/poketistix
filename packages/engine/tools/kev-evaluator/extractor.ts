import * as fs from "node:fs";
import * as path from "node:path";
import { Dex } from "@pkmn/sim";
import type { ParsedTestCase } from "./types.js";

/**
 * Extracts test cases from a test file content (supporting Vitest / Jest style test / it).
 */
export function extractTestCasesFromFile(filePath: string): ParsedTestCase[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return extractTestCasesFromSource(content, filePath);
}

/**
 * Parses test/it blocks from TypeScript source code.
 */
export function extractTestCasesFromSource(
  source: string,
  filePath = "snippet.ts",
): ParsedTestCase[] {
  const testCases: ParsedTestCase[] = [];

  // Match: test("...", ... or it("...", ...
  const testStartRegex = /(?:test|it)\s*\(\s*(["'`])(.*?)\1\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = testStartRegex.exec(source)) !== null) {
    const title = match[2];
    const startIndex = match.index;

    // Find line number
    const startLine = source.slice(0, startIndex).split("\n").length;

    // Find the matching closing brace for this test block
    let openBraces = 0;
    let foundFirstBrace = false;
    let endIndex = -1;

    for (let i = startIndex; i < source.length; i++) {
      if (source[i] === "{") {
        openBraces++;
        foundFirstBrace = true;
      } else if (source[i] === "}") {
        openBraces--;
        if (foundFirstBrace && openBraces === 0) {
          endIndex = i + 1;
          const nextSemicolon = source.indexOf(";", endIndex);
          const nextParen = source.indexOf(")", endIndex);
          if (nextParen !== -1 && (nextSemicolon === -1 || nextParen < nextSemicolon)) {
            endIndex =
              nextSemicolon !== -1 && nextSemicolon - nextParen < 3
                ? nextSemicolon + 1
                : nextParen + 1;
          }
          break;
        }
      }
    }

    const rawCode =
      endIndex !== -1
        ? source.slice(startIndex, endIndex)
        : source.slice(startIndex, startIndex + 500);

    // Extract structure summaries
    const setupSummary = extractPokemonSetups(rawCode);
    const actionsSummary = extractActions(rawCode);
    const assertionsSummary = extractAssertions(rawCode);

    testCases.push({
      title,
      rawCode,
      filePath,
      startLine,
      setupSummary,
      actionsSummary,
      assertionsSummary,
    });
  }

  return testCases;
}

function extractPokemonSetups(code: string): string {
  const speciesMatches = [...code.matchAll(/species:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const abilityMatches = [...code.matchAll(/ability:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const itemMatches = [...code.matchAll(/item:\s*["']([^"']+)["']/g)].map((m) => m[1]);

  const parts: string[] = [];
  if (speciesMatches.length > 0) {
    parts.push(`Species: ${[...new Set(speciesMatches)].join(", ")}`);
  }
  if (abilityMatches.length > 0) {
    parts.push(`Abilities: ${[...new Set(abilityMatches)].join(", ")}`);
  }
  if (itemMatches.length > 0) {
    parts.push(`Items: ${[...new Set(itemMatches)].join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "No explicit pokemon configuration found";
}

function extractActions(code: string): string {
  const actions: string[] = [];
  const execMatches = code.matchAll(
    /(?:executeAndAssert|executeTurn)\s*\(\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/g,
  );
  for (const m of execMatches) {
    if (m[2]) {
      actions.push(`P1: [${m[1]}], P2: [${m[2]}]`);
    } else {
      actions.push(`Choices: [${m[1]}]`);
    }
  }

  // Also match engine.run_turn({ ... })
  const runTurnMatches = code.matchAll(/run_turn\s*\(\s*\{([^}]+)\}\s*\)/g);
  for (const m of runTurnMatches) {
    const rawArgs = m[1].replace(/\s+/g, " ").trim();
    actions.push(`Engine run_turn: { ${rawArgs} }`);
  }

  if (code.includes("executeAndAssert")) {
    actions.push(
      "(Note: uses executeAndAssert to assert full battle engine state parity against Pokémon Showdown reference simulator)",
    );
  }

  return actions.length > 0 ? actions.join("; ") : "No battle turn actions detected";
}

function extractAssertions(code: string): string {
  const assertions: string[] = [];
  const expectMatches = code.matchAll(/expect\s*\(([^)]+)\)\.([a-zA-Z]+)\(([^)]*)\)/g);
  for (const m of expectMatches) {
    assertions.push(`expect(${m[1].trim()}).${m[2]}(${m[3].trim()})`);
  }

  // Also capture custom assertion patterns like: if (...) throw new Error(...)
  const throwMatches = code.matchAll(/if\s*\(([^)]+)\)\s*(?:\{\s*)?throw new Error\s*\(([^)]+)\)/g);
  for (const m of throwMatches) {
    assertions.push(`assert(!(${m[1].trim()})) /* throws: ${m[2].trim()} */`);
  }

  return assertions.length > 0 ? assertions.join("; ") : "No explicit expect(...) calls detected";
}

/**
 * Resolves the official specification text for the tested move/ability/item using Pokémon Dex.
 */
export function resolveMechanicSpecification(filePath: string, code: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const specs: string[] = [];

  // 1. Check path: tests/moves/([a-z0-9_-]+)\.test\.ts
  const movePathMatch = normalizedPath.match(/moves\/([a-z0-9_-]+)\.test\.ts/);
  if (movePathMatch) {
    const moveId = movePathMatch[1].replace(/[-_]/g, "");
    const move = Dex.moves.get(moveId);
    if (move.exists && (move.desc || move.shortDesc)) {
      specs.push(
        `Tested Move Specification (${move.name}):\n- Official Effect: "${move.desc || move.shortDesc}"\n- Priority: ${move.priority}, Target: ${move.target}`,
      );
    }
  }

  // 2. Check path: tests/abilities/([a-z0-9_-]+)\.test\.ts
  const abilityPathMatch = normalizedPath.match(/abilities\/([a-z0-9_-]+)\.test\.ts/);
  if (abilityPathMatch) {
    const abilityId = abilityPathMatch[1].replace(/[-_]/g, "");
    const ability = Dex.abilities.get(abilityId);
    if (ability.exists && (ability.desc || ability.shortDesc)) {
      specs.push(
        `Tested Ability Specification (${ability.name}):\n- Official Effect: "${ability.desc || ability.shortDesc}"`,
      );
    }
  }

  // 3. Check path: tests/items/([a-z0-9_-]+)\.test\.ts
  const itemPathMatch = normalizedPath.match(/items\/([a-z0-9_-]+)\.test\.ts/);
  if (itemPathMatch) {
    const itemId = itemPathMatch[1].replace(/[-_]/g, "");
    const item = Dex.items.get(itemId);
    if (item.exists && (item.desc || item.shortDesc)) {
      specs.push(
        `Tested Item Specification (${item.name}):\n- Official Effect: "${item.desc || item.shortDesc}"`,
      );
      if (item.megaStone) {
        specs.push(
          `Mechanic Specification (Mega Evolution via ${item.name}):\n- Selecting a move with the Mega trigger activates Mega Evolution in battle.\n- The holder transforms into its Mega form, updating its species, stats, typing, and ability, and consuming the side's Mega Evolution for the battle.`,
        );
      }
    }
  }

  // 4. Check mechanics/ paths (e.g. mega evolution)
  if (normalizedPath.includes("mechanics/mega_evolution")) {
    specs.push(
      `Mechanic Specification (Mega Evolution):\n- In Pokémon battles, Mega Evolution transforms a Pokémon into its Mega form, modifying its species, stats, typing, and ability.\n- Only one Pokémon per side may Mega Evolve per battle.\n- A Pokémon holding its matching Mega Stone cannot have its Mega Stone removed or stolen by Knock Off, Trick, or Switcheroo, and Knock Off does NOT receive a 1.5x damage boost against it.\n- A Pokémon holding a non-matching Mega Stone CAN have it removed by Knock Off with normal boosted power.`,
    );
  }

  // 5. For scenario tests or generic/complex tests, extract moves, abilities, and items mentioned in code or filename
  const isScenarioOrComplex =
    normalizedPath.includes("senarios") ||
    normalizedPath.includes("scenario") ||
    normalizedPath.includes("mechanics") ||
    specs.length === 0;

  if (isScenarioOrComplex) {
    const fillerMoves = new Set([
      "sleeptalk",
      "pass",
      "protect",
      "swordsdance",
      "growth",
      "flamethrower",
    ]);

    // Extract moves
    const moveRegex = /moves:\s*\[([^\]]+)\]/g;
    const foundMoves: string[] = [];
    let mMatch: RegExpExecArray | null;
    while ((mMatch = moveRegex.exec(code)) !== null) {
      const list = mMatch[1].match(/["']([a-zA-Z0-9]+)["']/g);
      if (list) {
        for (const item of list) {
          const id = item.replace(/["']/g, "").toLowerCase();
          // Skip filler moves unless file path or code specifically tests them
          if (!fillerMoves.has(id) && !foundMoves.includes(id)) {
            foundMoves.push(id);
          }
        }
      }
    }

    // Extract abilities
    const abilityRegex = /ability:\s*["']([a-zA-Z0-9_-]+)["']/g;
    const foundAbilities: string[] = [];
    let aMatch: RegExpExecArray | null;
    while ((aMatch = abilityRegex.exec(code)) !== null) {
      const id = aMatch[1].replace(/[-_]/g, "").toLowerCase();
      if (!foundAbilities.includes(id)) {
        foundAbilities.push(id);
      }
    }

    // Extract items
    const itemRegex = /item:\s*["']([a-zA-Z0-9_-]+)["']/g;
    const foundItems: string[] = [];
    let iMatch: RegExpExecArray | null;
    while ((iMatch = itemRegex.exec(code)) !== null) {
      const id = iMatch[1].replace(/[-_]/g, "").toLowerCase();
      if (!foundItems.includes(id)) {
        foundItems.push(id);
      }
    }

    // Check filename for mentions
    const fileName = path.basename(normalizedPath, path.extname(normalizedPath));
    const fileTokens = fileName.split(/[-_]/);
    for (const token of fileTokens) {
      const move = Dex.moves.get(token);
      if (move.exists && !foundMoves.includes(move.id)) {
        foundMoves.unshift(move.id);
      }
      const ability = Dex.abilities.get(token);
      if (ability.exists && !foundAbilities.includes(ability.id)) {
        foundAbilities.unshift(ability.id);
      }
      const item = Dex.items.get(token);
      if (item.exists && !foundItems.includes(item.id)) {
        foundItems.unshift(item.id);
      }
    }

    // Resolve specs (up to 2 moves, 2 abilities, 2 items)
    for (const moveId of foundMoves.slice(0, 2)) {
      const move = Dex.moves.get(moveId);
      if (move.exists && (move.desc || move.shortDesc)) {
        const spec = `Move Specification (${move.name}):\n- Official Effect: "${move.desc || move.shortDesc}"`;
        if (!specs.includes(spec)) specs.push(spec);
      }
    }

    for (const abilityId of foundAbilities.slice(0, 2)) {
      const ability = Dex.abilities.get(abilityId);
      if (ability.exists && (ability.desc || ability.shortDesc)) {
        const spec = `Ability Specification (${ability.name}):\n- Official Effect: "${ability.desc || ability.shortDesc}"`;
        if (!specs.includes(spec)) specs.push(spec);
      }
    }

    for (const itemId of foundItems.slice(0, 2)) {
      const item = Dex.items.get(itemId);
      if (item.exists && (item.desc || item.shortDesc)) {
        const spec = `Item Specification (${item.name}):\n- Official Effect: "${item.desc || item.shortDesc}"`;
        if (!specs.includes(spec)) specs.push(spec);
      }
    }
  }

  return specs.length > 0 ? specs.join("\n\n") : null;
}

/**
 * Converts a parsed test case into the `state` text sent to Kev, enriched with official specifications.
 */
export function formatTestCaseForKev(tc: ParsedTestCase): string {
  const specText = resolveMechanicSpecification(tc.filePath, tc.rawCode);

  const sections: string[] = [
    `# Test Case: "${tc.title}" (File: ${path.basename(tc.filePath)}:${tc.startLine})`,
  ];

  if (specText) {
    sections.push("", "## Official Mechanic Specification:", specText);
  }

  sections.push(
    "",
    "## Extracted Summary:",
    `- ${tc.setupSummary}`,
    `- Actions: ${tc.actionsSummary}`,
    `- Assertions: ${tc.assertionsSummary}`,
    "",
    "## Full Test Code:",
    "```typescript",
    tc.rawCode,
    "```",
  );

  return sections.join("\n");
}
