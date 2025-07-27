import devLog from '@/utils/dev/logger';

import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';
import fs from 'fs/promises';
import path from 'path';
import getIsVercel from '@/utils/isVercel';

export async function POST(request) {
  const body = await request.json();
  const { reservationKey, labId, start, end, metadataUri } = body;
  
  // Only collect debug messages in development
  const isDev = process.env.NODE_ENV === 'development';
  const debugMessages = [];
  
  if (isDev) {
    debugMessages.push(`Processing reservation request: ${JSON.stringify({ reservationKey, labId, start, end, metadataUri })}`);
  }
  
  if (!reservationKey || !labId || !start || !end || !metadataUri) {
    return Response.json({ error: 'Missing required fields (reservationKey, labId, start, end, metadataUri)' }, { status: 400 });
  }

  try {
    if (isDev) debugMessages.push('Step 1: Getting contract instance...');
    const contract = await getContractInstance();
    if (isDev) debugMessages.push('Step 1: Contract instance obtained successfully');
    
    if (isDev) {
      debugMessages.push('Step 2: Using provided metadata URI...');
      debugMessages.push(`Metadata URI: ${metadataUri}`);
    }
    
    // Fetch metadata using the provided URI
    if (isDev) debugMessages.push('Step 3: Fetching lab metadata...');
    let metadata = {};
    const isVercel = getIsVercel();
    
    try {
      if (metadataUri.startsWith('Lab-')) {
        if (!isVercel) {
          // Development: read from local filesystem
          if (isDev) debugMessages.push('Reading metadata from local filesystem...');
          
          const filePath = path.join(process.cwd(), 'data', metadataUri);
          if (isDev) debugMessages.push(`Metadata file path: ${filePath}`);
          
          const fileContent = await fs.readFile(filePath, 'utf-8');
          metadata = JSON.parse(fileContent);
          
          if (isDev) debugMessages.push('Metadata loaded successfully from local filesystem');
        } else {
          // Production: fetch from Vercel blob storage
          if (isDev) debugMessages.push('Fetching metadata from Vercel blob storage...');
          
          const blobUrl = path.join(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL, 'data', metadataUri);
          if (isDev) debugMessages.push(`Blob URL: ${blobUrl}`);
          
          const response = await fetch(blobUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch blob data: ${response.statusText}`);
          }
          metadata = await response.json();
          
          if (isDev) debugMessages.push('Metadata fetched successfully from Vercel blob storage');
        }
      } else {
        // External URI - fetch directly
        if (isDev) debugMessages.push('Fetching metadata from external URI...');
        
        const response = await fetch(metadataUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata from external URI: ${response.statusText}`);
        }
        metadata = await response.json();
        
        if (isDev) debugMessages.push('Metadata fetched successfully from external URI');
      }
    } catch (metadataError) {
      devLog.error('Error fetching metadata:', metadataError);
      if (isDev) debugMessages.push(`Error fetching metadata: ${metadataError.message}`);
      throw new Error(`Failed to load lab metadata: ${metadataError.message}`);
    }
    
    // Extract dates from metadata attributes
    if (isDev) debugMessages.push('Extracting dates from metadata attributes...');
    
    if (!metadata.attributes || !Array.isArray(metadata.attributes)) {
      throw new Error('No attributes array found in metadata');
    }
    
    // Find opens and closes attributes
    const opensAttr = metadata.attributes.find(attr => attr.trait_type === 'opens');
    const closesAttr = metadata.attributes.find(attr => attr.trait_type === 'closes');
    
    if (isDev) {
      debugMessages.push(`Opens attribute: ${JSON.stringify(opensAttr)}`);
      debugMessages.push(`Closes attribute: ${JSON.stringify(closesAttr)}`);
    }
    
    if (!opensAttr || !closesAttr) {
      const availableTraits = metadata.attributes.map(attr => attr.trait_type).join(', ');
      if (isDev) debugMessages.push(`Available trait types: ${availableTraits}`);
      throw new Error('Could not find opens/closes attributes in metadata');
    }
    
    // Convert date strings to Unix timestamps
    const opensDate = new Date(opensAttr.value);
    const closesDate = new Date(closesAttr.value);
    
    // Validate dates
    if (isNaN(opensDate.getTime()) || isNaN(closesDate.getTime())) {
      if (isDev) {
        debugMessages.push(`Invalid date parsing - opens: "${opensAttr.value}" -> ${opensDate}, closes: "${closesAttr.value}" -> ${closesDate}`);
      }
      throw new Error(`Invalid date format in metadata. Opens: "${opensAttr.value}", Closes: "${closesAttr.value}"`);
    }
    
    if (isDev) {
      debugMessages.push(`Opens date: ${opensDate.toISOString()}`);
      debugMessages.push(`Closes date: ${closesDate.toISOString()}`);
    }
    
    // Convert to Unix timestamps (seconds since epoch)
    const labOpens = Math.floor(opensDate.getTime() / 1000);
    const labCloses = Math.floor(closesDate.getTime() / 1000);
    
    if (isDev) {
      debugMessages.push('Step 3: Lab dates extracted from metadata');
      debugMessages.push(`Lab opens timestamp: ${labOpens}`);
      debugMessages.push(`Lab closes timestamp: ${labCloses}`);
    }
    
    // Convert start and end to numbers if they're strings
    const reservationStart = parseInt(start);
    const reservationEnd = parseInt(end);
    
    if (isDev) {
      debugMessages.push('Step 4: Date validation...');
      debugMessages.push(`Date validation - Lab opens: ${new Date(labOpens * 1000).toISOString()}, Lab closes: ${new Date(labCloses * 1000).toISOString()}, Reservation start: ${new Date(reservationStart * 1000).toISOString()}, Reservation end: ${new Date(reservationEnd * 1000).toISOString()}`);
    }
    
    // Check if reservation is within lab operating dates
    if (reservationStart >= labOpens && reservationEnd <= labCloses) {
      if (isDev) debugMessages.push('Step 5: Reservation is within allowed dates, confirming...');
      await confirmReservation(contract, reservationKey);
      if (isDev) debugMessages.push('Step 5: Reservation confirmed successfully');
      
      const response = { 
        success: true, 
        action: 'confirmed',
        reason: 'Reservation within allowed dates'
      };
      
      // Only include debug in development
      if (isDev) response.debug = debugMessages;
      
      return Response.json(response);
    } else {
      if (isDev) debugMessages.push('Step 5: Reservation is outside allowed dates, denying...');
      let reason = 'Reservation outside allowed dates';
      if (reservationStart < labOpens) {
        reason = `Reservation starts before lab opens (${new Date(reservationStart * 1000).toISOString()} < ${new Date(labOpens * 1000).toISOString()})`;
      } else if (reservationEnd > labCloses) {
        reason = `Reservation ends after lab closes (${new Date(reservationEnd * 1000).toISOString()} > ${new Date(labCloses * 1000).toISOString()})`;
      }
      
      if (isDev) {
        devLog.log('🔍 RESERVATION DEBUG - DENIAL REASON:', reason);
      }
      
      await denyReservation(contract, reservationKey, reason);
      if (isDev) debugMessages.push('Step 5: Reservation denied successfully');
      
      const response = { 
        success: true, 
        action: 'denied',
        reason: reason
      };
      
      // Only include debug in development
      if (isDev) response.debug = debugMessages;
      
      return Response.json(response);
    }
    
  } catch (error) {
    devLog.error('Error processing reservation request:', error);
    
    // In case of error, try to deny the reservation to prevent it from being stuck
    try {
      const contract = await getContractInstance();
      await denyReservation(contract, reservationKey, 'Processing error');
    } catch (denyError) {
      devLog.error('Failed to deny reservation after error:', denyError);
    }
    
    const errorResponse = { 
      error: 'Failed to process reservation request',
      details: error.message
    };
    
    // Only include debug in development
    if (isDev) errorResponse.debug = debugMessages;
    
    return Response.json(errorResponse, { status: 500 });
  }
}

async function confirmReservation(contract, reservationKey) {
  try {
    const tx = await retry(() => contract.confirmReservationRequest(reservationKey));
    await tx.wait();
    return tx.hash;
  } catch (error) {
    devLog.error('Error confirming reservation:', error);
    throw error;
  }
}

async function denyReservation(contract, reservationKey, reason) {
  try {
    devLog.log(`Denying reservation ${reservationKey}: ${reason}`);
    // The contract function only accepts reservationKey, not reason
    const tx = await retry(() => contract.denyReservationRequest(reservationKey));
    await tx.wait();
    return tx.hash;
  } catch (error) {
    devLog.error('Error denying reservation:', error);
    throw error;
  }
}
