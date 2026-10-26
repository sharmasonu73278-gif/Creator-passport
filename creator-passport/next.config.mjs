/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PDF guides are uploaded through server actions (10 MB limit enforced in code too).
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
