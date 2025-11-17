import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Building2 } from "lucide-react";
import { userSettingsService, UserSettings } from "@/lib/userSettings";

export default function Settings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const settings = await userSettingsService.getUserSettings();
      if (settings) {
        setCompanyName(settings.company_name || "");
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast.error("Por favor, preencha o nome da sua empresa");
      return;
    }

    setIsSaving(true);
    try {
      await userSettingsService.saveUserSettings({
        company_name: companyName,
      });

      toast.success("Configurações salvas com sucesso!", {
        description: "As variáveis dos templates agora usarão esse nome",
      });
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-2">
          Configure as informações da sua empresa para personalizar os templates
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Informações da Empresa</CardTitle>
          </div>
          <CardDescription>
            Essas informações serão usadas para substituir as variáveis nos templates de mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="company_name">
              Nome da Sua Empresa <span className="text-red-500">*</span>
            </Label>
            <Input
              id="company_name"
              placeholder="Ex: IntelliX Solutions"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              Esse nome será usado na variável <code className="bg-muted px-1 rounded">{"{{minha_empresa}}"}</code> nos templates
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
              💡 Como usar nos templates:
            </p>
            <div className="space-y-1 text-xs text-yellow-800 dark:text-yellow-200">
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{minha_empresa}}"}</code> = {companyName || "Sua empresa"}</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{empresa}}"}</code> = Nome da empresa prospectada</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{categoria}}"}</code> = Categoria do lead</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{cidade}}"}</code> = Cidade do lead</p>
              <p>• <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{contato}}"}</code> = Nome do contato (se disponível)</p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              📝 Exemplo de mensagem:
            </p>
            <div className="text-xs text-blue-800 dark:text-blue-200 bg-white dark:bg-blue-950 p-3 rounded border border-blue-200 dark:border-blue-800">
              <p className="whitespace-pre-wrap">
                Olá! Sou da <strong>{companyName || "Sua Empresa"}</strong>.<br/><br/>
                Notei que a <strong>{"{{empresa}}"}</strong> em <strong>{"{{cidade}}"}</strong> atua no ramo de <strong>{"{{categoria}}"}</strong>.<br/><br/>
                Podemos ajudar a impulsionar seus resultados. Posso apresentar nossa solução?
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving || !companyName.trim()}
              className="min-w-32"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outras Configurações</CardTitle>
          <CardDescription>
            Mais opções de personalização em breve...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Novas configurações serão adicionadas nas próximas versões.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
