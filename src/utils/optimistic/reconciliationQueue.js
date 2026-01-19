const STORAGE_KEY = 'decentralabs-reconcile-queue';

export const RECONCILIATION_SCHEDULE_MS = [10_000, 20_000, 40_000, 60_000];
export const RECONCILIATION_DEFAULTS = {
  checkIntervalMs: 5_000,
};

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeQueryKeys = (rawKeys) => {
  const normalized = [];

  if (Array.isArray(rawKeys)) {
    rawKeys.forEach((item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        normalized.push({ queryKey: item, exact: true });
        return;
      }
      if (Array.isArray(item.queryKey)) {
        normalized.push({ queryKey: item.queryKey, exact: item.exact ?? true });
      }
    });
  } else if (rawKeys && Array.isArray(rawKeys.queryKey)) {
    normalized.push({ queryKey: rawKeys.queryKey, exact: rawKeys.exact ?? true });
  }

  return normalized;
};

const normalizeEntry = (entry) => {
  if (!entry || !entry.id) return null;
  const queryKeys = normalizeQueryKeys(entry.queryKeys);
  if (!queryKeys.length) return null;
  return {
    ...entry,
    queryKeys,
  };
};

export const readReconciliationQueue = () => {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeEntry).filter(Boolean);
};

export const writeReconciliationQueue = (entries) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries || []));
};

export const buildNextAttemptAt = (createdAt, attemptIndex) => {
  const offset = RECONCILIATION_SCHEDULE_MS[attemptIndex] ?? null;
  if (!offset) return null;
  return createdAt + offset;
};

export const enqueueReconciliationEntry = ({
  id,
  queryKeys,
  expected,
  category,
} = {}) => {
  if (!id || typeof window === 'undefined') return;
  const normalized = normalizeEntry({ id, queryKeys, expected, category });
  if (!normalized) return;
  const now = Date.now();
  const queue = readReconciliationQueue();
  const nextAttemptAt = buildNextAttemptAt(now, 0);
  const updated = queue.filter((entry) => entry.id !== id);
  updated.push({
    ...normalized,
    createdAt: now,
    attemptIndex: 0,
    nextAttemptAt,
  });
  writeReconciliationQueue(updated);
};

export const removeReconciliationEntry = (id) => {
  if (!id || typeof window === 'undefined') return;
  const queue = readReconciliationQueue();
  const updated = queue.filter((entry) => entry.id !== id);
  writeReconciliationQueue(updated);
};

export const updateReconciliationQueue = (entries) => {
  writeReconciliationQueue(entries);
};
