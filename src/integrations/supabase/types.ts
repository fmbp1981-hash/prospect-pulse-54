export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      atendimento_bot: {
        Row: {
          id: string
          modo: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          id?: string
          modo?: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          id?: string
          modo?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          location: Json
          niche: string
          quantity: number
          saved_count: number | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          location: Json
          niche: string
          quantity: number
          saved_count?: number | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          location?: Json
          niche?: string
          quantity?: number
          saved_count?: number | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          lead_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          lead_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lead_interactions: {
        Row: {
          created_at: string | null
          description: string
          id: string
          lead_id: string
          metadata: Json | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      leads_prospeccao: {
        Row: {
          aceita_cartao: string | null
          bairro_regiao: string | null
          categoria: string | null
          cidade: string | null
          cnpj: string | null
          contato: string | null
          created_at: string | null
          data: string | null
          data_envio_proposta: string | null
          data_envio_wa: string | null
          data_qualificacao: string | null
          data_ultima_interacao: string | null
          email: string | null
          empresa: string
          endereco: string | null
          estagio_pipeline: string | null
          etapa_funil: string | null
          faturamento_declarado: number | null
          id: string
          instagram: string | null
          lead: string
          link_gmn: string | null
          mensagem_whatsapp: string | null
          modo_atendimento: string | null
          motivo_follow_up: string | null
          origem: string | null
          resposta_inicial: string | null
          resumo_analitico: string | null
          status: string | null
          status_msg_wa: string | null
          telefone: string | null
          ultimo_contato: string | null
          updated_at: string | null
          usa_meios_pagamento: string | null
          user_id: string | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          aceita_cartao?: string | null
          bairro_regiao?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string | null
          data?: string | null
          data_envio_proposta?: string | null
          data_envio_wa?: string | null
          data_qualificacao?: string | null
          data_ultima_interacao?: string | null
          email?: string | null
          empresa: string
          endereco?: string | null
          estagio_pipeline?: string | null
          etapa_funil?: string | null
          faturamento_declarado?: number | null
          id: string
          instagram?: string | null
          lead: string
          link_gmn?: string | null
          mensagem_whatsapp?: string | null
          modo_atendimento?: string | null
          motivo_follow_up?: string | null
          origem?: string | null
          resposta_inicial?: string | null
          resumo_analitico?: string | null
          status?: string | null
          status_msg_wa?: string | null
          telefone?: string | null
          ultimo_contato?: string | null
          updated_at?: string | null
          usa_meios_pagamento?: string | null
          user_id?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          aceita_cartao?: string | null
          bairro_regiao?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string | null
          data?: string | null
          data_envio_proposta?: string | null
          data_envio_wa?: string | null
          data_qualificacao?: string | null
          data_ultima_interacao?: string | null
          email?: string | null
          empresa?: string
          endereco?: string | null
          estagio_pipeline?: string | null
          etapa_funil?: string | null
          faturamento_declarado?: number | null
          id?: string
          instagram?: string | null
          lead?: string
          link_gmn?: string | null
          mensagem_whatsapp?: string | null
          modo_atendimento?: string | null
          motivo_follow_up?: string | null
          origem?: string | null
          resposta_inicial?: string | null
          resumo_analitico?: string | null
          status?: string | null
          status_msg_wa?: string | null
          telefone?: string | null
          ultimo_contato?: string | null
          updated_at?: string | null
          usa_meios_pagamento?: string | null
          user_id?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          company_name: string | null
          created_at: string | null
          evolution_api_key: string | null
          evolution_api_url: string | null
          evolution_instance_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_instance_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_instance_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          ai_generated: boolean | null
          created_at: string | null
          from_lead: boolean
          id: string
          intent: string | null
          lead_id: string | null
          message: string
          message_id: string | null
          sentiment: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          created_at?: string | null
          from_lead?: boolean
          id?: string
          intent?: string | null
          lead_id?: string | null
          message: string
          message_id?: string | null
          sentiment?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          created_at?: string | null
          from_lead?: boolean
          id?: string
          intent?: string | null
          lead_id?: string | null
          message?: string
          message_id?: string | null
          sentiment?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: "admin" | "operador" | "visualizador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Mantido para compatibilidade - agora é simplesmente o Database
type DatabaseWithoutInternals = Database

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
