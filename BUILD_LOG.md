# Gleipnir Build Log — ETHGlobal Open Agents 2026

> Scope guard: this log is for **Gleipnir**, the ETHGlobal Open Agents / Ethereum hackathon build. It is **not** the ENS hackathon/project build log and should not be merged with ENSFall, NamePact, or other ENS-focused work.

## Project

**Gleipnir** answers: _Who can rug this protocol?_

It makes Ethereum smart contract permission structures legible to humans and agents by extracting privileged functions, resolving admin/owner surfaces, flagging dangerous control paths, and producing a plain-English risk report plus API response.

- Repo/path: `/root/.openclaw/workspace/projects/gleipnir`
- Hackathon: ETHGlobal Open Agents, April 24–May 3, 2026
- Stack: Next.js 16 App Router, TypeScript, Tailwind v4, Blockscout API, Etherscan fallback, DeFiLlama TVL context, Railway
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
5. Polish search UX: replace browser popup validation with inline error.
6. Add share/copy URL button.
7. Update landing copy to avoid stale “five days ago” wording.
8. Test against 10+ real contracts and record remaining false positives.

### 2026-04-29 — Phase 1.7 demo-readiness: rsETH, USDC, Lido fixes

Testing feedback focused on demo credibility across rsETH, USDC, Lido, Aave, ENS, and Uniswap.

Implemented:

- Ownership resolver now follows one generic hop past a resolved proxy admin.
  - Detects OpenZeppelin-style `ProxyAdmin -> owner()`.
  - Classifies the owner as Safe, Timelock, Governor, EOA, or UnknownContract.
  - Uses serialized RPC probes and fallback public RPC URLs to avoid demo-time rate-limit failures.
- Proxy resolver now retries EIP-1967 slot reads across multiple RPC endpoints.
- Report UI now renders the resolved control chain, not just the first owner.
- Added Claude-backed plain-English descriptions for the top 5 functions per report when `ANTHROPIC_API_KEY` is present.
  - Deterministic descriptions remain the fallback and source of truth.
  - Claude is narration only: it cannot change extracted facts, callers, categories, or risk factors.
- Improved deterministic descriptions for mint, burn, freeze/blacklist, unfreeze/unblacklist, minter configuration, rescue/recovery, pause/unpause, ownership changes, upgrades, and economic parameters.
- Fixed Lido false positives:
  - Detects Aragon-style access checks (`auth`, `authP`, `_auth`, `canPerform`, `hasPermission`, etc.).
  - Detects one-time initializer / upgrade-finalization guards, including Lido-style `_checkContractVersion()` / `_setContractVersion()`.
  - Skips read-only permission-check helpers like Aragon `canPerform(...)` as direct privileged surfaces.

Added tests:

- Aragon-style auth detection.
- Initializer / upgrade-finalization guard detection.

Verification:

```bash
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/permission-extractor.test.ts
npm run build
```

All passed. Test suite now has 7 tests.

Smoke results from local production server:

- rsETH (`0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7`)
  - `RSETH`, `67 / HIGH`
  - Control resolved: `ProxyAdmin 0xb61e…dc78 -> Timelock 0x49bd…35b1`
  - Timelock delay: `864000s` = 10 days
  - Top descriptions now specifically identify freeze, mint, burn, pause, and frozen-fund recovery behavior.
- USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`)
  - `FiatTokenV2_2`, `67 / HIGH`
  - Correctly shows centralized/permissioned pattern: blacklist, mint, burn, pause, minter configuration, rescue, ownership transfer.
  - No ERC transfer/approve false-positive noise.
- Lido (`0xae7ab96520de3a18e5e111b5eaab095312d7fe84`)
  - Dropped from `82 / CRITICAL` to `67 / HIGH`.
  - `pauseStaking` is now protected by `STAKING_PAUSE_ROLE`.
  - `finalizeUpgrade_v3` is now treated as a one-time upgrade-finalization flow, not an anyone-callable critical function.

Remaining known work:

- Lido still scores HIGH because the deterministic engine sees a large fund/permission/upgrade surface. Further calibration can distinguish operational accounting/vault hooks from governance/admin powers.
- USDC owner resolution currently reports the implementation-level `owner()` EOA. Further work should distinguish proxy admin control from implementation owner control for non-EIP-1967 proxy patterns.
- Aave still needs protocol-specific ACL graph tracing.

### 2026-04-29 — Phase 1.8 demo API hardening after real-contract matrix

Commit: `7f3cbb0` — `Harden demo API scoring and EOA handling`

After testing the agent-facing `/api/v1/check` endpoint against the proposed demo contract matrix, tightened a few high-leverage presentation and scoring issues.

Demo matrix tested:

- rsETH proxy: `0xa1290d69c65a6fe4df752f95823fae25cb99e5a7`
- RSETH OFTAdapter: `0x2A1D74de3027ccE18d31011518C571130a4cd513`
- Kelp deployer EOA: `0x7aad74b7f0d60d5867b59dbd377a71783425af47`
- Aave V3 Pool: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- Lido stETH: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`
- Uniswap V3 Factory: `0x1F98431c8aD98523631AE4a59f267346ea31F984`
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- GALA single-EOA mint example: `0x15D4c048f83bd7e37d49EA4C83A07267ec4203Da`

Built:

- Added an explicit non-contract / EOA preflight using Blockscout address metadata.
  - Previous error: “Contract source not verified...”
  - New error: `This address is not a smart contract (EOA/wallet). Gleipnir analyzes smart contract permissions.`
- Risk scoring now receives ownership-chain context.
- Added `Single EOA controls token supply` red flag for non-proxy contracts where an EOA controls mint / burn / issue authority.
- Reweighted that pattern so EOA-owned supply-control tokens score as genuinely dangerous instead of merely moderate.
- ENS Registry ownership now resolves via `owner(bytes32 root node)` and follows the root owner one hop deeper to its timelock.
- Added `scripts/run-demo-api-tests.mjs` to reproduce the demo matrix API checks and save full JSON outputs locally.
- Ignored generated `test-outputs/` artifacts so demo JSON can be regenerated without polluting commits.

Updated smoke results:

- rsETH: `RSETH`, `67 / HIGH`, `ProxyAdmin -> 10-day timelock`, 11 privileged functions.
- RSETH OFTAdapter: `KERNEL_OFTAdapter`, `47 / ELEVATED`, `3/6 multisig`, 9 privileged functions.
- Kelp deployer EOA: HTTP `422`, explicit EOA/wallet message.
- Aave V3 Pool: `PoolInstance`, `63 / HIGH`, ownership still pending, 18 privileged functions.
- USDC: `FiatTokenV2_2`, `67 / HIGH`, centralized control surface remains clear.
- Lido: `Lido`, `67 / HIGH`, calibrated down from earlier false-positive `CRITICAL` behavior.
- Uniswap V3 Factory: `UniswapV3Factory`, `41 / ELEVATED`, 2 privileged functions, 2-day timelock.
- ENS Registry: `ENSRegistryWithFallback`, `47 / ELEVATED`, root owner resolves to 2-day timelock.
- GALA: `Gala`, moved from `39 / MODERATE` to `73 / HIGH` with `Single EOA controls token supply` red flag.

Verification:

```bash
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/permission-extractor.test.ts
npm run build
```

All passed. Test suite now has 8 tests.

### 2026-04-30 — Report narration, blast-radius context, and final submission polish

This pass finished the hackathon-demo presentation layer without changing the deterministic analysis contract.

Built:

- Locked product narration to Claude Haiku and separated report-page LLM narration from the agent API.
  - `/report/[address]` can request Haiku-polished summary/function prose.
  - `/api/v1/check` and `/api/analyze` remain deterministic/no-LLM.
  - Cache keys separate deterministic vs report-narrated results.
- Added a report summary paragraph produced from deterministic findings only.
  - Haiku can improve readability, not callers, scores, categories, red flags, or extracted facts.
- Added DeFiLlama blast-radius context.
  - High-confidence manual matches for demo protocols such as Aave V3, Lido, Uniswap V3, and Kelp/rsETH.
  - Conservative name-based fallback.
  - TVL context is explicitly not exact contract-controlled funds and does not affect permission risk scoring.
- Tightened report-page card sizing for desktop readability.
- Final submission polish:
  - Replaced stale relative-date landing copy with date-stable April 2026 language.
  - Added rsETH to landing-page demo links.
  - Updated AI attribution to match the Haiku implementation.
  - Replaced search-bar browser popup validation with inline validation feedback.
  - Added a report copy-link button.
  - Added lightweight report-page OpenGraph/Twitter metadata without triggering contract analysis in crawlers.
  - Removed unused create-next-app SVG boilerplate assets.

### 2026-05-01 — ENS input integration for submission polish

Added a small, real ENS integration for the search flow:

- Added `GET /api/resolve-ens?name=protocol.eth`.
  - Uses the existing Blockscout MCP `get_address_by_ens_name` path.
  - Keeps API validation conservative: DNS-style ENS names only, max 255 characters.
- Updated `SearchBar` so users can paste either a `0x…` address or an ENS name.
  - ENS names resolve server-side, then navigate to the resolved `/report/[address]` page.
  - Resolution errors stay inline with ARIA live feedback.
- Updated README feature list and API example to reflect current Aave output.

ENS smoke verification:

- `resolver.eth` resolves to `0x231b0ee14048e9dccd1d247744d114a4eb5e8e63`.
- The resolved address analyzes successfully as `PublicResolver`, `47 / ELEVATED`, with 12 privileged functions.
- `aave.eth` currently resolves to the zero address through upstream ENS data and is rejected with `404 No Ethereum address found` instead of navigating to `0x000…000`.

Verification:

```bash
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.ts
npm run build
```

All passed. Test suite now has 11 tests.

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
