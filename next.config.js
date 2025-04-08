import { join } from 'path';
const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: appendPath,
  assetPrefix: appendPath,
  webpack(config) {
    config.resolve.alias['@'] = join(__dirname, 'src');
    return config;
  }
};

export default nextConfig;