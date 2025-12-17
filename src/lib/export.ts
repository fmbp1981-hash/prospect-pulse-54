import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Lead } from '@/types/prospection';

// Sanitizar dados para prevenir CSV injection
export const sanitizeForCSV = (value: string | number | boolean | undefined): string => {
  if (value === undefined || value === null) return '';
  
  const stringValue = String(value);
  
  // Remover caracteres perigosos que podem causar formula injection
  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some(char => stringValue.startsWith(char))) {
    return `'${stringValue}`; // Adicionar aspas simples para escapar
  }
  
  return stringValue;
};

export const exportToCSV = (leads: Lead[], filename: string, selectedColumns?: string[]) => {
  const columnMapping: Record<string, keyof Lead> = {
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

  const data = leads.map(lead => {
    const row: Record<string, string> = {};
    
    Object.entries(columnMapping).forEach(([displayName, key]) => {
      if (!selectedColumns || selectedColumns.includes(displayName)) {
        row[displayName] = sanitizeForCSV(lead[key]);
      }
    });
    
    return row;
  });

  const csv = Papa.unparse(data, {
    delimiter: ',',
    header: true,
    newline: '\n',
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM para UTF-8
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportToExcel = (leads: Lead[], filename: string, selectedColumns?: string[]) => {
  const columnMapping: Record<string, keyof Lead> = {
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
    'Data de Contato': 'dataContato',
    'Observações': 'observacoes',
    'Data Criação': 'createdAt',
    'Data Atualização': 'updatedAt',
  };

  const data = leads.map(lead => {
    const row: Record<string, unknown> = {};
    
    Object.entries(columnMapping).forEach(([displayName, key]) => {
      if (!selectedColumns || selectedColumns.includes(displayName)) {
        row[displayName] = lead[key] ?? '';
      }
    });
    
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Auto-ajustar largura das colunas
  const maxWidth = 50;
  const colWidths = Object.keys(data[0] || {}).map(key => {
    const maxLength = Math.max(
      key.length,
      ...data.map(row => String(row[key] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};
