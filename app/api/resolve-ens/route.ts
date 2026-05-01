import { NextRequest, NextResponse } from 'next/server';
import { resolveEns } from '@/lib/blockscout-mcp';

function normalizeEnsName(value: string): string | null {
  const name = value.trim().toLowerCase();

  // Keep the hackathon integration intentionally conservative: ENS-style DNS names only.
  // This covers .eth names without accepting arbitrary strings into the resolver path.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) return null;
  if (name.length > 255) return null;

  return name;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawName = searchParams.get('name');

  if (!rawName) {
    return NextResponse.json(
      { error: 'Missing ENS name parameter', usage: 'GET /api/resolve-ens?name=example.eth' },
      { status: 400 }
    );
  }

  const name = normalizeEnsName(rawName);
  if (!name) {
    return NextResponse.json(
      { error: 'Invalid ENS name. Enter a name like protocol.eth.' },
      { status: 400 }
    );
  }

  const address = await resolveEns(name);
  const normalizedAddress = address?.toLowerCase();
  if (!normalizedAddress || normalizedAddress === '0x0000000000000000000000000000000000000000') {
    return NextResponse.json(
      { error: `No Ethereum address found for ${name}.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ name, address: normalizedAddress });
}
