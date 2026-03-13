/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536],
    imageSizes: [48, 56, 64, 96, 128, 256, 384],
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
