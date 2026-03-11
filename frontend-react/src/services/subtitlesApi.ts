import { getServiceUrl } from '../utils/apiConfig';

const SUBTITLES_SERVICE_URL = getServiceUrl('subtitles');

export interface SubtitleJob {
  id: string;
  cliente_id: string;
  content_type: "organico" | "paid_ads";
  input_drive_file_id: string;
  input_drive_file_name: string;
  status: "draft" | "queued" | "processing" | "generated" | "in_review" | "approved" | "rejected" | "error";
  progress: number;
  error_message?: string;
  created_by_user_id: number;
  assigned_reviewer_id?: number;
  created_at: string;
  updated_at: string;
  metadata?: any;
}

export interface SubtitleVersion {
  id: string;
  job_id: string;
  version: number; // 1=AI, 2=revised, 3=approved
  content: Array<{start: number, end: number, text: string, uncertain: boolean}>;
  drive_srt_file_id?: string;
  drive_lrc_file_id?: string;
  drive_ass_file_id?: string;
  drive_dump_file_id?: string;
  created_at: string;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('Token di autenticazione non trovato');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const createSubtitleJob = async (data: {
  cliente_id: string;
  drive_file_id: string;
  drive_file_name: string;
  content_type: "organico" | "paid_ads";
}): Promise<SubtitleJob> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Errore creazione job: ${text}`);
  }
  return response.json();
};

export const getSubtitleJobs = async (filters?: {
  cliente_id?: string;
  status?: string;
  assigned_to_me?: boolean;
}): Promise<SubtitleJob[]> => {
  const headers = getAuthHeaders();
  const url = new URL(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs`);
  if (filters) {
    if (filters.cliente_id) url.searchParams.append('cliente_id', filters.cliente_id);
    if (filters.status) url.searchParams.append('status', filters.status);
    if (filters.assigned_to_me) url.searchParams.append('assigned_to_me', 'true');
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Errore recupero jobs');
  }
  const data = await response.json();
  // Il backend ritorna { jobs: [...], total: N }
  return data.jobs || data;
};

export const getSubtitleJobById = async (id: string): Promise<SubtitleJob & { versions: SubtitleVersion[] }> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs/${id}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Errore recupero job');
  }
  return response.json();
};

export const submitForReview = async (id: string): Promise<SubtitleJob> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs/${id}/submit-review`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Errore invio a revisione');
  }
  return response.json();
};

export const approveJob = async (id: string, notes?: string): Promise<SubtitleJob> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs/${id}/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notes }),
  });

  if (!response.ok) {
    throw new Error('Errore approvazione job');
  }
  return response.json();
};

export const rejectJob = async (id: string, notes: string): Promise<SubtitleJob> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs/${id}/reject`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notes }),
  });

  if (!response.ok) {
    throw new Error('Errore rifiuto job');
  }
  return response.json();
};

export const updateSubtitleVersion = async (job_id: string, version: number, content: any): Promise<SubtitleVersion> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs/${job_id}/versions/${version}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error('Errore aggiornamento versione');
  }
  return response.json();
};

// ========================
// COMMENTS API
// ========================

export interface ContentComment {
  id: string;
  drive_file_id: string;
  cliente_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  replies?: ContentComment[];
}

export const getComments = async (driveFileId: string): Promise<ContentComment[]> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/comments/${driveFileId}`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) throw new Error('Errore recupero commenti');
  return response.json();
};

export const createComment = async (data: {
  drive_file_id: string;
  cliente_id: string;
  content: string;
  parent_id?: string;
}): Promise<ContentComment> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Errore creazione commento');
  return response.json();
};

export const deleteComment = async (commentId: string): Promise<void> => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/comments/${commentId}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('Errore eliminazione commento');
};

// ========================
// DOWNLOAD API
// ========================

export const downloadSubtitles = async (job_id: string, format: "srt" | "lrc" | "ass") => {
  const headers = getAuthHeaders();
  const response = await fetch(`${SUBTITLES_SERVICE_URL}/api/subtitles/jobs/${job_id}/download/${format}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Errore download ${format}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  // Estrai filename dall'header Content-Disposition se presente
  const disposition = response.headers.get('Content-Disposition');
  let filename = `subtitles.${format}`;
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];
  }
  
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
