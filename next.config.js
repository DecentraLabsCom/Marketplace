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
  webpack(config) {
    config.resolve.alias['@'] = path.resolve('./src');
    return config;
  },
  images: {
    remotePatterns: [
      { hostname: "n7alj90bp0isqv2j.public.blob.vercel-storage.com" },
    ]
  },
};

export default nextConfig;