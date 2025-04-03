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
  },
  async redirects() {
    return [
      {
        source: '/register',
        destination: '/RegisterProviderPage',
        permanent: true, // Usa `true` para redirección 308 o `false` para redirección 307
      },
      {
        source: '/userdashboard',
        destination: '/UserDashboardPage',
        permanent: true, // Usa `true` para redirección 308 o `false` para redirección 307
      },
      {
        source: '/providerdashboard',
        destination: '/ProviderDashboardPage',
        permanent: true, // Usa `true` para redirección 308 o `false` para redirección 307
      }
    ];
  },
};

module.exports = nextConfig;