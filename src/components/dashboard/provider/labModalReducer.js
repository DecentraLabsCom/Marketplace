import { getResourceType } from '@/utils/resourceType'

export const initialState = (lab) => ({
  activeTab: 'full',
  imageInputType: 'link',
  docInputType: 'link',
  localImages: [],
  localDocs: [],
  imageUrls: [],
  docUrls: [],
  localLab: { 
    // Ensure all form fields have default values to prevent uncontrolled -> controlled warnings
    id: lab?.id || null,
    name: lab?.name || '',
    category: lab?.category || '',
    keywords: lab?.keywords || [],
    description: lab?.description || '',
    price: lab?.price || '',
    auth: lab?.auth || '',
    accessURI: lab?.accessURI || '',
    accessKey: lab?.accessKey || '',
    timeSlots: lab?.timeSlots || [],
    opens: lab?.opens ?? null,
    closes: lab?.closes ?? null,
    images: lab?.images || [],
    docs: lab?.docs || [],
    uri: lab?.uri || '',
    availableDays: lab?.availableDays || [],
    availableHours: lab?.availableHours || { start: '', end: '' },
    timezone: lab?.timezone || '',
    maxConcurrentUsers: lab?.maxConcurrentUsers || 1,
    fmuFileName: lab?.fmuFileName || '',
    fmiVersion: lab?.fmiVersion || '',
    simulationType: lab?.simulationType || '',
    modelVariables: lab?.modelVariables || [],
    defaultStartTime: lab?.defaultStartTime ?? null,
    defaultStopTime: lab?.defaultStopTime ?? null,
    defaultStepSize: lab?.defaultStepSize ?? null,
    unavailableWindows: lab?.unavailableWindows || [],
    termsOfUse: lab?.termsOfUse || {
      url: '',
      version: '',
      effectiveDate: null,
      sha256: ''
    },
    // Spread the rest of the lab properties after ensuring required fields have defaults
    ...lab,
    // Always normalize to canonical string values ('lab' | 'fmu')
    resourceType: getResourceType(lab),
  },
  isExternalURI: false,
  errors: {},
  isLocalURI: false,
  clickedToEditUri: false,
});

export function extractInternalLabUri(uri) {
  if (!uri) return null;
  const trimmed = String(uri).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('Lab-') && trimmed.endsWith('.json')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const param = parsed.searchParams.get('uri');
    if (param && param.startsWith('Lab-') && param.endsWith('.json')) {
      return param;
    }
    const match = parsed.pathname.match(/Lab-[^/]+-\d+\.json$/);
    if (match) {
      return match[0];
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null;
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'MERGE_LOCAL_LAB':
      return { ...state, localLab: { ...state.localLab, ...action.value } };
    case 'BATCH_UPDATE':
      // Handle multiple updates in a single render cycle
      return action.updates.reduce((currentState, update) => {
        switch (update.type) {
          case 'SET_FIELD':
            return { ...currentState, [update.field]: update.value };
          case 'MERGE_LOCAL_LAB':
            return { ...currentState, localLab: { ...currentState.localLab, ...update.value } };
          default:
            return currentState;
        }
      }, state);
    case 'RESET':
      return initialState(action.lab);
    default:
      return state;
  }
}
