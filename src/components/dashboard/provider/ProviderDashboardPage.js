/**
 * Provider dashboard page component
 * Displays provider's labs, reservations calendar, and provides lab management tools
 * @returns {JSX.Element} Complete provider dashboard
 */
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { parseUnits } from 'viem'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import { globalQueryClient } from '@/context/ClientQueryProvider'
import { 
  useAddLab, 
  useUpdateLab, 
  useDeleteLab,
  useListLab,
  useUnlistLab,
  useLabsForProvider
} from '@/hooks/lab/useLabs'
import { useLabBookingsDashboard } from '@/hooks/booking/useBookings'
import { useRequestFunds } from '@/hooks/booking/useBookings'
import { useSaveLabData, useDeleteLabData, useMoveFiles } from '@/hooks/provider/useProvider'
import { useLabToken } from '@/context/LabTokenContext'
import useProviderLabsManager, { DEFAULT_NEW_LAB } from '@/hooks/provider/useProviderLabsManager'
import LabModal from '@/components/dashboard/provider/LabModal'
import AccessControl from '@/components/auth/AccessControl'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ProviderLabsList from '@/components/dashboard/provider/ProviderLabsList'
import ReservationsCalendar from '@/components/dashboard/provider/ReservationsCalendar'
import ProviderActions from '@/components/dashboard/provider/ProviderActions'
import ProviderStakingPanel from '@/components/dashboard/provider/staking/ProviderStakingPanel'
import PendingPayoutsPanel from '@/components/dashboard/provider/staking/PendingPayoutsPanel'
import ProviderStakingCompactCard from '@/components/dashboard/provider/staking/ProviderStakingCompactCard'
import ProviderStakingModal from '@/components/dashboard/provider/staking/ProviderStakingModal'
import StakeHealthIndicator from '@/components/dashboard/provider/staking/StakeHealthIndicator'
import { useStakeInfo } from '@/hooks/staking/useStakingAtomicQueries'
import { mapBookingsForCalendar } from '@/utils/booking/calendarBooking'
import getBaseUrl from '@/utils/env/baseUrl'
import devLog from '@/utils/dev/logger'
import {
  notifyLabCollected,
  notifyLabCollectFailed,
  notifyLabCollectStarted,
  notifyLabCreateCancelled,
  notifyLabCreated,
  notifyLabCreatedFilesWarning,
  notifyLabCreatedMetadataWarning,
  notifyLabCreateFailed,
  notifyLabDeleted,
  notifyLabDeletedCascadeWarning,
  notifyLabDeleteFailed,
  notifyLabDeleteStarted,
  notifyLabInvalidPrice,
  notifyLabListed,
  notifyLabListingRequested,
  notifyLabListFailed,
  notifyLabMetadataSaveFailed,
  notifyLabMetadataUpdated,
  notifyLabNoChanges,
  notifyLabUnlisted,
  notifyLabUnlistFailed,
  notifyLabUpdated,
  notifyLabUpdateFailed,
  notifyLabUpdateStarted,
} from '@/utils/notifications/labToasts'

import { sanitizeProviderNameForUri, resolveOnchainLabUri } from '@/utils/metadata/helpers'

export default function ProviderDashboard() {
  const {
    address,
    user,
    isSSO,
    isProvider,
    isProviderLoading,
    isLoading,
    hasWalletSession,
    institutionBackendUrl,
    institutionRegistrationWallet
  } = useUser();
  const router = useRouter();
  const hasInitialized = useRef(false); 

  const providerOwnerAddress = useMemo(
    () => (isSSO ? institutionRegistrationWallet : address),
    [isSSO, institutionRegistrationWallet, address]
  );

  const allLabsResult = useLabsForProvider(providerOwnerAddress, { 
    enabled: !!providerOwnerAddress && !isLoading && !isProviderLoading
  });
  
  const allLabsData = allLabsResult?.data || null;
  const loading = allLabsResult?.isLoading || false;
  const labsError = allLabsResult?.isError || false;
  const labsErrorDetails = allLabsResult?.error || null;
  
  const ownedLabs = useMemo(() => {
    if (!allLabsData || !Array.isArray(allLabsData.labs)) return [];
    return allLabsData.labs;
  }, [allLabsData]);

  const { addTemporaryNotification, addNotification } = useNotifications();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, setOptimisticLabState, clearOptimisticLabState } = useOptimisticUI();
  const { decimals } = useLabToken();

  const queryClient = globalQueryClient || null;

  const addLabMutation = useAddLab();
  const updateLabMutation = useUpdateLab();
  const deleteLabMutation = useDeleteLab();
  const listLabMutation = useListLab();
  const unlistLabMutation = useUnlistLab();
  const requestFundsMutation = useRequestFunds();
  const saveLabDataMutation = useSaveLabData();
  const deleteLabDataMutation = useDeleteLabData();
  

  const {
    selectedLabId,
    setSelectedLabId,
    selectedLab,
    maxId,
    isModalOpen,
    setIsModalOpen,
    newLab,
    setNewLab,
    shouldShowModal,
    labForModal,
    handleSaveLab: baseHandleSaveLab,
    handleDeleteLab,
    handleList,
    handleUnlist,
    handleCollectAll,
    handleSelectChange,
    handleCloseModal,
  } = useProviderLabsManager({ ownedLabs, providerOwnerAddress, isSSO, user, address, institutionBackendUrl, decimals });

  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);
  const { data: stakeInfo } = useStakeInfo(providerOwnerAddress, { enabled: !!providerOwnerAddress && !isSSO });

  const canFetchLabBookings = Boolean(selectedLab?.id && (isSSO || hasWalletSession));
  const { data: labBookingsData, isError: bookingsError } = useLabBookingsDashboard(selectedLab?.id, { queryOptions: { enabled: canFetchLabBookings } });
  const labBookings = labBookingsData?.bookings || [];

  const bookingInfo = useMemo(() => {
    if (!selectedLab || !labBookings || bookingsError) return [];
    return mapBookingsForCalendar(labBookings, { labName: selectedLab.name });
  }, [selectedLab, labBookings, bookingsError]);

  const today = new Date();
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    if (!isLoading && !isProviderLoading && address && !isProvider && !isSSO) {
      router.push('/');
    }
  }, [isProvider, isProviderLoading, isLoading, address, isSSO, router]);

  useEffect(() => {
    if (ownedLabs.length > 0 && !selectedLabId && !isModalOpen && !hasInitialized.current) {
      const firstLabId = ownedLabs[0]?.id;
      if (firstLabId) {
        setSelectedLabId(String(firstLabId));
        hasInitialized.current = true;
      }
    }
  }, [ownedLabs.length, selectedLabId, isModalOpen, setSelectedLabId]);
  
  
  const onModalSubmit = async (labData) => {
    const originalPrice = labData.price;
    
    if (labData.price && decimals) {
      try {
        const pricePerHour = parseFloat(labData.price.toString());
        const pricePerSecond = pricePerHour / 3600;
        const priceInTokenUnits = parseUnits(pricePerSecond.toString(), decimals);
        labData = { ...labData, price: priceInTokenUnits.toString() };
      } catch (error) {
        devLog.error('Error converting price:', error);
        notifyLabInvalidPrice(addTemporaryNotification);
        return;
      }
    }
    
    await baseHandleSaveLab(labData, originalPrice);
  };

  if (labsError) {
    return (
      <Container className="mt-12" padding="sm">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto text-center">
          <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Labs</h2>
          <p className="text-red-500 mb-4">
            {labsErrorDetails?.message || 'Failed to load laboratory data'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-700 text-white px-4 py-2 rounded hover:bg-red-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </Container>
    );
  }
  

  return (
    <AccessControl requireProvider message="Please log in to manage your labs.">
      <Container padding="sm">
        <DashboardHeader title="Lab Panel" />

        <div className="flex flex-col min-[1080px]:flex-row min-[1080px]:gap-6">
          <ProviderLabsList
            ownedLabs={ownedLabs}
            selectedLab={selectedLab}
            selectedLabId={selectedLabId}
            isLoading={loading}
            onSelectChange={handleSelectChange}
            onEdit={() => setIsModalOpen(true)}
            onDelete={handleDeleteLab}
            onList={handleList}
            onUnlist={handleUnlist}
          />

          <div className="flex flex-col min-[1080px]:w-1/3 mt-6 min-[1080px]:mt-0">
            <ReservationsCalendar
              selectedDate={date}
              onDateChange={(newDate) => setDate(newDate)}
              bookingInfo={bookingInfo}
              minDate={today}
            />

            <ProviderActions
              isSSO={isSSO}
              onCollectAll={handleCollectAll}
              onAddNewLab={() => {
                setNewLab(DEFAULT_NEW_LAB);
                setSelectedLabId("");
                setIsModalOpen(true);
              }}
            />
          </div>
        </div>

        {!isSSO && (
          <>
            <ProviderStakingCompactCard
              stakeInfo={stakeInfo}
              onManage={() => setIsStakingModalOpen(true)}
            />

            <ProviderStakingModal
              isOpen={isStakingModalOpen}
              onClose={() => setIsStakingModalOpen(false)}
              providerAddress={providerOwnerAddress}
              labs={ownedLabs}
              isSSO={isSSO}
              labCount={ownedLabs.length}
              onNotify={(type, message) => addNotification(type, message)}
              onCollectAll={handleCollectAll}
              isCollecting={requestFundsMutation.isPending}
            />
          </>
        )}

        <LabModal 
          isOpen={shouldShowModal} 
          onClose={handleCloseModal} 
          onSubmit={onModalSubmit} 
          lab={labForModal} 
          maxId={maxId} 
          key={labForModal?.id || 'new'} 
        />
      </Container>
    </AccessControl>
  );
}