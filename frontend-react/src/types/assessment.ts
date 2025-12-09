export interface AssessmentResponse {
  id: string;
  data: Record<string, any>;
  status: string;
  created_at?: string;
  updated_at?: string;
  source?: string;
  client_info?: Record<string, any>;
  notes?: string;
}


