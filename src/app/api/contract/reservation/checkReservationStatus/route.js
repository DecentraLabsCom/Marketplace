import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';

/**
 * API route to check the current status of a reservation on the blockchain
 * Used for detecting and resolving stuck reservations
 */
export async function POST(request) {
    try {
        const { reservationKey } = await request.json();

        if (!reservationKey) {
            return NextResponse.json({ error: 'Missing reservationKey' }, { status: 400 });
        }

        // Get the appropriate chain configuration
        const chain = selectChain();
        const contractAddress = contractAddresses[chain.name.toLowerCase()];

        if (!contractAddress || contractAddress === "0x...") {
            return NextResponse.json({ 
                error: `Contract not deployed on ${chain.name}` 
            }, { status: 400 });
        }

        // Set up provider and contract
        const provider = new ethers.JsonRpcProvider(chain.rpcUrls.default.http[0]);
        const contract = new ethers.Contract(contractAddress, contractABI, provider);

        // Check reservation status on blockchain
        try {
            // Try to get reservation details
            const reservation = await contract.getReservation(reservationKey);
            
            if (reservation && reservation.length >= 6) {
                const [labId, renter, start, end, status, cost] = reservation;
                
                // Convert status to readable format
                let statusText;
                switch (status.toString()) {
                    case '0': statusText = 'pending'; break;
                    case '1': statusText = 'confirmed'; break;
                    case '2': statusText = 'active'; break;
                    case '3': statusText = 'completed'; break;
                    case '4': statusText = 'cancelled'; break;
                    default: statusText = 'unknown'; break;
                }

                return NextResponse.json({
                    reservationKey,
                    status: statusText,
                    details: {
                        labId: labId.toString(),
                        renter: renter.toString(),
                        start: start.toString(),
                        end: end.toString(),
                        cost: cost.toString()
                    }
                });
            } else {
                // Reservation not found or invalid
                return NextResponse.json({
                    reservationKey,
                    status: 'not_found',
                    error: 'Reservation not found on blockchain'
                });
            }
        } catch (contractError) {
            // If getReservation fails, the reservation might not exist
            if (contractError.message?.includes('revert') || contractError.message?.includes('invalid')) {
                return NextResponse.json({
                    reservationKey,
                    status: 'not_found',
                    error: 'Reservation does not exist'
                });
            }
            throw contractError;
        }
    } catch (error) {
        console.error('Error checking reservation status:', error);
        return NextResponse.json({
            error: 'Failed to check reservation status',
            details: error.message
        }, { status: 500 });
    }
}
