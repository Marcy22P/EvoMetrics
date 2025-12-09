import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  DashboardIcon, 
  MoneyBagIcon, 
  UserIcon, 
  AssessmentListIcon, 
  CheckmarkIcon,
  ToolsIcon,
  ChartIcon,
  ServerIcon,
  BuildingIcon,
  GlobeIcon
} from '../Icons/AssessmentIcons';
import './SidebarNew.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface MenuItem {
  path: string;
  label: string;
  icon?: React.ReactNode;
  permission?: string;
  children?: MenuItem[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const SidebarNew: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'AMMINISTRAZIONE': true,
    'GESTIONE COMMERCIALE': true,
    'INTEGRAZIONI': true,
    'GESTIONE SERVIZI': true,
    'GESTIONE TEAM': true,
    'ANALISI E REPORT': true,
    'IMPOSTAZIONI': false
  });

  // Stato per i sottomenu
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  // Auto-expand menu based on current route
  React.useEffect(() => {
    // Trova il menu che dovrebbe essere aperto
    const activeMenu = menuStructure
      .flatMap(s => s.items)
      .find(item => item.children && location.pathname.startsWith(item.path));
      
    if (activeMenu) {
        setExpandedMenus({ [activeMenu.label]: true });
    }
  }, [location.pathname]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  // Definizione struttura menu basata sulle richieste specifiche
  const menuStructure: MenuSection[] = [
    {
      title: 'AMMINISTRAZIONE',
      items: [
        { path: '/', label: 'Home', icon: <DashboardIcon />, permission: 'dashboard:read' },
        { 
          path: '/conto', 
          label: 'Conto', 
          icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M21,18V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H19A2,2 0 0,1 21,5V6H12C10.89,6 10,6.9 10,8V16A2,2 0 0,0 12,18M12,16H22V8H12M16,13.5A1.5,1.5 0 0,1 14.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12A1.5,1.5 0 0,1 16,13.5Z" /></svg>, 
          permission: 'dashboard:read',
          children: [
            { path: '/conto/entrate', label: 'Entrate' }
          ]
        },
        { 
            path: '/bilancio', 
            label: 'Bilancio', 
            icon: <ChartIcon />, 
            permission: 'dashboard:read',
            children: [
                // { path: '/bilancio/entrate', label: 'Entrate' }, // Spostato in Gestione Pagamenti
                { path: '/bilancio/uscite', label: 'Uscite' },
                { path: '/bilancio/tasse', label: 'Tasse' }
            ]
        },
        { path: '/scadenze', label: 'Scadenze', icon: <MoneyBagIcon />, permission: 'pagamenti:read' },
        { path: '/gestione-pagamenti', label: 'Gestione Pagamenti', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5,6H23V18H5V6M14,9A3,3 0 0,1 17,12A3,3 0 0,1 14,15A3,3 0 0,1 11,12A3,3 0 0,1 14,9M9,8A2,2 0 0,1 7,10V14A2,2 0 0,1 9,16H19A2,2 0 0,1 21,14V10A2,2 0 0,1 19,8H9M1,10H3V20H19V22H1V10Z" /></svg>, permission: 'pagamenti:read' },
        { path: '/investimenti', label: 'Investimenti', icon: <ChartIcon /> }
      ]
    },
    {
      title: 'GESTIONE COMMERCIALE',
      items: [
        // Punto 3: Anagrafica Clienti (Registro unificato)
        { path: '/anagrafica-clienti', label: 'Anagrafica Clienti', icon: <BuildingIcon />, permission: 'clienti:read' },
        // Punto 4: Assessment (Risposte del form)
        { path: '/assessment-list', label: 'Assessment', icon: <AssessmentListIcon />, permission: 'assessments:read' },
        { path: '/preventivi', label: 'Preventivatore', icon: <MoneyBagIcon />, permission: 'preventivi:read' },
        { path: '/contratti', label: 'Contratti', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>, permission: 'contratti:read' }
      ]
    },
    {
      title: 'INTEGRAZIONI', // Punto 3: Nuova Macroarea
      items: [
        { path: '/integrazioni/shopify', label: 'Shopify', icon: <GlobeIcon />, permission: 'clienti:read' },
      ]
    },
    {
      title: 'GESTIONE SERVIZI',
      items: [
        { path: '/produttivita', label: 'Produttività Team', icon: <ChartIcon /> },
        { path: '/task', label: 'Task', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9L10,17Z" /></svg>, permission: 'task:read' },
        { path: '/attenzione-clienti', label: 'Attenzione su clienti', icon: <UserIcon /> }
      ]
    },
    {
      title: 'GESTIONE TEAM',
      items: [
        // Punto 5: Anagrafica Collab (solo lista collaboratori)
        { path: '/team/collaboratori', label: 'Anagrafica Collab', icon: <UserIcon />, permission: 'users:read' },
        // Punto 6: Form (Risposte gradimento)
        { path: '/team/gradimento-risposte', label: 'Form Team', icon: <CheckmarkIcon />, permission: 'gradimento:read' },
        // Punto 7: Indice di Benessere (Score - Todo)
        { path: '/team/indice-benessere', label: 'Indice di Benessere', icon: <ChartIcon /> },
        { path: '/team/bonus', label: 'Bonus', icon: <MoneyBagIcon /> },
        { path: '/team/procedure', label: 'Procedure', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg> }
      ]
    },
    {
      title: 'ANALISI E REPORT',
      items: [
        { path: '/analisi', label: 'Analisi', icon: <ChartIcon /> },
        { path: '/report-form', label: 'Form richieste', icon: <ToolsIcon /> },
        // Placeholder per la vera Dashboard generica (Punto 1)
        { path: '/dashboard-generale', label: 'Dashboard', icon: <DashboardIcon /> } 
      ]
    },
    {
      title: 'IMPOSTAZIONI',
      items: [
        // Punto 5: Accounts Manager spostato qui
        { path: '/impostazioni/accounts', label: 'Gestione Accounts', icon: <UserIcon />, permission: 'users:write' },
        { path: '/manuale', label: 'Manuale utente', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M13,17H11V15H13M13,13H11V7H13" /></svg> },
        { path: '/workflow', label: 'Workflow', icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" /></svg> },
        { path: '/sistema', label: 'Stato sistema', icon: <ServerIcon /> }
      ]
    }
  ];

  const getUserInitials = (username: string) => {
    return username ? username.substring(0, 2).toUpperCase() : 'U';
  };

  return (
    <div className={`sidebar-new ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <img 
            src={collapsed ? "/assets/logo_black_300x300.png" : "/assets/logo-evoluzione-white.png"}
            alt="Evoluzione Imprese" 
            className="sidebar-logo"
          />
        </div>
        <button className="sidebar-toggle-btn" onClick={onToggle}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d={collapsed ? "M9,18L15,12L9,6V18Z" : "M15,18L9,12L15,6V18Z"} />
          </svg>
        </button>
      </div>

      <div className="sidebar-menu-container">
        {menuStructure.map((section, index) => {
          const visibleItems = section.items.filter(item => 
            !item.permission || hasPermission(item.permission)
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={index} className={`sidebar-section ${expandedSections[section.title] ? 'expanded' : 'collapsed'}`}>
              {!collapsed && (
                <div 
                  className="section-title"
                  onClick={() => toggleSection(section.title)}
                >
                  <span>{section.title}</span>
                  <svg 
                    className="section-arrow"
                    viewBox="0 0 24 24" 
                    width="14" 
                    height="14" 
                    fill="currentColor"
                  >
                    <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
                  </svg>
                </div>
              )}
              
              <div className="section-items">
                {visibleItems.map((item, idx) => (
                  item.children ? (
                    <div key={idx} className="menu-group">
                        <NavLink 
                            to={item.path}
                            className={({ isActive }) => `menu-item group-header ${isActive || location.pathname.startsWith(item.path) ? 'active' : ''} ${expandedMenus[item.label] ? 'open' : ''}`}
                            onClick={() => {
                                // Al click sul link, apriamo il menu ESCLUSIVAMENTE se è chiuso
                                if (!expandedMenus[item.label]) {
                                    setExpandedMenus({ [item.label]: true });
                                }
                            }}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%' }}
                        >
                            <span className="menu-icon">{item.icon}</span>
                            {!collapsed && (
                                <span className="menu-label" style={{ flex: 1 }}>{item.label}</span>
                            )}
                        </NavLink>
                        {!collapsed && (
                            <div 
                                className="submenu"
                                style={{ 
                                    maxHeight: expandedMenus[item.label] ? '500px' : '0',
                                    overflow: 'hidden',
                                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    paddingLeft: '0'
                                }}
                            >
                                {item.children.map((child, childIdx) => (
                                    <NavLink
                                        key={childIdx}
                                        to={child.path}
                                        className={({ isActive }) => `menu-item submenu-item ${isActive ? 'active' : ''}`}
                                        style={{ 
                                            fontSize: '0.9rem', 
                                            paddingLeft: '3.5rem', /* Shopify style indentation */
                                            opacity: 0.8,
                                            height: '36px'
                                        }}
                                    >
                                        <span className="menu-label">{child.label}</span>
                                    </NavLink>
                                ))}
                            </div>
                        )}
                    </div>
                  ) : (
                    <NavLink
                        key={idx}
                        to={item.path}
                        className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
                        title={collapsed ? item.label : ''}
                        onClick={() => setExpandedMenus({})} // Chiude eventuali sottomenu aperti
                    >
                        <span className="menu-icon">{item.icon}</span>
                        {!collapsed && <span className="menu-label">{item.label}</span>}
                    </NavLink>
                  )
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">{user ? getUserInitials(user.username) : 'U'}</div>
          {!collapsed && (
            <div className="user-info">
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SidebarNew;
