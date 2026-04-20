/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for @ricky0123/vad-web WASM loading
  transpilePackages: ['@ricky0123/vad-web'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
  // Cho phép service worker hoạt động
  headers: async () => [
    // COOP + COEP required for SharedArrayBuffer (onnxruntime-web multi-threaded WASM on Android Chrome)
    {
      source: '/(.*)',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
      ],
    },
    {
      source: '/sw.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/',
        },
      ],
    },
  ],
};

export default nextConfig;
