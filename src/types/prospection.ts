export interface ProspectionSearch {
  id: string;
  niche: string;
  location: string;
  quantity: number;
  webhookUrl: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  whatsappStatus?: 'not_sent' | 'sent' | 'failed';
  whatsappSentAt?: Date;
}

export interface ProspectionFormData {
  niche: string;
  location: string;
  quantity: number;
  webhookUrl: string;
}
