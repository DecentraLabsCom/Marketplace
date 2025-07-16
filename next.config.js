import path from 'path';
//const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '', //appendPath,
  assetPrefix: '', //appendPath,
  publicRuntimeConfig: {
    basePath: '', //appendPath,
  },
  turbopack: {
  },
  webpack(config) {
    config.resolve.alias['@'] = path.resolve('./src');
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
    ]
  },
};

export default nextConfig;