export const KNOWN_LABELS: Record<string, string> = {
  '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e': 'ENS Registry',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC (Circle)',
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'Lido stETH',
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3 Pool',
  '0x1f98431c8ad98523631ae4a59f267346ea31f984': 'Uniswap V3 Factory',
  '0xc3d688b66703497daa19211eedff47f25384cdc3': 'Compound V3 cUSDCv3',
};

export const GNOSIS_SAFE_MASTERS = new Set([
  '0xd9db270c1b5e3bd161e8c8503c55ceabee709552',
  '0x3e5c63644e683549055b9be8653de26e0b4cd36e',
  '0x69f4d1788e39c87893c980c06edf4b7f686e2938',
  '0x41675c099f32341bf84bffc5382af534df5c7461a',
  '0xfb1bffc9d739b8d520daf37df666da4c687191ea',
]);

export const EXPLORER_URLS = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
};

export const DEMO_CONTRACTS = {
  aaveV3Pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  lido: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
};

// Risk score thresholds
export const RISK_LEVELS = {
  LOW: { max: 20, label: 'LOW', color: 'green' },
  MODERATE: { max: 40, label: 'MODERATE', color: 'yellow' },
  ELEVATED: { max: 60, label: 'ELEVATED', color: 'orange' },
  HIGH: { max: 80, label: 'HIGH', color: 'red' },
  CRITICAL: { max: 100, label: 'CRITICAL', color: 'red' },
} as const;
