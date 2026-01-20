import React, { useState, useCallback } from 'react';
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

const ShopifyLayout: React.FC = () => {
  const [mobileNavigationActive, setMobileNavigationActive] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleUserMenu = useCallback(
    () => setUserMenuOpen((userMenuOpen) => !userMenuOpen),
    [],
  );

  const handleNavigationToggle = useCallback(() => {
    setMobileNavigationActive((mobileNavigationActive) => !mobileNavigationActive);
  }, []);

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

  // Navigation Configuration
  const navigationMarkup = (
    <Navigation location={location.pathname}>
      {/* HOME */}
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
      
      {/* FINANZA */}
      <Navigation.Section
        title="Finanza"
        items={[
          {
            label: 'Situazione Finanziaria',
            icon: WalletIcon,
            url: '/conto', // Ripristinato URL per navigazione ed espansione
            onClick: () => navigate('/conto'),
            selected: location.pathname.startsWith('/conto') || location.pathname.startsWith('/bilancio'),
            subNavigationItems: [
              {
                label: 'Entrate',
                url: '/conto/entrate',
                onClick: () => navigate('/conto/entrate'),
              },
              {
                label: 'Uscite',
                url: '/bilancio/uscite',
                onClick: () => navigate('/bilancio/uscite'),
              },
              {
                label: 'Tasse',
                url: '/bilancio/tasse',
                onClick: () => navigate('/bilancio/tasse'),
              }
            ]
          },
          {
            label: 'Investimenti',
            icon: ChartVerticalIcon,
            url: '/investimenti',
            onClick: () => navigate('/investimenti'),
            selected: location.pathname.startsWith('/investimenti')
          },
          {
            label: 'Gestione Scadenze',
            icon: ReceiptIcon,
            url: '/scadenze',
            onClick: () => navigate('/scadenze'),
            selected: location.pathname.startsWith('/scadenze')
          }
        ]}
      />

      {/* GESTIONE CLIENTI */}
      <Navigation.Section
        title="Gestione Clienti"
        items={[
          {
            label: 'Clienti',
            icon: PersonIcon,
            url: '/anagrafica-clienti',
            onClick: () => navigate('/anagrafica-clienti'),
            selected: location.pathname.startsWith('/clienti') || location.pathname.startsWith('/preventivi') || location.pathname.startsWith('/contratti') || location.pathname.startsWith('/anagrafica-clienti'),
            subNavigationItems: [
              {
                label: 'Assessment',
                url: '/assessment-list',
                onClick: () => navigate('/assessment-list'),
              },
              {
                label: 'Preventivi',
                url: '/preventivi',
                onClick: () => navigate('/preventivi'),
              },
              {
                label: 'Contratti',
                url: '/contratti',
                onClick: () => navigate('/contratti'),
              }
            ]
          },
          {
            label: 'Sales Pipeline',
            icon: TargetIcon,
            url: '/sales',
            onClick: () => navigate('/sales'),
            selected: location.pathname.startsWith('/sales')
          }
        ]}
      />

      {/* GESTIONE TEAM */}
      <Navigation.Section
        title="Gestione Team"
        items={[
          {
            label: 'Team',
            icon: TeamIcon,
            url: '/team', 
            onClick: () => navigate('/team'),
            selected: location.pathname === '/team' || location.pathname === '/team/collaboratori' || location.pathname === '/team/produttivita' || location.pathname === '/produttivita', // Extended selection logic
            subNavigationItems: [
              {
                label: 'Collaboratori',
                url: '/team/collaboratori',
                onClick: () => navigate('/team/collaboratori'),
              },
              {
                label: 'Form Risposte',
                url: '/team/gradimento-risposte',
                onClick: () => navigate('/team/gradimento-risposte'),
              },
              {
                label: 'Produttività',
                url: '/produttivita',
                onClick: () => navigate('/produttivita'),
              },
              {
                label: 'Indice di Benessere',
                url: '/team/indice-benessere',
                onClick: () => navigate('/team/indice-benessere'),
              },
              {
                label: 'Bonus',
                url: '/team/bonus',
                onClick: () => navigate('/team/bonus'),
              },
              {
                label: 'Procedure',
                url: '/team/procedure',
                onClick: () => navigate('/team/procedure'),
              }
            ]
          },
          {
            label: 'Calendario',
            icon: CalendarIcon,
            url: '/calendario',
            onClick: () => navigate('/calendario'),
            selected: location.pathname.startsWith('/calendario')
          }
        ]}
      />

      {/* GESTIONE PROGETTI */}
      <Navigation.Section
        title="Gestione Progetti"
        items={[
          {
            label: 'Task Manager',
            icon: ListBulletedIcon,
            url: '/task',
            onClick: () => navigate('/task'),
            selected: location.pathname.startsWith('/task') || location.pathname.startsWith('/drive'),
            subNavigationItems: [
              {
                  label: 'Task',
                  url: '/task',
                  onClick: () => navigate('/task'),
              },
              {
                  label: 'Drive',
                  url: '/drive',
                  onClick: () => navigate('/drive'),
              }
            ]
          },
          {
            label: 'Workflow',
            icon: ClipboardIcon,
            url: '/workflow',
            onClick: () => navigate('/workflow'),
            selected: location.pathname.startsWith('/workflow')
          }
        ]}
      />

      {/* ANALISI E REPORT */}
      <Navigation.Section
        title="Analisi e Report"
        items={[
          {
            label: 'Analisi',
            icon: ChartVerticalIcon, // Sostituito AnalyticsIcon non trovato
            url: '/analisi',
            onClick: () => navigate('/analisi'),
            selected: location.pathname === '/analisi'
          },
          {
            label: 'Form Report',
            icon: ClipboardIcon,
            url: '/report-form',
            onClick: () => navigate('/report-form'),
            selected: location.pathname === '/report-form'
          }
        ]}
      />
      
      {/* IMPOSTAZIONI */}
      <Navigation.Section
        title="Impostazioni"
        items={[
            {
            label: 'Impostazioni',
            icon: SettingsIcon,
            url: '/impostazioni/accounts',
            onClick: () => navigate('/impostazioni/accounts'),
            selected: location.pathname.startsWith('/impostazioni'),
            subNavigationItems: [
              {
                label: 'Gestione Account',
                url: '/impostazioni/accounts',
                onClick: () => navigate('/impostazioni/accounts'),
              },
              {
                label: 'Categorie Task',
                url: '/impostazioni/tasks',
                onClick: () => navigate('/impostazioni/tasks'),
              },
              {
                label: 'Integrazioni',
                url: '/impostazioni/integrations',
                onClick: () => navigate('/impostazioni/integrations'),
              }
            ]
            }
        ]}
      />
    </Navigation>
  );

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

