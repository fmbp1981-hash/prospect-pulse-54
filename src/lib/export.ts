import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { Lead } from '@/types/prospection';

const COLUMN_MAPPING: Record<string, keyof Lead> = {
  'Lead': 'lead',
  'Status': 'status',
  'Data': 'data',
  'Empresa': 'empresa',
  'Categoria': 'categoria',
  'Contato': 'contato',
  'WhatsApp': 'whatsapp',
  'Telefone': 'telefone',
  'Email': 'email',
  'Website': 'website',
  'Instagram': 'instagram',
  'Cidade': 'cidade',
  'Endereço': 'endereco',
  'Bairro/Região': 'bairroRegiao',
  'Link Google Maps': 'linkGMN',
  'Aceita Cartão': 'aceitaCartao',
  'CNPJ': 'cnpj',
  'Mensagem WhatsApp': 'mensagemWhatsApp',
  'Status WhatsApp': 'statusMsgWA',
  'Data Envio WA': 'dataEnvioWA',
  'Resumo Analítico': 'resumoAnalitico',
  'Origem': 'origem',
  'Prioridade': 'prioridade',
  'Região': 'regiao',
  'Segmento': 'segmento',
  'Ticket Médio Estimado': 'ticketMedioEstimado',
  'Contato Principal': 'contatoPrincipal',
  'Data Contato': 'dataContato',
  'Observações': 'observacoes',
  'Data Criação': 'createdAt',
  'Data Atualização': 'updatedAt',
};

// Sanitizar dados para prevenir CSV injection
export const sanitizeForCSV = (value: string | number | boolean | null | undefined): string => {
  if (value === undefined || value === null) return '';

  const stringValue = String(value);

  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some(char => stringValue.startsWith(char))) {
    return `'${stringValue}`;
  }

  return stringValue;
};

export const exportToCSV = (leads: Lead[], filename: string, selectedColumns?: string[]) => {
  const data = leads.map(lead => {
    const row: Record<string, string> = {};

    Object.entries(COLUMN_MAPPING).forEach(([displayName, key]) => {
      if (!selectedColumns || selectedColumns.includes(displayName)) {
        row[displayName] = sanitizeForCSV(lead[key] as string | number | boolean | null | undefined);
      }
    });

    return row;
  });

  const csv = Papa.unparse(data, {
    delimiter: ',',
    header: true,
    newline: '\n',
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportToExcel = async (leads: Lead[], filename: string, selectedColumns?: string[]): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads');

  const activeColumns = Object.keys(COLUMN_MAPPING).filter(
    col => !selectedColumns || selectedColumns.includes(col)
  );

  worksheet.columns = activeColumns.map(col => ({
    header: col,
    key: col,
    width: Math.min(col.length + 10, 50),
  }));

  leads.forEach(lead => {
    const row: Record<string, string> = {};
    activeColumns.forEach(displayName => {
      const key = COLUMN_MAPPING[displayName];
      row[displayName] = String(lead[key] ?? '');
    });
    worksheet.addRow(row);
  });

  // Auto-ajustar largura das colunas com base no conteúdo
  worksheet.columns.forEach(col => {
    if (!col.key) return;
    const colKey = col.key as string;
    const leadKey = COLUMN_MAPPING[colKey];
    const maxLength = Math.max(
      String(col.header ?? '').length,
      ...leads.map(lead => String(lead[leadKey] ?? '').length)
    );
    col.width = Math.min(maxLength + 2, 50);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};
