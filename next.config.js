const path = require('path');
const { appendPath } = require('./src/utils/pathUtils');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: appendPath,
  assetPrefix: appendPath,
  webpack(config) {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  }
};

module.exports = nextConfig;