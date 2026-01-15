'use client';

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  // Marcar que estamos no cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Só executar no cliente
    if (!isClient) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client não disponível');
      setLoading(false);
      return;
    }

    // Verificar sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escutar mudanças de autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isClient]);

  const signIn = async (email: string, password: string) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        const errorMsg = 'Supabase não disponível. Verifique sua conexão.';
        toast.error("Erro ao fazer login", { description: errorMsg });
        return { error: { message: errorMsg } as AuthError };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Mensagens de erro mais amigáveis
        let description = error.message;
        if (error.message.includes('Invalid login credentials')) {
          description = 'Email ou senha incorretos. Verifique suas credenciais.';
        } else if (error.message.includes('Email not confirmed')) {
          description = 'Email não confirmado. Verifique sua caixa de entrada.';
        }

        toast.error("Erro ao fazer login", {
          description,
        });
      } else {
        toast.success("Login realizado com sucesso!");
      }

      return { error };
    } catch (error: unknown) {
      console.error("Erro no signIn:", error);

      // Tratamento específico para erros de rede
      let errorMessage = 'Erro inesperado ao fazer login.';

      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
          errorMessage = 'Falha na conexão. Verifique sua internet e tente novamente.';
        } else if (error.message.includes('NetworkError')) {
          errorMessage = 'Erro de rede. Verifique sua conexão com a internet.';
        } else if (error.message.includes('CORS')) {
          errorMessage = 'Erro de configuração do servidor. Contate o suporte.';
        } else {
          errorMessage = error.message;
        }
      }

      toast.error("Erro ao fazer login", {
        description: errorMessage,
      });

      return { error: { message: errorMessage } as AuthError };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        return { error: { message: 'Supabase não disponível' } as AuthError };
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || "",
          },
        },
      });

      if (error) {
        toast.error("Erro ao criar conta", {
          description: error.message,
        });
      } else {
        toast.success("Conta criada com sucesso!");
      }

      return { error };
    } catch (error) {
      console.error("Erro no signUp:", error);
      return { error: error as AuthError };
    }
  };

  const signOut = async () => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        toast.error("Supabase não disponível");
        return;
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        toast.error("Erro ao sair", {
          description: error.message,
        });
      } else {
        toast.success("Logout realizado com sucesso!");
      }
    } catch (error) {
      console.error("Erro no signOut:", error);
      toast.error("Erro ao sair");
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        return { error: { message: 'Supabase não disponível' } as AuthError };
      }

      // Usar variável de ambiente para base URL ou fallback seguro
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || '';

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${baseUrl}/reset-password`,
      });

      if (error) {
        toast.error("Erro ao enviar email de recuperação", {
          description: error.message,
        });
      } else {
        toast.success("Email de recuperação enviado!", {
          description: "Verifique sua caixa de entrada.",
        });
      }

      return { error };
    } catch (error) {
      console.error("Erro no resetPassword:", error);
      return { error: error as AuthError };
    }
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
