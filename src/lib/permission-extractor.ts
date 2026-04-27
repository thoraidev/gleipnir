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

const CRITICAL_NAME_RE =
  /(upgrade|implementation|beacon|proxy|admin|owner|role|govern|guardian|pause|unpause|withdraw|sweep|rescue|drain|mint|burn|blacklist|freeze|oracle|fee|treasury|emergency|delegatecall|execute|call)/i;
const EXTERNAL_CALL_RE = /\bdelegatecall\b|\.call\s*\{|\.call\s*\(|\.staticcall\s*\(|\.callcode\s*\(/i;
const ASSEMBLY_RE = /\bassembly\s*\{/i;
const MODERATING_MODIFIER_RE = /\b(nonReentrant|whenNotPaused|whenPaused|rateLimit(?:ed)?|timelock(?:ed)?|onlyTimelock|delay(?:ed)?)\b/i;

type FunctionKind = 'function' | 'constructor' | 'fallback' | 'receive';

interface ParsedFunction {
  kind: FunctionKind;
  name: string;
  params: string;
  headerTail: string;
  returns: string;
  body: string;
  lineNumber: number;
}

interface PermissionEvidence {
  modifier?: string;
  roleOrAddress?: string;
  source: 'modifier' | 'require' | 'body' | 'dangerous-internal';
  expression: string;
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

function parseFunctions(source: string): ParsedFunction[] {
  const clean = stripCommentsAndStrings(source);
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
    if (terminator.char === '{') {
      const closeBrace = findMatching(clean, terminator.index, '{', '}');
      if (closeBrace === -1) continue;
      body = source.slice(terminator.index + 1, closeBrace);
      pattern.lastIndex = closeBrace + 1;
    } else {
      pattern.lastIndex = terminator.index + 1;
    }

    functions.push({
      kind,
      name,
      params: source.slice(openParen + 1, closeParen),
      headerTail: rawHeaderTail,
      returns,
      body,
      lineNumber: lineNumberAt(source, match.index),
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
  return /msg\.sender|_msgSender\(\)|tx\.origin|hasRole\s*\(|onlyRole\s*\(|AccessControl|owner\s*\(\)|\badmin\b|\bguardian\b|\bgovern|authorized\s*\[|isAuthorized|\bauth\b/i.test(
    expression
  );
}

function extractBodyEvidence(body: string): PermissionEvidence[] {
  return extractRequireArguments(body)
    .filter(isPermissionExpression)
    .map((expression) => ({
      source: 'require' as const,
      modifier: 'require',
      roleOrAddress: roleFromExpression(expression) ?? 'restricted caller',
      expression: expression.replace(/\s+/g, ' ').slice(0, 180),
    }));
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
  const actor = fn.roleOrAddress || 'a privileged caller';
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
  return CRITICAL_NAME_RE.test(functionName) || /^(set|update|configure)/i.test(functionName);
}

function riskFactorsFor(fn: ParsedFunction, evidence: PermissionEvidence[], category: PermissionedFunction['category']): string[] {
  const factors: string[] = [];
  const accessEvidence = evidence.filter((item) => item.source !== 'dangerous-internal');
  if (accessEvidence.length === 0) factors.push('unprotected-anyone-callable');
  if (MODERATING_MODIFIER_RE.test(fn.headerTail)) factors.push('mitigated-by-timelock-or-guard');
  if (EXTERNAL_CALL_RE.test(fn.body)) factors.push('low-level-call');
  if (ASSEMBLY_RE.test(fn.body)) factors.push('inline-assembly');
  if (category === 'upgradeability') factors.push('upgrade-path');
  if (fn.kind === 'fallback' || fn.kind === 'receive') factors.push(`${fn.kind}-entrypoint`);
  return factors;
}

export function extractPermissionedFunctions(sourceCode: string): PermissionedFunction[] {
  const parsed = parseFunctions(sourceCode);
  const results: PermissionedFunction[] = [];

  for (const fn of parsed) {
    const visibility = extractVisibility(fn.kind, fn.headerTail);
    const mutability = extractMutability(fn.kind, fn.headerTail);
    const accessEvidence = dedupeEvidence([
      ...extractModifierEvidence(fn.headerTail),
      ...extractBodyEvidence(fn.body),
    ]);
    const dangerousEvidence = extractDangerousEvidence(fn.body);
    const evidence = dedupeEvidence([...accessEvidence, ...dangerousEvidence]);

    // Internal/private helpers are not externally callable permissions. Their checks are captured
    // when public/external functions use the corresponding access modifier.
    if (visibility === 'internal' || visibility === 'private') continue;

    const category = categorize(fn.name, evidence);
    const shouldInclude =
      accessEvidence.length > 0 ||
      dangerousEvidence.length > 0 ||
      (visibility === 'public' || visibility === 'external') && hasPotentiallySensitiveName(fn.name);
    if (!shouldInclude) continue;

    const primary = accessEvidence[0] ?? dangerousEvidence[0] ?? {
      source: 'body' as const,
      modifier: 'none',
      roleOrAddress: 'anyone',
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
      functionSignature: functionSignature(fn),
      modifier: primary.modifier ?? primary.source,
      roleOrAddress: primary.roleOrAddress ?? (accessEvidence.length === 0 ? 'anyone' : 'restricted caller'),
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
