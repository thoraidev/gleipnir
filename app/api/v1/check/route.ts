import { NextRequest, NextResponse } from 'next/server';
import { AnalyzeContractError, analyzeContract, normalizeChain } from '@/lib/analyze-contract';
import type { AgentCheckResponse } from '@/lib/types';

const CANONICAL_BASE_URL = 'https://gleipnir.up.railway.app';

/**
 * Agent-friendly permission check endpoint.
 * Returns clean JSON optimized for programmatic consumption.
 *
 * Usage: GET /api/v1/check?address=0x...&chain=ethereum
 *
 * Example:
 *   curl "https://gleipnir.up.railway.app/api/v1/check?address=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
 */
function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

function normalizeHost(value: string | null): string | null {
  const host = firstHeaderValue(value)
    ?.replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');

  return host || null;
}

function requestBaseUrl(req: NextRequest, fallbackOrigin: string) {
  const fallbackHost = normalizeHost(new URL(fallbackOrigin).host);
  const hostCandidates = [
    normalizeHost(req.headers.get('x-forwarded-host')),
    normalizeHost(req.headers.get('host')),
    fallbackHost,
  ].filter((host): host is string => Boolean(host));

  const host =
    hostCandidates.find((candidate) => candidate === 'gleipnir.up.railway.app') ||
    hostCandidates.find((candidate) => !candidate.includes('-production')) ||
    hostCandidates[0];

  if (!host) return fallbackOrigin.replace(/\/$/, '');

  const forwardedProto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
  const protocol = forwardedProto || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? 'http' : 'https');

  return `${protocol}://${host}`.replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const address = searchParams.get('address');
  const chain = normalizeChain(searchParams.get('chain'));

  if (!address) {
    return NextResponse.json(
      {
        error: 'Missing address parameter',
        usage: 'GET /api/v1/check?address=0x...&chain=ethereum',
        example:
          'GET /api/v1/check?address=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      },
      { status: 400 }
    );
  }

  const publicRequestBaseUrl = requestBaseUrl(req, origin);
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const isLocalRequest = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(publicRequestBaseUrl);
  const baseUrl = isLocalRequest ? configuredBaseUrl || publicRequestBaseUrl : CANONICAL_BASE_URL;

  try {
    const data = await analyzeContract(address, chain, { llmDescriptions: false });

    const agentResponse: AgentCheckResponse = {
      address: data.address,
      name: data.name,
      riskScore: data.riskScore ?? 0,
      riskLevel: data.riskLevel ?? 'PENDING',
      ultimateControl: data.ownershipChain?.ultimateControl ?? 'Ownership-chain analysis pending',
      redFlags: (data.redFlags || []).map((flag) => ({
        severity: flag.severity,
        title: flag.title,
        description: flag.description,
      })),
      privilegedFunctions: (data.permissionedFunctions || []).map((fn) => ({
        name: fn.functionName,
        calledBy: fn.roleOrAddress,
        plainEnglish: fn.plainEnglish || '',
        category: fn.category,
      })),
      ownershipChain: data.ownershipChain?.chain || [],
      blastRadius: data.blastRadius,
      analysisTimestamp: data.analysisTimestamp,
      gleipnirUrl: `${baseUrl}/report/${data.address}?chain=${chain}`,
    };

    return NextResponse.json(agentResponse);
  } catch (err: unknown) {
    if (err instanceof AnalyzeContractError) {
      return NextResponse.json(
        { error: err.message, address: err.address },
        { status: err.status }
      );
    }

    const message = err instanceof Error ? err.message : 'Unknown analysis error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
