import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface LeadForExport {
  id: string;
  lead: string;
  empresa: string;
  categoria: string;
  telefone: string | null;
  whatsapp: string | null;
  website: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  avaliacao: number | null;
  horario_funcionamento: string | null;
  aceita_cartao: boolean | null;
  mensagem_whatsapp: string | null;
  status_msg_wa: string | null;
  status: string;
  created_at: string;
}

// Sanitizar dados para prevenir CSV injection
const sanitizeForCSV = (value: any): string => {
  if (value === undefined || value === null) return '';

  const stringValue = String(value);

  // Remover caracteres perigosos que podem causar formula injection
  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some(char => stringValue.startsWith(char))) {
    return `'${stringValue}`; // Adicionar aspas simples para escapar
  }

  return stringValue;
};

export const exportLeadsToCSV = (leads: LeadForExport[], filename: string = 'leads') => {
  const data = leads.map(lead => ({
    'ID Lead': sanitizeForCSV(lead.lead),
    'Empresa': sanitizeForCSV(lead.empresa),
    'Categoria': sanitizeForCSV(lead.categoria),
    'Telefone': sanitizeForCSV(lead.telefone),
    'WhatsApp': sanitizeForCSV(lead.whatsapp),
    'Website': sanitizeForCSV(lead.website),
    'Endereço': sanitizeForCSV(lead.endereco),
    'Cidade': sanitizeForCSV(lead.cidade),
    'Estado': sanitizeForCSV(lead.estado),
    'CEP': sanitizeForCSV(lead.cep),
    'Avaliação': sanitizeForCSV(lead.avaliacao),
    'Horário': sanitizeForCSV(lead.horario_funcionamento),
    'Aceita Cartão': sanitizeForCSV(lead.aceita_cartao ? 'Sim' : 'Não'),
    'Status WhatsApp': sanitizeForCSV(lead.status_msg_wa),
    'Status': sanitizeForCSV(lead.status),
    'Data Criação': sanitizeForCSV(new Date(lead.created_at).toLocaleDateString('pt-BR')),
  }));

  const csv = Papa.unparse(data, {
    delimiter: ',',
    header: true,
    newline: '\n',
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM para UTF-8
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportLeadsToExcel = (leads: LeadForExport[], filename: string = 'leads') => {
  const data = leads.map(lead => ({
    'ID Lead': lead.lead,
    'Empresa': lead.empresa,
    'Categoria': lead.categoria,
    'Telefone': lead.telefone || '',
    'WhatsApp': lead.whatsapp || '',
    'Website': lead.website || '',
    'Endereço': lead.endereco || '',
    'Cidade': lead.cidade || '',
    'Estado': lead.estado || '',
    'CEP': lead.cep || '',
    'Avaliação': lead.avaliacao || '',
    'Horário Funcionamento': lead.horario_funcionamento || '',
    'Aceita Cartão': lead.aceita_cartao ? 'Sim' : 'Não',
    'Mensagem WhatsApp': lead.mensagem_whatsapp || '',
    'Status WhatsApp': lead.status_msg_wa || '',
    'Status': lead.status,
    'Data Criação': new Date(lead.created_at).toLocaleDateString('pt-BR'),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Auto-ajustar largura das colunas
  const maxWidth = 50;
  const colWidths = Object.keys(data[0] || {}).map(key => {
    const maxLength = Math.max(
      key.length,
      ...data.map(row => String(row[key as keyof typeof row] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads Prospectados');

  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};
