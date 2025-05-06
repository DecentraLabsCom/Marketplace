import { simLabsData } from '../../../../../utils/simLabsData';
import { getContractInstance } from '../../utils/contractInstance';

export async function GET(request) {
  try {
    // TODO - Remove when using contract
    throw new Error('Simulating error to get simulated labs.');

    const contract = await getContractInstance();

    // Get list of all providers and create a map address -> name
    const providerList = await contract.getLabProviders();
    const providerMap = {};
    for (const provider of providerList) {
      providerMap[provider.account.toLowerCase()] = provider.base.name;
    }

    // Get the list of all labs
    const labList = await contract.getAllLabs();

    // For each lab, get its metadata and its owner address
    const labs = await Promise.all(
      labList.map(async (lab) => {
        const labId = lab.labId.toString();

        // Fetch metadata from URI and get owner address from contract
        const metadataURI = lab.base.uri;
        const fetchPromise = fetch(metadataURI);
        const ownerPromise = contract.ownerOf(labId);

        const response = await fetchPromise;
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata for lab ${labId}: ${response.statusText}`);
        }

        // Parallelize the fetch and owner address retrieval
        const [metadata, providerAddress] = await Promise.all([
          response.json(),
          ownerPromise
        ]);

        // Use the map to obtain the provider name from the address
        const providerName = providerMap[providerAddress.toLowerCase()] || providerAddress;

        return {
          id: labId,
          name: metadata?.name  ?? "Unnamed Lab",
          category: metadata?.category ?? "",
          keywords: metadata?.keywords ?? "",
          price: parseFloat(lab.base.price),
          description: metadata?.description ?? "The provider didn't add a description for this lab yet.",
          provider: providerName,
          auth: lab.base.auth?.toString() ?? "",  // TODO - if not present, use DecentraLabs Auth service
          accessURI: lab.base.accessURI.toString(),
          accessKey: lab.base.accessKey.toString(),
          timeSlots: metadata?.timeSlots ?? [60], 
          opens: metadata?.opens ?? "",
          closes: metadata?.closes ?? "",
          docs: metadata?.docs ?? [],
          images: metadata?.images ?? [],
        };
      })
    );

    // Return data to client
    return Response.json(labs, { status: 200 });
  } catch (error) {
    console.error('Error fetching labs metadata:', error);
    try {
      const fallbackLabs = simLabsData();
      return Response.json(fallbackLabs, { status: 200 });
    } catch (fallbackError) {
      console.error('Error fetching fallback labs data:', fallbackError);
      return new Response(JSON.stringify({ error: 'Failed to fetch labs metadata and fallback data' }), 
                          { status: 500 });
    }
  }
}