"use client"
import { createContext, useContext, useEffect } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "./LabContext";
import { contractABI, contractAddresses } from '../contracts/diamond';
import { selectChain } from '../utils/selectChain';
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

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabAdded',
        listener(log) {
            const newLab = {...log.args};
            console.log('New Lab Added:', newLab);
            console.log('Current Labs:', labs);
            setLabs(prevLabs =>
                prevLabs.map(lab =>
                    lab.provider === newLab._provider &&
                    lab.uri === newLab._uri &&
                    lab.accessURI === newLab._accessURI &&
                    lab.accessKey === newLab._accessKey
                        ? { ...lab, labId: toIdString(newLab._labId) }
                        : lab
                )
            );
            console.log('Updated Labs:', labs);
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        listener(log) {
            const deletedLabId = toIdString(log.args._labId);
            console.log('Lab Deleted:', deletedLabId);
            console.log('Current Labs:', labs);
            setLabs(prevLabs => prevLabs.filter(lab => toIdString(lab.labId) !== deletedLabId));
            console.log('Updated Labs:', labs);
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUpdated',
        listener(log) {
            const updatedLab = { ...log.args };
            setLabs(prevLabs =>
                prevLabs.map(lab =>
                    toIdString(lab.labId) === toIdString(updatedLab._labId)
                        ? { ...lab, ...updatedLab }
                        : lab
                )
            );
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationAdded',
        listener(log) {
            const newReservation = { ...log.args };
            setLabs(prevLabs => {
                const lab = prevLabs.find(
                    lab => toIdString(lab.labId) === toIdString(newReservation._labId)
                );
                if (lab) {
                    lab.reservations = [...(lab.reservations || []), newReservation];
                }
                return [...prevLabs];
            });
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationDeleted',
        listener(log) {
            const deletedReservationId = log.args._reservationId?.toString?.() ?? log.args.reservationId;
            setLabs(prevLabs => {
                const lab = prevLabs.find(
                    lab => toIdString(lab.labId) === toIdString(log.args._labId ?? log.args.labId)
                );
                if (lab) {
                    lab.reservations = (lab.reservations || []).filter(
                        reservation => toIdString(reservation.id) !== deletedReservationId
                    );
                }
                return [...prevLabs];
            });
        },
    });

    return (
        <LabEventContext.Provider value={{}}>
          {children}
        </LabEventContext.Provider>
    );
}

export function useLabEvents() {
    return useContext(LabEventContext);
}