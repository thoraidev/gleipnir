# Gleipnir / ETHGlobal Hackathon Handoff

Updated: 2026-04-27 19:24 UTC

## Current Goal
Build Gleipnir: smart contract permission extraction and risk scoring for humans and agents.

## Latest Completed Work
Implemented deterministic TypeScript permission extraction + risk scoring support.

### Parser / Detector
File: `src/lib/permission-extractor.ts`

Capabilities now included:
- Parses Solidity `function`, `constructor`, `fallback`, and `receive` declarations.
- Handles multi-line signatures.
- Extracts function name, signature, params, return values, visibility, mutability, and line number.
- Detects access control from:
  - Modifiers: `onlyOwner`, `onlyRole`, `onlyAdmin`, custom `only*`, `requires*`, auth/role/owner/admin-style modifiers.
  - Body checks: `require(msg.sender == owner)`, `_msgSender()`, `tx.origin`, `hasRole(...)`, `authorized[msg.sender]`, `if (...) revert` patterns.
  - Dangerous internals: `delegatecall`, low-level `.call`, `.staticcall`, `.callcode`, inline `assembly`.
- Categorizes permissioned functions into:
  - `funds`
  - `parameters`
  - `permissions`
  - `pausability`
  - `upgradeability`
  - `other`
- Adds risk factors:
  - `unprotected-anyone-callable`
  - `low-level-call`
  - `inline-assembly`
  - `upgrade-path`
  - `fallback-entrypoint`
  - `receive-entrypoint`
  - `mitigated-by-timelock-or-guard`

### Risk Engine
File: `src/lib/risk-engine.ts`

Added:
- Scoring increases for unprotected critical functions.
- Scoring increases for low-level calls / inline assembly.
- Slight scoring reduction for guard/timelock-style mitigations.
- Red flags for:
  - `Unprotected critical function`
  - `Dangerous low-level execution path`

### Types
File: `src/lib/types.ts`

Extended `PermissionedFunction` with:
- `lineNumber?: number`
- `parameters?: string[]`
- `returnValues?: string[]`
- `accessControl?: string[]`
- `riskFactors?: string[]`

### Tests
File: `tests/permission-extractor.test.ts`

Coverage includes:
- OpenZeppelin-style `AccessControl`
- `onlyOwner`
- `onlyRole(DEFAULT_ADMIN_ROLE)`
- multi-line signatures
- body `require` authorization
- low-level call detection
- `delegatecall`
- inline `assembly`
- fallback handling
- risk engine red flags

## Verification Passed
Commands run from `/root/.openclaw/workspace/projects/gleipnir`:

```bash
node --experimental-strip-types --test tests/permission-extractor.test.ts
npx tsc --noEmit
npm run lint
npm run build
```

All passed.

Build warning only:
- Next.js inferred workspace root due to multiple lockfiles:
  - `/root/.openclaw/workspace/package-lock.json`
  - `/root/.openclaw/workspace/projects/gleipnir/package-lock.json`
- Build succeeds despite warning.

## Current Git State Notes
Uncommitted work exists. Do not assume every change is from the latest parser task.

Observed `git status --short`:

```text
 M app/layout.tsx
 M app/page.tsx
 M eslint.config.mjs
 D src/app/api/analyze/route.ts
 D src/app/api/v1/check/route.ts
 D src/app/page.tsx
 D src/app/report/[address]/page.tsx
 M src/lib/blockscout.ts
 M src/lib/types.ts
 M tsconfig.json
?? app/api/
?? app/report/
?? src/lib/permission-extractor.ts
?? src/lib/risk-engine.ts
?? tests/
```

Important: Some app-router migration files and layout/page changes already existed before the parser implementation. Review before committing if a clean commit is needed.

## Recommended Next Steps
1. Review uncommitted app-router changes and decide whether to commit as one hackathon checkpoint or split into logical commits.
2. Add an AST/import-resolution fallback later for inheritance/import-heavy contracts.
3. Add more fixtures:
   - UUPS `_authorizeUpgrade`
   - Transparent proxy admin patterns
   - TimelockController ownership
   - multisig/governance owner labels
   - dynamic role names
   - inherited modifiers
4. Consider adding a small script/test command in `package.json` for the node test runner.
5. Silence Next.js workspace-root warning via `next.config.ts` `turbopack.root` if desired.

## One-Line Status
Gleipnir now has a deterministic Solidity permission extractor with fixture tests and successful typecheck/lint/build; remaining work is AST/import depth, ownership-chain intelligence, and commit hygiene.
