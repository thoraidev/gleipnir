# AI Tool Attribution — Gleipnir

## ETHGlobal Open Agents Hackathon (April 24 – May 3, 2026)

## Tools Used
- **Claude (Anthropic)** — Architecture planning, specification design, code generation assistance
- **Thor (OpenClaw agent)** — Primary development agent, directed by human operator Trav
- **Claude Haiku API** — Used IN the product for deterministic permission findings → plain English report narration

## How AI Was Used
- Architecture and specifications planned collaboratively between human operator (Trav) and Claude
- Thor (OpenClaw AI agent) generated code based on detailed specs provided by Trav
- All code reviewed, tested, and iterated by the human operator
- Human operator directed all architectural decisions
- AI agent executed code generation under human supervision

## Key AI Integration in Product
- `src/lib/llm-translator.ts` (Day 4): Claude Haiku API rewrites deterministic findings into a clearer report summary and top function explanations for human report pages
- Prompt engineering for structured JSON output from Claude
- Claude never changes callers, categories, scores, red flags, or extracted facts; API routes remain deterministic/no-LLM

## Build Log
Daily decisions, blockers, and pivots logged in Notion (ETHGlobal Open Agents HQ → Build Changelog).
