'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

export default function PendingPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isPending, isLoading, refetch } = useUserRole();

  // Verificar aprovação a cada 30s
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Redirecionar automaticamente quando aprovado
  useEffect(() => {
    if (!isLoading && !isPending) {
      router.push('/');
    }
  }, [isPending, isLoading, router]);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-yellow-100 dark:bg-yellow-950 p-6">
            <Clock className="h-16 w-16 text-yellow-600 dark:text-yellow-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Aguardando Aprovação
          </h1>
          <p className="text-muted-foreground">
            Sua conta foi criada com sucesso, mas ainda precisa ser aprovada
            por um administrador antes que você possa acessar o sistema.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4 space-y-1">
          <p className="text-sm text-muted-foreground">Conta registrada com o email:</p>
          <p className="font-medium text-foreground">{user?.email}</p>
        </div>

        <p className="text-sm text-muted-foreground">
          Você será redirecionado automaticamente quando sua conta for aprovada.
          Esta página verifica o status a cada 30 segundos.
        </p>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="w-full gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Verificar agora
          </Button>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
