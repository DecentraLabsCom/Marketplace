//const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';
import { getSecurityHeaders } from './src/utils/security/securityHeaders.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Browser source maps are not published in production. Upload private maps
  // to the observability provider as part of the deployment pipeline instead.
  productionBrowserSourceMaps: false,
  basePath: "", //appendPath,
  assetPrefix: "", //appendPath,
  // Configure Turbopack aliases instead of customizing webpack directly.
  turbopack: {
    resolveAlias: {
      "@": "./src",
      "@react-native-async-storage/async-storage": "./src/utils/asyncStorageShim.js",
    },
  },
  // If you still need polling for OneDrive during dev, set `CHOKIDAR_USEPOLLING=1` in your environment.
  // To run with webpack instead, use `npm run dev:webpack` which keeps the old webpack hook.
  images: {
    qualities: [75, 82],
    remotePatterns: [
      { protocol: "https", hostname: "**.blob.vercel-storage.com" },
      { protocol: "https", hostname: "n7alj90bp0isqv2j.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "cloudflare-ipfs.com" },
      { protocol: "https", hostname: "gateway.pinata.cloud" },
      { protocol: "https", hostname: "nftstorage.link" },
    ],
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const securityHeaders = getSecurityHeaders({ isProduction });
    const noStoreHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
    ];
    const noStoreSources = [
      "/api/contract/lab/:path*",
      "/api/contract/provider/:path*",
      "/api/contract/institution/:path*",
      "/api/contract/reservation/userOfReservation",
      "/api/contract/reservation/reservationsOf",
      "/api/contract/reservation/reservationKeyOfUserByIndex",
      "/api/contract/reservation/getReservationsOfToken",
      "/api/contract/reservation/hasActiveBooking",
      "/api/contract/reservation/isTokenListed",
      "/api/contract/reservation/getReservationOfTokenByIndex",
      "/api/contract/reservation/checkAvailable",
      "/api/contract/reservation/getReservation",
      "/api/contract/reservation/getLabCreditAddress",
      "/api/contract/reservation/getReservationsOfTokenByUser",
    ];
    const sameOriginDocumentHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ];
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/metadata/document',
        headers: sameOriginDocumentHeaders,
      },
      ...noStoreSources.map((source) => ({
        source,
        headers: noStoreHeaders,
      })),
    ];
  },
};

export default nextConfig;
