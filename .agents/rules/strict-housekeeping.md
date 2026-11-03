---
name: strict-housekeeping
description: "Rules for housekeeping, testing, and cleanup before reporting task completion"
trigger: always_on
---

# Strict Housekeeping & Clean-up

Before concluding any task or reporting completion to the user, you MUST perform the following cleanup steps:

1. **NEVER Report Completion Prematurely (ZERO ERROR POLICY)**: You are strictly prohibited from reporting a task as complete or claiming a fix is successful without FIRST executing `pnpm check` (or `tsc --noEmit`) AND `pnpm build` (to verify Next.js and Contentlayer Zod schemas), ensuring **0 errors**. Never blindly claim a UI looks "beautiful" or functions correctly without absolute verification.
2. **Run Static Analysis & Typechecks**: Always run the project's linter (e.g., `pnpm lint`), TypeScript compiler (`pnpm check`), and the build command (`pnpm build`) to detect unused variables, missing imports, Zod schema violations, or build failures introduced by your edits (including MDX content changes). **If your edits involved any translation JSON files, you MUST also run `pnpm run i18n:check`.** Fix all warnings and errors you caused before stopping.
3. **Run the Full Test Suite When Testing Logic (NEVER Run Unrelated Tests)**:
   - **Relevance Check (Do NOT Run Unrelated Tests)**: You are **STRICTLY PROHIBITED** from running tests for changes that do not affect runtime application logic (e.g., editing Markdown/MDX documentation, updating comments, fixing typos, or pure text adjustments). Never waste time running irrelevant test suites ("意味不明に変更点に関係ないテスト回すのやめてね").
   - **Full Suite When Testing**: When and only when you make changes to testable code/logic and need to verify tests, you are **STRICTLY FORBIDDEN** from running a single test file (e.g., `vitest run tests/moves/dragoncheer.test.ts`). You **MUST** run the entire test suite (e.g., `pnpm exec vitest run tests/`).
   - **Enforcement**: If tests are executed, the environment has an automated monitoring script that will actively kill and interrupt your process if you attempt to run a single test file.
4. **Execute and Test**: Run the relevant code or tests to verify your implementation actually works in practice, rather than assuming it works based on the source code.
5. **STRICT Workspace Isolation for Scratch Scripts (Operational vs. Scratch)**:
   - **Definition of a Scratch Script**: Any script that contains hardcoded data for a specific test case (e.g., targeting a single MDX file), is meant for one-off data migration, or is used for temporary experimentation/validation is a **Scratch Script**.
   - **Definition of an Operational Script**: Only generic, robust, reusable scripts that apply to the entire repository (e.g., `check-i18n.ts`, `validate_domain.ts`) are considered **Operational Scripts**.
   - **Mandatory Location**: You **MUST** create all Scratch Scripts exclusively inside your dedicated agent scratch directory: `<appDataDir>\brain\<conversation-id>\scratch\`.
   - **Absolute Prohibition**: You are strictly forbidden from placing Scratch Scripts in **ANY** existing project directory. The `scripts/` directories are exclusively for Operational Scripts. Do not put temporary test files in `scripts/`, `src/`, `tmp/`, or anywhere else inside the workspace. **NO EXCEPTIONS.**
   - **No Laziness on Imports**: If a scratch script inside your `<appDataDir>\brain\<conversation-id>\scratch\` directory fails to execute due to TypeScript/ES module resolution errors, you MUST fix the execution command or path configuration. **You are STRICTLY FORBIDDEN from moving the scratch file into the project workspace (e.g., `packages/engine/tests/`) just to make it run.**
   - **Immediate Cleanup**: If you inadvertently create a temporary file or folder inside the project workspace, you must `rm -rf` it immediately after use to leave no trace.
6. **Clean Up Associated Dead Code**: If you remove a feature, component, or UI element, proactively search for and delete all associated dead code. This strictly includes removing orphaned localization keys from translation files (`en/translation.json`, `ja/translation.json`, etc.).
7. **Remove Temporary Debugging Code**: If you added temporary logs (e.g., `console.log`, `console.error`) or experimental code to debug an issue, you MUST remove them and restore the code to its original clean state before reporting completion.
8. **ABSOLUTE PROHIBITION on Destructive Git Commands**: You are strictly forbidden from running `git checkout`, `git restore`, or `git reset` on any files in the workspace. NO EXCEPTIONS. Do not use these even if you just want to revert a temporary debug change you made to a test file. Manually edit the file to revert changes.
