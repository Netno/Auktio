/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.skeleton.bbys.io",
      },
      {
        protocol: "https",
        hostname: "*.media.skeleton.bbys.io",
      },
    ],
  },
  // Vercel Cron: ingestion runs daily at 06:00 UTC
  // Configure in vercel.json
};

module.exports = nextConfig;
