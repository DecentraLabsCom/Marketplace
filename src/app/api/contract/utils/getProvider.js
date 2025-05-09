import { ethers } from 'ethers';
import { moralisNetworks, ankrNetworks, quicknodeNetworks, chainstackNetworks } 
    from '../../../../utils/networkConfig';

export default async function getProvider(network) {
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
    let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
    let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
    let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    const rpcUrl = network.rpcUrls.default.http[0];
    const networkInfo = { name: network.name, chainId: network.id }

    const providers = [];
    if (alchemyProjectId) {
        providers.push(new ethers.AlchemyProvider(network.id, alchemyProjectId));
    }
    if (moralisProjectId) {
        providers.push(new ethers.JsonRpcProvider(
            `https://${moralisNetworks[network.id]}${moralisProjectId}`,
            networkInfo, {batchMaxCount: 3}
        ));
    }
    if (ankrProjectId) {
        providers.push(new ethers.JsonRpcProvider(
            `https://${ankrNetworks[network.id]}${ankrProjectId}`,
            networkInfo, {batchMaxCount: 3}
        ));
    }
    if (quicknodeProjectId) {
        providers.push(new ethers.JsonRpcProvider(
            `https://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
            networkInfo, {batchMaxCount: 3}
        ));
    }
    // TODO: Try to solve issues with the following two providers
    /*if (chainstackProjectId) {
        providers.push(new ethers.JsonRpcProvider(
            `https://${chainstackNetworks[network.id]}${chainstackProjectId}`,
            networkInfo, {batchMaxCount: 3}
        ));
    }
    if (infuraProjectId) {
        providers.push(
            new ethers.InfuraProvider(
              network.id,
              infuraSecretKey
                ? { projectId: infuraProjectId, projectSecret: infuraSecretKey }
                : infuraProjectId
            )
          );
    }*/
    
    // Fallback to the official etherscan RPC if others fail
    providers.push(new ethers.JsonRpcProvider(rpcUrl, networkInfo, {batchMaxCount: 3}));

    return new ethers.FallbackProvider(providers, networkInfo, {quorum: 1});
}