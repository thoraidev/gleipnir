# Gleipnir / ETHGlobal Hackathon Handoff

Updated: 2026-04-29 01:20 UTC

## Current Goal

Build Gleipnir: smart contract permission extraction, risk scoring, and control-surface reporting for humans and agents.

Core question: **Who can rug this protocol?**

## Current Repo State

Path: `/root/.openclaw/workspace/projects/gleipnir`

Git:

```text
main == origin/main
HEAD: 8c3779b Implement Phase 1.6 analysis hardening
```

Recent commits:

```text
8c3779b Implement Phase 1.6 analysis hardening
d6bdb61 Harden Phase 1.5 permission analysis
285eda8 Reduce false positives in permission analyzer
8b8f580 Wire report page to Gleipnir analyzer
0b84d1c Fix Railway Node version and add build log
14adc0c Build Gleipnir permission analysis MVP
```

Important docs:

- Build log: `/root/.openclaw/workspace/projects/gleipnir/BUILD_LOG.md`
- README: `/root/.openclaw/workspace/projects/gleipnir/README.md`
- Notion HQ: `ETHGlobal Open Agents` (`https://www.notion.so/ETHGlobal-Open-Agents-34ccb946bafe814fa3d9ddd541894f0f`)

## Current Capabilities

### Report / API

- `/report/[address]` renders real analysis.
- `/api/analyze` returns full internal analysis JSON.
- `/api/v1/check?address=0x...&chain=ethereum` returns agent-friendly JSON.
- Shared analyzer lives at `src/lib/analyze-contract.ts`.
- Report includes:
  - risk score / level
  - red flags
  - proxy / implementation info
  - risk breakdown
  - control surface card
  - privileged function list
  - source stats

### Parser / Permission Extractor

File: `src/lib/permission-extractor.ts`

Capabilities:

- Parses Solidity `function`, `constructor`, `fallback`, `receive`.
- Handles multi-line signatures.
- Extracts name, signature, params, returns, visibility, mutability, source line number.
- Detects access control via:
  - modifiers (`onlyOwner`, `onlyRole`, custom `only*`, `requires*`, role/admin/auth/owner terms)
  - body checks (`require(msg.sender == owner)`, `_msgSender()`, `hasRole`, `authorized[msg.sender]`, `if (...) revert`)
  - dangerous internals (`delegatecall`, low-level call/staticcall/callcode, inline assembly)
- Tracks Solidity scope kind:
  - `contract`
  - `abstract contract`
  - `interface`
  - `library`
- Filters out declaration-only interface/abstract API functions.
- Filters out library helpers as direct user-callable contract surface.
- Reads inheritance and filters analysis to the target contract plus inherited base contracts.
- Adds `accessType` metadata:
  - `protected`
  - `unprotected`
  - `dangerous-internal`
- Adds `sourceContract` metadata.

### ERC/User-Flow Exclusions

Standard token user operations are excluded so Gleipnir does not confuse user authorization with admin control.

Excluded unless explicitly privileged:

- ERC-20: `transfer`, `transferFrom`, `approve`, allowance helpers, `permit`
- ERC-721: `safeTransferFrom`, `setApprovalForAll`
- ERC-1155: `safeTransferFrom`, `safeBatchTransferFrom`

If a standard-shaped function has an explicit privileged modifier like `onlyOwner`, it remains visible.

### Risk Engine

File: `src/lib/risk-engine.ts`

Capabilities:

- Scores privileged function categories, proxy risk, ownership placeholders, timelock placeholders, dangerous internals.
- Caps normal controlled admin surface below confirmed exploit-style critical paths.
- Red flags include:
  - upgradeable proxy detected
  - privileged upgrade path
  - privileged fund-moving function
  - permissions can be changed
  - unprotected critical function
  - dangerous low-level execution path
  - privileged economic parameter changes
  - no explicit privileged functions extracted

### Ownership MVP

File: `src/lib/ownership-resolver.ts`

Capabilities:

- Reads EIP-1967 proxy admin slot when available.
- Tries generic `owner()`, `admin()`, `governance()`.
- Classifies:
  - EOA
  - Safe / multisig via `getOwners()` + `getThreshold()`
  - Timelock via `getMinDelay()` / `delay()`
  - Governor via `votingPeriod()`
  - UnknownContract

Known limitation:

- Aave ownership remains unresolved by generic MVP resolver because Aave uses protocol-specific ACL / configurator indirection. Phase 2 needs Aave-style graph tracing: `Pool -> ADDRESSES_PROVIDER -> ACLManager / PoolConfigurator / governance / timelock`.

### Cache

- 5-minute in-memory analysis cache keyed by `chain:address`.
- Coalesces concurrent in-flight requests.
- Successful analysis results are cached; failures are not.

## Verification Passed

From `/root/.openclaw/workspace/projects/gleipnir`:

```bash
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test tests/permission-extractor.test.ts
npm run build
```

Latest parser test suite: 6 tests.

Aave smoke after Phase 1.6:

- Contract: `PoolInstance`
- Score: `63 / HIGH`
- Functions: `17`
- No ERC noise.
- No `execute*` helper noise.
- Cache smoke: repeated calls returned same `analysisTimestamp`.
- Ownership: unresolved for Aave until Phase 2 protocol-specific tracing.

Build warning only:

- Next.js infers workspace root due to multiple lockfiles:
  - `/root/.openclaw/workspace/package-lock.json`
  - `/root/.openclaw/workspace/projects/gleipnir/package-lock.json`
- Build succeeds despite warning.

## Critical Context From Testing Feedback

Trav is starting a new session and has additional testing feedback before Phase 2. Wait for that feedback before implementing Phase 2.

Previously discussed review priorities:

1. ERC false positives — addressed in Phase 1.6.
2. Ownership chain — MVP added, but real Phase 2 is protocol-specific graph tracing.
3. Caching — addressed in Phase 1.6.
4. Claude explanations — not yet implemented. Use Claude as narrator, not source of truth.
5. OpenGraph metadata / image — not yet implemented.
6. SearchBar inline error instead of `alert()` — not yet implemented.
7. Landing copy stale “five days ago” — not yet implemented.
8. Share/copy URL button — not yet implemented.
9. Test against 10+ real contracts — pending.

## Recommended Next Step

Do **not** start coding blindly. First consume Trav’s new testing feedback.

Then likely Phase 2:

1. Protocol-specific ownership/control graph resolver.
2. Aave tracing first:
   - Pool proxy
   - implementation
   - `ADDRESSES_PROVIDER`
   - `PoolConfigurator`
   - `ACLManager`
   - role admins / governance / timelock
3. Display an accurate “Ultimate control” narrative in the report.
4. Add regression tests or fixtures for Aave-style architecture.

## One-Line Status

Gleipnir Phase 1.6 is shipped: accurate target-contract permission filtering, ERC user-flow exclusions, cache, and generic ownership MVP are live; next is testing feedback + Phase 2 control-graph tracing.
