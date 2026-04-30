import Anthropic from '@anthropic-ai/sdk';
import type {
  AnalysisResult,
  BlastRadius,
  OwnershipChain,
  PermissionedFunction,
  ProxyInfo,
  RedFlag,
} from './types';

const MAX_LLM_FUNCTIONS = 5;
// Hard-code Haiku for demo-cost safety. Do not allow Railway/env overrides to
// accidentally switch public report narration to a more expensive model.
const MODEL = 'claude-haiku-4-5';

interface LlmDescription {
  functionSignature: string;
  plainEnglish: string;
}

interface LlmReportNarrative {
  summaryParagraph?: string;
  functions?: LlmDescription[];
}

interface ReportNarrativeInput {
  contractName: string;
  deterministicSummary: string;
  riskAssessment: string;
  riskScore: number;
  riskLevel: AnalysisResult['riskLevel'];
  proxyInfo: ProxyInfo;
  ownershipChain: OwnershipChain | null;
  blastRadius: BlastRadius | null;
  redFlags: RedFlag[];
  permissionedFunctions: PermissionedFunction[];
}

function compactFunction(fn: PermissionedFunction) {
  return {
    functionName: fn.functionName,
    functionSignature: fn.functionSignature,
    accessType: fn.accessType,
    roleOrAddress: fn.roleOrAddress,
    modifier: fn.modifier,
    sourceContract: fn.sourceContract,
    category: fn.category,
    parameters: fn.parameters,
    riskFactors: fn.riskFactors,
    deterministicDescription: fn.plainEnglish,
  };
}

function compactReport(input: ReportNarrativeInput) {
  return {
    contractName: input.contractName,
    deterministicSummary: input.deterministicSummary,
    riskAssessment: input.riskAssessment,
    riskScore: input.riskScore,
    riskLevel: input.riskLevel,
    proxy: input.proxyInfo,
    ownership: input.ownershipChain
      ? {
          ultimateControl: input.ownershipChain.ultimateControl,
          directOwner: input.ownershipChain.directOwner,
          chain: input.ownershipChain.chain,
        }
      : null,
    blastRadius: input.blastRadius
      ? {
          protocolName: input.blastRadius.protocolName,
          slug: input.blastRadius.slug,
          category: input.blastRadius.category,
          role: input.blastRadius.role,
          protocolTvlUsd: input.blastRadius.protocolTvlUsd,
          chainTvlUsd: input.blastRadius.chainTvlUsd,
          chain: input.blastRadius.chain,
          matchConfidence: input.blastRadius.matchConfidence,
          note: input.blastRadius.note,
        }
      : null,
    redFlags: input.redFlags.slice(0, 5).map((flag) => ({
      severity: flag.severity,
      title: flag.title,
      description: flag.description,
    })),
    privilegedFunctionCount: input.permissionedFunctions.length,
    topPrivilegedFunctions: input.permissionedFunctions.slice(0, MAX_LLM_FUNCTIONS).map(compactFunction),
  };
}

function extractJsonArray(text: string): LlmDescription[] | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is LlmDescription =>
        typeof item?.functionSignature === 'string' && typeof item?.plainEnglish === 'string'
    );
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): LlmReportNarrative | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const result: LlmReportNarrative = {};
    if (typeof parsed.summaryParagraph === 'string') {
      result.summaryParagraph = parsed.summaryParagraph;
    }
    if (Array.isArray(parsed.functions)) {
      result.functions = parsed.functions.filter(
        (item: unknown): item is LlmDescription => {
          if (!item || typeof item !== 'object') return false;
          const maybe = item as Partial<LlmDescription>;
          return typeof maybe.functionSignature === 'string' && typeof maybe.plainEnglish === 'string';
        }
      );
    }

    return result;
  } catch {
    return null;
  }
}

function cleanSummaryParagraph(summary?: string): string | null {
  if (!summary) return null;
  const cleaned = summary.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 40) return null;
  return cleaned.length > 900 ? `${cleaned.slice(0, 897).trim()}…` : cleaned;
}

function mergeDescriptions(
  functions: PermissionedFunction[],
  descriptions: LlmDescription[] | undefined
): PermissionedFunction[] {
  if (!descriptions || descriptions.length === 0) return functions;

  const bySignature = new Map(
    descriptions.map((item) => [item.functionSignature, item.plainEnglish.trim()])
  );

  return functions.map((fn) => ({
    ...fn,
    plainEnglish: bySignature.get(fn.functionSignature) || fn.plainEnglish,
  }));
}

export async function enrichReportNarrative(input: ReportNarrativeInput): Promise<{
  summary: string;
  permissionedFunctions: PermissionedFunction[];
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      summary: input.deterministicSummary,
      permissionedFunctions: input.permissionedFunctions,
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0,
      system:
        'You translate deterministic smart-contract permission findings into a concise human report. Never add facts not present in the input. Never change who can call a function, the risk score, categories, or extracted facts. Blast radius/TVL is DeFiLlama context only, not exact contract-controlled funds. If accessType is protected, do not imply anyone can call it. If a function is an initializer, say it is initialization/upgrade-finalization guarded rather than normal admin power.',
      messages: [
        {
          role: 'user',
          content:
            'Return ONLY a JSON object shaped as {"summaryParagraph":"...","functions":[{"functionSignature":"...","plainEnglish":"..."}]}. The summaryParagraph must be one paragraph, 3-5 sentences, under 650 characters, plain English, and should explain what matters about the permission surface. If blastRadius is present, you may mention it as protocol TVL context, never as exact funds controlled by this contract. For functions, rewrite only the provided topPrivilegedFunctions; keep each plainEnglish sentence under 160 characters and use specific verbs: mint, burn, freeze, recover, whitelist, pause, upgrade, set fees, etc. Input:\n' +
            JSON.stringify(compactReport(input), null, 2),
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const narrative = extractJsonObject(text);
    if (!narrative) {
      return {
        summary: input.deterministicSummary,
        permissionedFunctions: input.permissionedFunctions,
      };
    }

    return {
      summary: cleanSummaryParagraph(narrative.summaryParagraph) || input.deterministicSummary,
      permissionedFunctions: mergeDescriptions(input.permissionedFunctions, narrative.functions),
    };
  } catch {
    return {
      summary: input.deterministicSummary,
      permissionedFunctions: input.permissionedFunctions,
    };
  }
}

export async function enrichPlainEnglishDescriptions(
  functions: PermissionedFunction[]
): Promise<PermissionedFunction[]> {
  if (!process.env.ANTHROPIC_API_KEY || functions.length === 0) return functions;

  const top = functions.slice(0, MAX_LLM_FUNCTIONS);
  const rest = functions.slice(MAX_LLM_FUNCTIONS);

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 0,
      system:
        'You translate deterministic smart-contract permission findings into precise one-sentence plain English. Never add facts not present in the input. Never change who can call a function. If accessType is protected, do not imply anyone can call it. If a function is an initializer, say it is initialization/upgrade-finalization guarded rather than normal admin power.',
      messages: [
        {
          role: 'user',
          content:
            'Return ONLY a JSON array. For each function, return {"functionSignature":"...","plainEnglish":"..."}. Keep each plainEnglish sentence under 160 characters. Use specific verbs: mint, burn, freeze, recover, whitelist, pause, upgrade, set fees, etc. Input:\n' +
            JSON.stringify(top.map(compactFunction), null, 2),
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const descriptions = extractJsonArray(text);
    if (!descriptions) return functions;

    const enrichedTop = mergeDescriptions(top, descriptions);

    return [...enrichedTop, ...rest];
  } catch {
    return functions;
  }
}
