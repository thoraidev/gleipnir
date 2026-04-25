const BLOCKSCOUT_ETH_V2 = 'https://eth.blockscout.com/api/v2';
const BLOCKSCOUT_BASE_V2 = 'https://base.blockscout.com/api/v2';

function getBase(chain: 'ethereum' | 'base') {
  return chain === 'base' ? BLOCKSCOUT_BASE_V2 : BLOCKSCOUT_ETH_V2;
}

export async function getContractSourceBlockscout(
  address: string,
  chain: 'ethereum' | 'base' = 'ethereum'
) {
  try {
    const base = getBase(chain);
    const res = await fetch(`${base}/smart-contracts/${address}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.is_verified) return null;

    const sourceCode = [
      data.source_code,
      ...(data.additional_sources || []).map((s: any) => s.source_code),
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      contractName: data.name || 'Unknown',
      sourceCode,
      abi: data.abi || [],
      compilerVersion: data.compiler_version || '',
      isProxy: !!(data.minimal_proxy_address_hash || data.implementation_address),
      implementation:
        data.implementation_address || data.minimal_proxy_address_hash || undefined,
      isVerified: true,
    };
  } catch {
    return null;
  }
}

export async function getAddressInfoBlockscout(
  address: string,
  chain: 'ethereum' | 'base' = 'ethereum'
) {
  try {
    const base = getBase(chain);
    const res = await fetch(`${base}/addresses/${address}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function blockscoutUrl(
  address: string,
  chain: 'ethereum' | 'base' = 'ethereum'
) {
  const base =
    chain === 'base' ? 'https://base.blockscout.com' : 'https://eth.blockscout.com';
  return `${base}/address/${address}`;
}
