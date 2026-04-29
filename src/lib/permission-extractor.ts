import type { PermissionedFunction } from './types';

const VISIBILITY = new Set(['public', 'external', 'internal', 'private']);
const MUTABILITY = new Set(['payable', 'view', 'pure']);
const HEADER_SKIP = new Set([
  'returns',
  'return',
  'virtual',
  'override',
  'memory',
  'calldata',
  'storage',
]);

const ACCESS_WORDS = [
  'admin',
  'auth',
  'authorized',
  'controller',
  'guardian',
  'governor',
  'manager',
  'operator',
  'owner',
  'pauser',
  'permission',
  'role',
  'timelock',
  'whitelist',
];

const PRIVILEGED_NAME_RE =
  /(upgrade|implementation|beacon|proxy|admin|owner|govern|guardian|pause|unpause|sweep|rescue|drain|blacklist|freeze|oracle|fee|emergency|delegatecall|grant\w*role|revoke\w*role|set\w*role|role\w*admin)/i;
const CRITICAL_NAME_RE = PRIVILEGED_NAME_RE;
const EXTERNAL_CALL_RE = /\bdelegatecall\b|\.call\s*\{|\.call\s*\(|\.staticcall\s*\(|\.callcode\s*\(/i;
const ASSEMBLY_RE = /\bassembly\s*\{/i;
const MODERATING_MODIFIER_RE = /\b(nonReentrant|whenNotPaused|whenPaused|rateLimit(?:ed)?|timelock(?:ed)?|onlyTimelock|delay(?:ed)?)\b/i;
const EXPLICIT_PRIVILEGED_MODIFIER_RE =
  /^(only|requires?)(Owner|Admin|Role|Govern|Guardian|Manager|Operator|Controller|Authority|Auth|Timelock|PoolConfigurator|PoolAdmin|Emergency|Risk|Bridge|Umbrella)/;
const ACCESS_CALL_RE = /\b(?:auth|authP|canPerform|hasPermission|requirePermission|_checkRole|_requireAuth|_auth)\s*\([^;{}]*\)/gi;
const INITIALIZER_NAME_RE = /^(initialize|initializeV\d+|reinitialize|finalizeUpgrade(?:_v?\d+)?)$/i;
const INITIALIZER_MODIFIER_RE = /\b(initializer|reinitializer|onlyInit|initOnce|onlyInitializing)\b/i;
const INITIALIZER_GUARD_RE =
  /(!\s*(?:initialized|isInitialized|_initialized)|(?:initialized|isInitialized|_initialized)\s*==\s*false|hasInitialized\s*\(\s*\)|_checkContractVersion\s*\(|_setContractVersion\s*\(|(?:initialized|_initialized|initializedVersion|lastInitializedRevision|getInitializationBlock\s*\(\s*\))\s*(?:<|==|!=)\s*\d+|_setInitializedVersion\s*\(|_disableInitializers\s*\(|onlyInit)/i;

const ERC_STANDARD_USER_SIGNATURES = new Set([
  // ERC-20 user operations
  'transfer(address,uint256)',
  'transferFrom(address,address,uint256)',
  'approve(address,uint256)',
  'increaseAllowance(address,uint256)',
  'decreaseAllowance(address,uint256)',
  'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',

  // ERC-721 user operations
  'safeTransferFrom(address,address,uint256)',
  'safeTransferFrom(address,address,uint256,bytes)',
  'setApprovalForAll(address,bool)',

  // ERC-1155 user operations
  'safeTransferFrom(address,address,uint256,uint256,bytes)',
  'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
]);

type FunctionKind = 'function' | 'constructor' | 'fallback' | 'receive';
type SolidityScopeKind = 'contract' | 'abstract contract' | 'interface' | 'library' | 'unknown';

interface SolidityScope {
  kind: SolidityScopeKind;
  name: string;
  bases: string[];
  start: number;
  end: number;
}

interface ParsedFunction {
  kind: FunctionKind;
  name: string;
  params: string;
  headerTail: string;
  returns: string;
  body: string;
  hasBody: boolean;
  lineNumber: number;
  scopeKind: SolidityScopeKind;
  scopeName?: string;
}

interface PermissionEvidence {
  modifier?: string;
  roleOrAddress?: string;
  source: 'modifier' | 'require' | 'body' | 'dangerous-internal';
  expression: string;
}

interface ExtractOptions {
  targetContractName?: string;
}

function stripCommentsAndStrings(input: string): string {
  // Preserve byte positions so regex match indices still map to the original source.
  return input.replace(/\/\*[\s\S]*?\*\/|\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (match) =>
    match.replace(/[^\n]/g, ' ')
  );
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function findMatching(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findTerminator(clean: string, from: number): { index: number; char: '{' | ';' } | undefined {
  let parenDepth = 0;
  for (let i = from; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth -= 1;
    if (parenDepth === 0 && (char === '{' || char === ';')) return { index: i, char };
  }
  return undefined;
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '(' || char === '[' || char === '<') depth += 1;
    if (char === ')' || char === ']' || char === '>') depth -= 1;
    if (char === delimiter && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function parseBaseNames(header: string): string[] {
  const inheritance = header.match(/\bis\s+([\s\S]*)$/)?.[1];
  if (!inheritance) return [];
  return splitTopLevel(inheritance, ',')
    .map((item) => item.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/)?.[1])
    .filter((name): name is string => Boolean(name))
    .map((name) => name.split('.').pop() ?? name);
}

function parseScopes(clean: string): SolidityScope[] {
  const scopes: SolidityScope[] = [];
  const pattern = /\b(?:(abstract)\s+)?(contract|interface|library)\s+([A-Za-z_$][\w$]*)[^{};]*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(clean)) !== null) {
    const openBrace = clean.indexOf('{', match.index);
    if (openBrace === -1) continue;
    const closeBrace = findMatching(clean, openBrace, '{', '}');
    if (closeBrace === -1) continue;
    const header = clean.slice(match.index, openBrace);

    const baseKind = match[2] as 'contract' | 'interface' | 'library';
    const kind: SolidityScopeKind = match[1] && baseKind === 'contract' ? 'abstract contract' : baseKind;
    scopes.push({
      kind,
      name: match[3],
      bases: parseBaseNames(header),
      start: openBrace,
      end: closeBrace,
    });
  }

  return scopes;
}

function collectTargetScopes(scopes: SolidityScope[], targetContractName?: string): Set<string> | null {
  if (!targetContractName) return null;
  const byName = new Map(scopes.map((scope) => [scope.name, scope]));
  if (!byName.has(targetContractName)) return null;

  const reachable = new Set<string>();
  const visit = (name: string) => {
    if (reachable.has(name)) return;
    const scope = byName.get(name);
    if (!scope) return;
    reachable.add(name);
    for (const base of scope.bases) visit(base);
  };

  visit(targetContractName);
  return reachable;
}

function scopeForIndex(scopes: SolidityScope[], index: number): SolidityScope | undefined {
  // Pick the innermost scope in case a parser ever sees nested test fixtures.
  return scopes
    .filter((scope) => scope.start <= index && index <= scope.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
}

function parseFunctions(source: string, options: ExtractOptions = {}): ParsedFunction[] {
  const clean = stripCommentsAndStrings(source);
  const scopes = parseScopes(clean);
  const targetScopes = collectTargetScopes(scopes, options.targetContractName);
  const functions: ParsedFunction[] = [];
  const pattern = /\b(function|constructor|fallback|receive)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(clean)) !== null) {
    const kind = match[1] as FunctionKind;
    let cursor = pattern.lastIndex;
    let name: string = kind;

    if (kind === 'function') {
      const nameMatch = clean.slice(cursor).match(/^\s+([A-Za-z_$][\w$]*)/);
      if (!nameMatch) continue;
      name = nameMatch[1];
      cursor += nameMatch[0].length;
    }

    const openParen = clean.indexOf('(', cursor);
    if (openParen === -1) continue;
    const closeParen = findMatching(clean, openParen, '(', ')');
    if (closeParen === -1) continue;

    const terminator = findTerminator(clean, closeParen + 1);
    if (!terminator) continue;

    const rawHeaderTail = source.slice(closeParen + 1, terminator.index);
    const returns = rawHeaderTail.match(/\breturns\s*\(([^)]*)\)/i)?.[1]?.trim() ?? '';

    let body = '';
    const hasBody = terminator.char === '{';
    if (terminator.char === '{') {
      const closeBrace = findMatching(clean, terminator.index, '{', '}');
      if (closeBrace === -1) continue;
      body = source.slice(terminator.index + 1, closeBrace);
      pattern.lastIndex = closeBrace + 1;
    } else {
      pattern.lastIndex = terminator.index + 1;
    }

    const scope = scopeForIndex(scopes, match.index);
    if (targetScopes && (!scope?.name || !targetScopes.has(scope.name))) {
      continue;
    }

    functions.push({
      kind,
      name,
      params: source.slice(openParen + 1, closeParen),
      headerTail: rawHeaderTail,
      returns,
      body,
      hasBody,
      lineNumber: lineNumberAt(source, match.index),
      scopeKind: scope?.kind ?? 'unknown',
      scopeName: scope?.name,
    });
  }

  return functions;
}

function extractVisibility(kind: FunctionKind, headerTail: string): string {
  const visibility = headerTail.match(/\b(public|external|internal|private)\b/);
  if (visibility) return visibility[1];
  if (kind === 'constructor') return 'constructor';
  if (kind === 'fallback' || kind === 'receive') return 'external';
  return 'public';
}

function extractMutability(kind: FunctionKind, headerTail: string): string {
  const mutability = headerTail.match(/\b(payable|view|pure)\b/);
  if (mutability) return mutability[1];
  if (kind === 'receive') return 'payable';
  return 'nonpayable';
}

function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function simplifyType(param: string): string {
  return param
    .trim()
    .replace(/\b(memory|calldata|storage)\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+[A-Za-z_$][\w$]*$/u, '')
    .trim();
}

function functionSignature(fn: ParsedFunction): string {
  if (fn.kind !== 'function') return `${fn.name}()`;
  const types = splitTopLevelCommas(fn.params).map(simplifyType).filter(Boolean).join(',');
  return `${fn.name}(${types})`;
}

function isErcStandardUserOperation(signature: string, accessEvidence: PermissionEvidence[]): boolean {
  if (!ERC_STANDARD_USER_SIGNATURES.has(signature)) return false;

  // Standard transfer/approval functions often contain msg.sender/owner/approval checks.
  // Those are user-level token authorization checks, not protocol-admin permissions. If a
  // project adds an explicit privileged modifier to a standard function, keep it visible.
  return !accessEvidence.some(
    (item) => item.source === 'modifier' && item.modifier && EXPLICIT_PRIVILEGED_MODIFIER_RE.test(item.modifier)
  );
}

function looksAccessLike(token: string): boolean {
  if (/^only[A-Z_]/.test(token)) return true;
  if (/^requires?[A-Z_]/.test(token)) return true;
  const lower = token.toLowerCase();
  return ACCESS_WORDS.some((word) => lower.includes(word));
}

function parseModifierArg(modifier: string, args?: string): string | undefined {
  if (!args) return undefined;
  const raw = args.slice(1, -1).trim();
  if (!raw) return undefined;
  const roleMatch = raw.match(/([A-Z][A-Z0-9_]*_ROLE|DEFAULT_ADMIN_ROLE)/);
  if (roleMatch) return roleMatch[1];
  const addressMatch = raw.match(/0x[a-fA-F0-9]{40}/);
  if (addressMatch) return addressMatch[0].toLowerCase();
  const msgSenderCompare = raw.match(/(?:msg\.sender|_msgSender\(\))\s*[,=!<>]+\s*([A-Za-z_$][\w$.]*)/);
  if (msgSenderCompare) return msgSenderCompare[1];
  if (!/role/i.test(modifier)) return inferRoleFromModifier(modifier);
  return raw.slice(0, 96);
}

function stripReturns(headerTail: string): string {
  return headerTail.replace(/returns\s*\([^)]*\)/gi, ' ');
}

function extractModifierEvidence(headerTail: string): PermissionEvidence[] {
  const withoutReturns = stripReturns(headerTail);
  const evidence: PermissionEvidence[] = [];
  const pattern = /\b([A-Za-z_$][\w$]*)\s*(\([^)]*\))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(withoutReturns)) !== null) {
    const token = match[1];
    if (VISIBILITY.has(token) || MUTABILITY.has(token) || HEADER_SKIP.has(token)) continue;
    if (!looksAccessLike(token)) continue;

    evidence.push({
      source: 'modifier',
      modifier: token,
      roleOrAddress: parseModifierArg(token, match[2]) ?? inferRoleFromModifier(token),
      expression: `${token}${match[2] ?? ''}`,
    });
  }

  return evidence;
}

function inferRoleFromModifier(modifier: string): string {
  const known: Record<string, string> = {
    onlyOwner: 'owner',
    onlyAdmin: 'admin',
    onlyGovernor: 'governor',
    onlyGovernance: 'governance',
    onlyGuardian: 'guardian',
    onlyOperator: 'operator',
    onlyManager: 'manager',
    onlyRole: 'role',
    requiresAuth: 'authorized account',
    auth: 'authorized account',
    authP: 'authorized account',
  };
  return known[modifier] ?? modifier;
}

function extractRequireArguments(body: string): string[] {
  const expressions: string[] = [];
  const requirePattern = /\b(?:require|assert)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = requirePattern.exec(body)) !== null) {
    const start = requirePattern.lastIndex;
    let depth = 1;
    for (let i = start; i < body.length; i += 1) {
      const char = body[i];
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (depth === 0) {
        expressions.push(body.slice(start, i));
        requirePattern.lastIndex = i + 1;
        break;
      }
    }
  }

  const ifRevertPattern = /\bif\s*\(([^;{}]+)\)\s*(?:\{\s*)?revert\b/g;
  while ((match = ifRevertPattern.exec(body)) !== null) {
    expressions.push(match[1]);
  }

  return expressions;
}

function roleFromExpression(expression: string): string | undefined {
  const authCall = expression.match(/\b(?:auth|authP|canPerform|hasPermission|requirePermission|_checkRole|_requireAuth|_auth)\s*\(\s*([A-Za-z0-9_$.]+)/i);
  if (authCall) return authCall[1];

  const hasRole = expression.match(/hasRole\s*\(\s*([A-Za-z0-9_$.]+)\s*,\s*(?:msg\.sender|_msgSender\(\))/);
  if (hasRole) return hasRole[1];

  const hasRoleReversed = expression.match(/hasRole\s*\(\s*([A-Za-z0-9_$.]+)\s*,\s*([A-Za-z_$][\w$.]*)\s*\)/);
  if (hasRoleReversed) return hasRoleReversed[1];

  const onlyRole = expression.match(/onlyRole\s*\(\s*([A-Za-z0-9_$.]+)/);
  if (onlyRole) return onlyRole[1];

  const mappingAuth = expression.match(/([A-Za-z_$][\w$.]*)\s*\[\s*(?:msg\.sender|_msgSender\(\))\s*\]/);
  if (mappingAuth) return mappingAuth[1];

  const senderComparison = expression.match(
    /(?:msg\.sender|_msgSender\(\)|tx\.origin)\s*(?:==|!=)\s*([A-Za-z_$][\w$.]*(?:\(\))?)/
  );
  if (senderComparison) return senderComparison[1];

  const reversedComparison = expression.match(
    /([A-Za-z_$][\w$.]*(?:\(\))?)\s*(?:==|!=)\s*(?:msg\.sender|_msgSender\(\)|tx\.origin)/
  );
  if (reversedComparison) return reversedComparison[1];

  if (/\bonlyOwner\b|\bowner\s*\(\)/i.test(expression)) return 'owner';
  if (/\badmin\b/i.test(expression)) return 'admin';
  if (/\bguardian\b/i.test(expression)) return 'guardian';
  if (/\bgovern/i.test(expression)) return 'governance';
  return undefined;
}

function isPermissionExpression(expression: string): boolean {
  return /msg\.sender|_msgSender\(\)|tx\.origin|hasRole\s*\(|onlyRole\s*\(|AccessControl|owner\s*\(\)|\badmin\b|\bguardian\b|\bgovern|authorized\s*\[|isAuthorized|\bauth\b|authP\s*\(|canPerform\s*\(|hasPermission\s*\(|requirePermission\s*\(|_checkRole\s*\(|_requireAuth\s*\(|_auth\s*\(/i.test(
    expression
  );
}

function extractBodyEvidence(body: string): PermissionEvidence[] {
  const expressions = extractRequireArguments(body);
  let match: RegExpExecArray | null;
  ACCESS_CALL_RE.lastIndex = 0;
  while ((match = ACCESS_CALL_RE.exec(body)) !== null) {
    expressions.push(match[0]);
  }

  return expressions
    .filter(isPermissionExpression)
    .map((expression) => ({
      source: 'require' as const,
      modifier: 'require',
      roleOrAddress: roleFromExpression(expression) ?? 'restricted caller',
      expression: expression.replace(/\s+/g, ' ').slice(0, 180),
    }));
}

function extractInitializerEvidence(fn: ParsedFunction): PermissionEvidence[] {
  if (!INITIALIZER_NAME_RE.test(fn.name) && !INITIALIZER_MODIFIER_RE.test(fn.headerTail)) return [];
  if (!INITIALIZER_MODIFIER_RE.test(fn.headerTail) && !INITIALIZER_GUARD_RE.test(fn.body)) return [];

  return [
    {
      source: 'body' as const,
      modifier: INITIALIZER_MODIFIER_RE.test(fn.headerTail) ? 'initializer' : 'initializer-guard',
      roleOrAddress: 'one-time initializer guard',
      expression: 'initializer / version guard',
    },
  ];
}

function extractDangerousEvidence(body: string): PermissionEvidence[] {
  const evidence: PermissionEvidence[] = [];
  if (EXTERNAL_CALL_RE.test(body)) {
    evidence.push({
      source: 'dangerous-internal',
      modifier: 'low-level-call',
      roleOrAddress: 'any caller if unprotected',
      expression: 'delegatecall/call/staticcall/callcode',
    });
  }
  if (ASSEMBLY_RE.test(body)) {
    evidence.push({
      source: 'dangerous-internal',
      modifier: 'assembly',
      roleOrAddress: 'any caller if unprotected',
      expression: 'inline assembly',
    });
  }
  return evidence;
}

function categorize(functionName: string, evidence: PermissionEvidence[]): PermissionedFunction['category'] {
  const haystack = `${functionName} ${evidence.map((item) => item.expression).join(' ')}`.toLowerCase();
  if (/(upgrade|implementation|beacon|proxy|authorizeupgrade|delegatecall)/.test(functionName.toLowerCase())) return 'upgradeability';
  if (/(withdraw|sweep|rescue|drain|transfer\(|send\(|mint|burn|treasury|vault|funds?)/.test(haystack)) return 'funds';
  if (/(pause|unpause|paused|freeze|blacklist)/.test(functionName.toLowerCase())) return 'pausability';
  if (/(grantrole|revokerole|renouncerole|transferownership|setowner|setadmin|setguardian|setgovern|setoperator|setmanager|role|owner|admin)/.test(functionName.toLowerCase())) return 'permissions';
  if (/(set|update|configure|config|fee|rate|limit|oracle|price|threshold|delay|parameter)/.test(haystack)) return 'parameters';
  if (/(role|owner|admin|guardian|govern|operator|manager|authority|auth)/.test(haystack)) return 'permissions';
  return 'other';
}

function plainEnglishFor(fn: PermissionedFunction): string {
  const actor = fn.accessType === 'unprotected'
    ? 'Any external caller'
    : fn.roleOrAddress || 'a privileged caller';
  const name = fn.functionName.toLowerCase();

  if (fn.riskFactors?.includes('one-time-initializer')) {
    return `${actor} can call ${fn.functionName} during a one-time initialization or upgrade-finalization flow; repeated calls are likely blocked by initializer state guards.`;
  }
  if (/(configure|add|set).*minter/.test(name)) return `${actor} can authorize or configure minters and their minting limits.`;
  if (/(remove|revoke).*minter/.test(name)) return `${actor} can remove an address's ability to mint new tokens.`;
  if (/^mint/.test(name)) return `${actor} can create new tokens, increasing total supply.`;
  if (/^burnfrom$|^burn/.test(name)) return `${actor} can burn tokens, reducing balances or total supply under the function's rules.`;
  if (/(recover|rescue).*(frozen|fund|token|asset)|sweep|rescue/.test(name)) return `${actor} can recover or move assets from the contract, including funds affected by freeze or rescue logic.`;
  if (/(unblock|unfreeze|unblacklist|allow).*(user|account|address|transfer)|^unblacklist$/.test(name)) return `${actor} can remove wallet-level transfer restrictions.`;
  if (/(block|freeze|blacklist).*(user|account|address|transfer)|blacklist|freeze/.test(name)) return `${actor} can restrict specific wallets, blocking or freezing their ability to transfer.`;
  if (/(permanent|exempt|whitelist|allowlist)/.test(name)) return `${actor} can add or remove addresses from an exemption or whitelist path.`;
  if (/^pause/.test(name)) return `${actor} can pause part of the protocol, temporarily stopping affected user actions.`;
  if (/^unpause/.test(name)) return `${actor} can resume protocol actions after a pause.`;
  if (/(grantrole|add.*role|set.*role)/.test(name)) return `${actor} can give privileged roles to other addresses.`;
  if (/(revokerole|remove.*role)/.test(name)) return `${actor} can remove privileged roles from addresses.`;
  if (/(transferownership|setowner|setadmin|changeadmin)/.test(name)) return `${actor} can change who controls privileged administration.`;
  if (/(upgrade|implementation|beacon|proxy)/.test(name)) return `${actor} can change contract logic or upgrade routing.`;
  if (/(fee|rate|oracle|price|limit|threshold|config|configuration)/.test(name)) return `${actor} can change economic or protocol configuration parameters.`;

  const categoryCopy: Record<PermissionedFunction['category'], string> = {
    funds: 'move, mint, burn, rescue, or otherwise affect funds',
    parameters: 'change protocol parameters or configuration',
    permissions: 'change ownership, roles, admins, or other permissions',
    pausability: 'pause or unpause protocol behavior',
    upgradeability: 'upgrade or redirect contract logic',
    other: 'execute restricted protocol logic',
  };
  return `${actor} can call ${fn.functionName} to ${categoryCopy[fn.category]}.`;
}

function dedupeEvidence(evidence: PermissionEvidence[]): PermissionEvidence[] {
  const seen = new Set<string>();
  const result: PermissionEvidence[] = [];
  for (const item of evidence) {
    const key = `${item.source}:${item.modifier}:${item.roleOrAddress}:${item.expression}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function hasPotentiallySensitiveName(functionName: string): boolean {
  return PRIVILEGED_NAME_RE.test(functionName);
}

function riskFactorsFor(fn: ParsedFunction, evidence: PermissionEvidence[], category: PermissionedFunction['category']): string[] {
  const factors: string[] = [];
  const accessEvidence = evidence.filter((item) => item.source !== 'dangerous-internal');
  if (accessEvidence.length === 0) factors.push('unprotected-anyone-callable');
  if (MODERATING_MODIFIER_RE.test(fn.headerTail)) factors.push('mitigated-by-timelock-or-guard');
  if (EXTERNAL_CALL_RE.test(fn.body)) factors.push('low-level-call');
  if (ASSEMBLY_RE.test(fn.body)) factors.push('inline-assembly');
  if (category === 'upgradeability') factors.push('upgrade-path');
  if (evidence.some((item) => item.modifier === 'initializer' || item.modifier === 'initializer-guard')) {
    factors.push('one-time-initializer');
  }
  if (fn.kind === 'fallback' || fn.kind === 'receive') factors.push(`${fn.kind}-entrypoint`);
  return factors;
}

export function extractPermissionedFunctions(sourceCode: string, options: ExtractOptions = {}): PermissionedFunction[] {
  const parsed = parseFunctions(sourceCode, options);
  const results: PermissionedFunction[] = [];

  for (const fn of parsed) {
    const visibility = extractVisibility(fn.kind, fn.headerTail);
    const mutability = extractMutability(fn.kind, fn.headerTail);
    const accessEvidence = dedupeEvidence([
      ...extractModifierEvidence(fn.headerTail),
      ...extractBodyEvidence(fn.body),
      ...extractInitializerEvidence(fn),
    ]);
    const dangerousEvidence = extractDangerousEvidence(fn.body);
    const evidence = dedupeEvidence([...accessEvidence, ...dangerousEvidence]);

    // Internal/private helpers are not externally callable permissions. Their checks are captured
    // when public/external functions use the corresponding access modifier.
    if (visibility === 'internal' || visibility === 'private') continue;

    // Declaration-only functions from interfaces/abstract APIs are not callable implementation
    // surfaces. Verified explorer payloads often concatenate every imported interface; scoring
    // those declarations creates severe false positives like "anyone can call addPoolAdmin".
    if (!fn.hasBody) continue;

    // Library functions in concatenated verified source are helper code, not direct user-callable
    // functions on the analyzed contract. Interprocedural library risk belongs to a later pass that
    // follows calls from public/external contract entrypoints.
    if (fn.scopeKind === 'interface' || fn.scopeKind === 'library') continue;

    const category = categorize(fn.name, evidence);
    const isReadOnly = mutability === 'view' || mutability === 'pure';
    const signature = functionSignature(fn);
    if (isErcStandardUserOperation(signature, accessEvidence)) continue;

    // Permission-check helpers like Aragon canPerform(...) are read-only views used by other
    // guards. They are important evidence when called from mutating functions, but they are not
    // themselves privileged control surfaces.
    if (isReadOnly) continue;

    const shouldInclude =
      accessEvidence.length > 0 ||
      (!isReadOnly && dangerousEvidence.length > 0) ||
      (!isReadOnly && (visibility === 'public' || visibility === 'external') && hasPotentiallySensitiveName(fn.name));
    if (!shouldInclude) continue;

    const accessType: PermissionedFunction['accessType'] =
      accessEvidence.length > 0
        ? 'protected'
        : dangerousEvidence.length > 0
          ? 'dangerous-internal'
          : 'unprotected';

    const primary = accessEvidence[0] ?? dangerousEvidence[0] ?? {
      source: 'body' as const,
      modifier: 'none',
      roleOrAddress: 'public/external caller',
      expression: 'no explicit access control detected',
    };
    const riskFactors = riskFactorsFor(fn, evidence, category);
    const isCritical =
      CRITICAL_NAME_RE.test(fn.name) ||
      ['funds', 'permissions', 'upgradeability'].includes(category) ||
      riskFactors.includes('low-level-call') ||
      riskFactors.includes('inline-assembly');

    const permissioned: PermissionedFunction = {
      functionName: fn.name,
      functionSignature: signature,
      modifier: primary.modifier ?? primary.source,
      roleOrAddress: primary.roleOrAddress ?? (accessEvidence.length === 0 ? 'public/external caller' : 'restricted caller'),
      accessType,
      sourceContract: fn.scopeName,
      visibility,
      mutability,
      isCritical,
      category,
      lineNumber: fn.lineNumber,
      parameters: splitTopLevelCommas(fn.params),
      returnValues: fn.returns ? splitTopLevelCommas(fn.returns) : [],
      accessControl: accessEvidence.map((item) => item.expression),
      riskFactors,
    };
    permissioned.plainEnglish = plainEnglishFor(permissioned);
    results.push(permissioned);
  }

  return results.sort((a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    return a.functionName.localeCompare(b.functionName);
  });
}
