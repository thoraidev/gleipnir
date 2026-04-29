import Anthropic from '@anthropic-ai/sdk';
import type { PermissionedFunction } from './types';

const MAX_LLM_FUNCTIONS = 5;
// Hard-code Haiku for demo-cost safety. Do not allow Railway/env overrides to
// accidentally switch public contract analysis to Sonnet or Opus.
const MODEL = 'claude-haiku-4-5';

interface LlmDescription {
  functionSignature: string;
  plainEnglish: string;
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

    const bySignature = new Map(
      descriptions.map((item) => [item.functionSignature, item.plainEnglish.trim()])
    );

    const enrichedTop = top.map((fn) => ({
      ...fn,
      plainEnglish: bySignature.get(fn.functionSignature) || fn.plainEnglish,
    }));

    return [...enrichedTop, ...rest];
  } catch {
    return functions;
  }
}
