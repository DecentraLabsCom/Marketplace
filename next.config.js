const path = require('path');
const appendPath = process.env.NODE_ENV === 'production' ? '/marketplace' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: appendPath,
  assetPrefix: appendPath,
  publicRuntimeConfig: {
    basePath: appendPath,
  },
  webpack(config) {
    config.resolve.alias['@'] = path.resolve('./src');
    return config;
  },
};

module.exports = nextConfig;