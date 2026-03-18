import { getServiceUrl, getApiGatewayUrl } from '../utils/apiConfig';

const SALES_SERVICE_URL = getServiceUrl('sales');
const MCP_SERVICE_URL   = getApiGatewayUrl();

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

export interface LeadNote {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

export type ResponseStatus = 'pending' | 'no_show' | 'show' | 'followup' | 'qualified' | 'not_interested' | 'callback';

export interface ResponseStatusOption {
  value: ResponseStatus;
  label: string;
}

export interface LeadTag {
  id: number;
  label: string;
  color: string;
  hex_color?: string;  // V2: colore hex custom
  index: number;
  is_system: boolean;
}

export interface LeadTagCreate {
  label: string;
  color?: string;
  hex_color?: string;
  index?: number;
}

export interface LeadTagUpdate {
  label?: string;
  color?: string;
  hex_color?: string;
  index?: number;
}

// V2: Servizio associato a un deal
export interface DealService {
  name: string;
  price: number;
}

// V2: Utente assegnato
export interface PipelineUser {
  id: string;
  username: string;
  nome?: string;
  cognome?: string;
  role?: string;
}

// V2: Analytics mensile
export interface MonthlyValueItem {
  month: number;
  label: string;
  total_value: number;
  leads_count: number;
  delta_pct: number | null;
}

export interface MonthlyValueResponse {
  year: number;
  months: MonthlyValueItem[];
  year_total: number;
}

export interface Lead {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  azienda?: string;
  stage: string;
  source: string;
  clickfunnels_data?: { [key: string]: any };
  notes?: string;
  response_status?: ResponseStatus;
  lead_tag_id?: number;
  lead_tag?: LeadTag;
  structured_notes?: LeadNote[];
  // V2 fields
  deal_value?: number;
  deal_currency?: string;
  deal_services?: DealService[];
  linked_preventivo_id?: string;
  linked_contratto_id?: string;
  source_channel?: string;
  assigned_to_user_id?: string;
  assigned_to_user?: PipelineUser;
  created_at: string;
  updated_at: string;
  // V3 fields
  stage_entered_at?: string;
  first_contact_at?: string;
  first_appointment_at?: string;
  last_activity_at?: string;
  no_show_count?: number;
  follow_up_count?: number;
  consapevolezza?: string;
  obiettivo_cliente?: string;
  pacchetto_consigliato?: string;
  budget_indicativo?: string;
  setter_id?: string;
  appointment_date?: string;
  follow_up_date?: string;
  second_appointment_date?: string;
  trattativa_persa_reason?: string;
  lead_score?: number;
  converted_at?: string;
  contract_date?: string;       // Data firma contratto
  aircall_contact_id?: string;  // ID contatto su AirCall
}

export interface LeadCreate {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  azienda?: string;
  stage?: string;
  notes?: string;
  response_status?: ResponseStatus;
  lead_tag_id?: number;
  clickfunnels_data?: { [key: string]: any };
  // V2 fields
  deal_value?: number;
  deal_currency?: string;
  deal_services?: DealService[];
  source_channel?: string;
  assigned_to_user_id?: string;
}

export interface LeadUpdatePayload {
  stage?: string;
  notes?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  azienda?: string;
  response_status?: ResponseStatus;
  lead_tag_id?: number | null;
  // V2 fields
  deal_value?: number | null;
  deal_currency?: string;
  deal_services?: DealService[] | null;
  linked_preventivo_id?: string | null;
  linked_contratto_id?: string | null;
  source_channel?: string | null;
  assigned_to_user_id?: string | null;
  // V3 fields
  stage_entered_at?: string | null;
  first_contact_at?: string | null;
  first_appointment_at?: string | null;
  last_activity_at?: string | null;
  no_show_count?: number | null;
  follow_up_count?: number | null;
  consapevolezza?: string | null;
  obiettivo_cliente?: string | null;
  pacchetto_consigliato?: string | null;
  budget_indicativo?: string | null;
  setter_id?: string | null;
  appointment_date?: string | null;
  follow_up_date?: string | null;
  second_appointment_date?: string | null;
  trattativa_persa_reason?: string | null;
  lead_score?: number | null;
  converted_at?: string | null;
  contract_date?: string | null;      // Data firma contratto
  aircall_contact_id?: string | null; // ID contatto AirCall
}

export interface AircallCall {
  id: number;
  direction: 'inbound' | 'outbound';
  status: 'done' | 'missed' | 'answered' | 'voicemail' | string;
  duration: number;
  started_at?: number;
  ended_at?: number;
  recording?: string;
  voicemail?: string;
  contact?: { id: number; name?: string; phone_number?: string };
  user?: { id: number; name?: string; email?: string };
  number?: { id: number; name?: string; digits?: string };
  comments?: Array<{ id: number; content: string; author?: { name: string } }>;
}

export const salesApi = {
  // --- LEADS ---
  getLeads: async (stage?: string): Promise<Lead[]> => {
    const url = stage ? `${SALES_SERVICE_URL}/api/leads?stage=${stage}` : `${SALES_SERVICE_URL}/api/leads`;
    return authenticatedFetch(url);
  },

  /** Scarica CSV di tutte le opportunità in pipeline (overview). */
  downloadLeadsCsv: async (): Promise<void> => {
    const token = getAuthToken();
    const res = await fetch(`${SALES_SERVICE_URL}/api/leads/export/csv`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(res.statusText || 'Export fallito');
    const blob = await res.blob();
    const name = res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? 'pipeline-opportunita.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },

  createLead: async (data: LeadCreate): Promise<Lead> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getLead: async (id: string): Promise<Lead> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/leads/${id}`);
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

  // --- RESPONSE STATUS (DEPRECATO) ---
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

  // --- LEAD TAGS ---
  getLeadTags: async (): Promise<LeadTag[]> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/lead-tags`);
  },

  createLeadTag: async (data: LeadTagCreate): Promise<LeadTag> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/lead-tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateLeadTag: async (tagId: number, data: LeadTagUpdate): Promise<LeadTag> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/lead-tags/${tagId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteLeadTag: async (tagId: number): Promise<{ status: string; tag_id: number }> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/lead-tags/${tagId}`, {
      method: 'DELETE',
    });
  },

  reorderLeadTags: async (order: number[]): Promise<{ status: string }> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/lead-tags/reorder`, {
      method: 'POST',
      body: JSON.stringify(order),
    });
  },

  // --- V2: ANALYTICS ---
  getMonthlyValue: async (year?: number): Promise<MonthlyValueResponse> => {
    const url = year
      ? `${SALES_SERVICE_URL}/api/pipeline/analytics/monthly-value?year=${year}`
      : `${SALES_SERVICE_URL}/api/pipeline/analytics/monthly-value`;
    return authenticatedFetch(url);
  },

  // --- V2: SERVICES ---
  getAvailableServices: async (): Promise<any> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/services`);
  },

  // --- V2: SOURCE CHANNELS ---
  getSourceChannels: async (): Promise<{ channels: string[] }> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/source-channels`);
  },

  // --- V2: PIPELINE USERS ---
  getPipelineUsers: async (): Promise<PipelineUser[]> => {
    return authenticatedFetch(`${SALES_SERVICE_URL}/api/pipeline/users`);
  },

  // --- AIRCALL ---

  /** Sincronizza un singolo lead come contatto AirCall. */
  pushLeadToAircall: async (leadId: string): Promise<{
    success: boolean;
    aircall_contact_id: string;
    action: 'created' | 'linked' | 'updated';
    name: string;
    message: string;
  }> => {
    return authenticatedFetch(`${MCP_SERVICE_URL}/api/mcp/aircall/push-lead`, {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId }),
    });
  },

  /** Sincronizza più lead (o tutti gli attivi) su AirCall. */
  bulkPushToAircall: async (leadIds?: string[]): Promise<{
    synced: number;
    failed: number;
    total: number;
    results: Array<{ lead_id: string; name?: string; aircall_contact_id?: string; action?: string; error?: string }>;
  }> => {
    return authenticatedFetch(`${MCP_SERVICE_URL}/api/mcp/aircall/bulk-push`, {
      method: 'POST',
      body: JSON.stringify({ lead_ids: leadIds ?? [] }),
    });
  },

  /** Recupera le chiamate AirCall di un lead sincronizzato. */
  getLeadAircallCalls: async (leadId: string): Promise<{
    calls: AircallCall[];
    aircall_contact_id?: string;
    message?: string;
  }> => {
    return authenticatedFetch(`${MCP_SERVICE_URL}/api/mcp/aircall/calls/${leadId}`);
  },

  dialLead: async (leadId: string): Promise<{
    success: boolean;
    phone: string;
    aircall_user_id: string;
    lead_name: string;
  }> => {
    return authenticatedFetch(`${MCP_SERVICE_URL}/api/mcp/aircall/dial`, {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId }),
    });
  },

  reconcileAircall: async (): Promise<{
    matched: number;
    updated_aircall_info: number;
    skipped_already_linked: number;
    message: string;
  }> => {
    return authenticatedFetch(`${MCP_SERVICE_URL}/api/mcp/aircall/reconcile`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
