import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Rocket } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const SignUp = () => {
  const navigate = useNavigate();
  const { signUp, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName || !email || !password || !confirmPassword) {
      setError("Preencha todos os campos");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setIsLoading(true);
    const { error: signUpError } = await signUp(email, password, fullName);

    if (!signUpError) {
      // Redirecionar direto para login ao invés de mostrar mensagem de confirmação
      toast.success("Conta criada com sucesso! Você pode fazer login agora.");
      navigate("/auth/login");
    }

    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center shadow-card">
              <Rocket className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold">LeadFinder Pro</h1>
          </div>
          <p className="text-muted-foreground">
            Sistema de Prospecção Inteligente
          </p>
        </div>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Criar Conta</CardTitle>
            <CardDescription>
              Preencha os dados para criar sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            {signupSuccess ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                  <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                    ✅ Conta criada com sucesso!
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                    Enviamos um email de confirmação para:
                    <br />
                    <strong>{registeredEmail}</strong>
                  </p>
                  <div className="space-y-2 text-sm text-green-700 dark:text-green-300">
                    <p><strong>📧 Próximos passos:</strong></p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Abra seu email</li>
                      <li>Procure por "Confirm your email" (verifique spam também)</li>
                      <li>Clique no link de confirmação</li>
                      <li>Volte aqui e faça login</li>
                    </ol>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
                  <p className="text-blue-800 dark:text-blue-200">
                    <strong>💡 Dica:</strong> Se não recebeu o email em 5 minutos:
                  </p>
                  <ul className="list-disc list-inside ml-2 mt-2 text-blue-700 dark:text-blue-300">
                    <li>Verifique a pasta de spam/lixo eletrônico</li>
                    <li>Verifique se digitou o email corretamente</li>
                    <li>Aguarde alguns minutos e tente novamente</li>
                  </ul>
                </div>

                <Link to="/auth/login">
                  <Button className="w-full">
                    Ir para Login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 6 caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  "Criar Conta"
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                Já tem uma conta?{" "}
                <Link
                  to="/auth/login"
                  className="text-primary font-medium hover:underline"
                >
                  Fazer login
                </Link>
              </div>
            </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default SignUp;
