const ETHERSCAN_BASE = 'https://api.etherscan.io/api';
const BASESCAN_BASE = 'https://api.basescan.org/api';

let lastCallTime = 0;

async function rateLimitedFetch(url: string): Promise<any> {
  const now = Date.now();
  const timeSince = now - lastCallTime;
  if (timeSince < 250) await new Promise((r) => setTimeout(r, 250 - timeSince));
  lastCallTime = Date.now();
  const res = await fetch(url);
  return res.json();
}

export async function getContractSource(
  address: string,
  chain: 'ethereum' | 'base' = 'ethereum'
) {
  try {
    const base = chain === 'base' ? BASESCAN_BASE : ETHERSCAN_BASE;
    const apiKey =
      chain === 'base'
        ? process.env.BASESCAN_API_KEY
        : process.env.ETHERSCAN_API_KEY;
    const url = `${base}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
    const data = await rateLimitedFetch(url);
    if (data.status !== '1' || !data.result?.[0]) return null;
    const result = data.result[0];
    if (!result.SourceCode) return null;

    let sourceCode = result.SourceCode;
    if (sourceCode.startsWith('{{')) {
      try {
        const parsed = JSON.parse(sourceCode.slice(1, -1));
        sourceCode = Object.values(parsed.sources || {})
          .map((v: any) => v.content)
          .join('\n\n');
      } catch {
        // keep raw
      }
    }

    return {
      contractName: result.ContractName || 'Unknown',
      sourceCode,
      abi:
        result.ABI && result.ABI !== 'Contract source code not verified'
          ? JSON.parse(result.ABI)
          : [],
      compilerVersion: result.CompilerVersion || '',
      isProxy: result.Proxy === '1',
      implementation: result.Implementation || undefined,
      isVerified: true,
    };
  } catch {
    return null;
  }
}

export async function getTransactions(
  fromAddress: string,
  toAddress: string,
  chain: 'ethereum' | 'base' = 'ethereum'
) {
  try {
    const base = chain === 'base' ? BASESCAN_BASE : ETHERSCAN_BASE;
    const apiKey =
      chain === 'base'
        ? process.env.BASESCAN_API_KEY
        : process.env.ETHERSCAN_API_KEY;
    const url = `${base}?module=account&action=txlist&address=${fromAddress}&sort=desc&apikey=${apiKey}`;
    const data = await rateLimitedFetch(url);
    if (data.status !== '1') return [];
    return data.result.filter(
      (tx: any) => tx.to?.toLowerCase() === toAddress.toLowerCase()
    );
  } catch {
    return [];
  }
}
