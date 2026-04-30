import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBlastRadiusFromProtocols } from '../src/lib/defillama.ts';

const PROTOCOLS = [
  {
    name: 'Aave V3',
    slug: 'aave-v3',
    category: 'Lending',
    tvl: 13_700_000_000,
    chains: ['Ethereum', 'Base'],
    chainTvls: {
      Ethereum: 11_100_000_000,
      Base: 439_000_000,
      'Base-borrowed': 363_000_000,
    },
  },
  {
    name: 'Kelp',
    slug: 'kelp',
    category: 'Liquid Restaking',
    tvl: 1_500_000_000,
    chains: ['Ethereum', 'Base'],
    chainTvls: {
      Ethereum: 1_500_000_000,
      Base: 0,
      'Base-borrowed': 0,
    },
  },
];

test('resolves manual high-confidence DeFiLlama blast radius context', () => {
  const blastRadius = resolveBlastRadiusFromProtocols(
    '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    'ethereum',
    'PoolInstance',
    PROTOCOLS,
    123
  );

  assert.equal(blastRadius?.protocolName, 'Aave V3');
  assert.equal(blastRadius?.slug, 'aave-v3');
  assert.equal(blastRadius?.category, 'Lending');
  assert.equal(blastRadius?.role, 'Aave V3 Pool');
  assert.equal(blastRadius?.protocolTvlUsd, 13_700_000_000);
  assert.equal(blastRadius?.chainTvlUsd, 11_100_000_000);
  assert.equal(blastRadius?.chain, 'Ethereum');
  assert.equal(blastRadius?.matchConfidence, 'manual-high');
  assert.equal(blastRadius?.source, 'DeFiLlama');
  assert.equal(blastRadius?.updatedAt, 123);
  assert.match(blastRadius?.note || '', /not exact contract-controlled funds/i);
});

test('uses exact DeFiLlama chain TVL bucket, not borrowed side buckets', () => {
  const blastRadius = resolveBlastRadiusFromProtocols(
    '0x1111111111111111111111111111111111111111',
    'base',
    'AavePool',
    PROTOCOLS,
    123
  );

  assert.equal(blastRadius?.matchConfidence, 'name-medium');
  assert.equal(blastRadius?.chain, 'Base');
  assert.equal(blastRadius?.chainTvlUsd, 439_000_000);
});

test('returns null for unknown contracts instead of inventing blast radius', () => {
  const blastRadius = resolveBlastRadiusFromProtocols(
    '0x3333333333333333333333333333333333333333',
    'ethereum',
    'UnknownProtocol',
    PROTOCOLS,
    123
  );

  assert.equal(blastRadius, null);
});
