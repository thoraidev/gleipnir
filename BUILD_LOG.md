# Gleipnir Build Log — ETHGlobal Open Agents 2026

> Scope guard: this log is for **Gleipnir**, the ETHGlobal Open Agents / Ethereum hackathon build. It is **not** the ENS hackathon/project build log and should not be merged with ENSFall, NamePact, or other ENS-focused work.

## Project

**Gleipnir** answers: _Who can rug this protocol?_

It makes Ethereum smart contract permission structures legible to humans and agents by extracting privileged functions, resolving admin/owner surfaces, flagging dangerous control paths, and producing a plain-English risk report plus API response.

- Repo/path: `/root/.openclaw/workspace/projects/gleipnir`
- Hackathon: ETHGlobal Open Agents, April 24–May 3, 2026
- Stack: Next.js 15 App Router, TypeScript, Tailwind v4, Blockscout API, Etherscan fallback, Railway
- Core user: protocol users and agents that need to know contract permission risk before interacting

## Build Entries

### 2026-04-25 — Project scaffold and first data integrations

Commit: `7b844f6` — `feat: project scaffold + blockscout/etherscan api integration`

Built the first Gleipnir application shell and data pipeline:

- Created Next.js project structure, global styling, layout, landing page, and report route foundation.
- Added SearchBar component for contract lookup flow.
- Added contract-analysis API routes:
  - `/api/analyze`
  - `/api/v1/check`
- Added Blockscout integration as primary source.
- Added Etherscan integration as fallback source.
- Added proxy resolver, constants, and shared TypeScript types.
- Added Railway deployment config.
- Added README positioning: **“Who can rug this protocol?”**

Architectural decision:

- Blockscout is primary because it is open and keyless for many chains; Etherscan remains a fallback for verified source and familiar coverage.

### 2026-04-25 — Blockscout MCP client

Commit: `e0a8482` — `feat: blockscout mcp client (inspect_contract_code, read_contract, ens resolution, admin history)`

Expanded the analysis layer with a dedicated Blockscout MCP client.

Added support for:

- `inspect_contract_code`
- `read_contract`
- ENS resolution
- Admin/history-oriented lookups

Architectural decision:

- Keep the agent-facing contract intelligence pipeline modular, so future MCP calls and direct API calls can be swapped or layered without rewriting the app routes.

### 2026-04-25 — Full Blockscout MCP tool coverage

Commit: `b862e50` — `feat: add get_transaction_info + direct_api_call to mcp client (full tool coverage)`

Completed the Blockscout MCP client surface for the initial hackathon build.

Added:

- `get_transaction_info`
- `direct_api_call`

Why it mattered:

- Admin timelines and permission risk reports need transaction context, not only static source-code inspection.
- Direct API access gives Gleipnir an escape hatch for endpoints not yet wrapped in higher-level helpers.

### 2026-04-27 — Permission extraction and risk-scoring MVP

Commit: `14adc0c` — `Build Gleipnir permission analysis MVP`

Implemented the first serious deterministic permission-analysis engine.

#### Parser / detector

File: `src/lib/permission-extractor.ts`

Added support for parsing Solidity:

- `function`
- `constructor`
- `fallback`
- `receive`
- multi-line signatures

Extracts:

- function name
- full signature
- parameters
- return values
- visibility
- mutability
- source line number

Detects access control from:

- common modifiers like `onlyOwner`, `onlyRole`, `onlyAdmin`
- custom `only*`, `requires*`, auth/role/owner/admin-style modifiers
- body checks such as `require(msg.sender == owner)` and `_msgSender()` patterns
- `tx.origin` checks
- OpenZeppelin `hasRole(...)`
- `authorized[msg.sender]`
- `if (...) revert` guard patterns

Flags dangerous internals:

- `delegatecall`
- low-level `.call`
- `.staticcall`
- `.callcode`
- inline `assembly`

Categorizes privileged functions into:

- funds
- parameters
- permissions
- pausability
- upgradeability
- other

Adds risk factors:

- `unprotected-anyone-callable`
- `low-level-call`
- `inline-assembly`
- `upgrade-path`
- `fallback-entrypoint`
- `receive-entrypoint`
- `mitigated-by-timelock-or-guard`

#### Risk engine

File: `src/lib/risk-engine.ts`

Added scoring behavior for:

- unprotected critical functions
- dangerous low-level execution paths
- inline assembly
- upgrade paths
- timelock/guard mitigations

Added red flags for:

- `Unprotected critical function`
- `Dangerous low-level execution path`

#### Types

File: `src/lib/types.ts`

Extended `PermissionedFunction` with:

- `lineNumber?: number`
- `parameters?: string[]`
- `returnValues?: string[]`
- `accessControl?: string[]`
- `riskFactors?: string[]`

#### Tests

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
- risk-engine red flags

#### App structure cleanup

Moved app routes from `src/app` to top-level `app` and removed duplicate old route/page files.

## Verified Gates

Run from `/root/.openclaw/workspace/projects/gleipnir` on 2026-04-27:

```bash
node --experimental-strip-types --test tests/permission-extractor.test.ts
npx tsc --noEmit
npm run lint
npm run build
```

All passed.

Build warning only:

- Next.js inferred workspace root because multiple lockfiles exist:
  - `/root/.openclaw/workspace/package-lock.json`
  - `/root/.openclaw/workspace/projects/gleipnir/package-lock.json`

## Current Capability Snapshot

Gleipnir can now:

- Fetch and inspect verified contract data.
- Parse Solidity permission surfaces deterministically.
- Identify privileged functions and dangerous control paths.
- Score risk from permission centralization and dangerous execution patterns.
- Serve human-readable app reports and agent-readable API output.

## Known Next Work

- Add AST/import-resolution fallback for inherited and imported contracts.
- Add fixtures for:
  - UUPS `_authorizeUpgrade`
  - Transparent Proxy admin patterns
  - TimelockController ownership
  - multisig/governance owner labels
  - dynamic role names
  - inherited modifiers
- Add ownership-chain intelligence for EOAs, multisigs, timelocks, and governors.
- Consider silencing the Next.js workspace-root warning with explicit `turbopack.root`.

## Separation From ENS Work

This ETH hackathon build log belongs to **Gleipnir**.

Do not use ENSFall, ENS marketplace, NamePact, ENS primary-name, or other ENS project history as Gleipnir build-log material unless explicitly requested for comparison.
