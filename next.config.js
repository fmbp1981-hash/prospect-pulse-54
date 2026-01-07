/** @type {import('next').NextConfig} */
const nextConfig = {
  // Habilitar App Router
  experimental: {
    // Otimizações de bundle
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns',
      'recharts',
    ],
  },

  // Configuração de imagens externas (se necessário)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Transpile pacotes problemáticos
  transpilePackages: ['@supabase/supabase-js'],

  // Headers de segurança
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Redirecionamentos (se necessário no futuro)
  async redirects() {
    return [];
  },
};

module.exports = nextConfig;
