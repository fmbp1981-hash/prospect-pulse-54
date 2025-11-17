import { supabase } from "@/integrations/supabase/client";

export interface UserSettings {
  id?: string;
  user_id?: string;
  company_name: string;
  created_at?: string;
  updated_at?: string;
}

export const userSettingsService = {
  /**
   * Buscar configurações do usuário atual
   */
  async getUserSettings(): Promise<UserSettings | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        // Se não existe, retornar settings padrão
        if (error.code === "PGRST116") {
          return {
            company_name: "",
          };
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Erro ao buscar configurações:", error);
      return {
        company_name: "",
      };
    }
  },

  /**
   * Salvar ou atualizar configurações do usuário
   */
  async saveUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      // Verificar se já existe configuração
      const { data: existing } = await supabase
        .from("user_settings")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from("user_settings")
          .update({
            company_name: settings.company_name,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Inserir
        const { data, error } = await supabase
          .from("user_settings")
          .insert({
            user_id: user.id,
            company_name: settings.company_name,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      throw error;
    }
  },
};
