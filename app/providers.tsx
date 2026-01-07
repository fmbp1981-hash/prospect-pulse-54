'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster as HotToast } from 'react-hot-toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  // Criar QueryClient dentro do componente para evitar problemas de SSR
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minuto
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          <AuthProvider>
            {children}
            <Toaster />
            <Sonner />
            <HotToast position="top-right" />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
