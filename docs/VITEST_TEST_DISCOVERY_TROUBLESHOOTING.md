## Vitest Test Discovery Troubleshooting Guide

Purpose: Help diagnose why Vitest is not discovering or running tests in this repository (TypeScript + Next.js monorepo style).

Quick checks (run first):

- **List test files** (PowerShell):
  - `Get-ChildItem -Recurse -Include *.test.* , *.spec.* | Select-Object FullName`
- **Run a single test file**:
  - `npx vitest run tests/e2e/_smoke.test.ts` or `npx vitest run path/to/file.test.ts`
- **Run Vitest with verbose output**:
  - `npx vitest --run --reporter verbose`

Common causes and step-by-step troubleshooting

1) No test files in the expected locations
- Verify that test files exist and use one of the expected filename patterns: `*.test.ts`, `*.spec.ts`, `*.test.js`, `*.spec.js`, `*.test.tsx`, etc.
- PowerShell example to find files:
  ```powershell
  Get-ChildItem -Recurse -Include *.test.* , *.spec.* | Select-Object FullName
  ```

2) Vitest config `test.include` / `test.exclude` mismatch
- Open `vitest.config.ts` and check the `test` block for `include`, `exclude`, or `threads` settings.
- If `include` is present, ensure it matches your test file globs (e.g., `tests/**/*.test.ts`).

3) Typescript config excludes tests
- Open `tsconfig.json` and check `exclude` and `include` arrays. If `tests` is excluded or not included in builds, Vitest may fail to transpile test files.

4) ESM vs CJS / package.json `type`
- If `package.json` has `"type": "module"`, Node treats `.js` as ESM. Make sure Vitest config and TS transpilation are compatible.

5) Vitest can't execute TypeScript config (`vitest.config.ts`)
- Vitest supports `vitest.config.ts` out of the box, but if your environment lacks a compatible Node toolchain or tsconfig paths, the config file might fail silently. Try running:
  ```powershell
  npx vitest --config=vitest.config.ts --run --reporter verbose
  ```
  to surface config evaluation errors.

6) Files are skipped due to `describe.skip` / `test.skip` or accidental grep/only
- Search for `.only`, `.skip` in your test files: `Select-String -Path tests\**\*.ts -Pattern "\.only|\.skip" -SimpleMatch`

7) Monorepo / workspace mismatch
- Ensure you're running Vitest from the workspace root where `vitest.config.ts` and `package.json` are located. If tests live in a package, run Vitest in that package or configure `projects` in the root `vitest.config.ts`.

8) Worker threads failing (silent discovery)
- Try disabling worker threads: `VITEST_THREAD_COUNT=1 npx vitest --run`

9) Transpilation/tooling problems (esbuild, tsup, etc.)
- If you use custom transformers, try running Vitest with the default transformers or check plugin logs.

Useful commands

- Run vitest and show debug logs:
  ```powershell
  npx vitest --run --reporter verbose --logLevel debug
  ```
- Run a single file directly (absolute path works too):
  ```powershell
  npx vitest run ./tests/e2e/_smoke.test.ts
  ```
- Run Node script that checks config and file globs (project-provided):
  ```powershell
  node ./scripts/diagnose-vitest.mjs
  ```

Automated diagnostic script
- Use `scripts/diagnose-vitest.mjs` (in repository) to collect common issues: missing vitest dependency, config includes/excludes, tsconfig exclusions, and enumerates matching test files and suggestions.

If you still can't find tests after these steps

- Copy one test file to a simple sample: `tests/quick.test.ts` with a tiny test and run `npx vitest run tests/quick.test.ts` to validate the runner.
- If that works, incrementally bring your real test into that pattern and compare.
- If nothing runs in this repo, try running `npx vitest --init` in a temporary folder and compare the created `vitest.config.ts` with your project's config.

Notes specific to this repository

- This project has `vitest.config.ts` at the repo root. Check `tests/` and `tests/e2e/` for tests created during the migration. The E2E files previously added were `tests/e2e/workflow-retriever-rollout.test.ts` and `tests/e2e/_smoke.test.ts` — ensure these are not excluded by the `vitest.config.ts` include/exclude rules.

If you'd like, run the included diagnostic script now to generate a report and suggested fixes.

---
Created: automated by repo tooling
