import { ethers } from 'ethers';
import { defaultNetworks, alchemyNetworks, moralisNetworks, ankrNetworks, 
        quicknodeNetworks, chainstackNetworks } from '../../../../utils/networkConfig';

export default async function getProvider(network) {
    let alchemyProjectId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
    let moralisProjectId = process.env.NEXT_PUBLIC_MORALIS_ID;
    let ankrProjectId = process.env.NEXT_PUBLIC_ANKR_ID;
    let quicknodeProjectId = process.env.NEXT_PUBLIC_QUICKNODE_ID;
    let chainstackProjectId = process.env.NEXT_PUBLIC_CHAINSTACK_ID;
    let infuraProjectId = process.env.NEXT_PUBLIC_INFURA_ID;
    const infuraSecretKey = process.env.INFURA_SECRET_KEY;
    const rpcUrl = network.rpcUrls.default.http[0];
    const networkInfo = { name: network.name, chainId: network.id };
    const options = {batchMaxCount: 3};

    const providers = [];

    providers.push(new ethers.WebSocketProvider(
        `wss://${defaultNetworks[network.id]}`,
        networkInfo
    ));
    providers.push(new ethers.JsonRpcProvider(
        `https://${defaultNetworks[network.id]}`,
        networkInfo, options
    ));

    if (alchemyProjectId) {
        providers.push(new ethers.WebSocketProvider(
            `wss:${alchemyNetworks[network.id]}${alchemyProjectId}`,
            networkInfo
        ));
        providers.push(new ethers.AlchemyProvider(network.id, alchemyProjectId));
    }
    /*if (moralisProjectId) {
        providers.push(new ethers.JsonRpcProvider(
            `https://${moralisNetworks[network.id]}${moralisProjectId}`,
            networkInfo, options
        ));
    }*/
    if (ankrProjectId) {
        providers.push(new ethers.JsonRpcProvider(
            `https://${ankrNetworks[network.id]}${ankrProjectId}`,
            networkInfo, options
        ));
    }
    if (quicknodeProjectId) {
        providers.push(new ethers.WebSocketProvider(
            `wss://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
            networkInfo
        ));
        providers.push(new ethers.JsonRpcProvider(
            `https://${quicknodeNetworks[network.id]}${quicknodeProjectId}`,
            networkInfo, options
        ));
    }
    // TODO: Try to solve issues with the following two providers
    if (chainstackProjectId) {
        providers.push(new ethers.WebSocketProvider(
            `wss://${chainstackNetworks[network.id]}${chainstackProjectId}`,
            networkInfo
        ));
        providers.push(new ethers.JsonRpcProvider(
            `https://${chainstackNetworks[network.id]}${chainstackProjectId}`,
            networkInfo, options
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
    }
    
    // Fallback to the official RPC if others fail
    providers.push(new ethers.JsonRpcProvider(rpcUrl, networkInfo, options));

    return new ethers.FallbackProvider(providers, networkInfo, {quorum: 1});
}