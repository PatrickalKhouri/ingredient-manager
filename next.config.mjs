/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: './dist/client',
  typescript: {
    ignoreBuildErrors: true,
  },
  // Remove hardcoded path for better portability
  experimental: {
    // Only set outputFileTracingRoot in production
    ...(process.env.NODE_ENV === 'production' && {
      outputFileTracingRoot: process.cwd(),
    }),
  },
  // Improve development stability
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
};

export default nextConfig;
