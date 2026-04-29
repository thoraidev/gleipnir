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

### 2026-04-28 — Railway deploy fix and Gleipnir-specific build log

Commit: `0b84d1c` — `Fix Railway Node version and add build log`

Fixed the Railway/Nixpacks production build failure.

Root cause:

- Railway/Nixpacks defaults Node to 18 unless told otherwise.
- Gleipnir uses Next.js 16.2.4, which requires Node `>=20.9.0`.

Changes:

- Added `engines.node = "22.x"` to `package.json` and `package-lock.json`.
- Added this dedicated `BUILD_LOG.md` for the ETHGlobal/Open Agents Gleipnir build.
- Linked the build log from `README.md`.

Verification:

- Local clean builds passed after the Node version pin.
- GitHub/Railway are now aligned on Node 22.

### 2026-04-28 — Phase 1: report page wired to analyzer

Commit: `8b8f580` — `Wire report page to Gleipnir analyzer`

The deployed report page moved from placeholder copy to live analysis.

Built:

- Shared analyzer module: `src/lib/analyze-contract.ts`
- `/api/analyze` now calls shared analyzer logic.
- `/api/v1/check` now calls shared analyzer directly instead of self-fetching via `NEXT_PUBLIC_BASE_URL`.
- `/report/[address]` renders real report data:
  - risk score and risk level
  - red flags
  - proxy / implementation status
  - risk breakdown
  - privileged function list
  - source stats
- Added report loading skeleton: `app/report/[address]/loading.tsx`.

Smoke result before false-positive cleanup:

- Aave Pool resolved as `PoolInstance`.
- Analyzer returned `92 / CRITICAL`, `111` privileged functions, and `7` red flags.
- This proved the UI/API wiring worked, but also exposed major false-positive noise from flattened verified source.

### 2026-04-28 — False-positive cleanup: interfaces and libraries

Commit: `285eda8` — `Reduce false positives in permission analyzer`

Trav noticed the report claimed impossible Aave issues like “anyone can call addPoolAdmin.” This exposed that the parser was treating bundled interfaces and library helpers as direct live contract surfaces.

Fixes:

- Parser now tracks Solidity scopes:
  - `contract`
  - `abstract contract`
  - `interface`
  - `library`
- Skips declaration-only functions from interfaces/abstract APIs.
- Skips library helper functions as direct user-callable contract surface.
- Stops treating harmless read-only declarations / role getters as privileged functions.
- Narrows unprotected sensitive-name detection to admin/governance/upgrade/rescue/freeze/oracle/fee-style names.
- Calibrates risk scoring so a large controlled admin surface is not scored like confirmed anyone-callable critical paths.

Verification / Aave smoke:

- Aave dropped from `111` functions to `17` relevant protected functions.
- Bogus “73 critical functions callable by anyone” warning disappeared.
- Remaining warnings became credible: upgradeable proxy, privileged fund-moving function, privileged economic parameter changes.

### 2026-04-28 — Phase 1.5: target-contract filtering and clearer access metadata

Commit: `d6bdb61` — `Harden Phase 1.5 permission analysis`

Turned the quick false-positive cleanup into stronger target-aware analysis.

Built:

- Analyzer accepts `targetContractName`.
- Parser reads Solidity inheritance (`contract Target is BaseA, BaseB`).
- Analysis filters to the target implementation contract plus inherited base contracts.
- Added `accessType` metadata:
  - `protected`
  - `unprotected`
  - `dangerous-internal`
- Added `sourceContract` metadata for each permissioned function.
- Report UI now says `Access: protected by ...` and shows `Source: ...` instead of only `Caller`.
- Added tests for target-contract inheritance filtering.

Verification / Aave smoke:

- `PoolInstance`
- `63 / HIGH`
- `17` functions
- no `execute*` helper noise
- no interface role getter noise
- all listed Aave functions are protected
- source contract is `Pool`

### 2026-04-28 — Phase 1.6: ERC user-flow exclusions, cache, ownership MVP

Commit: `8c3779b` — `Implement Phase 1.6 analysis hardening`

Addressed testing feedback before moving to Phase 2.

#### ERC/user-operation exclusion

Added explicit exclusions for standard ERC user authorization flows so Gleipnir does not confuse token-user permissions with protocol-admin permissions.

Excluded standard user functions:

- ERC-20: `transfer`, `transferFrom`, `approve`, allowance helpers, `permit`
- ERC-721: `safeTransferFrom`, `setApprovalForAll`
- ERC-1155: `safeTransferFrom`, `safeBatchTransferFrom`

Important nuance:

- ERC-shaped functions stay visible if the project adds explicit privileged modifiers such as `onlyOwner`.

#### Tests

Added parser tests for:

- ERC-20 user flows
- ERC-721 user flows
- ERC-1155 user flows
- non-standard privileged ERC-shaped functions remaining visible

Test suite now has 6 parser/risk tests.

#### Cache

Added a 5-minute in-memory analysis cache keyed by `chain:address`.

Behavior:

- caches successful analysis results
- coalesces concurrent in-flight analysis promises
- avoids repeat Blockscout/Etherscan/RPC calls during demos and refreshes

#### Ownership-chain MVP

Added `src/lib/ownership-resolver.ts`.

Capabilities:

- reads EIP-1967 proxy admin slot when available
- tries generic `owner()`, `admin()`, and `governance()`
- classifies:
  - EOA
  - Gnosis Safe / multisig via `getOwners()` + `getThreshold()`
  - Timelock via `getMinDelay()` / `delay()`
  - Governor via `votingPeriod()`
  - unknown contract
- Report UI now includes a `Control surface` card.

Known limitation:

- Aave ownership remains unresolved by this MVP because Aave uses protocol-specific ACL / configurator indirection rather than a simple generic `owner()` or proxy-admin path. Phase 2 should trace Aave-style `ADDRESSES_PROVIDER`, `ACLManager`, `PoolConfigurator`, proxy admin, and timelock/governance contracts.

Verification / Aave smoke:

- `PoolInstance`
- `63 / HIGH`
- `17` functions
- no ERC noise
- no `execute*` helper noise
- cache confirmed by repeated calls returning the same `analysisTimestamp`

### 2026-04-29 — Handoff before new testing-feedback session

No code changes in this entry. Saved state for a new session before Phase 2.

Current branch state:

- Latest runtime code checkpoint: `8c3779b` — `Implement Phase 1.6 analysis hardening`.
- Handoff/docs checkpoint is the latest commit on `main`; see `git log -1` for the exact hash.
- `main` is synced with `origin/main` after the handoff/docs checkpoint.
- Railway should be deploying the latest `main`; no runtime code changed after `8c3779b`.

Current known priorities from review feedback:

1. Consume Trav’s new testing feedback before Phase 2.
2. Phase 2: protocol-specific ownership/control graph resolution.
   - Aave-style `Pool -> AddressesProvider / ACLManager / PoolConfigurator / governance` tracing.
   - Safe/timelock/governor labels in the report.
3. Improve plain-English descriptions with Claude as narrator, not source of truth.
4. Add OpenGraph metadata / image for shareable report links.
5. Polish search UX: replace `alert()` with inline error.
6. Add share/copy URL button.
7. Update landing copy to avoid stale “five days ago” wording.
8. Test against 10+ real contracts and record remaining false positives.

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
