"use client"
import { createContext, useContext, useEffect, useRef } from "react";
import { usePublicClient } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";

function toIdString(id) {
    if (typeof id === "bigint") return id.toString();
    if (typeof id === "number") return id.toString();
    if (typeof id === "string") return id;
    return String(id);
}

const LabEventContext = createContext();

export function LabEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { labs, setLabs } = useLabs();
    const publicClient = usePublicClient({ chainId: safeChain.id });
    const lastBlockRef = useRef(0);

    useEffect(() => {
        let polling = true;

        async function pollEvents() {
            // Get latest block number
            const latestBlock = await publicClient.getBlockNumber();
            let fromBlock;
            if (lastBlockRef.current && lastBlockRef.current < latestBlock) {
                fromBlock = lastBlockRef.current + 1n;
            } else {
                fromBlock = latestBlock;
            }
            lastBlockRef.current = latestBlock;

            const events = [
                { eventName: 'LabAdded', handler: handleLabAdded },
                { eventName: 'LabDeleted', handler: handleLabDeleted },
                { eventName: 'LabUpdated', handler: handleLabUpdated },
                //{ eventName: 'ReservationAdded', handler: handleReservationAdded },
                //{ eventName: 'ReservationDeleted', handler: handleReservationDeleted },
            ];

            for (const { eventName, handler } of events) {
                const logs = await publicClient.getLogs({
                    address: contractAddress,
                    event: contractABI.find(e => e.type === "event" && e.name === eventName),
                    fromBlock: fromBlock.toString(),
                    toBlock: latestBlock.toString(),
                });
                logs.forEach(log => handler(log.args));
            }
        }

        // Handlers for each event
        function handleLabAdded(args) {
            setLabs(prevLabs =>
                prevLabs.map(lab =>
                    lab.provider === args._provider &&
                    lab.uri === args._uri &&
                    lab.accessURI === args._accessURI &&
                    lab.accessKey === args._accessKey
                        ? { ...lab, labId: toIdString(args._labId) }
                        : lab
                )
            );
        }
        function handleLabDeleted(args) {
            const deletedLabId = toIdString(args._labId);
            setLabs(prev => prev.filter(lab => toIdString(lab.labId) !== deletedLabId));
        }
        function handleLabUpdated(args) {
            setLabs(prev =>
                prev.map(lab =>
                    toIdString(lab.labId) === toIdString(args._labId)
                        ? { ...lab, ...args }
                        : lab
                )
            );
        }
        /*function handleReservationAdded(args) {
            setLabs(prev => {
                const lab = prev.find(lab => toIdString(lab.labId) === toIdString(args._labId));
                if (lab) {
                    const newReservation = { ...args, reservationId: toIdString(args.reservationId ?? args.id) };
                    lab.reservations = [...(lab.reservations || []), newReservation];
                }
                return [...prev];
            });
        }
        function handleReservationDeleted(args) {
            const deletedReservationId = toIdString(args.reservationId);
            setLabs(prev => {
                const lab = prev.find(lab => toIdString(lab.labId) === toIdString(args._labId));
                if (lab) {
                    lab.reservations = (lab.reservations || []).filter(
                        reservation => toIdString(reservation.reservationId ?? reservation.id) !== deletedReservationId
                    );
                }
                return [...prev];
            });
        }*/

        // Poll every 10 seconds
        const interval = setInterval(() => {
            if (polling) pollEvents();
        }, 10000);

        // Initial poll
        pollEvents();

        return () => {
            polling = false;
            clearInterval(interval);
        };
    }, [contractAddress, contractABI, setLabs, publicClient, safeChain.id]);

    return (
        <LabEventContext.Provider value={{}}>
            {children}
        </LabEventContext.Provider>
    );
}

export function useLabEvents() {
    return useContext(LabEventContext);
}