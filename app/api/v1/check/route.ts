import { NextRequest, NextResponse } from 'next/server';
import { AnalyzeContractError, analyzeContract, normalizeChain } from '@/lib/analyze-contract';
import type { AgentCheckResponse } from '@/lib/types';

/**
 * Agent-friendly permission check endpoint.
 * Returns clean JSON optimized for programmatic consumption.
 *
 * Usage: GET /api/v1/check?address=0x...&chain=ethereum
 *
 * Example:
 *   curl "https://gleipnir.up.railway.app/api/v1/check?address=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
 */
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

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || origin).replace(/\/$/, '');

  try {
    const data = await analyzeContract(address, chain);

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
