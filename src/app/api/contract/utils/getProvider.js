import { ethers } from 'ethers';

export default async function getProvider(network) {
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    const rpcUrl = network.rpcUrls.default.http[0];

    const providers = [];
    if (infuraProjectId) {
        providers.push(
            new ethers.InfuraProvider(
              network.id,
              infuraSecretKey
                ? { projectId: infuraProjectId, projectSecret: infuraSecretKey }
                : infuraProjectId
            )
          );
    }
    if (alchemyProjectId) {
        providers.push(new ethers.AlchemyProvider(network.id, alchemyProjectId));
    }
    // Fallback to the official RPC if Infura and Alchemy fail
    providers.push(new ethers.JsonRpcProvider(rpcUrl, network.id));

    return new ethers.FallbackProvider(providers);
}