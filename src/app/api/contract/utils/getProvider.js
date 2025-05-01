import { ethers } from 'ethers';
import { infuraNetworks, alchemyNetworks } from '../../../../utils/networkConfig.js';

export default async function getProvider(network) {
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;

    const infuraBase = infuraNetworks[network.id];                // ya incluye «mainnet.infura.io/v3/»
    const infuraUrl = infuraSecretKey
      ? `https://${infuraProjectId}:${infuraSecretKey}@${infuraBase}${infuraProjectId}`
      : `https://${infuraBase}${infuraProjectId}`;

    let providerUrls = [
        infuraUrl,
        `https://${alchemyNetworks[network.id]}${alchemyProjectId}`,
        network.rpcUrls.default.http[0],
    ];

    for (const url of providerUrls) {
        try {
            const provider = new ethers.JsonRpcProvider(url, network.id, {
                staticNetwork: true,
            });
            await provider.getBlockNumber();
            console.log(`Connected to provider: ${url}`);
            return provider;
        } catch (error) {
            console.error(`Failed to connect to provider: ${url}`, error);
        }
    }
    throw new Error('No available providers');
}