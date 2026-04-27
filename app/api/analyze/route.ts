import { NextRequest, NextResponse } from 'next/server';
import { getContractSourceBlockscout } from '@/lib/blockscout';
import { getContractSource } from '@/lib/etherscan';
import { resolveProxy } from '@/lib/proxy-resolver';
import { extractPermissionedFunctions } from '@/lib/permission-extractor';
import { buildRedFlags, scorePermissions, summarizePermissions, riskLevel } from '@/lib/risk-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, chain = 'ethereum' } = body;

    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase() as string;
    const chainVal = (chain || 'ethereum') as 'ethereum' | 'base';

    // Blockscout first (no API key needed), Etherscan fallback
    let source = await getContractSourceBlockscout(normalizedAddress, chainVal);
    if (!source) source = await getContractSource(normalizedAddress, chainVal);

    if (!source) {
      return NextResponse.json(
        {
          error:
            'Contract source not verified on Blockscout or Etherscan. Cannot analyze permissions.',
          address: normalizedAddress,
        },
        { status: 422 }
      );
    }

    // Resolve proxy pattern
    const proxyInfo = await resolveProxy(normalizedAddress, source.implementation);

    // If proxy, fetch implementation source (has the real business logic)
    let implementationSource = null;
    if (proxyInfo.isProxy && proxyInfo.implementationAddress) {
      const implAddr = proxyInfo.implementationAddress;
      implementationSource =
        (await getContractSourceBlockscout(implAddr, chainVal)) ||
        (await getContractSource(implAddr, chainVal));
    }

    const analysisSource = implementationSource || source;
    const permissionedFunctions = extractPermissionedFunctions(analysisSource.sourceCode);
    const redFlags = buildRedFlags(permissionedFunctions, proxyInfo);
    const { riskScore, riskBreakdown } = scorePermissions(permissionedFunctions, proxyInfo);
    const summary = summarizePermissions(permissionedFunctions, redFlags, riskScore);

    return NextResponse.json({
      address: normalizedAddress,
      name: analysisSource.contractName,
      proxyInfo,
      hasSource: true,
      sourceLength: analysisSource.sourceCode.length,
      analysisTimestamp: Date.now(),
      ownershipChain: null,
      permissionedFunctions,
      redFlags,
      riskScore,
      riskLevel: riskLevel(riskScore),
      riskBreakdown,
      adminHistory: [],
      ...summary,
      _status: 'permission_extractor_complete',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
