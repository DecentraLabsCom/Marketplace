import path from "path";
//const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
      { hostname: "n7alj90bp0isqv2j.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
