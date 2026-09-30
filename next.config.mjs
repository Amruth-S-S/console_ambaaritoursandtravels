/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist (used by the in-browser passport reader, lib/passportOcr.ts)
    // has a Node-only require("canvas") that never runs in the browser —
    // stop webpack from trying to bundle it.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
