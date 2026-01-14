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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: totalLeads, error: totalError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // Leads por status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: statusData, error: statusError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('status')
      .not('status', 'is', null);

    if (statusError) throw statusError;

    const newLeads = statusData?.filter(l => l.status === 'Novo').length || 0;
    const recurrentLeads = statusData?.filter(l => l.status === 'Recorrente').length || 0;

    // Leads com informações de contato
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contactData, error: contactError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('whatsapp, telefone, email, website');

    if (contactError) throw contactError;

    const leadsWithPhone = contactData?.filter(l => l.whatsapp || l.telefone).length || 0;
    const leadsWithEmail = contactData?.filter(l => l.email).length || 0;
    const leadsWithWebsite = contactData?.filter(l => l.website).length || 0;

    // Leads por status (agregado)
    const leadsByStatus = Object.entries(
      statusData?.reduce((acc: Record<string, number>, lead) => {
        const status = lead.status || 'Sem Status';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([status, count]) => ({ status, count: count as number }));

    // Leads por categoria
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: categoryData, error: categoryError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('categoria')
      .not('categoria', 'is', null)
      .limit(100);

    if (categoryError) throw categoryError;

    const leadsByCategory = Object.entries(
      categoryData?.reduce((acc: Record<string, number>, lead) => {
        const categoria = lead.categoria || 'Sem Categoria';
        acc[categoria] = (acc[categoria] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([categoria, count]) => ({ categoria, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Leads por cidade
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cityData, error: cityError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('cidade')
      .not('cidade', 'is', null)
      .limit(100);

    if (cityError) throw cityError;

    const leadsByCity = Object.entries(
      cityData?.reduce((acc: Record<string, number>, lead) => {
        const cidade = lead.cidade || 'Sem Cidade';
        acc[cidade] = (acc[cidade] || 0) + 1;
        return acc;
      }, {}) || {}
    ).map(([cidade, count]) => ({ cidade, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Leads recentes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentLeads, error: recentError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('id, lead, empresa, categoria, cidade, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) throw recentError;

    // Timeline de leads (últimos 30 dias)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: timelineData, error: timelineError } = await (supabase as any)
      .from('leads_prospeccao')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });

    if (timelineError) throw timelineError;

    const leadsTimeline = Object.entries(
      timelineData?.reduce((acc: Record<string, number>, lead) => {
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
      recentLeads: recentLeads || [],
      leadsTimeline,
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    throw error;
  }
}
