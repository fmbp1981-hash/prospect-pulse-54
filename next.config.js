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
    const allowedOrigins = [
      'https://prospect-pulse-54.vercel.app',
      'https://alpha.dualite.dev',
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
    ].join(' ');

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
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            // CSP: permite scripts/estilos do próprio domínio, Supabase e CDNs utilizados
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com ${allowedOrigins}`,
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      {
        // CORS restrito para rotas de API
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NEXT_PUBLIC_APP_URL || 'https://prospect-pulse-54.vercel.app',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
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
