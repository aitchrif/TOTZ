import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) {
    if (text.includes(to)) return text;
    throw new Error(`Patch target missing: ${label}`);
  }
  return text.replace(from, to);
}

const corePath = 'supabase/functions/forge-claims/index.ts';
let core = fs.readFileSync(corePath, 'utf8');

const oldLayout = `const CLAIM_IMMUTABLE_RANGES = [
  { start: 522, length: 32 }, { start: 1020, length: 32 }, { start: 1288, length: 32 }, { start: 1422, length: 32 }, { start: 1618, length: 32 }, { start: 1864, length: 32 },
  { start: 376, length: 32 }, { start: 1129, length: 32 }, { start: 1456, length: 32 }, { start: 1495, length: 32 }, { start: 255, length: 32 }, { start: 868, length: 32 },
  { start: 329, length: 32 }, { start: 719, length: 32 }, { start: 1740, length: 32 }, { start: 1787, length: 32 }, { start: 186, length: 32 }, { start: 558, length: 32 }, { start: 1193, length: 32 },
];`;
const newLayout = `// solc 0.8.24 immutableReferences for the reviewed ForgeMerkleClaim release artifact.
// Keep the groups named: attestation verifies every embedded copy before zero-normalization.
const CLAIM_IMMUTABLE_LAYOUT = {
  token: [
    { start: 522, length: 32 }, { start: 1020, length: 32 }, { start: 1288, length: 32 }, { start: 1422, length: 32 }, { start: 1618, length: 32 }, { start: 1864, length: 32 },
  ],
  merkleRoot: [
    { start: 255, length: 32 }, { start: 868, length: 32 },
  ],
  totalAllocated: [
    { start: 329, length: 32 }, { start: 719, length: 32 }, { start: 1740, length: 32 }, { start: 1787, length: 32 },
  ],
  deadline: [
    { start: 186, length: 32 }, { start: 558, length: 32 }, { start: 1193, length: 32 },
  ],
  sponsor: [
    { start: 376, length: 32 }, { start: 1129, length: 32 }, { start: 1456, length: 32 }, { start: 1495, length: 32 },
  ],
} as const;
const CLAIM_IMMUTABLE_RANGES = Object.values(CLAIM_IMMUTABLE_LAYOUT).flat();`;
core = replaceOnce(core, oldLayout, newLayout, 'immutable layout');

const oldNormalizer = `function normalizedRuntimeCoreHash(code: string) {
  const hex = String(code || "").replace(/^0x/, "");
  if (!hex || hex.length % 2) throw new Error("invalid runtime");
  const bytes = new Uint8Array(hex.length / 2);`;
const newNormalizer = `type ClaimRuntimeImmutables = {
  token: string;
  merkleRoot: string;
  totalAllocated: string;
  deadline: number;
  sponsor: string;
};

function immutableWord(value: string | number | bigint, kind: "address" | "bytes32" | "uint") {
  let hex = String(value).replace(/^0x/, "").toLowerCase();
  if (kind === "address") {
    if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error("invalid immutable address");
  } else if (kind === "bytes32") {
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("invalid immutable bytes32");
    return hex;
  } else {
    let n: bigint;
    try { n = BigInt(value); } catch { throw new Error("invalid immutable uint"); }
    if (n < 0n || n > MAX_UINT256) throw new Error("invalid immutable uint");
    hex = n.toString(16);
  }
  return hex.padStart(64, "0");
}

function assertRuntimeImmutableOccurrences(code: string, expected: ClaimRuntimeImmutables) {
  const hex = String(code || "").replace(/^0x/, "").toLowerCase();
  if (!hex || hex.length % 2) throw new Error("invalid runtime");
  const words: Record<keyof ClaimRuntimeImmutables, string> = {
    token: immutableWord(expected.token, "address"),
    merkleRoot: immutableWord(expected.merkleRoot, "bytes32"),
    totalAllocated: immutableWord(expected.totalAllocated, "uint"),
    deadline: immutableWord(expected.deadline, "uint"),
    sponsor: immutableWord(expected.sponsor, "address"),
  };
  for (const [name, ranges] of Object.entries(CLAIM_IMMUTABLE_LAYOUT) as [keyof ClaimRuntimeImmutables, readonly { start: number; length: number }[]][]) {
    for (const { start, length } of ranges) {
      if (length !== 32 || (start + length) * 2 > hex.length) throw new Error("runtime size mismatch");
      const actual = hex.slice(start * 2, (start + length) * 2);
      if (actual !== words[name]) throw new Error(\`Claim contract immutable \${name} mismatch.\`);
    }
  }
}

function normalizedRuntimeCoreHash(code: string) {
  const hex = String(code || "").replace(/^0x/, "");
  if (!hex || hex.length % 2) throw new Error("invalid runtime");
  const bytes = new Uint8Array(hex.length / 2);`;
core = replaceOnce(core, oldNormalizer, newNormalizer, 'immutable occurrence validator');

const oldApproved = `async function assertApprovedClaimRuntime(chainId: number, address: string) {
  const code = await rpc(chainId, "eth_getCode", [address, "latest"]);
  if (!code || code === "0x" || code === "0x0") throw new Error("Claim contract does not exist on the configured claim chain.");
  let actual = "";
  try {
    actual = normalizedRuntimeCoreHash(code);
  } catch {
    throw new Error("Claim contract runtime is not an approved TOTZ FORGE build.");
  }
  if (actual.toLowerCase() !== APPROVED_CLAIM_RUNTIME_CORE_HASH) throw new Error("Claim contract runtime is not an approved TOTZ FORGE build.");
  return actual;
}`;
const newApproved = `async function assertApprovedClaimRuntime(chainId: number, address: string, expected: ClaimRuntimeImmutables) {
  const code = await rpc(chainId, "eth_getCode", [address, "latest"]);
  if (!code || code === "0x" || code === "0x0") throw new Error("Claim contract does not exist on the configured claim chain.");
  let actual = "";
  try {
    // Getter agreement is not sufficient: every compiler-reported immutable copy must
    // match the publication tuple before those bytes are normalized out of the hash.
    assertRuntimeImmutableOccurrences(code, expected);
    actual = normalizedRuntimeCoreHash(code);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Claim contract immutable ")) throw e;
    throw new Error("Claim contract runtime is not an approved TOTZ FORGE build.");
  }
  if (actual.toLowerCase() !== APPROVED_CLAIM_RUNTIME_CORE_HASH) throw new Error("Claim contract runtime is not an approved TOTZ FORGE build.");
  return actual;
}`;
core = replaceOnce(core, oldApproved, newApproved, 'approved runtime verifier');

const oldCall = `  const runtimeHash = await assertApprovedClaimRuntime(chainId, expected.claimContract);`;
const newCall = `  const runtimeHash = await assertApprovedClaimRuntime(chainId, expected.claimContract, {
    token: expected.rewardToken,
    merkleRoot: expected.merkleRoot,
    totalAllocated: expected.totalUnits,
    deadline: expected.deadlineUnix,
    sponsor: expected.creator,
  });`;
core = replaceOnce(core, oldCall, newCall, 'runtime verifier call');
core = core.replaceAll('runtimeAttestation: "executable-core-v1"', 'runtimeAttestation: "executable-core+immutables-v2"');
fs.writeFileSync(corePath, core);

const backendTestPath = 'tests/forge-backend-provenance-integration.mjs';
let backendTest = fs.readFileSync(backendTestPath, 'utf8');
backendTest = replaceOnce(
  backendTest,
  `assert(core.includes('function normalizedRuntimeCoreHash'), 'Core backend must normalize runtime before attestation.');`,
  `assert(core.includes('function normalizedRuntimeCoreHash'), 'Core backend must normalize runtime before attestation.');\nassert(core.includes('CLAIM_IMMUTABLE_LAYOUT'), 'Core backend must retain named compiler immutable ranges.');\nassert(core.includes('assertRuntimeImmutableOccurrences'), 'Core backend must verify every immutable occurrence before normalization.');`,
  'backend attestation assertions'
);
backendTest = backendTest.replace(
  `assert(core.includes('runtimeAttestation: "executable-core-v1"'), 'Core publication responses must identify executable-core attestation.');`,
  `assert(core.includes('runtimeAttestation: "executable-core+immutables-v2"'), 'Core publication responses must identify occurrence-bound runtime attestation.');`
);
backendTest = backendTest.replace(
  `console.log(\`FORGE BACKEND + RELEASE PROVENANCE: PASS · fingerprint \${expected.slice(0, 12)}… · source-controlled core + fresh artifact pinned\`);`,
  `console.log(\`FORGE BACKEND + RELEASE PROVENANCE: PASS · fingerprint \${expected.slice(0, 12)}… · source-controlled core + immutable occurrences bound\`);`
);
fs.writeFileSync(backendTestPath, backendTest);

const workflowPath = '.github/workflows/forge-production-integration.yml';
let workflow = fs.readFileSync(workflowPath, 'utf8');
workflow = replaceOnce(
  workflow,
  `      - 'tests/forge-backend-provenance-integration.mjs'\n      - 'tests/forge-csp-regression.mjs'`,
  `      - 'tests/forge-backend-provenance-integration.mjs'\n      - 'tests/forge-runtime-attestation-regression.mjs'\n      - 'tests/forge-csp-regression.mjs'`,
  'workflow path trigger'
);
workflow = replaceOnce(
  workflow,
  `      - name: Verify backend and release provenance enforcement\n        run: node tests/forge-backend-provenance-integration.mjs\n      - name: Verify FLOOR GUARD read-only market intelligence`,
  `      - name: Verify backend and release provenance enforcement\n        run: node tests/forge-backend-provenance-integration.mjs\n      - name: Verify runtime immutable occurrence attestation\n        run: node tests/forge-runtime-attestation-regression.mjs\n      - name: Verify FLOOR GUARD read-only market intelligence`,
  'workflow attestation step'
);
fs.writeFileSync(workflowPath, workflow);

const attrPath = '.gitattributes';
let attrs = fs.existsSync(attrPath) ? fs.readFileSync(attrPath, 'utf8') : '';
if (!attrs.split(/\r?\n/).includes('*.sol text eol=lf')) {
  attrs = `${attrs.replace(/\s*$/, '')}${attrs.trim() ? '\n' : ''}*.sol text eol=lf\n`;
  fs.writeFileSync(attrPath, attrs);
}

console.log('Applied FORGE immutable-occurrence attestation review fix.');
