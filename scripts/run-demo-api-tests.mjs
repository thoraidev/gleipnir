import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.GLEIPNIR_BASE_URL || 'http://127.0.0.1:3000';
const outDir = path.resolve('test-outputs/demo-contracts-2026-04-29');

const contracts = [
  ['rseth-token-proxy', '0xa1290d69c65a6fe4df752f95823fae25cb99e5a7', 'ethereum'],
  ['rseth-oft-adapter', '0x2A1D74de3027ccE18d31011518C571130a4cd513', 'ethereum'],
  ['kelp-deployer-eoa', '0x7aad74b7f0d60d5867b59dbd377a71783425af47', 'ethereum'],
  ['aave-v3-pool', '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', 'ethereum'],
  ['usdc-circle', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum'],
  ['lido-steth', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', 'ethereum'],
  ['uniswap-v3-factory', '0x1F98431c8aD98523631AE4a59f267346ea31F984', 'ethereum'],
  ['ens-registry', '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', 'ethereum'],
  ['gala-single-eoa-mint-example', '0x15D4c048f83bd7e37d49EA4C83A07267ec4203Da', 'ethereum'],
];

await fs.mkdir(outDir, { recursive: true });
const index = [];

for (const [label, address, chain] of contracts) {
  const url = `${base}/api/v1/check?address=${address}&chain=${chain}`;
  console.log(`\n=== ${label} ===`);
  console.log(url);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    const elapsedMs = Date.now() - startedAt;
    const file = path.join(outDir, `${label}.json`);
    await fs.writeFile(file, JSON.stringify(parsed, null, 2) + '\n');
    const row = {
      label,
      address: address.toLowerCase(),
      chain,
      status: res.status,
      elapsedMs,
      file,
      name: parsed.name,
      riskScore: parsed.riskScore,
      riskLevel: parsed.riskLevel,
      ultimateControl: parsed.ultimateControl,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.length : undefined,
      privilegedFunctions: Array.isArray(parsed.privilegedFunctions) ? parsed.privilegedFunctions.length : undefined,
      error: parsed.error,
    };
    index.push(row);
    console.log(JSON.stringify(row, null, 2));
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const row = { label, address: address.toLowerCase(), chain, status: 'FETCH_ERROR', elapsedMs, error: error?.message || String(error) };
    index.push(row);
    console.log(JSON.stringify(row, null, 2));
  }
}

await fs.writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\nWrote outputs to ${outDir}`);
