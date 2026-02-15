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

/**
 * Provider dashboard page component
 * Displays provider's labs, reservations calendar, and provides lab management tools
 * @returns {JSX.Element} Complete provider dashboard with access control, lab list, calendar, and management actions
 */
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

  const providerOwnerAddress = useMemo(
    () => (isSSO ? institutionRegistrationWallet : address),
    [isSSO, institutionRegistrationWallet, address]
  );

  // 🚀 React Query for labs owned by this provider - with safe defaults
  const allLabsResult = useLabsForProvider(providerOwnerAddress, { 
    enabled: !!providerOwnerAddress && !isLoading && !isProviderLoading
  });
  
  // Safe destructuring with guaranteed defaults to prevent Rules of Hooks violations
  const allLabsData = allLabsResult?.data || null;
  const loading = allLabsResult?.isLoading || false;
  const labsError = allLabsResult?.isError || false;
  const labsErrorDetails = allLabsResult?.error || null;
  
  const labs = Array.isArray(allLabsData?.labs) ? allLabsData.labs : [];
  
  // Extract owned labs - already filtered by useLabsForProvider
  const ownedLabs = useMemo(() => {
    if (!allLabsData || !Array.isArray(allLabsData.labs)) {
      return [];
    }
    return allLabsData.labs;
  }, [allLabsData]);

  // Legacy compatibility - derive ownedLabIds from owned labs
  const ownedLabIds = useMemo(() => 
    ownedLabs.map(lab => lab.id || lab.tokenId).filter(Boolean), 
    [ownedLabs]
  );

  const { addTemporaryNotification, addNotification, removeNotification } = useNotifications();
  const { setOptimisticListingState, completeOptimisticListingState, clearOptimisticListingState, setOptimisticLabState, clearOptimisticLabState } = useOptimisticUI();
  const { decimals } = useLabToken();

  // 🚀 React Query mutations for lab management
  const queryClient = globalQueryClient || null;

  const addLabMutation = useAddLab();
  const updateLabMutation = useUpdateLab();
  const deleteLabMutation = useDeleteLab();
  const listLabMutation = useListLab();
  const unlistLabMutation = useUnlistLab();
  
  // 🚀 React Query mutations for requesting funds (claiming $LAB tokens)
  const requestFundsMutation = useRequestFunds();
  
  // 🚀 React Query mutations for provider data management
  const saveLabDataMutation = useSaveLabData();
  const deleteLabDataMutation = useDeleteLabData();
  const moveFilesMutation = useMoveFiles();
  
  // Local lab manager hook (extracted for readability & testability)
  const {
    selectedLabId,
    setSelectedLabId,
    selectedLab,
    maxId,
    isModalOpen,
    setIsModalOpen,
    isCreatingLab,
    newLab,
    setNewLab,
    modalLab,
    shouldShowModal,
    labForModal,
    handleSaveLab,
    handleDeleteLab,
    handleList,
    handleUnlist,
    handleCollectAll,
    handleSelectChange,
    handleCloseModal,
    formatErrorMessage,
  } = useProviderLabsManager({ ownedLabs, providerOwnerAddress, isSSO, user, address, institutionBackendUrl, decimals });

  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);

  // Staking summary (used in compact card)
  const { data: stakeInfo } = useStakeInfo(providerOwnerAddress, { enabled: !!providerOwnerAddress && !isSSO });

  // React Query for lab bookings with user details (uses selectedLab from hook)
  const canFetchLabBookings = Boolean(selectedLab?.id && (isSSO || hasWalletSession));
  const { data: labBookingsData, isError: bookingsError } = useLabBookingsDashboard(selectedLab?.id, { queryOptions: { enabled: canFetchLabBookings } });
  const labBookings = labBookingsData?.bookings || [];

  const bookingInfo = useMemo(() => {
    if (!selectedLab || !labBookings || bookingsError) return [];
    return mapBookingsForCalendar(labBookings, { labName: selectedLab.name });
  }, [selectedLab, labBookings, bookingsError]);

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // Redirect non-providers to home page for wallet users
  useEffect(() => {
    // Only redirect after loading is complete to avoid false redirects
    if (!isLoading && !isProviderLoading && address && !isProvider && !isSSO) {
      router.push('/');
      return;
    }
  }, [isProvider, isProviderLoading, isLoading, address, isSSO, router]);

  

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <AccessControl requireProvider message="Please log in to manage your labs.">
        <Container className="mt-12" padding="sm">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
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
      </AccessControl>
    );
  }

  return (
    <AccessControl requireProvider message="Please log in to manage your labs.">{" "}
      <Container padding="sm">
        {/* Dashboard header */}
        <DashboardHeader title="Lab Panel" />

        <div className="flex flex-col min-[1080px]:flex-row min-[1080px]:gap-6">
          {/* Provider labs management */}
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
            {/* Reservations calendar */}
            <ReservationsCalendar
              selectedDate={date}
              onDateChange={(newDate) => setDate(newDate)}
              bookingInfo={bookingInfo}
              minDate={today}
            />

            {/* Provider actions */}
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

        {/* Staking & Economics — compact + modal (wallet users only) */}
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

        <LabModal isOpen={shouldShowModal} onClose={handleCloseModal} onSubmit={handleSaveLab}
          lab={labForModal} maxId={maxId} key={labForModal?.id || 'new'} />
      </Container>
    </AccessControl>
  );
}
