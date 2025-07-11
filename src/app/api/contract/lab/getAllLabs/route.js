import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { simLabsData } from '@/utils/simLabsData';
import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import getIsVercel from '@/utils/isVercel';

export async function GET(request) {
  function parseAttributes(attributes = []) {
    const result = {};
    for (const attr of attributes) {
      result[attr.trait_type] = attr.value;
    }
    return result;
  }

  try {
    const isVercel = getIsVercel();
    const contract = await getContractInstance();

    // Get list of all providers and create a map address -> name
    const providerList = await retry(() => contract.getLabProviders());
    const providerMap = {};
    for (const provider of providerList) {
      providerMap[provider.account.toLowerCase()] = provider.base.name;
    }

    // Get the list of all lab IDs
    const labIds = await retry(() => contract.getAllLabs()); // array of ids

    // Limit concurrency to 2 (it produces 4 requests in parallel: getLab() and ownerOf())
    // TODO: Increase when using a paid node service
    const limit = pLimit(2);

    // For each labId, get lab data, owner, and metadata in parallel
    const labs = await Promise.all(
      labIds.map(async (labIdRaw) =>
        limit(async () => {
          const labId = labIdRaw.toString();

          // Parallelize getLab and ownerOf calls
          const [labData, providerAddress] = await Promise.all([
            retry(() => contract.getLab(labId)),
            retry(() => contract.ownerOf(labId)),
          ]);

          // Fetch metadata from URI
          let metadata = {};

          try {
            if (labData.base.uri.startsWith('Lab-')) {
              if (!isVercel) {
                const filePath = path.join(process.cwd(), 'data', labData.base.uri);
                try {
                  const fileContent = await fs.readFile(filePath, 'utf-8');
                  metadata = JSON.parse(fileContent);
                } catch (fileError) {
                  console.error(`Error reading metadata file for lab ${labId} (${labData.base.uri}):`, fileError.message);
                  // Use default metadata when file is missing
                  metadata = {
                    name: `Lab ${labId}`,
                    description: "Metadata file not found",
                    attributes: []
                  };
                }
              } else {
                const blobName = labData.base.uri;
                const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', blobName);
                const response = await fetch(blobUrl);
                if (response.ok) {
                  metadata = await response.json();
                } else {
                  console.error(`Failed to fetch blob data for ${blobName}: ${response.statusText}`);
                  metadata = {
                    name: `Lab ${labId}`,
                    description: "Metadata not available",
                    attributes: []
                  };
                }
              }
            } else {
              const response = await fetch(labData.base.uri);
              if (response.ok) {
                metadata = await response.json();
              } else {
                console.error(`Failed to fetch metadata from URI ${labData.base.uri}`);
                metadata = {
                  name: `Lab ${labId}`,
                  description: "External metadata not available",
                  attributes: []
                };
              }
            }
          } catch (err) {
            console.error(`Error fetching metadata for lab ${labId}:`, err);
            // Fallback metadata when all else fails
            metadata = {
              name: `Lab ${labId}`,
              description: "Metadata unavailable",
              attributes: []
            };
          }

          // Parse attributes array to object
          const attrs = parseAttributes(metadata.attributes);

          // Use the map to obtain the provider name from the address
          const providerName = providerMap[providerAddress.toLowerCase()] || providerAddress;

          return {
            id: labId,
            name: metadata?.name ?? "Unnamed Lab",
            category: attrs?.category ?? "",
            keywords: attrs?.keywords ?? [],
            price: parseFloat(labData.base.price),
            description: metadata?.description ?? "The provider didn't add a description for this lab yet.",
            provider: providerName, 
            providerAddress: providerAddress,
            auth: labData.base.auth?.toString() ?? "",
            accessURI: labData.base.accessURI?.toString() ?? "",
            accessKey: labData.base.accessKey?.toString() ?? "",
            timeSlots: attrs?.timeSlots ?? [60],
            opens: attrs?.opens ?? "",
            closes: attrs?.closes ?? "",
            docs: attrs?.docs ?? [],
            images: [metadata?.image, ...(attrs.additionalImages ?? [])].filter(Boolean),
            uri: labData.base.uri,
          };
        })
      )
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