import {
  labQueryKeys,
  bookingQueryKeys,
  userQueryKeys,
  providerQueryKeys,
  metadataQueryKeys,
  labImageQueryKeys
} from '../hooks/queryKeys.js';

describe('queryKeys', () => {
  describe('lab', () => {
    test('should have correct lab query keys', () => {
      expect(labQueryKeys.all()).toEqual(['labs']);
      expect(labQueryKeys.list()).toEqual(['labs', 'list']);
      expect(labQueryKeys.byId('123')).toEqual(['labs', 'data', '123']);
      expect(labQueryKeys.owner('123')).toEqual(['labs', 'owner', '123']);
      expect(labQueryKeys.metadata('uri')).toEqual(['labs', 'metadata', 'uri']);
      expect(labQueryKeys.decimals()).toEqual(['labs', 'decimals']);
      expect(labQueryKeys.getAllLabs()).toEqual(['labs', 'getAllLabs']);
      expect(labQueryKeys.getLab('123')).toEqual(['labs', 'getLab', '123']);
      expect(labQueryKeys.balanceOf('0x123')).toEqual(['labs', 'balanceOf', '0x123']);
    });
  });

  describe('booking', () => {
    test('should have correct booking query keys', () => {
      expect(bookingQueryKeys.all()).toEqual(['bookings']);
      expect(bookingQueryKeys.byUser('0x123')).toEqual(['bookings', 'user', '0x123']);
      expect(bookingQueryKeys.byLab('123')).toEqual(['bookings', 'lab', '123']);
      expect(bookingQueryKeys.byReservationKey('key123')).toEqual(['bookings', 'reservation', 'key123']);
      expect(bookingQueryKeys.userComposed('0x123')).toEqual(['bookings', 'user-composed', '0x123', false]);
      expect(bookingQueryKeys.labComposed('123')).toEqual(['bookings', 'lab-composed', '123', true]);
      expect(bookingQueryKeys.multiLab(['1', '2'])).toEqual(['bookings', 'multi-lab', ['1', '2'], false]);
      expect(bookingQueryKeys.userReservationsComplete('0x123', 10)).toEqual(['bookings', 'userReservationsComplete', '0x123', 10]);
      expect(bookingQueryKeys.getReservationsOfToken('123')).toEqual(['bookings', 'reservationsOfToken', '123']);
      expect(bookingQueryKeys.getReservationsOfTokenByUser('123', '0x123')).toEqual(['bookings', 'reservationsOfTokenByUser', '123', '0x123', 0, 50]);
      expect(bookingQueryKeys.getReservationOfTokenByIndex('123', 5)).toEqual(['bookings', 'reservationOfToken', '123', 5]);
      expect(bookingQueryKeys.reservationsOf('0x123')).toEqual(['bookings', 'reservationsOf', '0x123']);
      expect(bookingQueryKeys.reservationKeyOfUserByIndex('0x123', 3)).toEqual(['bookings', 'reservationKeyOfUser', '0x123', 3]);
      expect(bookingQueryKeys.totalReservations()).toEqual(['bookings', 'totalReservations']);
      expect(bookingQueryKeys.userOfReservation('key123')).toEqual(['bookings', 'userOfReservation', 'key123']);
      expect(bookingQueryKeys.checkAvailable('123', 1000, 3600)).toEqual(['bookings', 'checkAvailable', '123', 1000, 3600]);
      expect(bookingQueryKeys.hasActiveBooking('0x123')).toEqual(['bookings', 'hasActiveBooking', '0x123']);
      expect(bookingQueryKeys.hasActiveBookingByToken('123')).toEqual(['bookings', 'hasActiveBookingByToken', '123']);
      expect(bookingQueryKeys.activeReservationKeyForUser('123', '0x123')).toEqual(['bookings', 'activeReservationKey', '123', '0x123']);
      expect(bookingQueryKeys.institutionalHasActiveBooking()).toEqual(['bookings', 'institutional', 'hasActiveBooking', 'session']);
      expect(bookingQueryKeys.institutionalActiveReservationKey('123')).toEqual(['bookings', 'institutional', 'activeReservationKey', '123']);
      expect(bookingQueryKeys.labTokenAddress()).toEqual(['bookings', 'labTokenAddress']);
      expect(bookingQueryKeys.safeBalance('0x123')).toEqual(['bookings', 'safeBalance', '0x123']);
    });
  });

  describe('user', () => {
    test('should have correct user query keys', () => {
      expect(userQueryKeys.all()).toEqual(['users']);
      expect(userQueryKeys.byAddress('0x123')).toEqual(['user', 'profile', '0x123']);
      expect(userQueryKeys.providerStatus('0x123')).toEqual(['provider', 'status', '0x123']);
      expect(userQueryKeys.ssoSession()).toEqual(['auth', 'sso', 'session']);
    });
  });

  describe('provider', () => {
    test('should have correct provider query keys', () => {
      expect(providerQueryKeys.all()).toEqual(['providers']);
      expect(providerQueryKeys.list()).toEqual(['providers', 'list']);
      expect(providerQueryKeys.byAddress('0x123')).toEqual(['provider', 'profile', '0x123']);
      expect(providerQueryKeys.status('test@example.com', true)).toEqual(['provider', 'status', 'test@example.com', true]);
      expect(providerQueryKeys.name('0x123')).toEqual(['provider', 'name', '0x123']);
      expect(providerQueryKeys.getLabProviders()).toEqual(['providers', 'getLabProviders']);
      expect(providerQueryKeys.isLabProvider('0x123')).toEqual(['providers', 'isLabProvider', '0x123']);
    });
  });

  describe('metadata', () => {
    test('should have correct metadata query keys', () => {
      expect(metadataQueryKeys.all()).toEqual(['metadata']);
      expect(metadataQueryKeys.byUri('uri123')).toEqual(['metadata', 'uri123']);
    });
  });

  describe('labImage', () => {
    test('should have correct labImage query keys', () => {
      expect(labImageQueryKeys.all()).toEqual(['labImage']);
      expect(labImageQueryKeys.byUrl('url123')).toEqual(['labImage', 'url123']);
    });
  });

  describe('Key structure validation', () => {
    test('all query keys should be functions that return arrays', () => {
      const allKeys = [
        ...Object.values(labQueryKeys),
        ...Object.values(bookingQueryKeys),
        ...Object.values(userQueryKeys),
        ...Object.values(providerQueryKeys),
        ...Object.values(metadataQueryKeys),
        ...Object.values(labImageQueryKeys),
      ];

      allKeys.forEach(keyFn => {
        expect(typeof keyFn).toBe('function');
        // Test with appropriate parameters based on function signature
        let result;
        if (keyFn.name === 'multiLab') {
          result = keyFn(['1', '2']); // multiLab expects array
        } else if (keyFn.name === 'getReservationsOfTokenByUser') {
          result = keyFn('lab1', 'user1'); // has defaults for offset and limit
        } else if (keyFn.name === 'userComposed' || keyFn.name === 'labComposed') {
          result = keyFn('test'); // has defaults
        } else if (keyFn.name === 'status') {
          result = keyFn('test'); // has defaults
        } else if (keyFn.length === 0) {
          result = keyFn(); // no parameters needed
        } else {
          result = keyFn('test'); // single parameter
        }
        expect(Array.isArray(result)).toBe(true);
      });
    });

    test('query keys should follow hierarchical structure', () => {
      // Test that child keys include parent keys
      expect(labQueryKeys.byId('123')).toEqual(['labs', 'data', '123']);
      expect(bookingQueryKeys.byUser('0x123')).toEqual(['bookings', 'user', '0x123']);
      expect(userQueryKeys.byAddress('0x123')).toEqual(['user', 'profile', '0x123']);
      expect(providerQueryKeys.byAddress('0x123')).toEqual(['provider', 'profile', '0x123']);
      expect(metadataQueryKeys.byUri('uri123')).toEqual(['metadata', 'uri123']);
      expect(labImageQueryKeys.byUrl('url123')).toEqual(['labImage', 'url123']);
    });

    test('query keys should be unique across domains', () => {
      const collectedKeys = new Set();

      const collectKeys = (obj) => {
        Object.values(obj).forEach(keyFn => {
          let result;
          if (keyFn.name === 'multiLab') {
            result = keyFn(['1', '2']);
          } else if (keyFn.name === 'getReservationsOfTokenByUser') {
            result = keyFn('lab1', 'user1');
          } else if (keyFn.name === 'userComposed' || keyFn.name === 'labComposed') {
            result = keyFn('test');
          } else if (keyFn.name === 'status') {
            result = keyFn('test');
          } else if (keyFn.length === 0) {
            result = keyFn();
          } else {
            result = keyFn('test');
          }
          const keyString = result.join('|');
          expect(collectedKeys.has(keyString)).toBe(false);
          collectedKeys.add(keyString);
        });
      };

      collectKeys(labQueryKeys);
      collectKeys(bookingQueryKeys);
      collectKeys(userQueryKeys);
      collectKeys(providerQueryKeys);
      collectKeys(metadataQueryKeys);
      collectKeys(labImageQueryKeys);
    });
  });
});