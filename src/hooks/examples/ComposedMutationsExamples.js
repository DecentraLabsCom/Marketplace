/**
 * Composed Mutations Usage Examples
 * 
 * This file demonstrates how to use composed mutations in React components
 * for complex workflows that involve multiple operations, state management,
 * and error handling with rollback capabilities.
 * 
 * @file ComposedMutationsExamples.js
 */

import React, { useState } from 'react';
import { 
  useCreateLabComposed,
  useUpdateLabComposed,
  useCreateBookingComposed,
  useCancelBookingComposed,
  useProviderRegistrationComposed
} from '@/utils/mutations';
import { useNotifications } from '@/context/NotificationContext';
import devLog from '@/utils/dev/logger';

/**
 * Example: Lab Creation with Image Upload and Metadata
 * 
 * This component demonstrates how to use the composed lab creation mutation
 * that handles image uploads, metadata creation, and blockchain operations
 * as a single atomic operation with rollback support.
 */
export function CreateLabExample() {
  const [labData, setLabData] = useState({
    name: '',
    description: '',
    category: '',
    price: 0,
    images: []
  });

  const createLabComposed = useCreateLabComposed({
    onSuccess: (result) => {
      devLog.log('🎉 Lab creation completed:', result);
      
      // The mutation automatically handles:
      // - Image uploads in parallel
      // - Metadata creation and storage
      // - Blockchain NFT creation
      // - Cache invalidation
      // - Success notifications
      
      // You can add custom success logic here
      setLabData({ name: '', description: '', category: '', price: 0, images: [] });
    },
    onError: (error) => {
      devLog.error('❌ Lab creation failed:', error);
      
      // The mutation automatically handles:
      // - Rollback of uploaded images
      // - Cleanup of created metadata
      // - Cache state restoration
      // - Error notifications
      
      // You can add custom error handling here
      console.log('Error details:', error.rollbackResults);
    }
  });

  const handleCreateLab = async () => {
    try {
      const result = await createLabComposed.mutateAsync({
        name: labData.name,
        description: labData.description,
        category: labData.category,
        price: parseFloat(labData.price),
        provider: 'EXAMPLE-PROVIDER',
        keywords: ['example', 'demo'],
        images: labData.images // File objects from input
      });
      
      devLog.log('Lab created successfully:', result);
    } catch (error) {
      // Error is already handled by the mutation's onError callback
      devLog.error('Create lab mutation failed:', error);
    }
  };

  return (
    <div className="p-6 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Create Lab (Composed Mutation)</h3>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Lab Name"
          value={labData.name}
          onChange={(e) => setLabData(prev => ({ ...prev, name: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <textarea
          placeholder="Description"
          value={labData.description}
          onChange={(e) => setLabData(prev => ({ ...prev, description: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="number"
          placeholder="Price"
          value={labData.price}
          onChange={(e) => setLabData(prev => ({ ...prev, price: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setLabData(prev => ({ ...prev, images: Array.from(e.target.files) }))}
          className="w-full p-2 border rounded"
        />
        
        <button
          onClick={handleCreateLab}
          disabled={createLabComposed.isPending}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {createLabComposed.isPending ? 'Creating Lab...' : 'Create Lab'}
        </button>
        
        {/* Progress indicator for composed mutation */}
        {createLabComposed.isPending && (
          <div className="text-sm text-gray-600">
            <div>Status: {createLabComposed.data?.currentStep || 'Starting...'}</div>
            <div>Completed Steps: {createLabComposed.data?.completedSteps?.length || 0}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Example: Booking Creation with Validation and Payment
 * 
 * This component shows how to use the composed booking mutation that handles
 * availability checking, payment processing, and notification sending.
 */
export function CreateBookingExample({ labId, labName, requiredAmount }) {
  const [bookingData, setBookingData] = useState({
    startTime: '',
    endTime: '',
    timeslot: 1
  });

  const createBookingComposed = useCreateBookingComposed({
    onSuccess: (result) => {
      devLog.log('🎉 Booking created successfully:', result);
      
      // The mutation automatically handled:
      // - Funds validation and requesting
      // - Availability checking
      // - Optimistic UI updates
      // - Blockchain booking creation
      // - Notifications to user and provider
      // - Cache invalidation
      
      // Navigate to booking confirmation page
      // router.push(`/booking/confirmation/${result.results[3].reservationKey}`);
    },
    onError: (error) => {
      devLog.error('❌ Booking creation failed:', error);
      
      // The mutation automatically handled:
      // - Rollback of optimistic updates
      // - Cleanup of any partial operations
      // - Error notifications to user
    }
  });

  const handleCreateBooking = async () => {
    if (!bookingData.startTime) {
      alert('Please select a start time');
      return;
    }

    try {
      const result = await createBookingComposed.mutateAsync({
        labId,
        labName,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        timeslot: bookingData.timeslot,
        requiredAmount,
        providerEmail: 'provider@example.com', // Would come from lab data
        userEmail: 'user@example.com' // Would come from user context
      });

      devLog.log('Booking created with reservation key:', result.results[3].reservationKey);
    } catch (error) {
      devLog.error('Booking mutation failed:', error);
    }
  };

  return (
    <div className="p-6 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Book Lab: {labName}</h3>
      
      <div className="space-y-4">
        <input
          type="datetime-local"
          value={bookingData.startTime}
          onChange={(e) => setBookingData(prev => ({ ...prev, startTime: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="number"
          placeholder="Duration (hours)"
          min="1"
          max="24"
          value={bookingData.timeslot}
          onChange={(e) => setBookingData(prev => ({ ...prev, timeslot: parseInt(e.target.value) }))}
          className="w-full p-2 border rounded"
        />
        
        <div className="text-sm text-gray-600">
          Booking Cost: {requiredAmount} LAB tokens
        </div>
        
        <button
          onClick={handleCreateBooking}
          disabled={createBookingComposed.isPending}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          {createBookingComposed.isPending ? 'Processing Booking...' : 'Book Lab'}
        </button>
        
        {/* Real-time progress updates */}
        {createBookingComposed.isPending && createBookingComposed.data && (
          <div className="text-sm bg-blue-50 p-3 rounded">
            <div className="font-medium">Booking Progress:</div>
            {createBookingComposed.data.completedSteps?.map((step, index) => (
              <div key={index} className="text-green-600">✅ {step.step}</div>
            ))}
            <div className="text-blue-600">⏳ Processing...</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Example: Provider Registration Workflow
 * 
 * This demonstrates the complete provider registration process including
 * validation, storage, blockchain operations, and onboarding.
 */
export function ProviderRegistrationExample() {
  const [registrationData, setRegistrationData] = useState({
    name: '',
    email: '',
    organization: '',
    country: '',
    termsAccepted: false
  });

  const providerRegistrationComposed = useProviderRegistrationComposed({
    onSuccess: (result) => {
      devLog.log('🎉 Provider registration completed:', result);
      
      // The mutation handled:
      // - Data validation
      // - Pending registration storage
      // - Blockchain provider addition
      // - Status updates and cache coordination
      // - Welcome notifications and onboarding
      
      const { addedToBlockchain } = result.results[2] || {};
      
      if (addedToBlockchain) {
        // Redirect to provider dashboard for active providers
        // router.push('/providerdashboard?welcome=true');
      } else {
        // Show pending approval message
        // router.push('/registration/pending');
      }
    },
    onError: (error) => {
      devLog.error('❌ Provider registration failed:', error);
      
      // The mutation handled all rollback operations:
      // - Cleanup of partial registrations
      // - Cache state restoration
      // - User feedback via notifications
    }
  });

  const handleRegister = async () => {
    try {
      const result = await providerRegistrationComposed.mutateAsync({
        ...registrationData,
        autoApprove: false // Set to true for wallet users, false for SSO
      });

      devLog.log('Registration process completed:', result);
    } catch (error) {
      devLog.error('Registration mutation failed:', error);
    }
  };

  return (
    <div className="p-6 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Become a Provider</h3>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Full Name"
          value={registrationData.name}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, name: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="email"
          placeholder="Email Address"
          value={registrationData.email}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, email: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="text"
          placeholder="Organization"
          value={registrationData.organization}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, organization: e.target.value }))}
          className="w-full p-2 border rounded"
        />
        
        <select
          value={registrationData.country}
          onChange={(e) => setRegistrationData(prev => ({ ...prev, country: e.target.value }))}
          className="w-full p-2 border rounded"
        >
          <option value="">Select Country</option>
          <option value="US">United States</option>
          <option value="ES">Spain</option>
          <option value="UK">United Kingdom</option>
          <option value="DE">Germany</option>
        </select>
        
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={registrationData.termsAccepted}
            onChange={(e) => setRegistrationData(prev => ({ ...prev, termsAccepted: e.target.checked }))}
            className="mr-2"
          />
          I accept the terms and conditions
        </label>
        
        <button
          onClick={handleRegister}
          disabled={providerRegistrationComposed.isPending || !registrationData.termsAccepted}
          className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
        >
          {providerRegistrationComposed.isPending ? 'Registering...' : 'Register as Provider'}
        </button>
        
        {/* Detailed progress tracking */}
        {providerRegistrationComposed.isPending && (
          <div className="bg-purple-50 p-4 rounded">
            <div className="font-medium mb-2">Registration Progress:</div>
            <div className="space-y-1 text-sm">
              {providerRegistrationComposed.data?.completedSteps?.map((step, index) => (
                <div key={index} className="text-green-600 flex items-center">
                  <span className="mr-2">✅</span>
                  <span className="capitalize">{step.step.replace('-', ' ')}</span>
                </div>
              ))}
              <div className="text-blue-600 flex items-center">
                <span className="mr-2">⏳</span>
                <span>Processing next step...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Example: Booking Cancellation with Refund Processing
 */
export function CancelBookingExample({ reservationKey, bookingData }) {
  const { addNotification } = useNotifications();
  
  const cancelBookingComposed = useCancelBookingComposed({
    onSuccess: (result) => {
      const { refundPercentage } = result.results[0];
      
      addNotification?.({
        type: 'success',
        title: 'Booking Cancelled',
        message: `Booking cancelled successfully. ${refundPercentage.toFixed(0)}% refund applied.`,
        duration: 5000
      });
      
      // Redirect back to bookings list
      // router.push('/userdashboard?tab=bookings');
    }
  });

  const handleCancelBooking = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this booking? Cancellation policies may apply.'
    );
    
    if (!confirmed) return;

    try {
      await cancelBookingComposed.mutateAsync({
        reservationKey,
        bookingData,
        providerEmail: bookingData.providerEmail // For notifications
      });
    } catch (error) {
      devLog.error('Cancel booking failed:', error);
    }
  };

  return (
    <div className="p-4 border border-red-200 rounded-lg">
      <h4 className="font-medium text-red-800 mb-2">Cancel Booking</h4>
      <p className="text-sm text-red-600 mb-3">
        Cancellation policies apply. Refund amount depends on how far in advance you cancel.
      </p>
      
      <button
        onClick={handleCancelBooking}
        disabled={cancelBookingComposed.isPending}
        className="px-3 py-2 bg-red-500 text-white text-sm rounded disabled:opacity-50"
      >
        {cancelBookingComposed.isPending ? 'Cancelling...' : 'Cancel Booking'}
      </button>
      
      {cancelBookingComposed.isPending && (
        <div className="mt-2 text-sm text-gray-600">
          Processing cancellation and refund...
        </div>
      )}
    </div>
  );
}

/**
 * Demo Component - Showcases all composed mutations
 */
export default function ComposedMutationsDemo() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h2 className="text-2xl font-bold mb-6">Composed Mutations Examples</h2>
      
      <CreateLabExample />
      
      <CreateBookingExample 
        labId="123" 
        labName="Advanced Physics Lab" 
        requiredAmount={50}
      />
      
      <ProviderRegistrationExample />
      
      <CancelBookingExample 
        reservationKey="example-key-123"
        bookingData={{
          labId: "123",
          userAddress: "0x123...",
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: "confirmed",
          providerEmail: "provider@example.com"
        }}
      />
      
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium mb-2">Key Benefits Demonstrated:</h3>
        <ul className="text-sm space-y-1 text-blue-800">
          <li>• Atomic operations with automatic rollback</li>
          <li>• Real-time progress tracking</li>
          <li>• Optimistic UI updates</li>
          <li>• Coordinated cache management</li>
          <li>• Comprehensive error handling</li>
          <li>• User-friendly notifications</li>
          <li>• Step-by-step workflow execution</li>
          <li>• Parallel operation optimization</li>
        </ul>
      </div>
    </div>
  );
}
