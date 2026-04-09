import ExcelJS from 'exceljs';
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
const sanitizeForCSV = (value: string | number | boolean | null | undefined): string => {
  if (value === undefined || value === null) return '';

  const stringValue = String(value);

  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some(char => stringValue.startsWith(char))) {
    return `'${stringValue}`;
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

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportLeadsToExcel = async (leads: LeadForExport[], filename: string = 'leads'): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads Prospectados');

  worksheet.columns = [
    { header: 'ID Lead', key: 'lead', width: 20 },
    { header: 'Empresa', key: 'empresa', width: 30 },
    { header: 'Categoria', key: 'categoria', width: 20 },
    { header: 'Telefone', key: 'telefone', width: 18 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Website', key: 'website', width: 30 },
    { header: 'Endereço', key: 'endereco', width: 35 },
    { header: 'Cidade', key: 'cidade', width: 20 },
    { header: 'Estado', key: 'estado', width: 10 },
    { header: 'CEP', key: 'cep', width: 12 },
    { header: 'Avaliação', key: 'avaliacao', width: 12 },
    { header: 'Horário Funcionamento', key: 'horario_funcionamento', width: 30 },
    { header: 'Aceita Cartão', key: 'aceita_cartao', width: 14 },
    { header: 'Mensagem WhatsApp', key: 'mensagem_whatsapp', width: 40 },
    { header: 'Status WhatsApp', key: 'status_msg_wa', width: 16 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Data Criação', key: 'created_at', width: 14 },
  ];

  leads.forEach(lead => {
    worksheet.addRow({
      lead: lead.lead,
      empresa: lead.empresa,
      categoria: lead.categoria,
      telefone: lead.telefone ?? '',
      whatsapp: lead.whatsapp ?? '',
      website: lead.website ?? '',
      endereco: lead.endereco ?? '',
      cidade: lead.cidade ?? '',
      estado: lead.estado ?? '',
      cep: lead.cep ?? '',
      avaliacao: lead.avaliacao ?? '',
      horario_funcionamento: lead.horario_funcionamento ?? '',
      aceita_cartao: lead.aceita_cartao ? 'Sim' : 'Não',
      mensagem_whatsapp: lead.mensagem_whatsapp ?? '',
      status_msg_wa: lead.status_msg_wa ?? '',
      status: lead.status,
      created_at: new Date(lead.created_at).toLocaleDateString('pt-BR'),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};
