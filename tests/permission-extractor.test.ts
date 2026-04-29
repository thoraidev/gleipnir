import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPermissionedFunctions } from '../src/lib/permission-extractor.ts';
import { buildRedFlags, scorePermissions } from '../src/lib/risk-engine.ts';

const OZ_STYLE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract AccessControl {
  function hasRole(bytes32 role, address account) public view virtual returns (bool);
}

contract Vault is AccessControl {
  bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
  address public owner;
  mapping(address => bool) public authorized;

  modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
  }

  modifier onlyRole(bytes32 role) {
    require(hasRole(role, msg.sender), "missing role");
    _;
  }

  constructor(address initialOwner) {
    owner = initialOwner;
  }

  function withdraw(
    address payable recipient,
    uint256 amount
  )
    external
    nonReentrant
    onlyOwner
    returns (bool ok)
  {
    (ok,) = recipient.call{value: amount}("");
  }

  function grantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    role; account;
  }

  function pause() external onlyRole(PAUSER_ROLE) {}

  function setFee(uint256 newFee) public {
    require(authorized[msg.sender], "not auth");
    newFee;
  }

  function upgradeTo(address implementation) external onlyOwner {
    implementation.delegatecall("");
  }

  function skim(address token) external {
    token.call("");
  }

  receive() external payable {}

  fallback() external payable {
    assembly { let x := 1 }
  }
}
`;

test('extracts Solidity functions, access control, categories, and edge entrypoints', () => {
  const functions = extractPermissionedFunctions(OZ_STYLE);
  const byName = new Map(functions.map((fn) => [fn.functionName, fn]));

  assert.equal(byName.get('withdraw')?.functionSignature, 'withdraw(address payable,uint256)');
  assert.equal(byName.get('withdraw')?.modifier, 'onlyOwner');
  assert.equal(byName.get('withdraw')?.roleOrAddress, 'owner');
  assert.equal(byName.get('withdraw')?.category, 'funds');
  assert.equal(byName.get('withdraw')?.mutability, 'nonpayable');
  assert.deepEqual(byName.get('withdraw')?.returnValues, ['bool ok']);
  assert.ok(byName.get('withdraw')?.riskFactors?.includes('low-level-call'));
  assert.ok(byName.get('withdraw')?.riskFactors?.includes('mitigated-by-timelock-or-guard'));
  assert.equal(typeof byName.get('withdraw')?.lineNumber, 'number');

  assert.equal(byName.get('grantRole')?.roleOrAddress, 'DEFAULT_ADMIN_ROLE');
  assert.equal(byName.get('grantRole')?.category, 'permissions');
  assert.equal(byName.get('pause')?.category, 'pausability');

  assert.equal(byName.get('setFee')?.modifier, 'require');
  assert.equal(byName.get('setFee')?.roleOrAddress, 'authorized');
  assert.equal(byName.get('setFee')?.category, 'parameters');

  assert.equal(byName.get('upgradeTo')?.category, 'upgradeability');
  assert.ok(byName.get('upgradeTo')?.riskFactors?.includes('upgrade-path'));

  assert.equal(byName.get('skim')?.roleOrAddress, 'any caller if unprotected');
  assert.ok(byName.get('skim')?.riskFactors?.includes('unprotected-anyone-callable'));
  assert.ok(byName.get('skim')?.riskFactors?.includes('low-level-call'));

  assert.equal(byName.get('fallback')?.visibility, 'external');
  assert.ok(byName.get('fallback')?.riskFactors?.includes('inline-assembly'));
  assert.ok(!byName.has('constructor'));
  assert.ok(!byName.has('receive'));
});

test('risk engine elevates unprotected critical and dangerous internals', () => {
  const permissionedFunctions = extractPermissionedFunctions(OZ_STYLE);
  const proxyInfo = { isProxy: false, proxyType: 'None' as const };
  const flags = buildRedFlags(permissionedFunctions, proxyInfo);
  const { riskScore } = scorePermissions(permissionedFunctions, proxyInfo);

  assert.ok(flags.some((flag) => flag.title === 'Unprotected critical function'));
  assert.ok(flags.some((flag) => flag.title === 'Dangerous low-level execution path'));
  assert.ok(riskScore >= 60);
});

test('ignores imported interfaces and library helpers as direct callable surface', () => {
  const source = `
interface IACLManager {
  function addPoolAdmin(address admin) external;
  function EMERGENCY_ADMIN_ROLE() external view returns (bytes32);
}

library BorrowLogic {
  function executeBorrow(mapping(address => uint256) storage reserves, address user) external {
    reserves[user] += 1;
  }
}

abstract contract AbstractToken {
  function burn(address from, uint256 amount) external virtual returns (bool);
}

contract RealPool {
  address public owner;

  modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
  }

  function upgradeTo(address implementation) external onlyOwner {
    implementation.delegatecall("");
  }
}
`;

  const functions = extractPermissionedFunctions(source);
  const byName = new Map(functions.map((fn) => [fn.functionName, fn]));

  assert.ok(!byName.has('addPoolAdmin'));
  assert.ok(!byName.has('EMERGENCY_ADMIN_ROLE'));
  assert.ok(!byName.has('executeBorrow'));
  assert.ok(!byName.has('burn'));
  assert.equal(byName.get('upgradeTo')?.roleOrAddress, 'owner');
});

test('filters to target contract plus inherited base contracts', () => {
  const source = `
contract SharedBase {
  address public owner;
  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
  function rescueTokens(address token) external onlyOwner { token.call(""); }
}

contract UnrelatedAdminSurface {
  function setOracle(address oracle) external { oracle; }
}

contract TargetPool is SharedBase {
  function setReserveFactor(uint256 factor) external onlyOwner { factor; }
}
`;

  const functions = extractPermissionedFunctions(source, { targetContractName: 'TargetPool' });
  const byName = new Map(functions.map((fn) => [fn.functionName, fn]));

  assert.ok(byName.has('rescueTokens'));
  assert.equal(byName.get('rescueTokens')?.sourceContract, 'SharedBase');
  assert.ok(byName.has('setReserveFactor'));
  assert.equal(byName.get('setReserveFactor')?.sourceContract, 'TargetPool');
  assert.ok(!byName.has('setOracle'));
});

test('excludes standard ERC20/ERC721/ERC1155 user authorization flows', () => {
  const source = `
contract TokenLike {
  address public owner;
  mapping(address => mapping(address => uint256)) public allowance;
  mapping(address => mapping(address => bool)) public operatorApprovals;

  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

  function transfer(address to, uint256 amount) external returns (bool) {
    require(to != address(0)); amount; return true;
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount; return true;
  }

  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    require(from == msg.sender || allowance[from][msg.sender] >= amount, "not approved");
    to; return true;
  }

  function safeTransferFrom(address from, address to, uint256 tokenId) external {
    require(_isApprovedOrOwner(msg.sender, tokenId), "not approved"); from; to;
  }

  function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external {
    require(_isApprovedOrOwner(msg.sender, tokenId), "not approved"); from; to; data;
  }

  function setApprovalForAll(address operator, bool approved) external {
    operatorApprovals[msg.sender][operator] = approved;
  }

  function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
    require(from == msg.sender || operatorApprovals[from][msg.sender], "not approved"); to; id; amount; data;
  }

  function safeBatchTransferFrom(address from, address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) external {
    require(from == msg.sender || operatorApprovals[from][msg.sender], "not approved"); to; ids; amounts; data;
  }

  function mint(address to, uint256 amount) external onlyOwner { to; amount; }
  function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }

  function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
    spender; tokenId; return true;
  }
}
`;

  const functions = extractPermissionedFunctions(source, { targetContractName: 'TokenLike' });
  const byName = new Map(functions.map((fn) => [fn.functionName, fn]));

  assert.ok(!byName.has('transfer'));
  assert.ok(!byName.has('approve'));
  assert.ok(!byName.has('transferFrom'));
  assert.ok(!byName.has('safeTransferFrom'));
  assert.ok(!byName.has('setApprovalForAll'));
  assert.ok(!byName.has('safeBatchTransferFrom'));
  assert.equal(byName.get('mint')?.roleOrAddress, 'owner');
  assert.equal(byName.get('transferOwnership')?.category, 'permissions');
});

test('keeps non-standard privileged ERC-shaped functions visible', () => {
  const source = `
contract WeirdToken {
  address public owner;
  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

  function transferFrom(address from, address to, uint256 amount) external onlyOwner returns (bool) {
    from; to; amount; return true;
  }
}
`;

  const functions = extractPermissionedFunctions(source, { targetContractName: 'WeirdToken' });
  assert.equal(functions[0]?.functionName, 'transferFrom');
  assert.equal(functions[0]?.roleOrAddress, 'owner');
});

test('detects Aragon-style auth calls and initializer guards', () => {
  const source = `
contract LidoLike {
  bool internal initialized;
  bytes32 public constant STAKING_PAUSE_ROLE = keccak256("STAKING_PAUSE_ROLE");

  modifier auth(bytes32 role) { role; _; }

  function finalizeUpgrade_v3(address locator, address[] calldata operators, uint256 version) external {
    require(!initialized, "already initialized");
    initialized = true;
    locator; operators; version;
  }

  function pauseStaking() external auth(STAKING_PAUSE_ROLE) {
  }

  function resumeStaking() external {
    _auth(STAKING_PAUSE_ROLE);
  }
}
`;

  const functions = extractPermissionedFunctions(source, { targetContractName: 'LidoLike' });
  const byName = new Map(functions.map((fn) => [fn.functionName, fn]));

  assert.equal(byName.get('finalizeUpgrade_v3')?.roleOrAddress, 'one-time initializer guard');
  assert.ok(byName.get('finalizeUpgrade_v3')?.riskFactors?.includes('one-time-initializer'));
  assert.ok(!byName.get('finalizeUpgrade_v3')?.riskFactors?.includes('unprotected-anyone-callable'));
  assert.equal(byName.get('pauseStaking')?.roleOrAddress, 'STAKING_PAUSE_ROLE');
  assert.equal(byName.get('resumeStaking')?.roleOrAddress, 'STAKING_PAUSE_ROLE');
});
