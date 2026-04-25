# Gleipnir ⛓️

**Who can rug this protocol?**

Gleipnir makes smart contract permission structures legible for everyone — and every agent. Paste any Ethereum contract address to get a plain-English breakdown of who controls it, what they can do, every red flag, and a 0–100 permission risk score.

## The Name

In Norse mythology, Gleipnir is the magical chain that binds Fenrir. It looked like a silk ribbon — impossibly delicate — but was the strongest binding ever forged, made from six impossible ingredients. Smart contract permissions are like Gleipnir: invisible lines of code (`onlyOwner`, `require(msg.sender == admin)`) that look harmless but bind enormous power over user funds.

**Gleipnir makes the invisible bindings visible.**

## Features

- 🔍 **Permission Analysis** — Every privileged function in plain English
- 👤 **Ownership Chain** — EOA, multisig, timelock, and governor detection
- 🚩 **Red Flags** — Pause+drain combos, no timelock, 1-of-N multisigs, oracle manipulation vectors
- 📊 **Risk Score** — 0–100 permission centralization score with breakdown
- 📅 **Admin Timeline** — History of every admin action on the contract
- 🤖 **Agent API** — `GET /api/v1/check?address=0x…` returns clean JSON for programmatic use
- 🔗 **Shareable Reports** — `/report/0x…` with OpenGraph previews

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in your API keys (see .env.example)
npm run dev
```

## Agent API

Agents: query permission risk before executing against any protocol.

```bash
curl "https://gleipnir.up.railway.app/api/v1/check?address=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
```

Response:
```json
{
  "address": "0x...",
  "name": "Pool",
  "riskScore": 42,
  "riskLevel": "MODERATE",
  "ultimateControl": "4/6 multisig with 48h timelock",
  "redFlags": [...],
  "privilegedFunctions": [...],
  "gleipnirUrl": "https://gleipnir.up.railway.app/report/0x..."
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ETHERSCAN_API_KEY` | Etherscan API key (fallback data source) |
| `BASESCAN_API_KEY` | Basescan API key (Base chain) |
| `ALCHEMY_RPC_URL` | Alchemy RPC for contract reads |
| `ANTHROPIC_API_KEY` | Claude Sonnet for Solidity → plain English |
| `NEXT_PUBLIC_BASE_URL` | Deployed URL for shareable reports |

Primary data source: **Blockscout** (no API key needed). Etherscan is fallback only.

## Stack

- **Framework**: Next.js 15, App Router, TypeScript
- **Styling**: Tailwind v4
- **Data**: Blockscout API (primary) + Etherscan (fallback)
- **AI**: Anthropic Claude Sonnet
- **Deployment**: Railway

## Built at ETHGlobal Open Agents — April 24–May 3, 2026
