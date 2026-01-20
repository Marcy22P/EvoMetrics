import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Page, Card, Box, ButtonGroup, Button, Text, InlineStack, Spinner, Modal, Icon, Badge, Divider, BlockStack, Avatar, Banner, Select } from '@shopify/polaris';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon,
  CalendarIcon,
  ClockIcon,
  ExternalIcon,
  WorkIcon,
  CheckCircleIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import calendarApi from '../services/calendarApi';
import type { UserCalendarInfo } from '../services/calendarApi';
import { productivityApi } from '../services/productivityApi';
import { usersApi } from '../services/usersApi';
import { clientiApi } from '../services/clientiApi';
import { inferTaskCategory, getTaskIcon } from '../utils/taskUtils';
import { useTasksConfiguration } from '../contexts/TasksConfigurationContext';
import toast from 'react-hot-toast';
import './Calendar.css';

const Calendar: React.FC = () => {
  const { categories } = useTasksConfiguration();
  const { user } = useAuth();
  const calendarRef = useRef<FullCalendar>(null);
  const [currentView, setCurrentView] = useState('dayGridMonth');
  const [title, setTitle] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Cache per i Task (per evitare fetch ripetuti)
  const [cachedTasks, setCachedTasks] = useState<any[] | null>(null);
  // Cache per range Google Calendar già caricati (stringa "startIso|endIso")
  const loadedGoogleRanges = useRef<Set<string>>(new Set());
  const [googleEventsCache, setGoogleEventsCache] = useState<any[]>([]);

  // Metadata Cache (Users, Clients)
  const [usersMap, setUsersMap] = useState<Map<number, any>>(new Map());
  const [clientsMap, setClientsMap] = useState<Map<string, any>>(new Map());

  // Modal stati
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);

  // Range corrente visualizzato
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);

  // Google Calendar Connection
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [calendarEmail, setCalendarEmail] = useState<string>('');
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  // Admin: Lista utenti con calendario collegato
  const [connectedUsers, setConnectedUsers] = useState<UserCalendarInfo[]>([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const handleViewChange = useCallback((view: string) => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.changeView(view);
      setCurrentView(view);
    }
  }, []);

  const handlePrev = useCallback(() => calendarRef.current?.getApi().prev(), []);
  const handleNext = useCallback(() => calendarRef.current?.getApi().next(), []);
  const handleToday = useCallback(() => calendarRef.current?.getApi().today(), []);

  // Fetch Task e Metadata (Una tantum all'avvio)
  useEffect(() => {
    const loadData = async () => {
        try {
            const [tasks, users, clients] = await Promise.all([
                productivityApi.getTasks(),
                usersApi.getUsers(),
                clientiApi.getClienti()
            ]);
            
            setCachedTasks(tasks.filter((t: any) => t.due_date));
            setUsersMap(new Map(users.map(u => [u.id, u])));
            setClientsMap(new Map(clients.map(c => [c.id, c])));

        } catch (e) {
            console.error('Errore loading data:', e);
            toast.error('Errore caricamento dati iniziali');
        }
    };
    loadData();
  }, []);

  // Verifica stato connessione Google Calendar
  useEffect(() => {
    const checkCalendarConnection = async () => {
      if (!user?.id) return;
      try {
        const status = await calendarApi.getConnectionStatus(String(user.id));
        setCalendarConnected(status.connected);
        setCalendarEmail(status.calendar_email || '');
      } catch (e) {
        console.warn('Errore verifica calendario:', e);
        setCalendarConnected(false);
      }
    };
    checkCalendarConnection();
  }, [user?.id]);

  // Admin: Carica lista utenti con calendario collegato
  useEffect(() => {
    const loadConnectedUsers = async () => {
      if (!isAdmin || !user?.id) return;
      try {
        const users = await calendarApi.getConnectedUsers(String(user.id));
        setConnectedUsers(users);
      } catch (e) {
        console.warn('Errore caricamento utenti calendario:', e);
      }
    };
    loadConnectedUsers();
  }, [isAdmin, user?.id]);

  // Handler per connettere Google Calendar
  const handleConnectCalendar = async () => {
    if (!user?.id) return;
    setConnectingCalendar(true);
    try {
      const redirectUri = `${window.location.origin}/calendario/callback`;
      localStorage.setItem('calendar_oauth_redirect', '/calendario');
      const authUrl = await calendarApi.getAuthUrl(redirectUri);
      window.location.href = authUrl;
    } catch (e: any) {
      toast.error(e.message || 'Errore avvio collegamento');
      setConnectingCalendar(false);
    }
  };

  // Handler per scollegare Google Calendar
  const handleDisconnectCalendar = async () => {
    try {
      await calendarApi.disconnectCalendar();
      setCalendarConnected(false);
      setCalendarEmail('');
      toast.success('Calendario scollegato');
    } catch (e: any) {
      toast.error(e.message || 'Errore scollegamento');
    }
  };

  // Fetch dati Google per range (con supporto filtro utente per admin)
  const fetchCalendarData = useCallback(async (start: Date, end: Date, forceRefresh = false) => {
    if (!user?.id) return;
    
    const filterKey = selectedUserFilter === 'all' ? 'all' : selectedUserFilter;
    const rangeKey = `${start.getFullYear()}-${start.getMonth()}-${end.getFullYear()}-${end.getMonth()}-${filterKey}`;
    
    if (!forceRefresh && loadedGoogleRanges.current.has(rangeKey)) {
        return; // Skip se già caricato
    }

    setLoading(true);
    try {
      let newGoogleEvents: any[] = [];
      
      try {
          if (isAdmin) {
            // Admin: carica eventi di tutti o di un utente specifico
            const userIds = selectedUserFilter !== 'all' ? [selectedUserFilter] : undefined;
            const res = await calendarApi.getAllEvents(String(user.id), start, end, userIds);
            newGoogleEvents = res.events || [];
          } else if (calendarConnected) {
            // Utente normale: solo i propri eventi (se collegato)
            newGoogleEvents = await calendarApi.getEvents(String(user.id), start, end);
          }
      } catch (e) {
          console.warn('Errore fetch Google Calendar:', e);
      }

      // Quando cambia filtro, sostituisci invece di aggiungere
      if (forceRefresh) {
        setGoogleEventsCache(newGoogleEvents);
        loadedGoogleRanges.current.clear();
      } else {
        setGoogleEventsCache(prev => {
            const combined = [...prev, ...newGoogleEvents];
            const unique = new Map(combined.map(e => [e.id, e]));
            return Array.from(unique.values());
        });
      }
      loadedGoogleRanges.current.add(rangeKey);

    } catch (error) {
      console.error('Errore fetch google:', error);
      toast.error('Errore caricamento eventi esterni');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, calendarConnected, selectedUserFilter]);

  // Mappa tone Polaris → Colori FullCalendar
  const TONE_COLORS: Record<string, string> = {
    critical: '#D72C0D',   // Rosso
    warning: '#B98900',    // Arancione/Giallo
    success: '#50B83C',    // Verde
    info: '#4285F4',       // Blu
    base: '#637381',       // Grigio
    attention: '#F49342',  // Arancione default
  };

  // Unione Eventi (Memoized)
  useEffect(() => {
      const mappedGoogle = googleEventsCache.map((e: any) => ({
            id: e.id,
            title: e.summary,
            start: e.start,
            end: e.end,
            allDay: e.is_all_day,
            backgroundColor: '#4285F4',
            borderColor: '#4285F4',
            extendedProps: { type: 'google', ...e }
      }));

      const mappedTasks = (cachedTasks || []).map((t: any) => {
            // Determina il colore dalla categoria
            const category = inferTaskCategory(t, categories);
            const tone = category?.tone || 'base';
            
            // Task completate: usa verde indipendentemente dalla categoria
            const isCompleted = t.status === 'done' || t.status === 'completed';
            const bgColor = isCompleted ? '#50B83C' : (TONE_COLORS[tone] || TONE_COLORS.base);
            
            return {
                id: `task-${t.id}`,
                title: t.title,
                start: t.due_date,
                allDay: true,
                backgroundColor: bgColor,
                borderColor: bgColor,
                extendedProps: { type: 'task', category, ...t }
            };
      });

      setEvents([...mappedGoogle, ...mappedTasks]);
  }, [googleEventsCache, cachedTasks, categories]);


  // Aggiorna dati quando cambia il range (es. cambio mese)
  useEffect(() => {
    if (dateRange) {
        fetchCalendarData(dateRange.start, dateRange.end);
    }
  }, [dateRange, fetchCalendarData]);

  // Refresh quando cambia il filtro utente (admin)
  useEffect(() => {
    if (isAdmin && dateRange) {
        fetchCalendarData(dateRange.start, dateRange.end, true);
    }
  }, [selectedUserFilter]);

  const handleEventClick = useCallback((info: any) => {
    const eventObj = {
        id: info.event.id,
        title: info.event.title,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay,
        extendedProps: info.event.extendedProps
    };
    setSelectedEvent(eventObj);
    setShowEventDetailModal(true);
  }, []);

  const handleDatesSet = (arg: any) => {
    setTitle(arg.view.title);
    // Imposta il range per triggerare il fetch
    setDateRange({ start: arg.start, end: arg.end });
  };

  // Render Modal Dettaglio
  const renderEventDetailModal = () => {
    if (!selectedEvent) return null;
    
    const isTask = selectedEvent.extendedProps?.type === 'task';
    const props = selectedEvent.extendedProps || {};
    const startStr = selectedEvent.start?.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = selectedEvent.allDay ? 'Tutto il giorno' : selectedEvent.start?.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    // Lookup Metadata
    const assignee = props.assignee_id ? usersMap.get(Number(props.assignee_id)) : null;
    const client = props.project_id ? clientsMap.get(props.project_id) : null;
    
    // Categorizzazione
    const category = isTask ? inferTaskCategory(selectedEvent, categories) : null;
    
    const googleLink = props.htmlLink || props.html_link;

    return (
        <Modal
            open={showEventDetailModal}
            onClose={() => setShowEventDetailModal(false)}
            title={selectedEvent.title.replace(/^📋\s*/, '')}
            primaryAction={{
                content: 'Chiudi',
                onAction: () => setShowEventDetailModal(false),
            }}
        >
            <Modal.Section>
                <BlockStack gap="500">
                    {/* Header con Badges */}
                    <InlineStack gap="200" align="start" blockAlign="center" wrap={false}>
                        {isTask && category && <Badge tone={category.tone as any}>{category.label}</Badge>}
                        <Badge tone={isTask ? 'info' : 'new'}>{isTask ? 'Interno' : 'Google Calendar'}</Badge>
                        {props.status && <Badge tone={props.status === 'done' ? 'success' : 'attention'}>{props.status === 'done' ? 'Completato' : props.status}</Badge>}
                        {props.priority && <Badge tone={props.priority === 'high' ? 'critical' : 'info'}>{props.priority}</Badge>}
                    </InlineStack>
                    
                    <Divider />

                    {/* Dettagli Temporali */}
                    <InlineStack gap="400" align="start" blockAlign="center">
                        <Box minWidth="24px"><Icon source={ClockIcon} tone="subdued" /></Box>
                        <BlockStack gap="100">
                            <Text as="p" variant="bodyLg" fontWeight="semibold">{startStr}</Text>
                            <Text as="p" variant="bodyMd" tone="subdued">{timeStr}</Text>
                        </BlockStack>
                    </InlineStack>

                    {/* Assegnatario */}
                    {assignee && (
                        <InlineStack gap="300" align="start" blockAlign="center" wrap={false}>
                            <div style={{ minWidth: '24px', minHeight: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                 <Avatar source={assignee.avatar_url} name={assignee.full_name || assignee.email || 'User'} size="xs" />
                            </div>
                            <Text as="span" variant="bodyMd">
                                Assegnato a: <Text as="span" fontWeight="semibold">{assignee.full_name || assignee.email || 'N/A'}</Text>
                            </Text>
                        </InlineStack>
                    )}

                    {/* Cliente e Azioni Rapide */}
                    {client && (
                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="300">
                                <InlineStack gap="300" align="start" blockAlign="center" wrap={false}>
                                    <div style={{ minWidth: '20px', display: 'flex', alignItems: 'center' }}>
                                        <Icon source={WorkIcon} tone="base" />
                                    </div>
                                    <Text as="span" variant="headingSm" fontWeight="semibold">
                                        {client.nome_azienda || client.nome_completo || 'Cliente'}
                                    </Text>
                                </InlineStack>
                                
                                <ButtonGroup fullWidth>
                                    <Button url={`/clienti/${client.id}`} icon={ExternalIcon} target="_blank">Scheda</Button>
                                    <Button 
                                        disabled={!client.dettagli?.drive_folder_id} 
                                        onClick={() => window.open(`https://drive.google.com/drive/folders/${client.dettagli.drive_folder_id}`, '_blank')}
                                        icon={ExternalIcon} 
                                    >
                                        Drive
                                    </Button>
                                    {googleLink ? (
                                        <Button url={googleLink} target="_blank" icon={CalendarIcon}>Apri Meet</Button>
                                    ) : (
                                        <Button onClick={() => toast.success('Funzionalità creazione Meet in arrivo')} icon={CalendarIcon}>Fissa Call</Button>
                                    )}
                                </ButtonGroup>
                            </BlockStack>
                        </Box>
                    )}

                    {/* Descrizione */}
                    {props.description && (
                        <Box padding="400" borderColor="border" borderWidth="025" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingXs" tone="subdued">Descrizione</Text>
                                <Text as="p" variant="bodyMd">{props.description}</Text>
                            </BlockStack>
                        </Box>
                    )}
                    
                    {/* Link Google Generico (se non c'è cliente) */}
                    {!client && googleLink && (
                        <Box paddingBlockStart="200">
                            <Button fullWidth icon={ExternalIcon} onClick={() => window.open(googleLink, '_blank')}>
                                Visualizza su Google Calendar
                            </Button>
                        </Box>
                    )}
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
  };



  // Opzioni filtro utenti per admin
  const userFilterOptions = [
    { label: 'Tutti i calendari', value: 'all' },
    ...connectedUsers
      .filter(u => u.is_connected)
      .map(u => ({
        label: `${u.nome || u.username} ${u.cognome || ''}`.trim() + (u.calendar_email ? ` (${u.calendar_email})` : ''),
        value: u.user_id
      }))
  ];

  return (
    <Page fullWidth title="Calendario">
      <BlockStack gap="400">
        {/* Banner connessione Google Calendar (solo se non connesso) */}
        {calendarConnected === false && (
          <Banner
            title="Collega il tuo Google Calendar"
            tone="info"
            action={{
              content: connectingCalendar ? 'Collegamento...' : 'Collega ora',
              onAction: handleConnectCalendar,
              loading: connectingCalendar
            }}
            onDismiss={() => setCalendarConnected(null)}
          >
            <p>Sincronizza i tuoi eventi Google Calendar per visualizzarli insieme alle task.</p>
          </Banner>
        )}

        {/* Banner calendario collegato (mostra email) */}
        {calendarConnected && calendarEmail && (
          <Banner
            tone="success"
            icon={CheckCircleIcon}
            action={{
              content: 'Scollega',
              onAction: handleDisconnectCalendar
            }}
          >
            <InlineStack gap="200" blockAlign="center">
              <Text as="span">Google Calendar collegato:</Text>
              <Text as="span" fontWeight="semibold">{calendarEmail}</Text>
            </InlineStack>
          </Banner>
        )}

        {/* Admin: Filtro utenti e panoramica */}
        {isAdmin && connectedUsers.length > 0 && (
          <Card>
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Vista Admin - Calendari Team</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    {connectedUsers.filter(u => u.is_connected).length} di {connectedUsers.length} utenti con calendario collegato
                  </Text>
                </BlockStack>
                <div style={{ width: '300px' }}>
                  <Select
                    label="Filtra per utente"
                    labelHidden
                    options={userFilterOptions}
                    value={selectedUserFilter}
                    onChange={(value) => setSelectedUserFilter(value)}
                  />
                </div>
              </InlineStack>
            </Box>
          </Card>
        )}

      <Card>
        <Box padding="400" borderBlockEndWidth="025" borderColor="border">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="400" blockAlign="center">
               <InlineStack gap="200" blockAlign="center">
                 <Text as="h2" variant="headingLg" fontWeight="bold">{title}</Text>
                 {loading && <Spinner size="small" />}
               </InlineStack>
               <ButtonGroup variant="segmented">
                  <Button icon={ChevronLeftIcon} onClick={handlePrev} accessibilityLabel="Mese precedente" />
                  <Button onClick={handleToday}>Oggi</Button>
                  <Button icon={ChevronRightIcon} onClick={handleNext} accessibilityLabel="Mese successivo" />
               </ButtonGroup>
            </InlineStack>
            <ButtonGroup variant="segmented">
              <Button pressed={currentView === 'dayGridMonth'} onClick={() => handleViewChange('dayGridMonth')}>Mese</Button>
              <Button pressed={currentView === 'timeGridWeek'} onClick={() => handleViewChange('timeGridWeek')}>Settimana</Button>
              <Button pressed={currentView === 'timeGridDay'} onClick={() => handleViewChange('timeGridDay')}>Giorno</Button>
              <Button pressed={currentView === 'listWeek'} onClick={() => handleViewChange('listWeek')}>Lista</Button>
            </ButtonGroup>
          </InlineStack>
        </Box>
        <div style={{ height: '75vh', padding: '16px' }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="dayGridMonth"
            headerToolbar={false}
            height="100%"
            locale="it"
            firstDay={1} // Lunedì
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            allDayText="Tutto il giorno"
            datesSet={handleDatesSet}
            events={events}
            eventClick={handleEventClick}
            eventClassNames={(arg) => {
                if (arg.event.end && arg.event.end < new Date()) {
                    return ['event-past'];
                }
                return [];
            }}
            eventContent={(eventInfo) => {
                const { event } = eventInfo;
                const isTask = event.extendedProps.type === 'task';
                const category = event.extendedProps.category;
                // Usa l'icona della categoria o del task, fallback a ClipboardIcon
                const iconSource = isTask 
                    ? getTaskIcon(category?.icon || event.extendedProps.icon)
                    : CalendarIcon;
                
                if (eventInfo.view.type === 'listWeek') {
                    return null; 
                }
            
                return (
                    <div className="fc-event-content-custom">
                        <div className="fc-event-icon">
                            <Icon source={iconSource} tone="base" />
                        </div>
                        <div className="fc-event-text-container">
                            {eventInfo.timeText && !event.allDay && <div className="fc-event-time-custom">{eventInfo.timeText}</div>}
                            <div className="fc-event-title-custom">{event.title}</div>
                        </div>
                    </div>
                );
            }}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              meridiem: false
            }}
          />
        </div>
      </Card>
      </BlockStack>
      {renderEventDetailModal()}
    </Page>
  );
};

export default Calendar;
