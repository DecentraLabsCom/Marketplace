# DecentraLabs Marketplace - AI Coding Assistant Instructions

## Project Overview
This is a decentralized marketplace for online laboratories built with Next.js 15 + React 18, integrating Ethereum smart contracts (ERC-2535 Diamond pattern with facets for user/provider, ERC-721 labs and ERC-809-based reservations; as well as an ERC-20 token for payments) and supporting dual authentication (crypto wallets + institutional SSO).

## Architecture Patterns

### Data Layer - Hybrid Service Pattern
Services follow a dual-layer architecture for optimal performance (`src/services/`):
```javascript
// ✅ Atomic services (1:1 with endpoints)
export const labServices = {
  async fetchLabList() { /* single endpoint call */ },
  async fetchLabData(id) { /* single endpoint call */ },
  async fetchLabOwner(id) { /* single endpoint call */ }
}

// ✅ Composed services (orchestrate multiple atomic calls)
export const labServices = {
  async fetchAllLabsComposed() { 
    // Orchestrates multiple atomic calls with parallel execution
    // Returns complete, composed lab objects
  }
}

// ❌ Avoid: Mixed business logic
export const labServices = {
  async getLabsWithSomeMetadata() { /* inconsistent composition */ }
}
```

### React Query + Hooks Pattern - Simplified Architecture
The project eliminates complex hook compositions in favor of simple hooks using composed services:

- **Simple hooks with composed services**: Single `useQuery` calls in `src/hooks/*/use*.js`
- **Cache-extracting hooks**: Extract data from shared cache with basic operations
- **Atomic hooks**: Available for specific individual use cases
- Query keys centralized in `src/utils/hooks/queryKeys.js`
- Global cache config in `src/context/ClientQueryProvider.js`

Example structure (new simplified pattern):
```javascript
// ✅ Simple hook using composed service (single HTTP request)
export const useAllLabsQuery = () => useQuery({
  queryKey: ['labs', 'all-composed'],
  queryFn: () => labServices.fetchAllLabsComposed() // Service handles composition
});

// ✅ Cache-extracting hook (simple data extraction)
export const useLabDataQuery = (labId) => {
  const allLabsQuery = useAllLabsQuery(); // Uses shared cache
  return useMemo(() => {
    const lab = allLabsQuery.data?.find(l => l.id === labId); // Simple find operation
    return {
      data: lab,
      isLoading: allLabsQuery.isLoading,
      error: allLabsQuery.error
    };
  }, [allLabsQuery.data, labId]); // Stable dependencies
};

// ✅ Atomic hook (when individual data needed)
export const useLabDataQueryAtomic = (labId) => useQuery({
  queryKey: QUERY_KEYS.LABS.data(labId),
  queryFn: () => labServices.fetchLabData(labId) // Individual service call
});

// ❌ AVOID: Complex hook compositions (cause render loops)
export const useComplexComposition = () => {
  const query1 = useQuery1();
  const query2 = useQuery2();
  const queries = useQueries({ queries: dynamicArray }); // Problematic
  // Complex composition logic here
};
```

### Context Architecture
Multiple specialized contexts in provider hierarchy (`src/app/layout.js`):
1. `ClientWagmiProvider` - Wallet connections
2. `ClientQueryProvider` - React Query setup
3. `UserData` - User state (SSO + wallet)
4. Event contexts: `UserEventProvider`, `LabEventProvider`, `BookingEventProvider`
5. `NotificationProvider` - Global notifications

### Authentication System
Dual-mode authentication handled in `UserContext`:
- **Wallet mode**: Wagmi + wallet connectors
- **SSO mode**: SAML-based institutional login
- Components use `AccessControl` wrapper with `requireWallet`/`requireSSO` props

## API Layer Guidelines

### Route Structure
API routes in `src/app/api/` are atomic by design:
- **Contract endpoints**: `api/contract/lab/getLabList` - Single smart contract call
- **No caching**: Use `Cache-Control: no-cache` (React Query handles client cache)
- **Error handling**: Consistent error formats across endpoints

### Smart Contract Integration
- Contract ABIs and addresses in `src/contracts/diamond.js` and `src/contracts/abis/lab.js`
- Use `getContractInstance()` helper for blockchain calls
- Retry logic with `retryBlockchainRead()` for network reliability

## Component Guidelines

### Component Structure
Follow the existing component organization:
- `src/components/auth/` - Authentication components
- `src/components/booking/` - Lab booking functionality  
- `src/components/dashboard/` - User/provider dashboards
- `src/components/labs/` - Lab display components
- `src/components/layout/` - App layout and navigation
- `src/components/ui/` - Reusable UI components

### PropTypes & JSDoc
All components must include:
```javascript
/**
 * Component description
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.optionalProp] - Optional prop description
 */
export default function Component({ children, optionalProp }) {
  // Implementation
}

Component.propTypes = {
  children: PropTypes.node.isRequired,
  optionalProp: PropTypes.string
}
```

## Development Workflows

### Key Commands
```bash
npm run dev --turbopack   # Development with Turbopack
npm run build             # Production build
npm run lint              # ESLint check
```

### Event Handling
Blockchain events automatically trigger cache invalidation via event contexts. Manual cache invalidation should coordinate with `manualUpdateInProgress` state to prevent conflicts.

### Optimistic Updates
The project implements optimistic UI updates primarily for booking operations to provide immediate user feedback:

- **Booking Creation**: `useCreateBookingMutation` in `src/hooks/booking/useBookings.js` immediately adds bookings to both user and lab caches
- **Booking Cancellation**: `useCancelBookingMutation` immediately removes bookings from relevant caches
- **Manual Cache Updates**: `addOptimisticBooking`/`removeOptimisticBooking` in `src/hooks/user/useUsers.js` for direct cache manipulation

Pattern:
```javascript
onMutate: async (variables) => {
  // 1. Cancel outgoing queries to prevent conflicts
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.BOOKINGS.all });
  
  // 2. Snapshot current data for rollback
  const previousData = queryClient.getQueryData(queryKey);
  
  // 3. Apply optimistic update
  queryClient.setQueryData(queryKey, optimisticData);
  
  return { previousData }; // Return for rollback
},
onError: (err, variables, context) => {
  // Rollback on error
  queryClient.setQueryData(queryKey, context.previousData);
}
```

### State Management Flow
1. User action → Component
2. Component → Custom hook (React Query)  
3. Hook → Service (API call)
4. API → Smart contract
5. Blockchain event → Event context → Cache invalidation

## Data Storage Architecture

### Storage Strategy
The project uses **no traditional database**. Instead, it implements a hybrid storage approach:

1. **Primary Data Source**: Ethereum smart contracts (source of truth)
2. **Metadata Storage**: JSON files in local filesystem (development) or Vercel Blob Storage (production)
3. **Static Assets**: File system for images/documents with cloud fallback
4. **Client State**: React Query for data fetching, caching, and state management

### Environment-Aware Storage
Storage behavior automatically adapts based on environment:

**Development (Local):**
- Metadata: `./data/*.json` files (e.g., `Lab-UNED-54.json`)
- Assets: `./public/{labId}/{images|docs}/` directory structure
- Detection: `!process.env.VERCEL`

**Production (Vercel):**
- Metadata: Vercel Blob Storage at `data/{filename}.json`
- Assets: Vercel Blob Storage at `data/{labId}/{type}/{filename}`
- Detection: `process.env.VERCEL`

### Data Flow Patterns

**Reading Data:**
1. Smart contracts → Blockchain data (lab IDs, prices, access info)
2. Metadata URIs → JSON files via `/api/metadata` endpoint
3. File paths → Static assets via `MediaDisplayWithFallback` component

**Writing Data:**
1. Lab creation/updates → Smart contract + metadata JSON save
2. File uploads → Storage + path tracking in metadata
3. Deletions → Remove from storage + update references

### Key API Endpoints

**Storage Operations:**
- `POST /api/provider/saveLabData` - Save/update lab metadata JSON
- `POST /api/provider/deleteLabData` - Remove lab metadata JSON
- `POST /api/provider/uploadFile` - Upload images/documents
- `POST /api/provider/deleteFile` - Remove uploaded files
- `GET /api/metadata` - Fetch metadata (environment-aware)

**File Structure:**
```
data/
├── Lab-{PROVIDER}-{ID}.json     # Lab metadata
└── {labId}/
    ├── images/                  # Lab images
    └── docs/                    # Lab documents
```

### Storage Utilities

**Environment Detection:**
```javascript
import getIsVercel from '@/utils/isVercel'
const isVercel = getIsVercel() // returns !!process.env.VERCEL
```

**Fallback Handling:**
- `MediaDisplayWithFallback`: Automatic fallback from Vercel Blob → local paths
- Metadata fetching: Environment-aware URI resolution
- File operations: Platform-specific storage (local FS vs. Blob API)

### Best Practices

1. **Atomic Operations**: Each API endpoint performs single, well-defined storage tasks
2. **Environment Consistency**: Use `getIsVercel()` for environment-aware code
3. **Error Handling**: Graceful fallbacks for missing/corrupted data
4. **Path Normalization**: Consistent path handling across platforms
5. **Content-Type Detection**: Automatic MIME type resolution for uploads
6. **Cleanup**: Remove orphaned files when labs/data are deleted

### React Query Integration
- No server-side caching (use `Cache-Control: no-cache`)
- Client-side caching via React Query with environment-aware invalidation
- Optimistic updates for immediate UI feedback
- Event-driven cache invalidation from blockchain events

## Styling Guidelines

### Design System
The project uses a centralized design system with standardized tokens:
- **Design tokens**: `src/styles/designSystem.js` - Colors, typography, spacing, shadows
- **Tailwind config**: `tailwind.config.js` extends theme with design system tokens
- **Component library**: `src/components/ui/` - Standardized UI components

### Design System Usage
```javascript
// Import design tokens
import { designSystem } from '@/styles/designSystem'

// Use in Tailwind classes (automatically available)
<div className="bg-primary-600 text-white p-spacing-md" />

// Use programmatically
<div style={{ color: designSystem.colors.primary[600] }} />
```

### UI Component Library
Standardized components in `src/components/ui/`:
- **Buttons**: `Button`, `IconButton`, `ButtonGroup` with variants and sizes
- **Forms**: `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `FormField`, `FormGroup`
- **Layout**: `Card`, `Container`, `Grid`, `Stack`, `Inline`, `Divider`, `Spacer`
- **Feedback**: `Alert`, `Badge`, `Spinner`, `Progress`, `Skeleton`, `EmptyState`

Example usage:
```javascript
import { Button, Card, Input, Alert } from '@/components/ui'

// Consistent styling with design system
<Card padding="lg">
  <Input label="Email" size="md" state="error" />
  <Button variant="primary" size="lg">Submit</Button>
  <Alert variant="success" dismissible>Success message</Alert>
</Card>
```

### CSS Guidelines
- **Tailwind CSS only** - No inline styles, no custom CSS outside design system
- **Component variants**: Use design system tokens for all styling decisions
- **Utility classes**: Prefer UI components over raw Tailwind classes
- **Consistency**: All components must use design system tokens exclusively
- **Class utility**: Use `cn()` utility for conditional class concatenation

### Migration Pattern
When updating existing components:
1. Replace hardcoded colors with design system tokens
2. Use UI component library instead of custom styled elements
3. Remove inline styles and custom CSS classes
4. Apply consistent spacing, typography, and color schemes
5. Ensure accessibility and responsive design through component props

## Testing & Debugging
- React Query DevTools enabled in development
- Custom dev logger: `devLog.log()` (respects environment)
- Error boundaries in `src/utils/errorBoundaries.js`

## Key File Locations
- **Configuration**: `next.config.js`, `tailwind.config.js`
- **Types**: Smart contract types auto-generated from ABIs
- **Utils**: Domain-specific utilities in `src/utils/`
- **Mock Data**: Static lab data in `data/` directory

When making changes, prioritize the atomic service pattern, maintain the React Query cache hierarchy, and ensure dual authentication modes continue working seamlessly.

NEVER update this file unless being explicitely told to do it. Instead, use the provided guidelines to maintain consistency across the codebase.