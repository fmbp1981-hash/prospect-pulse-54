import { supabase } from "@/integrations/supabase/client";

export interface DashboardMetrics {
  totalLeads: number;
  newLeads: number;
  recurrentLeads: number;
  leadsWithPhone: number;
  leadsWithEmail: number;
  leadsWithWebsite: number;
  leadsByStatus: {
    status: string;
    count: number;
  }[];
  leadsByCategory: {
    categoria: string;
    count: number;
  }[];
  leadsByCity: {
    cidade: string;
    count: number;
  }[];
  recentLeads: {
    id: string;
    lead: string;
    empresa: string;
    categoria: string;
    cidade: string;
    created_at: string;
  }[];
  leadsTimeline: {
    date: string;
    count: number;
  }[];
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    // Total de leads
    const { count: totalLeads, error: totalError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // Leads por status
    const { data: statusData, error: statusError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('status')
      .not('status', 'is', null);

    if (statusError) throw statusError;

    const newLeads = (statusData as any[])?.filter(l => l.status === 'Novo').length || 0;
    const recurrentLeads = (statusData as any[])?.filter(l => l.status === 'Recorrente').length || 0;

    // Leads com informações de contato
    const { data: contactData, error: contactError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('whatsapp, telefone, email, website');

    if (contactError) throw contactError;

    const leadsWithPhone = (contactData as any[])?.filter(l => l.whatsapp || l.telefone).length || 0;
    const leadsWithEmail = (contactData as any[])?.filter(l => l.email).length || 0;
    const leadsWithWebsite = (contactData as any[])?.filter(l => l.website).length || 0;

    // Leads por status (agregado)
    const leadsByStatus = Object.entries(
      (statusData as any[])?.reduce((acc: Record<string, number>, lead: any) => {
        const status = lead.status || 'Sem Status';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([status, count]) => ({ status, count: count as number }));

    // Leads por categoria
    const { data: categoryData, error: categoryError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('categoria')
      .not('categoria', 'is', null)
      .limit(100);

    if (categoryError) throw categoryError;

    const leadsByCategory = Object.entries(
      (categoryData as any[])?.reduce((acc: Record<string, number>, lead: any) => {
        const categoria = lead.categoria || 'Sem Categoria';
        acc[categoria] = (acc[categoria] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([categoria, count]) => ({ categoria, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Leads por cidade
    const { data: cityData, error: cityError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('cidade')
      .not('cidade', 'is', null)
      .limit(100);

    if (cityError) throw cityError;

    const leadsByCity = Object.entries(
      (cityData as any[])?.reduce((acc: Record<string, number>, lead: any) => {
        const cidade = lead.cidade || 'Sem Cidade';
        acc[cidade] = (acc[cidade] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([cidade, count]) => ({ cidade, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Leads recentes
    const { data: recentLeads, error: recentError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('id, lead, empresa, categoria, cidade, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) throw recentError;

    // Timeline de leads (últimos 30 dias)
    const { data: timelineData, error: timelineError } = await (supabase
      .from('leads_prospeccao') as any)
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });

    if (timelineError) throw timelineError;

    const leadsTimeline = Object.entries(
      (timelineData as any[])?.reduce((acc: Record<string, number>, lead: any) => {
        const date = new Date(lead.created_at).toLocaleDateString('pt-BR');
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([date, count]) => ({ date, count: count as number }));

    return {
      totalLeads: totalLeads || 0,
      newLeads,
      recurrentLeads,
      leadsWithPhone,
      leadsWithEmail,
      leadsWithWebsite,
      leadsByStatus,
      leadsByCategory,
      leadsByCity,
      recentLeads: (recentLeads as any[]) || [],
      leadsTimeline,
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    throw error;
  }
}
