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
    // Exclude Node.js-only packages from server bundle
    serverComponentsExternalPackages: [
      'better-sqlite3', // Already removed, but keep here as safety
    ],
  },
  
  // Optimize for Cloudflare Pages
  ...(process.env.NODE_ENV === 'production' && {
    webpack: (config, { isServer }) => {
      // Disable webpack cache for production builds
      config.cache = false;
      // Disable source maps to reduce bundle size
      config.devtool = false;
      
      // Aggressive code splitting for client bundles
      if (!isServer) {
        config.optimization = {
          ...config.optimization,
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              default: false,
              vendors: false,
              // Separate large libraries
              ethers: {
                name: 'ethers',
                test: /[\\/]node_modules[\\/]ethers[\\/]/,
                priority: 20,
                reuseExistingChunk: true,
              },
              viem: {
                name: 'viem',
                test: /[\\/]node_modules[\\/]viem[\\/]/,
                priority: 20,
                reuseExistingChunk: true,
              },
              web3auth: {
                name: 'web3auth',
                test: /[\\/]node_modules[\\/]@web3auth[\\/]/,
                priority: 20,
                reuseExistingChunk: true,
              },
              mui: {
                name: 'mui',
                test: /[\\/]node_modules[\\/]@mui[\\/]/,
                priority: 20,
                reuseExistingChunk: true,
              },
              // Everything else
              common: {
                name: 'commons',
                minChunks: 2,
                priority: 10,
                reuseExistingChunk: true,
              },
            },
          },
        };
      }
      
      return config;
    },
  }),
};

export default nextConfig;
