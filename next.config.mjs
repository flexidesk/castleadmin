import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/orders-dashboard',
        permanent: false,
      },
    ];
  },

  webpack(config) {
    return config;
  }
};
export default nextConfig;