import path from "path";
//const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
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
    const noStoreHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
    ];
    const noStoreSources = [
      "/api/contract/lab/:path*",
      "/api/contract/provider/:path*",
      "/api/contract/institution/:path*",
      "/api/contract/reservation/userOfReservation",
      "/api/contract/reservation/totalReservations",
      "/api/contract/reservation/reservationsOf",
      "/api/contract/reservation/reservationKeyOfUserByIndex",
      "/api/contract/reservation/getReservationsOfToken",
      "/api/contract/reservation/hasActiveBooking",
      "/api/contract/reservation/isTokenListed",
      "/api/contract/reservation/hasActiveBookingByToken",
      "/api/contract/reservation/getReservationOfTokenByIndex",
      "/api/contract/reservation/getSafeBalance",
      "/api/contract/reservation/checkAvailable",
      "/api/contract/reservation/getReservation",
      "/api/contract/reservation/getActiveReservationKeyForUser",
      "/api/contract/reservation/getReservationsOfTokenByUser",
    ];
    return [
      ...noStoreSources.map((source) => ({
        source,
        headers: noStoreHeaders,
      })),
    ];
  },
};

export default nextConfig;
