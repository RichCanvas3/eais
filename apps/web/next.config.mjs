/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable source maps in production to reduce build size
  productionBrowserSourceMaps: false,
  
  // Optimize package imports (tree shaking)
  experimental: {
    optimizePackageImports: [
      '@mui/material',
      '@mui/icons-material',
      'ethers',
      'viem',
      '@ensdomains/ensjs',
    ],
    // Exclude Node.js-only packages from server bundle (if any)
    // serverComponentsExternalPackages: [],
  },
  
  // Optimize for Cloudflare Pages
  ...(process.env.NODE_ENV === 'production' && {
    webpack: (config, { isServer }) => {
      // Disable webpack cache for production builds
      config.cache = false;
      // Disable source maps to reduce bundle size
      config.devtool = false;
      
      // Let Next.js handle bundle splitting by default - it's more optimized
      // Custom splitChunks can cause duplication and increase total size
      
      return config;
    },
  }),
};

export default nextConfig;
