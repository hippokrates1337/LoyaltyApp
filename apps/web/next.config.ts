import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: ['@loyalty/db', '@loyalty/email'],
};

export default nextConfig;
