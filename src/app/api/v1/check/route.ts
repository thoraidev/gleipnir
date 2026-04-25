import { NextRequest, NextResponse } from 'next/server';
import { AgentCheckResponse } from '@/lib/types';

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
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  const chain = (searchParams.get('chain') || 'ethereum') as 'ethereum' | 'base';

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

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chain }),
    });

    const data = await analyzeRes.json();
    if (data.error) {
      return NextResponse.json(data, { status: analyzeRes.status });
    }

    const agentResponse: AgentCheckResponse = {
      address: data.address,
      name: data.name,
      riskScore: data.riskScore ?? 0,
      riskLevel: data.riskLevel ?? 'PENDING',
      ultimateControl: data.ownershipChain?.ultimateControl ?? 'Analysis pending',
      redFlags: (data.redFlags || []).map((f: any) => ({
        severity: f.severity,
        title: f.title,
        description: f.description,
      })),
      privilegedFunctions: (data.permissionedFunctions || []).map((f: any) => ({
        name: f.functionName,
        calledBy: f.roleOrAddress,
        plainEnglish: f.plainEnglish || '',
        category: f.category,
      })),
      ownershipChain: data.ownershipChain?.chain || [],
      analysisTimestamp: data.analysisTimestamp,
      gleipnirUrl: `${baseUrl}/report/${address}`,
    };

    return NextResponse.json(agentResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
