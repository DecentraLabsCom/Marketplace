/**
 * Example usage of composed hooks
 * This file demonstrates how to use the new composed hooks that replace service orchestration
 */

import React from 'react'
import { 
  useAllLabsComposed, 
  useAllLabsBasic, 
  useAllLabsFull,
  extractLabFromComposed 
} from '@/hooks/lab/useLabs'
import { 
  useAllUsersComposed,
  useProviderStatusComposed,
  extractProviderFromComposed 
} from '@/hooks/user/useUsers'
import { 
  useUserBookingsComposed,
  useLabBookingsComposed,
  useMultiLabBookingsComposed 
} from '@/hooks/booking/useBookingsComposed'

/**
 * Example: Basic Lab List Component
 * Replaces: labServices.getAllLabs() with basic metadata
 */
export const LabListBasic = () => {
  const { data, isLoading, isError, error, meta } = useAllLabsBasic();

  if (isLoading) return <div>Loading labs...</div>;
  if (isError) return <div>Error: {error?.message}</div>;

  return (
    <div>
      <h2>Labs ({data.totalLabs})</h2>
      <p>Decimals: {data.decimals}</p>
      <p>Successful queries: {meta.successfulQueries}/{meta.totalQueries}</p>
      {meta.hasPartialFailures && <p>⚠️ Some data could not be loaded</p>}
      
      {data.labs.map(lab => (
        <div key={lab.tokenId || lab.id}>
          <h3>Lab {lab.tokenId || lab.id}</h3>
          <p>Price: {lab.price}</p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example: Full Lab List with Metadata and Owners
 * Replaces: labServices.getAllLabs({ includeMetadata: true, includeOwners: true })
 */
export const LabListFull = () => {
  const { data, isLoading, meta } = useAllLabsFull();

  if (isLoading) return <div>Loading enriched labs...</div>;

  return (
    <div>
      <h2>Full Lab Details ({data.totalLabs})</h2>
      <p>Status: {meta.successfulQueries} successful, {meta.failedQueries} failed</p>
      
      {data.labs.map(lab => (
        <div key={lab.tokenId || lab.id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
          <h3>{lab.metadata?.name || `Lab ${lab.tokenId || lab.id}`}</h3>
          <p>Owner: {lab.owner || 'Unknown'}</p>
          <p>Description: {lab.metadata?.description || 'No description'}</p>
          <p>Location: {lab.metadata?.location || 'Unknown'}</p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example: Provider Status Component
 * Replaces: userServices.getProviderStatus(address)
 */
export const ProviderStatus = ({ address }) => {
  const { data, isLoading, isError, meta } = useProviderStatusComposed(address);

  if (!address) return <div>No address provided</div>;
  if (isLoading) return <div>Checking provider status...</div>;
  if (isError) return <div>Error checking status</div>;

  return (
    <div>
      <h3>Provider Status</h3>
      <p>Address: {data.address}</p>
      <p>Is Provider: {data.isProvider ? 'Yes' : 'No'}</p>
      <p>Name: {data.name || 'Not available'}</p>
      <p>Status: {data.status}</p>
      
      {meta.hasPartialFailures && (
        <div style={{ background: '#fff3cd', padding: '10px' }}>
          ⚠️ Some information could not be loaded
        </div>
      )}
    </div>
  );
};

/**
 * Example: User Bookings with Lab Details
 * Replaces: bookingServices.getUserBookings(userAddress, { includeLabDetails: true })
 */
export const UserBookingsDashboard = ({ userAddress }) => {
  const { data, isLoading, isError, meta } = useUserBookingsComposed(userAddress, {
    includeLabDetails: true
  });

  if (!userAddress) return <div>Please connect your wallet</div>;
  if (isLoading) return <div>Loading your bookings...</div>;
  if (isError) return <div>Error loading bookings</div>;

  return (
    <div>
      <h2>Your Bookings</h2>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div>Total: {data.totalBookings}</div>
        <div>Active: {data.activeBookings}</div>
        <div>Completed: {data.completedBookings}</div>
        <div>Cancelled: {data.cancelledBookings}</div>
      </div>

      {meta.hasPartialFailures && (
        <div style={{ background: '#fff3cd', padding: '10px', marginBottom: '20px' }}>
          ⚠️ Some booking details could not be loaded
        </div>
      )}

      {data.bookings.map(booking => (
        <div key={booking.reservationKey} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
          <h4>Booking {booking.reservationKey}</h4>
          <p>Status: {booking.status}</p>
          <p>Lab: {booking.labDetails?.name || `Lab ${booking.labId}`}</p>
          <p>Start: {new Date(booking.startTime * 1000).toLocaleString()}</p>
          <p>End: {new Date(booking.endTime * 1000).toLocaleString()}</p>
          {booking.failed && <p style={{ color: 'red' }}>⚠️ {booking.error}</p>}
        </div>
      ))}
    </div>
  );
};

/**
 * Example: Multi-Lab Analytics Dashboard
 * Replaces: bookingServices.getMultiLabBookings(labIds, { includeAnalytics: true })
 */
export const LabAnalyticsDashboard = ({ labIds = [] }) => {
  const { data, isLoading, meta } = useMultiLabBookingsComposed(labIds, {
    includeAnalytics: true
  });

  if (labIds.length === 0) return <div>No labs selected</div>;
  if (isLoading) return <div>Loading analytics...</div>;

  return (
    <div>
      <h2>Lab Analytics Dashboard</h2>
      
      {/* Aggregates */}
      <div style={{ background: '#f8f9fa', padding: '20px', marginBottom: '20px' }}>
        <h3>Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <div>Total Labs: {data.aggregates.totalLabs}</div>
          <div>Total Bookings: {data.aggregates.totalBookings}</div>
          <div>Active: {data.aggregates.totalActiveBookings}</div>
          <div>Upcoming: {data.aggregates.totalUpcomingBookings}</div>
          <div>Completed: {data.aggregates.totalCompletedBookings}</div>
          <div>Avg per Lab: {data.aggregates.averageBookingsPerLab}</div>
        </div>
      </div>

      {/* Analytics */}
      {data.analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div>
            <h4>Busiest Labs</h4>
            {data.analytics.busiestLabs.map(lab => (
              <div key={lab.labId} style={{ padding: '5px', background: '#e7f3ff' }}>
                Lab {lab.labId}: {lab.totalBookings} bookings ({lab.utilizationRate}% utilization)
              </div>
            ))}
          </div>
          
          <div>
            <h4>Quietest Labs</h4>
            {data.analytics.quietestLabs.map(lab => (
              <div key={lab.labId} style={{ padding: '5px', background: '#fff2e7' }}>
                Lab {lab.labId}: {lab.totalBookings} bookings ({lab.utilizationRate}% utilization)
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Information */}
      <div style={{ marginTop: '20px', fontSize: '0.9em', color: '#666' }}>
        <p>Query Status: {meta.successfulQueries} successful, {meta.failedQueries} failed</p>
        {meta.hasPartialFailures && <p style={{ color: 'orange' }}>⚠️ Some data could not be loaded</p>}
      </div>
    </div>
  );
};

/**
 * Example: Cache Extraction Usage
 * Shows how to extract specific data from composed results
 */
export const CacheExtractionExample = () => {
  const allLabsResult = useAllLabsFull();
  const allUsersResult = useAllUsersComposed({ includeProviderData: true });

  // Extract specific lab by ID
  const specificLab = extractLabFromComposed(allLabsResult, '123');

  // Extract specific provider by address
  const specificProvider = extractProviderFromComposed(allUsersResult, '0x123...');

  return (
    <div>
      <h3>Cache Extraction Examples</h3>
      
      {specificLab ? (
        <div>
          <h4>Lab 123 Details</h4>
          <p>Name: {specificLab.metadata?.name}</p>
          <p>Owner: {specificLab.owner}</p>
        </div>
      ) : (
        <p>Lab 123 not found</p>
      )}

      {specificProvider ? (
        <div>
          <h4>Provider Details</h4>
          <p>Address: {specificProvider.address}</p>
          <p>Name: {specificProvider.name}</p>
        </div>
      ) : (
        <p>Provider not found</p>
      )}
    </div>
  );
};

// Migration guide comments for developers:
/*
MIGRATION FROM SERVICES TO COMPOSED HOOKS:

Old Service Call:
const result = await labServices.getAllLabs(true, true);

New Composed Hook:
const { data, isLoading, error, meta } = useAllLabsFull();

Key Benefits:
1. ✅ React Query caching, retry, and error handling maintained
2. ✅ Real-time reactivity and automatic refetching
3. ✅ Granular loading states and error handling
4. ✅ Progressive loading with partial failure handling
5. ✅ Cache extraction helpers for component optimization
6. ✅ TypeScript support and better developer experience

Migration Steps:
1. Replace service calls with corresponding composed hooks
2. Handle loading states with isLoading
3. Handle errors with isError and error
4. Access comprehensive status with meta object
5. Use cache extraction helpers for specific data needs
*/
