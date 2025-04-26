import { ethers } from 'ethers';
import { infuraNetworks, alchemyNetworks } from '../../../../utils/networkConfig.js';

export default async function getProvider(network) {
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let providerUrls = [
        `https://${infuraNetworks[network.id]}${infuraProjectId}`,
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