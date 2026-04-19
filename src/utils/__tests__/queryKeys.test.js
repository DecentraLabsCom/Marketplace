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
      expect(bookingQueryKeys.byLabPrefix()).toEqual(['bookings', 'lab']);
      expect(bookingQueryKeys.byLab('123')).toEqual(['bookings', 'lab', '123']);
      expect(bookingQueryKeys.byReservationKey('key123')).toEqual(['bookings', 'reservation', 'key123']);
      expect(bookingQueryKeys.labComposed('123')).toEqual(['bookings', 'lab-composed', '123', true]);
      expect(bookingQueryKeys.multiLab(['1', '2'])).toEqual(['bookings', 'multi-lab', ['1', '2'], false]);
      expect(bookingQueryKeys.getReservationsOfToken('123')).toEqual(['bookings', 'reservationsOfToken', '123']);
      expect(bookingQueryKeys.reservationOfTokenRoot()).toEqual(['bookings', 'reservationOfToken']);
      expect(bookingQueryKeys.reservationOfTokenPrefix('123')).toEqual(['bookings', 'reservationOfToken', '123']);
      expect(bookingQueryKeys.getReservationOfTokenByIndex('123', 5)).toEqual(['bookings', 'reservationOfToken', '123', 5]);
      expect(bookingQueryKeys.ssoReservationsOf()).toEqual(['bookings', 'sso', 'reservationsOf']);
      expect(bookingQueryKeys.ssoReservationKeyOfUserPrefix()).toEqual(['bookings', 'sso', 'reservationKeyOfUser']);
      expect(bookingQueryKeys.userOfReservation('key123')).toEqual(['bookings', 'userOfReservation', 'key123']);
      expect(bookingQueryKeys.checkAvailable('123', 1000, 3600)).toEqual(['bookings', 'checkAvailable', '123', 1000, 3600]);
      expect(bookingQueryKeys.ssoHasActiveBookingSession()).toEqual(['bookings', 'sso', 'hasActiveBooking', 'session']);
      expect(bookingQueryKeys.ssoActiveReservationKeySession('123')).toEqual(['bookings', 'sso', 'activeReservationKey', '123']);
      expect(bookingQueryKeys.labCreditAddress()).toEqual(['bookings', 'labCreditAddress']);
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
        } else if (keyFn.name === 'labComposed') {
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
      expect(bookingQueryKeys.byLab('123')).toEqual(['bookings', 'lab', '123']);
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
          } else if (keyFn.name === 'labComposed') {
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
