import path from "path";
//const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: "", //appendPath,
  assetPrefix: "", //appendPath,
  // Turbopack is the default dev bundler; use 'npm run dev:webpack' if issues appear.
  webpack(config) {
    config.resolve.alias["@"] = path.resolve("./src");
    config.resolve.alias["@react-native-async-storage/async-storage"] = path.resolve(
      "./src/utils/asyncStorageShim.js"
    );
    // For OneDrive
    config.watchOptions = {
      aggregateTimeout: 300,
      poll: 1000,
      ignored: /node_modules/,
    };
    return config;
  },
  images: {
    remotePatterns: [
      { hostname: "n7alj90bp0isqv2j.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
