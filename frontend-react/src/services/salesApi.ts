import { getServiceUrl } from '../utils/apiConfig';

const SALES_SERVICE_URL = getServiceUrl('sales');

const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export interface PipelineStage {
  id: number;
  key: string;
  label: string;
  color: string;
  index: number;
  is_system: boolean;
}

// Nota strutturata per lead
export interface LeadNote {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

// Status risposta possibili
export type ResponseStatus = 'pending' | 'no_show' | 'show' | 'followup' | 'qualified' | 'not_interested' | 'callback';

export interface ResponseStatusOption {
  value: ResponseStatus;
  label: string;
}

export interface Lead {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  azienda?: string;  // Nome azienda
  stage: string;
  source: string;
  clickfunnels_data?: { [key: string]: any };
  notes?: string;  // Legacy
  response_status?: ResponseStatus;  // Stato risposta: pending, no_show, show, etc.
  structured_notes?: LeadNote[];  // Note strutturate
  created_at: string;
  updated_at: string;
}

export interface LeadCreate {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  azienda?: string;  // Nome azienda
  stage?: string;
  notes?: string;
  response_status?: ResponseStatus;
  clickfunnels_data?: { [key: string]: any };
}

export interface LeadUpdatePayload {
  stage?: string;
  notes?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  azienda?: string;  // Nome azienda
  response_status?: ResponseStatus;
}

export const salesApi = {
  // --- LEADS ---
  getLeads: async (stage?: string): Promise<Lead[]> => {
    const url = stage ? `${SALES_SERVICE_URL}/api/leads?stage=${stage}` : `${SALES_SERVICE_URL}/api/leads`;
    return authenticatedFetch(url);
  },

  createLead: async (data: LeadCreate): Promise<Lead> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateLead: async (id: string, data: LeadUpdatePayload): Promise<Lead> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteLead: async (id: string): Promise<void> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/${id}`, {
      method: 'DELETE',
    });
  },

  // --- STAGES ---
  getStages: async (): Promise<PipelineStage[]> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/stages`);
  },
  
  createStage: async (data: Omit<PipelineStage, 'id'>): Promise<PipelineStage> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/stages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  updateStage: async (id: number, data: Partial<PipelineStage>): Promise<PipelineStage> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/stages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  deleteStage: async (id: number, fallbackStage?: string): Promise<void> => {
    const url = fallbackStage 
      ? `${SALES_SERVICE_URL}/api/pipeline/stages/${id}?fallback_stage_key=${fallbackStage}`
      : `${SALES_SERVICE_URL}/api/pipeline/stages/${id}`;
    return authenticatedFetch(url, { method: 'DELETE' });
  },
  
  reorderStages: async (order: number[]): Promise<void> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/stages/reorder`, {
      method: 'POST',
      body: JSON.stringify(order),
    });
  },

  // --- RESPONSE STATUS ---
  getResponseStatuses: async (): Promise<ResponseStatusOption[]> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/response-statuses`);
  },

  // --- LEAD NOTES ---
  addNote: async (leadId: string, content: string): Promise<{ status: string; note: LeadNote; total_notes: number }> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/${leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  updateNote: async (leadId: string, noteId: string, content: string): Promise<{ status: string; notes: LeadNote[] }> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/${leadId}/notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  },

  deleteNote: async (leadId: string, noteId: string): Promise<{ status: string; remaining_notes: number }> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/${leadId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  },
};
