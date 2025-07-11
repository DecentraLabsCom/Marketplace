import { getContractInstance } from './contractInstance';

class ReservationEventManager {
  constructor() {
    this.isListening = false;
    this.contract = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async startListener() {
    if (this.isListening) {
      console.log('Event listener already running');
      return;
    }

    try {
      this.contract = await getContractInstance();
      console.log('Starting ReservationRequested event listener...');

      // Listen for ReservationRequested events
      this.contract.on('ReservationRequested', this.handleReservationRequested.bind(this));
      
      // Listen for connection errors
      this.contract.provider.on('error', this.handleProviderError.bind(this));
      
      this.isListening = true;
      this.retryCount = 0;
      console.log('ReservationRequested event listener started successfully');
      
    } catch (error) {
      console.error('Error starting event listener:', error);
      await this.handleReconnect();
    }
  }

  async stopListener() {
    if (!this.isListening || !this.contract) {
      console.log('Event listener not running');
      return;
    }

    try {
      this.contract.off('ReservationRequested');
      this.contract.provider.off('error');
      this.isListening = false;
      this.contract = null;
      console.log('ReservationRequested event listener stopped');
    } catch (error) {
      console.error('Error stopping event listener:', error);
    }
  }

  async handleReservationRequested(reservationKey, labId, user, start, end, event) {
    console.log('ReservationRequested event received:', {
      reservationKey: reservationKey,
      labId: labId.toString(),
      user: user,
      start: start.toString(),
      end: end.toString(),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash
    });

    try {
      // Process the reservation request
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        
      const response = await fetch(`${baseUrl}/api/contract/reservation/processReservationRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationKey: reservationKey,
          labId: labId.toString(),
          start: start.toString(),
          end: end.toString()
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Reservation processing result:', result);

    } catch (error) {
      console.error('Error processing reservation request:', error);
      
      // Try to deny the reservation if processing failed
      try {
        const tx = await this.contract.denyReservationRequest(reservationKey);
        await tx.wait();
        console.log('Reservation denied due to processing error');
      } catch (denyError) {
        console.error('Failed to deny reservation after processing error:', denyError);
      }
    }
  }

  async handleProviderError(error) {
    console.error('Provider error:', error);
    this.isListening = false;
    
    // Attempt to reconnect
    await this.handleReconnect();
  }

  async handleReconnect() {
    if (this.retryCount >= this.maxRetries) {
      console.error('Max retry attempts reached. Event listener disabled.');
      return;
    }

    this.retryCount++;
    console.log(`Attempting to reconnect event listener (attempt ${this.retryCount}/${this.maxRetries})...`);
    
    setTimeout(async () => {
      try {
        await this.stopListener();
        await this.startListener();
      } catch (error) {
        console.error('Reconnection failed:', error);
        await this.handleReconnect();
      }
    }, this.retryDelay * this.retryCount); // Exponential backoff
  }

  getStatus() {
    return {
      isListening: this.isListening,
      retryCount: this.retryCount,
      hasContract: !!this.contract
    };
  }
}

// Create a singleton instance
const eventManager = new ReservationEventManager();

export default eventManager;
