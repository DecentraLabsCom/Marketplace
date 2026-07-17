import { writeFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider } from 'ethers';
import { isMoralisRpcUrl } from '../src/utils/security/rpcEndpoint.js';

const REGISTRY_ABI = [
  'function getAllInstitutions() view returns (address[])',
  'function getRegisteredSchacHomeOrganizations(address institution) view returns (string[])',
  'function getSchacHomeOrganizationBackend(string organization) view returns (string)',
  'function isLabProvider(address provider) view returns (bool)',
  'event SchacHomeOrganizationRegistered(address indexed institution, string organization, bytes32 indexed organizationHash)',
];

const moralisRpcUrl = process.env.NEXT_PUBLIC_MORALIS_SEPOLIA_URL
  && process.env.NEXT_PUBLIC_MORALIS_ID
  ? `${process.env.NEXT_PUBLIC_MORALIS_SEPOLIA_URL.replace(/\/+$/, '')}/${process.env.NEXT_PUBLIC_MORALIS_ID}`
  : process.env.NEXT_PUBLIC_MORALIS_SEPOLIA_URL;
const configuredRpcUrl = process.env.RPC_URL
  || process.env.NEXT_PUBLIC_ALCHEMY_SEPOLIA_URL
  || moralisRpcUrl
  || process.env.NEXT_PUBLIC_QUICKNODE_SEPOLIA_URL
  || process.env.NEXT_PUBLIC_INFURA_SEPOLIA_URL
  || process.env.NEXT_PUBLIC_CHAINSTACK_SEPOLIA_URL
  || process.env.NEXT_PUBLIC_ANKR_SEPOLIA_URL
  || process.env.NEXT_PUBLIC_DEFAULT_SEPOLIA_URL;
const rpcUrl = configuredRpcUrl && /^[a-z][a-z\d+.-]*:\/\//i.test(configuredRpcUrl)
  ? configuredRpcUrl
  : configuredRpcUrl ? `https://${configuredRpcUrl}` : null;
const registryContract = process.env.NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_SEPOLIA;
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputArgument?.slice('--output='.length)
  || (outputIndex >= 0 ? process.argv[outputIndex + 1] : null)
  || process.env.PROVISIONING_AUDIT_OUTPUT
  || null;
const configuredFromBlock = process.env.PROVISIONING_AUDIT_FROM_BLOCK
  ? Number.parseInt(process.env.PROVISIONING_AUDIT_FROM_BLOCK, 10)
  : null;
const defaultBlockChunk = isMoralisRpcUrl(rpcUrl) ? '100' : '50000';
const blockChunk = Number.parseInt(
  process.env.PROVISIONING_AUDIT_BLOCK_CHUNK || defaultBlockChunk,
  10
);
const queryConcurrency = Number.parseInt(
  process.env.PROVISIONING_AUDIT_QUERY_CONCURRENCY || '5',
  10
);

if (!rpcUrl) {
  throw new Error('RPC_URL or NEXT_PUBLIC_DEFAULT_SEPOLIA_URL is required');
}
if (!/^0x[0-9a-fA-F]{40}$/.test(registryContract || '')) {
  throw new Error('NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_SEPOLIA must be configured');
}
if (configuredFromBlock !== null && (
  !Number.isSafeInteger(configuredFromBlock) || configuredFromBlock < 0
)) {
  throw new Error('PROVISIONING_AUDIT_FROM_BLOCK must be a non-negative integer');
}
if (!Number.isSafeInteger(blockChunk) || blockChunk <= 0) {
  throw new Error('PROVISIONING_AUDIT_BLOCK_CHUNK must be a positive integer');
}
if (!Number.isSafeInteger(queryConcurrency) || queryConcurrency <= 0 || queryConcurrency > 20) {
  throw new Error('PROVISIONING_AUDIT_QUERY_CONCURRENCY must be between 1 and 20');
}

const provider = new JsonRpcProvider(rpcUrl);
const registry = new Contract(registryContract, REGISTRY_ABI, provider);

async function findDeploymentBlock(latestBlock) {
  const latestCode = await provider.getCode(registryContract, latestBlock);
  if (latestCode === '0x') {
    throw new Error('The configured registry contract has no code on the selected network');
  }

  let low = 0;
  let high = latestBlock;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const code = await provider.getCode(registryContract, middle);
    if (code === '0x') {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

async function loadRegistrationEvents(fromBlock, latestBlock) {
  const events = [];
  const filter = registry.filters.SchacHomeOrganizationRegistered();
  const ranges = [];
  for (let start = fromBlock; start <= latestBlock; start += blockChunk) {
    ranges.push([start, Math.min(latestBlock, start + blockChunk - 1)]);
  }
  for (let index = 0; index < ranges.length; index += queryConcurrency) {
    const batch = ranges.slice(index, index + queryConcurrency);
    const results = await Promise.all(
      batch.map(([start, end]) => registry.queryFilter(filter, start, end))
    );
    events.push(...results.flat());
  }
  return events;
}

const latestBlock = await provider.getBlockNumber();
const fromBlock = configuredFromBlock ?? await findDeploymentBlock(latestBlock);
const registrationEvents = await loadRegistrationEvents(fromBlock, latestBlock);
const eventByAssociation = new Map(
  registrationEvents.map((event) => [
    `${event.args.institution.toLowerCase()}:${event.args.organization.toLowerCase()}`,
    event,
  ])
);
const blockTimestamps = new Map();

async function timestampFor(blockNumber) {
  if (!blockNumber) return null;
  if (!blockTimestamps.has(blockNumber)) {
    const block = await provider.getBlock(blockNumber);
    blockTimestamps.set(
      blockNumber,
      block ? new Date(Number(block.timestamp) * 1000).toISOString() : null
    );
  }
  return blockTimestamps.get(blockNumber);
}

const institutions = await registry.getAllInstitutions();
const associations = [];

for (const walletAddress of institutions) {
  const [organizations, isProvider] = await Promise.all([
    registry.getRegisteredSchacHomeOrganizations(walletAddress),
    registry.isLabProvider(walletAddress),
  ]);

  for (const institutionId of organizations) {
    const canonicalBackendOrigin = await registry.getSchacHomeOrganizationBackend(institutionId);
    const event = eventByAssociation.get(
      `${walletAddress.toLowerCase()}:${institutionId.toLowerCase()}`
    );
    associations.push({
      institutionId,
      walletAddress,
      canonicalBackendOrigin: canonicalBackendOrigin || null,
      registrationType: isProvider ? 'provider' : 'consumer',
      registrationTransaction: event?.transactionHash || null,
      registeredAt: event ? await timestampFor(event.blockNumber) : null,
      responsiblePerson: null,
      provisioningTokenJti: null,
      reviewStatus: 'requires-off-chain-evidence',
      reviewReason: 'Historical on-chain state does not identify the SSO administrator or provisioning token.',
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  chainId: Number((await provider.getNetwork()).chainId),
  registryContract,
  fromBlock,
  latestBlock,
  associationCount: associations.length,
  associations,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  await writeFile(outputPath, serialized, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`Wrote ${associations.length} associations to ${outputPath}\n`);
} else {
  process.stdout.write(serialized);
}
