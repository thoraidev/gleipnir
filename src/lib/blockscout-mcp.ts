/**
 * Blockscout MCP Client
 *
 * Calls the Blockscout MCP server at https://mcp.blockscout.com/mcp
 * using JSON-RPC 2.0 over HTTP with SSE response parsing.
 *
 * The MCP server requires __unlock_blockchain_analysis__ to be called first
 * in each session before other tools are available.
 *
 * Gleipnir uses these MCP tools:
 * - inspect_contract_code  → source files + proxy metadata
 * - get_address_info       → address classification, proxy type, ENS
 * - read_contract          → call owner(), threshold(), getMinDelay() etc.
 * - get_address_by_ens_name → ENS → address resolution
 * - get_transactions_by_address → admin activity history
 * - get_contract_abi       → ABI for decoding
 */

const MCP_ENDPOINT = 'https://mcp.blockscout.com/mcp';

// Chain IDs for Blockscout MCP
export const MCP_CHAIN_IDS = {
  ethereum: '1',
  base: '8453',
  arbitrum: '42161',
  optimism: '10',
  polygon: '137',
} as const;

let sessionInitialized = false;

/**
 * Send a single MCP tool call and parse the SSE response.
 */
async function mcpCall<T>(method: string, params: Record<string, any>): Promise<T | null> {
  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: method,
          arguments: params,
        },
      }),
    });

    if (!res.ok) return null;

    const text = await res.text();

    // Parse SSE: extract first `data:` line
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const json = JSON.parse(line.slice(5).trim());
          // MCP tool result is in json.result.content[0].text or json.result
          if (json.result?.content?.[0]?.text) {
            return JSON.parse(json.result.content[0].text) as T;
          }
          if (json.result) return json.result as T;
        } catch {
          // continue
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Initialize the MCP session. Must be called before other tools.
 * Lightweight — skip if already initialized in this process.
 */
export async function initMcpSession(): Promise<boolean> {
  if (sessionInitialized) return true;
  try {
    const result = await mcpCall<any>('__unlock_blockchain_analysis__', {});
    sessionInitialized = !!result;
    return sessionInitialized;
  } catch {
    return false;
  }
}

/**
 * Resolve ENS name → Ethereum address.
 * Returns null if not found.
 */
export async function resolveEns(name: string): Promise<string | null> {
  await initMcpSession();
  const result = await mcpCall<{ data: { resolved_address: string | null } }>(
    'get_address_by_ens_name',
    { name }
  );
  return result?.data?.resolved_address ?? null;
}

/**
 * Get comprehensive address info: is-contract, proxy type, ENS name, first tx.
 */
export async function getAddressInfo(
  address: string,
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum'
): Promise<any | null> {
  await initMcpSession();
  const result = await mcpCall<{ data: any }>(
    'get_address_info',
    { chain_id: MCP_CHAIN_IDS[chain], address }
  );
  return result?.data ?? null;
}

/**
 * Inspect contract code metadata (list of source files, proxy type, etc.)
 * Without file_name: returns metadata + source_code_tree_structure
 * With file_name: returns the specific file content
 */
export async function inspectContractCode(
  address: string,
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum',
  fileName?: string
): Promise<any | null> {
  await initMcpSession();
  const args: Record<string, any> = {
    chain_id: MCP_CHAIN_IDS[chain],
    address,
  };
  if (fileName) args.file_name = fileName;
  const result = await mcpCall<{ data: any }>('inspect_contract_code', args);
  return result?.data ?? null;
}

/**
 * Get contract ABI.
 */
export async function getContractAbi(
  address: string,
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum'
): Promise<any[] | null> {
  await initMcpSession();
  const result = await mcpCall<{ data: { abi: any[] | null } }>(
    'get_contract_abi',
    { chain_id: MCP_CHAIN_IDS[chain], address }
  );
  return result?.data?.abi ?? null;
}

/**
 * Read a contract function (view/pure).
 * Use for: owner(), admin(), getOwners(), threshold(), getMinDelay(), etc.
 *
 * Example:
 *   readContract(address, 'ethereum', {
 *     name: 'owner',
 *     type: 'function',
 *     stateMutability: 'view',
 *     inputs: [],
 *     outputs: [{ type: 'address' }]
 *   }, 'owner')
 */
export async function readContract(
  address: string,
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum',
  abi: Record<string, any>,
  functionName: string,
  args: any[] = []
): Promise<any | null> {
  await initMcpSession();
  const result = await mcpCall<{ data: { result: any } }>(
    'read_contract',
    {
      chain_id: MCP_CHAIN_IDS[chain],
      address,
      abi,
      function_name: functionName,
      args: JSON.stringify(args),
    }
  );
  return result?.data?.result ?? null;
}

/**
 * Get transactions by address for admin activity history.
 * age_from: ISO 8601 date string, e.g. '2024-01-01T00:00:00.00Z'
 */
export async function getTransactionsByAddress(
  address: string,
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum',
  ageFrom: string,
  ageTo?: string
): Promise<any[] | null> {
  await initMcpSession();
  const args: Record<string, any> = {
    chain_id: MCP_CHAIN_IDS[chain],
    address,
    age_from: ageFrom,
  };
  if (ageTo) args.age_to = ageTo;
  const result = await mcpCall<{ data: any[] }>('get_transactions_by_address', args);
  return result?.data ?? null;
}

/**
 * Get detailed info about a specific transaction.
 * Use for admin history: decode exactly what parameters were passed.
 */
export async function getTransactionInfo(
  txHash: string,
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum'
): Promise<any | null> {
  await initMcpSession();
  const result = await mcpCall<{ data: any }>(
    'get_transaction_info',
    { chain_id: MCP_CHAIN_IDS[chain], transaction_hash: txHash }
  );
  return result?.data ?? null;
}

/**
 * Direct Blockscout API call — raw access to any /api/v2/ endpoint.
 * Use for exotic cases: Gnosis Safe details, diamond proxy facets, etc.
 *
 * Example:
 *   directApiCall('ethereum', '/api/v2/smart-contracts/0x.../methods-read')
 */
export async function directApiCall(
  chain: keyof typeof MCP_CHAIN_IDS = 'ethereum',
  endpointPath: string,
  queryParams?: Record<string, string>
): Promise<any | null> {
  await initMcpSession();
  const args: Record<string, any> = {
    chain_id: MCP_CHAIN_IDS[chain],
    endpoint_path: endpointPath,
  };
  if (queryParams) args.query_params = queryParams;
  const result = await mcpCall<{ data: any }>('direct_api_call', args);
  return result?.data ?? null;
}

// ─── Convenience ABIs for common owner/admin functions ───────────────────────

export const ABIS = {
  owner: {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  admin: {
    name: 'admin',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  getOwners: {
    name: 'getOwners',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
  getThreshold: {
    name: 'getThreshold',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  getMinDelay: {
    name: 'getMinDelay',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  delay: {
    name: 'delay',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  governance: {
    name: 'governance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  votingPeriod: {
    name: 'votingPeriod',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  quorum: {
    name: 'quorum',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'blockNumber', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
};
