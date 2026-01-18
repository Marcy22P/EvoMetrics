/**
 * Calendar API Service
 * Gestione integrazione Google Calendar
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

// Helper per headers autenticati
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ========================
// TIPI
// ========================

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  creator_email?: string;
  calendar_id?: string;
  color_id?: string;
  html_link?: string;
  is_all_day?: boolean;
  // Per eventi aggregati (admin view)
  owner_user_id?: string;
  owner_username?: string;
  owner_calendar_email?: string;
  // UI Props
  extendedProps?: any;
  allDay?: boolean;
}

export interface CalendarEventCreate {
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  target_user_id?: string; // Per admin: creare su altro calendario
  color_id?: string;
  recurrence?: string[];
}

export interface CalendarEventUpdate {
  summary?: string;
  description?: string;
  start?: string;
  end?: string;
  location?: string;
  attendees?: string[];
  color_id?: string;
}

export interface UserCalendarInfo {
  user_id: string;
  username: string;
  nome?: string;
  cognome?: string;
  calendar_email?: string;
  is_connected: boolean;
  connected_at?: string;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}

export interface FreeBusyResponse {
  user_id: string;
  username: string;
  calendar_email?: string;
  busy_slots: FreeBusySlot[];
}

export interface ConnectionStatus {
  connected: boolean;
  calendar_email?: string;
  connected_at?: string;
}

export interface AggregatedEventsResponse {
  events: CalendarEvent[];
  period: { start: string; end: string };
  users_count: number;
}

// ========================
// API FUNCTIONS
// ========================

/**
 * Ottieni URL per autorizzazione Google Calendar
 */
export const getAuthUrl = async (redirectUri: string): Promise<string> => {
  const params = new URLSearchParams({ redirect_uri: redirectUri });
  const response = await fetch(`${API_BASE}/api/auth/google/calendar/url?${params}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore generazione URL auth');
  }
  
  const data = await response.json();
  return data.authorization_url;
};

/**
 * Completa autorizzazione OAuth (chiamato dal callback)
 */
export const completeAuth = async (
  code: string,
  redirectUri: string
): Promise<{ success: boolean; calendar_email?: string }> => {
  // Backend aspetta JSON body, non query params per connect
  const response = await fetch(`${API_BASE}/api/auth/google/calendar/connect`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore callback OAuth');
  }
  
  return response.json();
};

/**
 * Scollega calendario Google
 */
export const disconnectCalendar = async (): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/auth/google/calendar/disconnect`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore disconnessione');
  }
};

/**
 * Verifica stato connessione calendario
 */
export const getConnectionStatus = async (userId: string): Promise<ConnectionStatus> => {
  const params = new URLSearchParams({ user_id: userId });
  const response = await fetch(`${API_BASE}/api/calendar/status?${params}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore verifica stato');
  }
  
  return response.json();
};

/**
 * Ottieni eventi del proprio calendario
 */
export const getEvents = async (
  userId: string,
  start?: Date,
  end?: Date
): Promise<CalendarEvent[]> => {
  const params = new URLSearchParams({ user_id: userId });
  if (start) params.append('start', start.toISOString());
  if (end) params.append('end', end.toISOString());
  
  const response = await fetch(`${API_BASE}/api/calendar/events?${params}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore fetch eventi');
  }
  
  return response.json();
};

/**
 * Crea nuovo evento
 */
export const createEvent = async (
  userId: string,
  event: CalendarEventCreate
): Promise<CalendarEvent> => {
  const params = new URLSearchParams({ user_id: userId });
  const response = await fetch(`${API_BASE}/api/calendar/events?${params}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(event),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore creazione evento');
  }
  
  return response.json();
};

/**
 * Aggiorna evento esistente
 */
export const updateEvent = async (
  userId: string,
  eventId: string,
  updates: CalendarEventUpdate
): Promise<CalendarEvent> => {
  const params = new URLSearchParams({ user_id: userId });
  const response = await fetch(`${API_BASE}/api/calendar/events/${eventId}?${params}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore aggiornamento evento');
  }
  
  return response.json();
};

/**
 * Elimina evento
 */
export const deleteEvent = async (userId: string, eventId: string): Promise<void> => {
  const params = new URLSearchParams({ user_id: userId });
  const response = await fetch(`${API_BASE}/api/calendar/events/${eventId}?${params}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore eliminazione evento');
  }
};

// ========================
// API ADMIN
// ========================

/**
 * [ADMIN] Ottieni lista utenti con stato connessione calendario
 */
export const getConnectedUsers = async (requestingUserId: string): Promise<UserCalendarInfo[]> => {
  const params = new URLSearchParams({ requesting_user_id: requestingUserId });
  const response = await fetch(`${API_BASE}/api/calendar/admin/users?${params}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore fetch utenti');
  }
  
  return response.json();
};

/**
 * [ADMIN] Ottieni tutti gli eventi aggregati
 */
export const getAllEvents = async (
  requestingUserId: string,
  start?: Date,
  end?: Date,
  userIds?: string[]
): Promise<AggregatedEventsResponse> => {
  const params = new URLSearchParams({ requesting_user_id: requestingUserId });
  if (start) params.append('start', start.toISOString());
  if (end) params.append('end', end.toISOString());
  if (userIds && userIds.length > 0) params.append('user_ids', userIds.join(','));
  
  const response = await fetch(`${API_BASE}/api/calendar/admin/all-events?${params}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore fetch eventi aggregati');
  }
  
  return response.json();
};

/**
 * [ADMIN] Ottieni disponibilità di tutti
 */
export const getFreeBusy = async (
  requestingUserId: string,
  start: Date,
  end: Date,
  userIds?: string[]
): Promise<FreeBusyResponse[]> => {
  const params = new URLSearchParams({ requesting_user_id: requestingUserId });
  const response = await fetch(`${API_BASE}/api/calendar/admin/freebusy?${params}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      start: start.toISOString(),
      end: end.toISOString(),
      user_ids: userIds,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Errore fetch disponibilità');
  }
  
  return response.json();
};

// ========================
// EXPORT DEFAULT
// ========================

export const calendarApi = {
  // OAuth
  getAuthUrl,
  completeAuth,
  disconnectCalendar,
  getConnectionStatus,
  // Eventi
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  // Admin
  getConnectedUsers,
  getAllEvents,
  getFreeBusy,
};

export default calendarApi;
