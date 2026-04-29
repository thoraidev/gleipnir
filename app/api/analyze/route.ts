import { NextRequest, NextResponse } from 'next/server';
import { AnalyzeContractError, analyzeContract, normalizeChain } from '@/lib/analyze-contract';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, chain } = body;

    if (typeof address !== 'string') {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const analysis = await analyzeContract(address, normalizeChain(chain), { llmDescriptions: false });
    return NextResponse.json(analysis);
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
