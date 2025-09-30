/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: './dist/client',
  experimental: {
    outputFileTracingRoot: '/Users/patrickalkhouri/code/PatrickalKhouri/olis-lab/ingredient-manager',
  },
};

export default nextConfig;
