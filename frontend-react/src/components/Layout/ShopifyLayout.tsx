import React, { useState, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Frame, Navigation, TopBar } from '@shopify/polaris';
import {
  HomeIcon,
  WalletIcon,
  ReceiptIcon,
  PersonIcon,
  ClipboardIcon,
  ExitIcon,
  ChartVerticalIcon,
  CalendarIcon,
  TeamIcon,
  ListBulletedIcon,
  TargetIcon,
  SettingsIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../../hooks/useAuth';
import './ShopifyLayout.css';

// Definizione permessi per sezione
// NOTA: Basta avere UNO dei permessi elencati per accedere alla sezione
const PERMISSION_MAP = {
  // Finanza (solo admin)
  finanza: ['finanza:read', 'pagamenti:read'],
  entrate: ['finanza:read', 'pagamenti:read'],
  uscite: ['finanza:read', 'pagamenti:read'],
  tasse: ['finanza:read', 'pagamenti:read'],
  investimenti: ['investimenti:read'],
  scadenze: ['finanza:read', 'pagamenti:read'],
  
  // Gestione Clienti
  clienti: ['clienti:read'],
  assessment: ['assessments:read'],  // Solo chi ha assessments:read vede Assessment
  preventivi: ['preventivi:read'],
  contratti: ['contratti:read'],
  sales: ['sales:read'],
  
  // Gestione Team
  team: ['team:read', 'users:read'],
  collaboratori: ['users:read'],  // Tutti possono vedere chi è iscritto
  gradimento: ['gradimento:read', 'gradimento:write'],  // Chi può compilare O vedere
  produttivita: ['task:read'],
  benessere: ['team:read'],  // Coming Soon - visibile a chi ha team:read
  bonus: ['team:read'],  // Coming Soon - visibile a chi ha team:read
  procedure: ['team:read'],  // Coming Soon - visibile a chi ha team:read
  calendario: ['calendar:read'],
  
  // Gestione Progetti
  task: ['task:read'],
  drive: ['clienti:read'],
  workflow: ['workflow:read'],
  
  // Analisi (solo admin)
  analisi: ['analytics:read'],
  report: ['analytics:read'],
  
  // Impostazioni
  impostazioni: ['settings:read'],
  accounts: ['users:write'],  // Solo chi può modificare vede Gestione Account
  accountsView: ['users:read'],  // Per vedere lista collaboratori (non modificare)
  taskCategories: ['task:write'],
  integrations: ['settings:read'],
};

const ShopifyLayout: React.FC = () => {
  const [mobileNavigationActive, setMobileNavigationActive] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleUserMenu = useCallback(
    () => setUserMenuOpen((userMenuOpen) => !userMenuOpen),
    [],
  );

  const handleNavigationToggle = useCallback(() => {
    setMobileNavigationActive((mobileNavigationActive) => !mobileNavigationActive);
  }, []);

  // Helper: verifica se l'utente ha almeno uno dei permessi richiesti
  const canAccess = useCallback((section: keyof typeof PERMISSION_MAP): boolean => {
    // Superadmin e Admin vedono tutto
    if (user?.role === 'superadmin' || user?.role === 'admin') return true;
    
    const requiredPerms = PERMISSION_MAP[section];
    if (!requiredPerms || requiredPerms.length === 0) return true;
    
    // Basta avere UNO dei permessi elencati
    return requiredPerms.some(perm => hasPermission(perm));
  }, [user, hasPermission]);

  // User Menu Actions
  const userMenuActions = [
    {
      items: [
        { content: 'Profilo', icon: PersonIcon, onAction: () => navigate('/impostazioni/profile') },
        { content: 'Logout', icon: ExitIcon, onAction: logout },
      ],
    },
  ];

  // Top Bar Configuration
  const userMenuMarkup = (
    <TopBar.UserMenu
      actions={userMenuActions}
      name={user?.username || 'Admin'}
      detail={user?.role || 'User'}
      initials={user?.username?.substring(0, 2).toUpperCase() || 'EI'}
      open={userMenuOpen}
      onToggle={toggleUserMenu}
    />
  );

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      userMenu={userMenuMarkup}
      onNavigationToggle={handleNavigationToggle}
    />
  );

  // Costruzione dinamica del menu basata sui permessi
  const navigationMarkup = useMemo(() => {
    // Sezione FINANZA
    const finanzaSubItems = [];
    if (canAccess('entrate')) {
      finanzaSubItems.push({
        label: 'Entrate',
        url: '/conto/entrate',
        onClick: () => navigate('/conto/entrate'),
      });
    }
    if (canAccess('uscite')) {
      finanzaSubItems.push({
        label: 'Uscite',
        url: '/bilancio/uscite',
        onClick: () => navigate('/bilancio/uscite'),
      });
    }
    if (canAccess('tasse')) {
      finanzaSubItems.push({
        label: 'Tasse',
        url: '/bilancio/tasse',
        onClick: () => navigate('/bilancio/tasse'),
      });
    }

    const finanzaItems = [];
    if (canAccess('finanza') && finanzaSubItems.length > 0) {
      finanzaItems.push({
        label: 'Situazione Finanziaria',
        icon: WalletIcon,
        url: '/conto',
        onClick: () => navigate('/conto'),
        selected: location.pathname.startsWith('/conto') || location.pathname.startsWith('/bilancio'),
        subNavigationItems: finanzaSubItems
      });
    }
    if (canAccess('investimenti')) {
      finanzaItems.push({
        label: 'Investimenti',
        icon: ChartVerticalIcon,
        url: '/investimenti',
        onClick: () => navigate('/investimenti'),
        selected: location.pathname.startsWith('/investimenti')
      });
    }
    if (canAccess('scadenze')) {
      finanzaItems.push({
        label: 'Gestione Scadenze',
        icon: ReceiptIcon,
        url: '/scadenze',
        onClick: () => navigate('/scadenze'),
        selected: location.pathname.startsWith('/scadenze')
      });
    }

    // Sezione CLIENTI
    const clientiSubItems = [];
    if (canAccess('assessment')) {
      clientiSubItems.push({
        label: 'Assessment',
        url: '/assessment-list',
        onClick: () => navigate('/assessment-list'),
      });
    }
    if (canAccess('preventivi')) {
      clientiSubItems.push({
        label: 'Preventivi',
        url: '/preventivi',
        onClick: () => navigate('/preventivi'),
      });
    }
    if (canAccess('contratti')) {
      clientiSubItems.push({
        label: 'Contratti',
        url: '/contratti',
        onClick: () => navigate('/contratti'),
      });
    }

    const clientiItems = [];
    if (canAccess('clienti')) {
      clientiItems.push({
        label: 'Clienti',
        icon: PersonIcon,
        url: '/anagrafica-clienti',
        onClick: () => navigate('/anagrafica-clienti'),
        selected: location.pathname.startsWith('/clienti') || location.pathname.startsWith('/preventivi') || location.pathname.startsWith('/contratti') || location.pathname.startsWith('/anagrafica-clienti'),
        subNavigationItems: clientiSubItems.length > 0 ? clientiSubItems : undefined
      });
    }
    if (canAccess('sales')) {
      clientiItems.push({
        label: 'Sales Pipeline',
        icon: TargetIcon,
        url: '/sales',
        onClick: () => navigate('/sales'),
        selected: location.pathname.startsWith('/sales')
      });
    }

    // Sezione TEAM
    const teamSubItems = [];
    // La mia produttività personale - sempre visibile per chi può vedere task
    if (canAccess('produttivita')) {
      teamSubItems.push({
        label: 'La Mia Produttività',
        url: '/team/produttivita',
        onClick: () => navigate('/team/produttivita'),
      });
    }
    if (canAccess('collaboratori')) {
      teamSubItems.push({
        label: 'Collaboratori',
        url: '/team/collaboratori',
        onClick: () => navigate('/team/collaboratori'),
      });
    }
    if (canAccess('gradimento')) {
      teamSubItems.push({
        label: 'Form Risposte',
        url: '/team/gradimento-risposte',
        onClick: () => navigate('/team/gradimento-risposte'),
      });
    }
    if (canAccess('benessere')) {
      teamSubItems.push({
        label: 'Indice di Benessere',
        url: '/team/indice-benessere',
        onClick: () => navigate('/team/indice-benessere'),
      });
    }
    if (canAccess('bonus')) {
      teamSubItems.push({
        label: 'Bonus',
        url: '/team/bonus',
        onClick: () => navigate('/team/bonus'),
      });
    }
    if (canAccess('procedure')) {
      teamSubItems.push({
        label: 'Procedure',
        url: '/team/procedure',
        onClick: () => navigate('/team/procedure'),
      });
    }

    const teamItems = [];
    if (canAccess('team') && teamSubItems.length > 0) {
      teamItems.push({
        label: 'Team',
        icon: TeamIcon,
        url: '/team',
        onClick: () => navigate('/team'),
        selected: location.pathname === '/team' || location.pathname.startsWith('/team/') || location.pathname === '/produttivita',
        subNavigationItems: teamSubItems
      });
    }
    if (canAccess('calendario')) {
      teamItems.push({
        label: 'Calendario',
        icon: CalendarIcon,
        url: '/calendario',
        onClick: () => navigate('/calendario'),
        selected: location.pathname.startsWith('/calendario')
      });
    }

    // Sezione PROGETTI
    const taskSubItems = [];
    if (canAccess('task')) {
      taskSubItems.push({
        label: 'Task',
        url: '/task',
        onClick: () => navigate('/task'),
      });
    }
    if (canAccess('drive')) {
      taskSubItems.push({
        label: 'Drive',
        url: '/drive',
        onClick: () => navigate('/drive'),
      });
    }

    const progettiItems = [];
    if (canAccess('task') && taskSubItems.length > 0) {
      progettiItems.push({
        label: 'Task Manager',
        icon: ListBulletedIcon,
        url: '/task',
        onClick: () => navigate('/task'),
        selected: location.pathname.startsWith('/task') || location.pathname.startsWith('/drive'),
        subNavigationItems: taskSubItems
      });
    }
    if (canAccess('workflow')) {
      progettiItems.push({
        label: 'Workflow',
        icon: ClipboardIcon,
        url: '/workflow',
        onClick: () => navigate('/workflow'),
        selected: location.pathname.startsWith('/workflow')
      });
    }

    // Sezione ANALISI
    const analisiItems = [];
    if (canAccess('analisi')) {
      analisiItems.push({
        label: 'Analisi',
        icon: ChartVerticalIcon,
        url: '/analisi',
        onClick: () => navigate('/analisi'),
        selected: location.pathname === '/analisi'
      });
    }
    if (canAccess('report')) {
      analisiItems.push({
        label: 'Form Report',
        icon: ClipboardIcon,
        url: '/report-form',
        onClick: () => navigate('/report-form'),
        selected: location.pathname === '/report-form'
      });
    }

    // Sezione IMPOSTAZIONI
    const impostazioniSubItems = [];
    
    // Profilo personale - SEMPRE visibile per tutti gli utenti autenticati
    impostazioniSubItems.push({
      label: 'Il Mio Profilo',
      url: '/impostazioni/profile',
      onClick: () => navigate('/impostazioni/profile'),
    });
    
    // Gestione Account - solo admin
    if (canAccess('accounts')) {
      impostazioniSubItems.push({
        label: 'Gestione Account',
        url: '/impostazioni/accounts',
        onClick: () => navigate('/impostazioni/accounts'),
      });
    }
    if (canAccess('taskCategories')) {
      impostazioniSubItems.push({
        label: 'Categorie Task',
        url: '/impostazioni/tasks',
        onClick: () => navigate('/impostazioni/tasks'),
      });
    }
    if (canAccess('integrations')) {
      impostazioniSubItems.push({
        label: 'Integrazioni',
        url: '/impostazioni/integrations',
        onClick: () => navigate('/impostazioni/integrations'),
      });
    }

    // Impostazioni sempre visibili perché almeno "Il Mio Profilo" è sempre presente
    const impostazioniItems = [{
      label: 'Impostazioni',
      icon: SettingsIcon,
      url: '/impostazioni/profile',
      onClick: () => navigate('/impostazioni/profile'),
      selected: location.pathname.startsWith('/impostazioni'),
      subNavigationItems: impostazioniSubItems
    }];

    return (
      <Navigation location={location.pathname}>
        {/* HOME - sempre visibile */}
        <Navigation.Section
          items={[
            {
              url: '/',
              label: 'Home',
              icon: HomeIcon,
              selected: location.pathname === '/',
              onClick: () => navigate('/')
            },
          ]}
        />
        
        {/* FINANZA - solo se ha permessi */}
        {finanzaItems.length > 0 && (
          <Navigation.Section
            title="Finanza"
            items={finanzaItems}
          />
        )}

        {/* GESTIONE CLIENTI - solo se ha permessi */}
        {clientiItems.length > 0 && (
          <Navigation.Section
            title="Gestione Clienti"
            items={clientiItems}
          />
        )}

        {/* GESTIONE TEAM - solo se ha permessi */}
        {teamItems.length > 0 && (
          <Navigation.Section
            title="Gestione Team"
            items={teamItems}
          />
        )}

        {/* GESTIONE PROGETTI - solo se ha permessi */}
        {progettiItems.length > 0 && (
          <Navigation.Section
            title="Gestione Progetti"
            items={progettiItems}
          />
        )}

        {/* ANALISI E REPORT - solo se ha permessi */}
        {analisiItems.length > 0 && (
          <Navigation.Section
            title="Analisi e Report"
            items={analisiItems}
          />
        )}
        
        {/* IMPOSTAZIONI - solo se ha permessi */}
        {impostazioniItems.length > 0 && (
          <Navigation.Section
            title="Impostazioni"
            items={impostazioniItems}
          />
        )}
      </Navigation>
    );
  }, [location.pathname, canAccess, navigate]);

  return (
    <Frame
      topBar={topBarMarkup}
      navigation={navigationMarkup}
      showMobileNavigation={mobileNavigationActive}
      onNavigationDismiss={handleNavigationToggle}
      logo={{
        topBarSource: '/assets/logo-evoluzione-white.png',
        width: 180, 
        url: '/',
        accessibilityLabel: 'Evoluzione Imprese',
      }}
    >
      <Outlet />
    </Frame>
  );
};

export default ShopifyLayout;
