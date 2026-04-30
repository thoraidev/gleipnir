# Gleipnir / ETHGlobal Hackathon Handoff

Updated: 2026-04-30 final submission polish pass

## Current Goal

Build Gleipnir: smart contract permission extraction, risk scoring, and control-surface reporting for humans and agents.

Core question: **Who can rug this protocol?**

## Current Repo State

Path: `/root/.openclaw/workspace/projects/gleipnir`

Git:

```text
main is intended to stay synced with origin/main after the final polish commit
Latest shipped code before this polish pass: d8d6509 Tighten report risk card layout
Run git log -1 for the exact final polish hash
```

Recent runtime-code commits:

```text
fe3a6cc Add LLM report summary paragraph
e6246ea Add DeFiLlama blast radius context
d8d6509 Tighten report risk card layout
c8bef95 Force Anthropic narration to Haiku
f148fd5 Limit Anthropic narration to report pages
b79bff7 Clarify report explanation layer
7f3cbb0 Harden demo API scoring and EOA handling
8c3779b Implement Phase 1.6 analysis hardening
d6bdb61 Harden Phase 1.5 permission analysis
285eda8 Reduce false positives in permission analyzer
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
  - Haiku-polished summary paragraph when `ANTHROPIC_API_KEY` is present
  - DeFiLlama blast-radius context for high-confidence protocol matches
  - red flags
  - proxy / implementation info
  - risk breakdown
  - control surface card
  - privileged function list
  - source stats
- Agent API routes intentionally run deterministic/no-LLM output.

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
node --experimental-strip-types --test tests/*.test.ts
npm run build
```

Latest test suite: 11 tests.

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

Most pre-submission review priorities are now addressed:

1. ERC false positives — addressed.
2. Ownership chain — MVP added; Phase 2 remains protocol-specific graph tracing.
3. Caching — addressed.
4. Claude/Haiku explanations — implemented as report-page narration only, not source of truth.
5. Lightweight report metadata — implemented without crawler-triggered contract analysis.
6. SearchBar inline error — implemented.
7. Stale relative-date landing copy — fixed.
8. Share/copy URL button — implemented.
9. Real-contract demo matrix — tested for Aave, Lido, Uniswap, rsETH/Kelp, USDC, ENS, GALA, and EOA cases.

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

Gleipnir is submission-ready for the hackathon demo: deterministic permission extraction, risk scoring, ownership MVP, report-page Haiku narration, DeFiLlama blast-radius context, polished landing/report UX, and deterministic agent API are live. Phase 2 remains protocol-specific control-graph tracing.
