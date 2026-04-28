import { ProxyInfo } from './types';

const IMPL_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ADMIN_SLOT =
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const BEACON_SLOT =
  '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';

async function readStorageSlot(address: string, slot: string): Promise<string> {
  const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://eth.llamarpc.com';
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getStorageAt',
        params: [address, slot, 'latest'],
      }),
    });
    const data = await res.json();
    return data.result || '0x';
  } catch {
    return '0x';
  }
}

function slotToAddress(slot: string): string | null {
  if (!slot || slot === '0x' || slot === '0x' + '0'.repeat(64)) return null;
  const addr = '0x' + slot.slice(-40);
  if (addr === '0x' + '0'.repeat(40)) return null;
  return addr;
}

export async function resolveProxy(
  address: string,
  etherscanImpl?: string
): Promise<ProxyInfo> {
  // Read EIP-1967 slots in parallel
  const [implSlot, adminSlot, beaconSlot] = await Promise.all([
    readStorageSlot(address, IMPL_SLOT),
    readStorageSlot(address, ADMIN_SLOT),
    readStorageSlot(address, BEACON_SLOT),
  ]);

  const implAddr = slotToAddress(implSlot);
  const explorerImpl = etherscanImpl && /^0x[a-fA-F0-9]{40}$/.test(etherscanImpl) ? etherscanImpl : undefined;
  const implementationAddress = implAddr || explorerImpl;

  if (implementationAddress) {
    return {
      isProxy: true,
      proxyType: implAddr ? 'EIP-1967' : 'Transparent',
      implementationAddress,
      adminAddress: slotToAddress(adminSlot) || undefined,
    };
  }

  const beaconAddr = slotToAddress(beaconSlot);
  if (beaconAddr) {
    return { isProxy: true, proxyType: 'Beacon', beaconAddress: beaconAddr };
  }

  return { isProxy: false, proxyType: 'None' };
}
