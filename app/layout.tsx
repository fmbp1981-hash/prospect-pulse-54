import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LeadFinder Pro - CRM de Prospecção B2B',
  description: 'Sistema de prospecção e gestão de leads B2B com integração WhatsApp, AI e automações.',
  keywords: ['CRM', 'leads', 'prospecção', 'B2B', 'WhatsApp', 'vendas'],
  authors: [{ name: 'LeadFinder Pro' }],
  openGraph: {
    title: 'LeadFinder Pro',
    description: 'Sistema de prospecção e gestão de leads B2B',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LeadFinder Pro',
    description: 'Sistema de prospecção e gestão de leads B2B',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0F4C75' },
    { media: '(prefers-color-scheme: dark)', color: '#0F4C75' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
