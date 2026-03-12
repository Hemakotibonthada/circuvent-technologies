/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@circuvent/shared"],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
