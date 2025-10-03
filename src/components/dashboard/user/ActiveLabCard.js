/**
 * Active lab card component for user dashboard
 * Displays the currently active lab or next upcoming lab booking
 */
import React from 'react';
import Link from 'next/link';
import PropTypes from 'prop-types';
import Carrousel from '@/components/ui/Carrousel';
import LabAccess from '@/components/home/LabAccess';
import devLog from '@/utils/dev/logger';

/**
 * Renders an active or upcoming lab card with details and access
 * @param {Object} props - Component props
 * @param {Object|null} props.lab - Lab object to display
 * @param {Object|null} props.booking - Associated booking object
 * @param {string} props.userAddress - User's wallet address
 * @param {boolean} props.isActive - Whether this is an active booking or upcoming
 * @param {Object} props.bookingTimes - Booking start/end times
 * @param {string} props.bookingTimes.start - Start time formatted as HH:MM
 * @param {string} props.bookingTimes.end - End time formatted as HH:MM
 * @returns {JSX.Element|null} Active lab card component or null if no lab
 */
export default function ActiveLabCard({ 
  lab, 
  booking, 
  userAddress, 
  isActive = false, 
  bookingTimes = { start: null, end: null } 
}) {
  // Debug log to see what lab data is being passed
  devLog.log('🔍 ActiveLabCard received lab data:', {
    lab,
    hasLab: !!lab,
    labImages: lab?.images,
    labDocs: lab?.docs,
    labKeys: lab ? Object.keys(lab) : null
  });

  if (!lab) {
    return (
      <span className="text-gray-300 text-center">
        No upcoming or active lab
      </span>
    );
  }

  // Format date from booking timestamp if available
  const formatBookingDate = (booking) => {
    if (!booking?.start) return '';
    try {
      const startDate = new Date(parseInt(booking.start) * 1000);
      if (isNaN(startDate.getTime())) return '';
      return startDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    } catch (error) {
      return '';
    }
  };

  const formattedDate = formatBookingDate(booking);
  const statusText = isActive ? "Available today" : `Available: ${formattedDate}`;
  const borderClass = isActive ? "border-4 border-brand animate-glow" : "border-2";

  return (
    <div className='flex min-[1280px]:flex-row flex-wrap'>
      <div className='flex flex-col items-center'>
        <div className={`min-[1280px]:w-[320px] w-[305px] group 
          justify-between items-center shadow-md bg-gray-200 
          transition-transform duration-300 
          hover:scale-105 mr-3 mb-4 p-2 h-[320px] rounded-lg flex 
          flex-col ${borderClass}`}>
          
          <div className='rounded-lg h-[150px] w-full mb-4'>
            <Carrousel lab={lab} maxHeight={210} />
          </div>
          
          <span className="text-gray-700 block mt-14">
            {statusText}
          </span>
          
          <div className='text-gray-500 flex flex-col text-xs mr-1 mb-3'>
            <span>Start time: {bookingTimes.start}</span>
            <span>End time: {bookingTimes.end}</span>
          </div>
          
          {isActive && (
            <LabAccess 
              id={lab.id}
              userWallet={userAddress} 
              hasActiveBooking={!!booking} 
              auth={lab.auth} 
            />
          )}
        </div>
      </div>
      
      <div className={`w-full ${lab.docs?.length > 0 ? `` : 'h-[100px]'} 
        min-[1280px]:flex-1 mb-4 flex flex-col justify-center p-2 
        text-center rounded-lg shadow-md bg-gray-300`}>
        
        {lab.docs && lab.docs.length > 0 && (
          <div className="mt-1">
            <iframe 
              src={lab.docs[0]} 
              title="description" 
              height="260px" 
              width="100%" 
              className='rounded-lg' 
            />
          </div>
        )}
        
        {(!lab.docs || lab.docs.length === 0) && (
          <span className="text-gray-700 text-center">
            No documents available
          </span>
        )}
        
        <Link 
          href={`/lab/${lab.id}`} 
          className='px-3 mt-3 py-1 rounded text-sm bg-[#759ca8] hover:bg-[#5f7a91] text-white'
        >
          Explore this lab
        </Link>
      </div>
    </div>
  );
}

ActiveLabCard.propTypes = {
  lab: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    docs: PropTypes.arrayOf(PropTypes.string),
    auth: PropTypes.string
  }),
  booking: PropTypes.shape({
    date: PropTypes.string,
    reservationKey: PropTypes.string,
    start: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    end: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }),
  userAddress: PropTypes.string.isRequired,
  isActive: PropTypes.bool,
  bookingTimes: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string
  })
};
