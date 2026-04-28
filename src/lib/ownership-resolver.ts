import type { OwnerInfo, OwnershipChain, ProxyInfo } from './types';
import type { SupportedChain } from './analyze-contract';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const SELECTORS = {
  owner: '0x8da5cb5b',
  admin: '0xf851a440',
  governance: '0x5aa6e675',
  getOwners: '0xa0e67e2b',
  getThreshold: '0xe75235b8',
  getMinDelay: '0xf27a0c92',
  delay: '0x6a42b8f8',
  votingPeriod: '0x02a251a3',
};

function rpcUrl(chain: SupportedChain): string {
  if (chain === 'base') {
    return process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
  }
  return process.env.ALCHEMY_RPC_URL || 'https://eth.llamarpc.com';
}

async function rpcCall<T>(chain: SupportedChain, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl(chain), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function ethCall(chain: SupportedChain, to: string, data: string): Promise<string | null> {
  const result = await rpcCall<string>(chain, 'eth_call', [{ to, data }, 'latest']);
  if (!result || result === '0x') return null;
  return result;
}

async function getCode(chain: SupportedChain, address: string): Promise<string> {
  return (await rpcCall<string>(chain, 'eth_getCode', [address, 'latest'])) || '0x';
}

function normalizeAddress(address?: string | null): string | null {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  if (address.toLowerCase() === ZERO_ADDRESS) return null;
  return address.toLowerCase();
}

function decodeAddress(result: string | null): string | null {
  if (!result || result.length < 66) return null;
  return normalizeAddress(`0x${result.slice(-40)}`);
}

function decodeUint(result: string | null): number | undefined {
  if (!result || result.length < 66) return undefined;
  const value = Number.parseInt(result.slice(-64), 16);
  return Number.isSafeInteger(value) ? value : undefined;
}

function decodeAddressArray(result: string | null): string[] | undefined {
  if (!result || result.length < 130) return undefined;
  const hex = result.startsWith('0x') ? result.slice(2) : result;
  const length = Number.parseInt(hex.slice(64, 128), 16);
  if (!Number.isSafeInteger(length) || length < 0 || length > 500) return undefined;

  const addresses: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const word = hex.slice(128 + i * 64, 128 + (i + 1) * 64);
    const address = normalizeAddress(`0x${word.slice(-40)}`);
    if (address) addresses.push(address);
  }
  return addresses.length === length ? addresses : undefined;
}

async function readAddressFunction(
  chain: SupportedChain,
  address: string,
  selector: string
): Promise<string | null> {
  return decodeAddress(await ethCall(chain, address, selector));
}

async function readUintFunction(
  chain: SupportedChain,
  address: string,
  selector: string
): Promise<number | undefined> {
  return decodeUint(await ethCall(chain, address, selector));
}

async function classifyOwner(chain: SupportedChain, address: string, label?: string): Promise<OwnerInfo> {
  const code = await getCode(chain, address);
  if (!code || code === '0x') {
    return { address, type: 'EOA', label };
  }

  const [ownersResult, threshold, minDelay, legacyDelay, votingPeriod] = await Promise.all([
    ethCall(chain, address, SELECTORS.getOwners).then(decodeAddressArray),
    readUintFunction(chain, address, SELECTORS.getThreshold),
    readUintFunction(chain, address, SELECTORS.getMinDelay),
    readUintFunction(chain, address, SELECTORS.delay),
    readUintFunction(chain, address, SELECTORS.votingPeriod),
  ]);

  if (ownersResult?.length && threshold) {
    return {
      address,
      type: 'GnosisSafe',
      label: label || 'Multisig Safe',
      threshold,
      signerCount: ownersResult.length,
      signers: ownersResult,
    };
  }

  const delay = minDelay ?? legacyDelay;
  if (typeof delay === 'number') {
    return {
      address,
      type: 'Timelock',
      label: label || 'Timelock controller',
      delay,
    };
  }

  if (typeof votingPeriod === 'number') {
    return {
      address,
      type: 'Governor',
      label: label || 'Governor contract',
      votingPeriod,
    };
  }

  return { address, type: 'UnknownContract', label };
}

function describeOwner(owner: OwnerInfo): string {
  const short = `${owner.address.slice(0, 6)}…${owner.address.slice(-4)}`;
  if (owner.type === 'GnosisSafe') {
    return `${owner.threshold}/${owner.signerCount} multisig (${short})`;
  }
  if (owner.type === 'Timelock') {
    return `timelock (${short}) with ${owner.delay ?? 'unknown'}s delay`;
  }
  if (owner.type === 'Governor') {
    return `governor contract (${short})`;
  }
  if (owner.type === 'EOA') {
    return `EOA ${short}`;
  }
  return `contract ${short}`;
}

export async function resolveOwnershipChain(
  contractAddress: string,
  chain: SupportedChain,
  proxyInfo: ProxyInfo
): Promise<OwnershipChain | null> {
  const normalizedContract = normalizeAddress(contractAddress);
  if (!normalizedContract) return null;

  let directOwnerAddress = normalizeAddress(proxyInfo.adminAddress);
  let directOwnerLabel = directOwnerAddress ? 'Proxy admin' : undefined;

  if (!directOwnerAddress) {
    directOwnerAddress = await readAddressFunction(chain, normalizedContract, SELECTORS.owner);
    directOwnerLabel = directOwnerAddress ? 'owner()' : undefined;
  }

  if (!directOwnerAddress) {
    directOwnerAddress = await readAddressFunction(chain, normalizedContract, SELECTORS.admin);
    directOwnerLabel = directOwnerAddress ? 'admin()' : undefined;
  }

  if (!directOwnerAddress) {
    directOwnerAddress = await readAddressFunction(chain, normalizedContract, SELECTORS.governance);
    directOwnerLabel = directOwnerAddress ? 'governance()' : undefined;
  }

  if (!directOwnerAddress) return null;

  const directOwner = await classifyOwner(chain, directOwnerAddress, directOwnerLabel);
  return {
    contract: normalizedContract,
    directOwner,
    chain: [directOwner],
    ultimateControl: describeOwner(directOwner),
  };
}
