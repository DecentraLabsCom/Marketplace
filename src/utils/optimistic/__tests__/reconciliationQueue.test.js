import {
  RECONCILIATION_SCHEDULE_MS,
  buildNextAttemptAt,
  enqueueReconciliationEntry,
  readReconciliationQueue,
  removeReconciliationEntry,
  updateReconciliationQueue,
} from '@/utils/optimistic/reconciliationQueue';

describe('reconciliationQueue', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  test('buildNextAttemptAt uses the configured schedule', () => {
    const base = 1_000_000;
    RECONCILIATION_SCHEDULE_MS.forEach((offset, index) => {
      expect(buildNextAttemptAt(base, index)).toBe(base + offset);
    });
    expect(buildNextAttemptAt(base, 999)).toBeNull();
  });

  test('enqueueReconciliationEntry stores normalized query keys', () => {
    enqueueReconciliationEntry({
      id: 'booking:rk-1',
      category: 'booking',
      queryKeys: [
        ['bookings', 'reservation', 'rk-1'],
        { queryKey: ['bookings', 'reservationOfToken', '1'], exact: false },
        null,
      ],
    });

    const entries = readReconciliationQueue();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('booking:rk-1');
    expect(entries[0].queryKeys).toEqual([
      { queryKey: ['bookings', 'reservation', 'rk-1'], exact: true },
      { queryKey: ['bookings', 'reservationOfToken', '1'], exact: false },
    ]);
    expect(entries[0].attemptIndex).toBe(0);
    expect(entries[0].nextAttemptAt).toBeGreaterThan(entries[0].createdAt);
  });

  test('removeReconciliationEntry deletes entries by id', () => {
    updateReconciliationQueue([
      { id: 'a', queryKeys: [{ queryKey: ['labs', 'getLab', '1'], exact: true }] },
      { id: 'b', queryKeys: [{ queryKey: ['labs', 'getLab', '2'], exact: true }] },
    ]);

    removeReconciliationEntry('a');
    const entries = readReconciliationQueue();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('b');
  });
});
