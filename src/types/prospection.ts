export interface ProspectionSearch {
  id: string;
  niche: string;
  location: string;
  quantity: number;
  webhookUrl: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ProspectionFormData {
  niche: string;
  location: string;
  quantity: number;
  webhookUrl: string;
}
