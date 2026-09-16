export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_iterations: number
          model: string
          name: string
          organization_id: string | null
          prompt_version: string
          system_prompt: string
          temperature: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_iterations?: number
          model?: string
          name?: string
          organization_id?: string | null
          prompt_version?: string
          system_prompt: string
          temperature?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_iterations?: number
          model?: string
          name?: string
          organization_id?: string | null
          prompt_version?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          organization_id: string | null
          user_agent: string | null
          user_email: string | null
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
          organization_id?: string | null
          user_agent?: string | null
          user_email?: string | null
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
          organization_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          campaign_id: string
          created_at: string | null
          error: string | null
          id: string
          lead_id: string | null
          organization_id: string | null
          recipient: string
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json | null
          body: string
          channel: string
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          subject: string | null
          total_failed: number | null
          total_sent: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          audience_filter?: Json | null
          body: string
          channel?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          subject?: string | null
          total_failed?: number | null
          total_sent?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          audience_filter?: Json | null
          body?: string
          channel?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          subject?: string | null
          total_failed?: number | null
          total_sent?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_historico: {
        Row: {
          cliente_id: string
          created_at: string | null
          descricao: string
          id: string
          metadata: Json | null
          organization_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          descricao: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          descricao?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_historico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_historico_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          aceita_cartao: string | null
          bairro: string | null
          categoria: string | null
          cidade: string | null
          cnpj: string | null
          consultor_responsavel: string | null
          contato: string | null
          created_at: string | null
          data_conversao: string | null
          data_primeiro_contato: string | null
          email: string | null
          empresa: string
          endereco: string | null
          estagio_origem: string | null
          faturamento_declarado: number | null
          id: string
          instagram: string | null
          lead_id_original: string | null
          observacoes: string | null
          organization_id: string | null
          origem: string | null
          status: string | null
          tags: string[] | null
          telefone: string | null
          updated_at: string | null
          usa_meios_pagamento: string | null
          user_id: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          aceita_cartao?: string | null
          bairro?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          consultor_responsavel?: string | null
          contato?: string | null
          created_at?: string | null
          data_conversao?: string | null
          data_primeiro_contato?: string | null
          email?: string | null
          empresa: string
          endereco?: string | null
          estagio_origem?: string | null
          faturamento_declarado?: number | null
          id?: string
          instagram?: string | null
          lead_id_original?: string | null
          observacoes?: string | null
          organization_id?: string | null
          origem?: string | null
          status?: string | null
          tags?: string[] | null
          telefone?: string | null
          updated_at?: string | null
          usa_meios_pagamento?: string | null
          user_id: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          aceita_cartao?: string | null
          bairro?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          consultor_responsavel?: string | null
          contato?: string | null
          created_at?: string | null
          data_conversao?: string | null
          data_primeiro_contato?: string | null
          email?: string | null
          empresa?: string
          endereco?: string | null
          estagio_origem?: string | null
          faturamento_declarado?: number | null
          id?: string
          instagram?: string | null
          lead_id_original?: string | null
          observacoes?: string | null
          organization_id?: string | null
          origem?: string | null
          status?: string | null
          tags?: string[] | null
          telefone?: string | null
          updated_at?: string | null
          usa_meios_pagamento?: string | null
          user_id?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          channel: string
          city: string | null
          country: string | null
          created_at: string
          domain: string | null
          gmaps_place_id: string | null
          id: string
          industry: string | null
          linkedin_slug: string | null
          linkedin_url: string | null
          location_confidence: number | null
          location_data: Json | null
          location_raw: string | null
          name: string
          organization_id: string | null
          region: string | null
          segment_tags: string[]
          size_label: string | null
          size_max: number | null
          size_min: number | null
          state_name: string | null
          state_uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          city?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          gmaps_place_id?: string | null
          id?: string
          industry?: string | null
          linkedin_slug?: string | null
          linkedin_url?: string | null
          location_confidence?: number | null
          location_data?: Json | null
          location_raw?: string | null
          name: string
          organization_id?: string | null
          region?: string | null
          segment_tags?: string[]
          size_label?: string | null
          size_max?: number | null
          size_min?: number | null
          state_name?: string | null
          state_uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          city?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          gmaps_place_id?: string | null
          id?: string
          industry?: string | null
          linkedin_slug?: string | null
          linkedin_url?: string | null
          location_confidence?: number | null
          location_data?: Json | null
          location_raw?: string | null
          name?: string
          organization_id?: string | null
          region?: string | null
          segment_tags?: string[]
          size_label?: string | null
          size_max?: number | null
          size_min?: number | null
          state_name?: string | null
          state_uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          channel: string
          city: string | null
          company_id: string | null
          converted_lead_id: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string | null
          email_source: string | null
          headline: string | null
          id: string
          job_id: string | null
          linkedin_slug: string | null
          linkedin_url: string | null
          location_confidence: number | null
          location_data: Json | null
          location_raw: string | null
          name: string
          organization_id: string | null
          phone: string | null
          phone_source: string | null
          region: string | null
          role_title: string | null
          seniority: string | null
          state_name: string | null
          state_uf: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          city?: string | null
          company_id?: string | null
          converted_lead_id?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          email_source?: string | null
          headline?: string | null
          id?: string
          job_id?: string | null
          linkedin_slug?: string | null
          linkedin_url?: string | null
          location_confidence?: number | null
          location_data?: Json | null
          location_raw?: string | null
          name: string
          organization_id?: string | null
          phone?: string | null
          phone_source?: string | null
          region?: string | null
          role_title?: string | null
          seniority?: string | null
          state_name?: string | null
          state_uf?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          city?: string | null
          company_id?: string | null
          converted_lead_id?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          email_source?: string | null
          headline?: string | null
          id?: string
          job_id?: string | null
          linkedin_slug?: string | null
          linkedin_url?: string | null
          location_confidence?: number | null
          location_data?: Json | null
          location_raw?: string | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          phone_source?: string | null
          region?: string | null
          role_title?: string | null
          seniority?: string | null
          state_name?: string | null
          state_uf?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_converted_lead_id_fkey"
            columns: ["converted_lead_id"]
            isOneToOne: false
            referencedRelation: "leads_prospeccao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "prospecting_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_raw: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string | null
          raw_json: Json
          scraped_at: string
          source_tool: string
          source_url: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          raw_json: Json
          scraped_at?: string
          source_tool: string
          source_url?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          raw_json?: Json
          scraped_at?: string
          source_tool?: string
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_raw_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_raw_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_raw_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_schedules: {
        Row: {
          created_at: string
          due_at: string
          id: string
          instance_name: string
          lead_id: string
          organization_id: string | null
          processed_at: string | null
          scenario: string
          skip_reason: string | null
          status: string
          step_number: number
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at: string
          id?: string
          instance_name?: string
          lead_id: string
          organization_id?: string | null
          processed_at?: string | null
          scenario: string
          skip_reason?: string | null
          status?: string
          step_number?: number
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          instance_name?: string
          lead_id?: string
          organization_id?: string | null
          processed_at?: string | null
          scenario?: string
          skip_reason?: string | null
          status?: string
          step_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_settings: {
        Row: {
          created_at: string
          id: string
          max_employee_count: number | null
          min_employee_count: number | null
          organization_id: string | null
          require_contact_channel: boolean
          target_categories: string[]
          target_cities: string[]
          target_departments: string[]
          target_seniorities: string[]
          target_states: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_employee_count?: number | null
          min_employee_count?: number | null
          organization_id?: string | null
          require_contact_channel?: boolean
          target_categories?: string[]
          target_cities?: string[]
          target_departments?: string[]
          target_seniorities?: string[]
          target_states?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_employee_count?: number | null
          min_employee_count?: number | null
          organization_id?: string | null
          require_contact_channel?: boolean
          target_categories?: string[]
          target_cities?: string[]
          target_departments?: string[]
          target_seniorities?: string[]
          target_states?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          created: number
          created_at: string
          errors: number
          filename: string | null
          id: string
          import_id: string
          organization_id: string | null
          skipped: number
          source: string
          updated: number
          user_id: string
        }
        Insert: {
          created?: number
          created_at?: string
          errors?: number
          filename?: string | null
          id?: string
          import_id: string
          organization_id?: string | null
          skipped?: number
          source: string
          updated?: number
          user_id: string
        }
        Update: {
          created?: number
          created_at?: string
          errors?: number
          filename?: string | null
          id?: string
          import_id?: string
          organization_id?: string | null
          skipped?: number
          source?: string
          updated?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          lead_id: string
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          lead_id: string
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_prospeccao: {
        Row: {
          aceita_cartao: string | null
          bairro: string | null
          bairro_regiao: string | null
          categoria: string | null
          cidade: string | null
          cnpj: string | null
          consultor_responsavel: string | null
          contato: string | null
          created_at: string | null
          data: string | null
          data_envio_email: string | null
          data_envio_proposta: string | null
          data_envio_wa: string | null
          data_qualificacao: string | null
          data_transferencia: string | null
          data_ultima_acao_consultor: string | null
          data_ultima_interacao: string | null
          email: string | null
          empresa: string
          endereco: string | null
          estagio_pipeline: string | null
          etapa_funil: string | null
          faturamento_declarado: number | null
          follow_up_count: number | null
          icp_fit_evaluated_at: string | null
          icp_fit_reason: string | null
          icp_fit_status: string
          id: string
          instagram: string | null
          lead: string
          link_gmn: string | null
          linkedin: string | null
          mensagem_personalizada: string | null
          mensagem_whatsapp: string | null
          modo_atendimento: string | null
          motivo_follow_up: string | null
          organization_id: string | null
          origem: string | null
          resposta_inicial: string | null
          resumo_analitico: string | null
          status: string | null
          status_email: string | null
          status_msg_wa: string | null
          telefone: string | null
          tenant_id: string | null
          ultimo_contato: string | null
          updated_at: string | null
          usa_meios_pagamento: string | null
          user_id: string | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          aceita_cartao?: string | null
          bairro?: string | null
          bairro_regiao?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          consultor_responsavel?: string | null
          contato?: string | null
          created_at?: string | null
          data?: string | null
          data_envio_email?: string | null
          data_envio_proposta?: string | null
          data_envio_wa?: string | null
          data_qualificacao?: string | null
          data_transferencia?: string | null
          data_ultima_acao_consultor?: string | null
          data_ultima_interacao?: string | null
          email?: string | null
          empresa: string
          endereco?: string | null
          estagio_pipeline?: string | null
          etapa_funil?: string | null
          faturamento_declarado?: number | null
          follow_up_count?: number | null
          icp_fit_evaluated_at?: string | null
          icp_fit_reason?: string | null
          icp_fit_status?: string
          id: string
          instagram?: string | null
          lead: string
          link_gmn?: string | null
          linkedin?: string | null
          mensagem_personalizada?: string | null
          mensagem_whatsapp?: string | null
          modo_atendimento?: string | null
          motivo_follow_up?: string | null
          organization_id?: string | null
          origem?: string | null
          resposta_inicial?: string | null
          resumo_analitico?: string | null
          status?: string | null
          status_email?: string | null
          status_msg_wa?: string | null
          telefone?: string | null
          tenant_id?: string | null
          ultimo_contato?: string | null
          updated_at?: string | null
          usa_meios_pagamento?: string | null
          user_id?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          aceita_cartao?: string | null
          bairro?: string | null
          bairro_regiao?: string | null
          categoria?: string | null
          cidade?: string | null
          cnpj?: string | null
          consultor_responsavel?: string | null
          contato?: string | null
          created_at?: string | null
          data?: string | null
          data_envio_email?: string | null
          data_envio_proposta?: string | null
          data_envio_wa?: string | null
          data_qualificacao?: string | null
          data_transferencia?: string | null
          data_ultima_acao_consultor?: string | null
          data_ultima_interacao?: string | null
          email?: string | null
          empresa?: string
          endereco?: string | null
          estagio_pipeline?: string | null
          etapa_funil?: string | null
          faturamento_declarado?: number | null
          follow_up_count?: number | null
          icp_fit_evaluated_at?: string | null
          icp_fit_reason?: string | null
          icp_fit_status?: string
          id?: string
          instagram?: string | null
          lead?: string
          link_gmn?: string | null
          linkedin?: string | null
          mensagem_personalizada?: string | null
          mensagem_whatsapp?: string | null
          modo_atendimento?: string | null
          motivo_follow_up?: string | null
          organization_id?: string | null
          origem?: string | null
          resposta_inicial?: string | null
          resumo_analitico?: string | null
          status?: string | null
          status_email?: string | null
          status_msg_wa?: string | null
          telefone?: string | null
          tenant_id?: string | null
          ultimo_contato?: string | null
          updated_at?: string | null
          usa_meios_pagamento?: string | null
          user_id?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_prospeccao_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_raw: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          expires_at: string
          id: string
          job_id: string | null
          organization_id: string | null
          raw_json: Json
          scraped_at: string
          source_tool: string
          source_url: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string | null
          organization_id?: string | null
          raw_json: Json
          scraped_at?: string
          source_tool: string
          source_url?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string | null
          organization_id?: string | null
          raw_json?: Json
          scraped_at?: string
          source_tool?: string
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_raw_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_raw_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_raw_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "prospecting_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_raw_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_suppression_list: {
        Row: {
          created_at: string
          id: string
          linkedin_slug: string
          organization_id: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linkedin_slug: string
          organization_id?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linkedin_slug?: string
          organization_id?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_suppression_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          message_sent: boolean | null
          organization_id: string | null
          recipient_id: string | null
          recipient_phone: string
          sent_at: string | null
          template_used: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_sent?: boolean | null
          organization_id?: string | null
          recipient_id?: string | null
          recipient_phone: string
          sent_at?: string | null
          template_used?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_sent?: boolean | null
          organization_id?: string | null
          recipient_id?: string | null
          recipient_phone?: string
          sent_at?: string | null
          template_used?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      prospecting_channels: {
        Row: {
          channel_type: string
          company_id: string | null
          config: Json
          created_at: string
          id: string
          last_run_at: string | null
          organization_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_type: string
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          last_run_at?: string | null
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_type?: string
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          last_run_at?: string | null
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_jobs: {
        Row: {
          callback_token_hash: string | null
          channel: string
          created_at: string
          error_code: string | null
          error_message: string | null
          external_job_id: string | null
          heartbeat_at: string | null
          id: string
          job_type: string
          organization_id: string | null
          params: Json
          progress_found: number
          progress_target: number | null
          result_summary: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          callback_token_hash?: string | null
          channel?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_job_id?: string | null
          heartbeat_at?: string | null
          id?: string
          job_type: string
          organization_id?: string | null
          params?: Json
          progress_found?: number
          progress_target?: number | null
          result_summary?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          callback_token_hash?: string | null
          channel?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_job_id?: string | null
          heartbeat_at?: string | null
          id?: string
          job_type?: string
          organization_id?: string | null
          params?: Json
          progress_found?: number
          progress_target?: number | null
          result_summary?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rag_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_document_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_documents: {
        Row: {
          agent_config_id: string | null
          chunk_count: number | null
          content: string | null
          created_at: string
          filename: string
          id: string
          mimetype: string
          organization_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_config_id?: string | null
          chunk_count?: number | null
          content?: string | null
          created_at?: string
          filename: string
          id?: string
          mimetype?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_config_id?: string | null
          chunk_count?: number | null
          content?: string | null
          created_at?: string
          filename?: string
          id?: string
          mimetype?: string
          organization_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          location: Json
          niche: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          quantity?: number
          saved_count?: number | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_logs: {
        Row: {
          banco_atualizado: boolean | null
          consultor: string | null
          consultor_notificado: boolean | null
          id: number
          lead_nome: string | null
          lead_whatsapp: string | null
          metodo: string | null
          timestamp: string | null
        }
        Insert: {
          banco_atualizado?: boolean | null
          consultor?: string | null
          consultor_notificado?: boolean | null
          id?: number
          lead_nome?: string | null
          lead_whatsapp?: string | null
          metodo?: string | null
          timestamp?: string | null
        }
        Update: {
          banco_atualizado?: boolean | null
          consultor?: string | null
          consultor_notificado?: boolean | null
          id?: number
          lead_nome?: string | null
          lead_whatsapp?: string | null
          metodo?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          agent_enabled: boolean
          apify_api_key: string | null
          appointment_confirmation: string | null
          appointment_reminder: string | null
          approved_by: string | null
          business_access_token: string | null
          business_phone_number_id: string | null
          company_name: string | null
          consultant_whatsapp: string | null
          created_at: string | null
          evolution_api_key: string | null
          evolution_api_url: string | null
          evolution_instance_name: string | null
          firecrawl_api_key: string | null
          from_email: string | null
          id: string
          integration_configured: boolean | null
          meta_verify_token: string | null
          openai_api_key: string | null
          organization_id: string | null
          pending_setup: boolean | null
          provider: string | null
          reactivation_message: string | null
          resend_api_key: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          user_id: string
          user_webhook_url: string | null
          welcome_message: string | null
          whatsapp_webhook_url: string | null
          zapi_instance_id: string | null
          zapi_token: string | null
          zapi_url: string | null
        }
        Insert: {
          agent_enabled?: boolean
          apify_api_key?: string | null
          appointment_confirmation?: string | null
          appointment_reminder?: string | null
          approved_by?: string | null
          business_access_token?: string | null
          business_phone_number_id?: string | null
          company_name?: string | null
          consultant_whatsapp?: string | null
          created_at?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_instance_name?: string | null
          firecrawl_api_key?: string | null
          from_email?: string | null
          id?: string
          integration_configured?: boolean | null
          meta_verify_token?: string | null
          openai_api_key?: string | null
          organization_id?: string | null
          pending_setup?: boolean | null
          provider?: string | null
          reactivation_message?: string | null
          resend_api_key?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id: string
          user_webhook_url?: string | null
          welcome_message?: string | null
          whatsapp_webhook_url?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
          zapi_url?: string | null
        }
        Update: {
          agent_enabled?: boolean
          apify_api_key?: string | null
          appointment_confirmation?: string | null
          appointment_reminder?: string | null
          approved_by?: string | null
          business_access_token?: string | null
          business_phone_number_id?: string | null
          company_name?: string | null
          consultant_whatsapp?: string | null
          created_at?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_instance_name?: string | null
          firecrawl_api_key?: string | null
          from_email?: string | null
          id?: string
          integration_configured?: boolean | null
          meta_verify_token?: string | null
          openai_api_key?: string | null
          organization_id?: string | null
          pending_setup?: boolean | null
          provider?: string | null
          reactivation_message?: string | null
          resend_api_key?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id?: string
          user_webhook_url?: string | null
          welcome_message?: string | null
          whatsapp_webhook_url?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
          zapi_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          organization_id: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          organization_id?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          ai_generated: boolean | null
          created_at: string | null
          from_lead: boolean
          id: string
          intent: string | null
          lead_id: string | null
          message_agent: string | null
          message_agent_id: string | null
          message_lead: string
          message_lead_id: string | null
          organization_id: string | null
          sentiment: string | null
          status: string | null
          timestamp: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          created_at?: string | null
          from_lead?: boolean
          id?: string
          intent?: string | null
          lead_id?: string | null
          message_agent?: string | null
          message_agent_id?: string | null
          message_lead: string
          message_lead_id?: string | null
          organization_id?: string | null
          sentiment?: string | null
          status?: string | null
          timestamp?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          created_at?: string | null
          from_lead?: boolean
          id?: string
          intent?: string | null
          lead_id?: string | null
          message_agent?: string | null
          message_agent_id?: string | null
          message_lead?: string
          message_lead_id?: string | null
          organization_id?: string | null
          sentiment?: string | null
          status?: string | null
          timestamp?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_lead_por_whatsapp: {
        Args: {
          p_contato?: string
          p_data_qualificacao?: string
          p_empresa?: string
          p_estagio_pipeline?: string
          p_etapa_funil?: string
          p_faturamento_declarado?: number
          p_modo_atendimento?: string
          p_motivo_follow_up?: string
          p_status_msg_wa?: string
          p_usa_meios_pagamento?: string
          p_whatsapp: string
        }
        Returns: Json
      }
      can_write: { Args: never; Returns: boolean }
      criar_lead_organico: {
        Args: {
          p_categoria?: string
          p_contato?: string
          p_empresa?: string
          p_instance_name?: string
          p_telefone?: string
          p_user_id?: string
          p_webhook_path?: string
          p_whatsapp: string
        }
        Returns: Json
      }
      find_lead_by_phone_digits: {
        Args: { p_digits: string; p_user_id?: string }
        Returns: {
          aceita_cartao: string | null
          bairro: string | null
          bairro_regiao: string | null
          categoria: string | null
          cidade: string | null
          cnpj: string | null
          consultor_responsavel: string | null
          contato: string | null
          created_at: string | null
          data: string | null
          data_envio_email: string | null
          data_envio_proposta: string | null
          data_envio_wa: string | null
          data_qualificacao: string | null
          data_transferencia: string | null
          data_ultima_acao_consultor: string | null
          data_ultima_interacao: string | null
          email: string | null
          empresa: string
          endereco: string | null
          estagio_pipeline: string | null
          etapa_funil: string | null
          faturamento_declarado: number | null
          follow_up_count: number | null
          icp_fit_evaluated_at: string | null
          icp_fit_reason: string | null
          icp_fit_status: string
          id: string
          instagram: string | null
          lead: string
          link_gmn: string | null
          linkedin: string | null
          mensagem_personalizada: string | null
          mensagem_whatsapp: string | null
          modo_atendimento: string | null
          motivo_follow_up: string | null
          organization_id: string | null
          origem: string | null
          resposta_inicial: string | null
          resumo_analitico: string | null
          status: string | null
          status_email: string | null
          status_msg_wa: string | null
          telefone: string | null
          tenant_id: string | null
          ultimo_contato: string | null
          updated_at: string | null
          usa_meios_pagamento: string | null
          user_id: string | null
          website: string | null
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "leads_prospeccao"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_user_webhook_url: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_my_organization_id: { Args: never; Returns: string }
      get_user_by_evolution_instance: {
        Args: { p_instance_name: string }
        Returns: Json
      }
      get_user_by_webhook_url: {
        Args: { p_webhook_path: string }
        Returns: Json
      }
      get_user_tenant_id: { Args: { user_uuid: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_org_admin: { Args: { check_org_id: string }; Returns: boolean }
      is_org_member: { Args: { check_org_id: string }; Returns: boolean }
      is_org_writer: { Args: { check_org_id: string }; Returns: boolean }
      match_document_chunks: {
        Args: {
          match_count: number
          p_agent_config_id?: string
          p_user_id: string
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      user_role: "admin" | "operador" | "visualizador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_role: ["admin", "operador", "visualizador"],
    },
  },
} as const
