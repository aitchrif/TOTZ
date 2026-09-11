import fs from 'node:fs';
import solc from 'solc';
import {
  AbiCoder,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  getAddress,
  keccak256
} from 'ethers';

const EXPECTED_CHAIN_ID = 46630n;
const RPC_URL = process.env.FORGE_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const PRIVATE_KEY = String(process.env.FORGE_TESTNET_PRIVATE_KEY || '').trim();
const ARTIFACT_PATH = 'artifacts/ForgeMerkleClaim.release.json';
const EXPECTED_CORE_HASH = '0xb90f55deac3bb7b4cc6743afb563abd27ac21e0df0ff02d7ce6ae289bb9b7e36';

if (!/^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)) {
  throw new Error('FORGE_TESTNET_PRIVATE_KEY is missing or invalid. Use a dedicated funded Robinhood testnet wallet only.');
}
if (!fs.existsSync(ARTIFACT_PATH)) throw new Error('Fresh release artifact is missing.');

const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
if (artifact.artifactFormat !== 'TOTZ_FORGE_CLAIM_RELEASE_V1') throw new Error('Unexpected claim release artifact format.');
if (String(artifact.normalizedCoreHash || '').toLowerCase() !== EXPECTED_CORE_HASH) throw new Error('Claim executable core hash is not approved.');
if (!Array.isArray(artifact.abi) || !/^0x[0-9a-f]+$/i.test(String(artifact.bytecode || ''))) throw new Error('Claim release artifact is incomplete.');

const tokenSource = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract ForgeRehearsalToken {
    string public constant name = "FORGE Rehearsal Token";
    string public constant symbol = "tFORGE";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 value);
    constructor(address recipient, uint256 supply) {
        balanceOf[recipient] = supply;
        emit Transfer(address(0), recipient, supply);
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "zero recipient");
        uint256 balance = balanceOf[msg.sender];
        require(balance >= amount, "insufficient balance");
        unchecked { balanceOf[msg.sender] = balance - amount; }
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}`;

function compileTestToken() {
  const input = {
    language: 'Solidity',
    sources: { 'ForgeRehearsalToken.sol': { content: tokenSource } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage || entry.message).join('\n'));
  const built = output.contracts?.['ForgeRehearsalToken.sol']?.ForgeRehearsalToken;
  if (!built) throw new Error('Test token compiler output missing.');
  return { abi: built.abi, bytecode: `0x${built.evm.bytecode.object}` };
}

function claimLeaf(account, amount) {
  const inner = keccak256(AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [account, amount]));
  return keccak256(inner);
}

const provider = new JsonRpcProvider(RPC_URL, Number(EXPECTED_CHAIN_ID), { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== EXPECTED_CHAIN_ID) throw new Error(`Refusing rehearsal on chain ${network.chainId}; expected Robinhood testnet ${EXPECTED_CHAIN_ID}.`);

const signer = new Wallet(PRIVATE_KEY, provider);
const sponsor = getAddress(await signer.getAddress());
const nativeBalance = await provider.getBalance(sponsor);
if (nativeBalance <= 0n) throw new Error('Dedicated rehearsal wallet has no testnet gas balance.');

const amount = 123456789n;
const tokenBuild = compileTestToken();
const tokenFactory = new ContractFactory(tokenBuild.abi, tokenBuild.bytecode, signer);
const token = await tokenFactory.deploy(sponsor, amount);
await token.waitForDeployment();
const tokenAddress = getAddress(await token.getAddress());

const latest = await provider.getBlock('latest');
if (!latest) throw new Error('Could not read latest Robinhood testnet block.');
const deadline = Number(latest.timestamp) + 3600;
const root = claimLeaf(sponsor, amount);

const claimFactory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
const claim = await claimFactory.deploy(tokenAddress, root, amount, deadline, sponsor);
await claim.waitForDeployment();
const claimAddress = getAddress(await claim.getAddress());

const [liveToken, liveSponsor, liveRoot, liveTotal, liveDeadline] = await Promise.all([
  claim.token(), claim.sponsor(), claim.merkleRoot(), claim.totalAllocated(), claim.deadline()
]);
if (getAddress(liveToken) !== tokenAddress) throw new Error('Claim token immutable mismatch.');
if (getAddress(liveSponsor) !== sponsor) throw new Error('Claim sponsor immutable mismatch.');
if (String(liveRoot).toLowerCase() !== root.toLowerCase()) throw new Error('Claim root immutable mismatch.');
if (BigInt(liveTotal) !== amount) throw new Error('Claim allocation immutable mismatch.');
if (Number(liveDeadline) !== deadline) throw new Error('Claim deadline immutable mismatch.');

const fundTx = await token.transfer(claimAddress, amount);
await fundTx.wait();
if ((await claim.contractBalance()) !== amount) throw new Error('Claim contract funding balance mismatch.');
if ((await claim.isFullyFunded()) !== true) throw new Error('Claim contract did not report fully funded.');

const claimTx = await claim.claim(amount, []);
await claimTx.wait();
if ((await claim.claimed(sponsor)) !== true) throw new Error('Claimed flag was not persisted.');
if ((await claim.totalClaimed()) !== amount) throw new Error('Total claimed mismatch.');
if ((await claim.claimCount()) !== 1n) throw new Error('Claim count mismatch.');
if ((await token.balanceOf(sponsor)) !== amount) throw new Error('Claimed token balance did not return to the rehearsal wallet.');

console.log('FORGE TESTNET WALLET REHEARSAL: PASS');
console.log(JSON.stringify({
  chainId: Number(network.chainId),
  sponsor,
  token: tokenAddress,
  claim: claimAddress,
  allocationUnits: amount.toString(),
  deadline,
  deployTokenTx: token.deploymentTransaction()?.hash || null,
  deployClaimTx: claim.deploymentTransaction()?.hash || null,
  fundTx: fundTx.hash,
  claimTx: claimTx.hash
}, null, 2));
