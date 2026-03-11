import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
// import './App.css' // Disabilitiamo CSS globale custom per favorire Polaris
import HomePage from './pages/HomePage' // NUOVA DASHBOARD
import BilancioPage from './pages/BilancioPage' // NUOVA PAGINA BILANCIO
import ContoPage from './pages/ContoPage' // NUOVA PAGINA CONTO
import ContoEntratePage from './pages/ContoEntratePage' // NUOVA PAGINA ENTRATE RICONCILIATE
import ContoUscitePage from './pages/ContoUscitePage' // NUOVA PAGINA USCITE CATEGORIZZATE
import EntratePage from './pages/EntratePage' // NUOVA PAGINA ENTRATE
import Assessment from './pages/Assessment' // Public Form
import AssessmentList from './pages/AssessmentList' // Private List (Punto 4)
import Preventivatore from './pages/Preventivatore'
import Contratti from './pages/Contratti'
// import Pagamenti from './pages/Pagamenti'
import Login from './pages/Login'
import Gradimento from './pages/Gradimento' // Legacy
import GradimentoForm from './pages/GradimentoForm' // Nuovo Form Polaris
import GradimentoList from './pages/GradimentoList' // Private List (Punto 6)
import { AuthProvider, useAuth } from './hooks/useAuth'
// AccountsManager ora è in Settings.tsx come AccountsManagerPolaris
import ProfileForm from './pages/ProfileForm'
import UserSettings from './pages/UserSettings'
import ShopifyIntegration from './pages/ShopifyIntegration' // Ex Clienti
import AnagraficaClienti from './pages/AnagraficaClienti' // Unified Registry (Punto 3)
import ClienteDetail from './pages/ClienteDetail'
import ShopifyInstall from './pages/ShopifyInstall'
import ShopifyThankYou from './pages/ShopifyThankYou'
import TaskManager from './pages/TaskManager'
import ProductivityDashboard from './pages/ProductivityDashboard'
import WorkflowBuilder from './pages/WorkflowBuilder'
import DrivePage from './pages/DrivePage'
import SubtitleJobStatus from './pages/SubtitleJobStatus'
// SubtitlesInbox replaced by ContenutiPage
import SubtitleReviewPage from './pages/SubtitleReviewPage'
import ContenutiPage from './pages/ContenutiPage'
import TeamCollaboratorsView from './pages/TeamCollaboratorsView'
import TeamOverview from './pages/TeamOverview'
import Calendar from './pages/Calendar'
import CalendarCallback from './pages/CalendarCallback'
// SettingsTasks ora è integrato in Settings.tsx
import Settings from './pages/Settings'
import SalesPipeline from './pages/SalesPipeline'
import EvoAgentPage from './pages/EvoAgentPage'
// import TeamCollaborators from './pages/TeamCollaborators' // Used internally by Team.tsx
import ShopifyLayout from './components/Layout/ShopifyLayout' // Nuovo Layout Polaris
import { TasksConfigurationProvider } from './contexts/TasksConfigurationContext'

// Componente per proteggere le route
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  const userWithProfile = user as any;
  const profileCompleted = React.useMemo(() => {
    return userWithProfile?.profile_completed === true;
  }, [user?.id, userWithProfile?.profile_completed]);
  
  const hasUserData = React.useMemo(() => {
    return !!(userWithProfile?.nome && userWithProfile?.cognome && userWithProfile?.email);
  }, [userWithProfile?.nome, userWithProfile?.cognome, userWithProfile?.email]);
  
  const shouldShowProfileForm = !profileCompleted && !hasUserData;
  
  React.useEffect(() => {
    if (profileCompleted && user) {
      const savedPath = localStorage.getItem('oauth_redirect_path');
      if (savedPath && savedPath === location.pathname) {
        localStorage.removeItem('oauth_redirect_path');
      }
    }
  }, [profileCompleted, location.pathname, user]);
  
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '1.2rem',
        color: '#202223', // Polaris Text Color
        background: '#F6F6F7' // Polaris Background
      }}>
        Caricamento...
      </div>
    );
  }

  if (!user) {
    const originalPath = location.pathname;
    if (originalPath && originalPath !== '/login' && originalPath !== '/') {
      localStorage.setItem('oauth_redirect_path', originalPath);
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (location.pathname === '/profile') {
    return <>{children}</>;
  }
  
  if (shouldShowProfileForm) {
    return <Navigate to="/profile" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const RequirePermission: React.FC<{ perm: string; children: React.ReactNode }> = ({ perm, children }) => {
  const { hasPermission, loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div>Caricamento...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return hasPermission(perm) ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Route Pubbliche */}
      <Route path="/login" element={<Login />} />
      <Route path="/assessment" element={<Assessment />} /> {/* Form Pubblico */}
      <Route path="/gradimento" element={<Gradimento />} /> {/* Form Pubblico */}
      <Route path="/shopify-install/:token" element={<ShopifyInstall />} />
      <Route path="/shopify-thankyou" element={<ShopifyThankYou />} />
      
      {/* Route Protette con ShopifyLayout */}
      <Route element={
        <ProtectedRoute>
          <ShopifyLayout />
        </ProtectedRoute>
      }>
        {/* DASHBOARD / HOME */}
        <Route path="/" element={<HomePage />} />

        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/homepage" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        
        {/* AMMINISTRAZIONE */}
        <Route path="/bilancio" element={<BilancioPage />} /> {/* Nuova Pagina Finanziaria */}
        
        {/* Sottovoci Bilancio */}
        {/* <Route path="/bilancio/entrate" element={<EntratePage />} /> Spostato */}
        <Route path="/bilancio/uscite" element={
          <RequirePermission perm="dashboard:read">
            <ContoUscitePage />
          </RequirePermission>
        } />
        <Route path="/bilancio/tasse" element={<div className="page-container"><h1>Tasse</h1><p>Sezione in sviluppo</p></div>} />

        {/* NUOVA PAGINA CONTO */}
        <Route path="/conto" element={
          <RequirePermission perm="dashboard:read">
             <ContoPage />
          </RequirePermission>
        } />
        
        <Route path="/conto/entrate" element={
          <RequirePermission perm="dashboard:read">
             <ContoEntratePage />
          </RequirePermission>
        } />

        <Route path="/scadenze" element={
          <RequirePermission perm="pagamenti:read">
             <EntratePage /> 
          </RequirePermission>
        } />
        
        <Route path="/gestione-pagamenti" element={
          <RequirePermission perm="pagamenti:read">
             <EntratePage /> 
          </RequirePermission>
        } />

        <Route path="/pagamenti" element={<Navigate to="/gestione-pagamenti" replace />} />

        {/* GESTIONE COMMERCIALE */}
        <Route path="/anagrafica-clienti" element={
            <RequirePermission perm="clienti:read">
                <AnagraficaClienti />
            </RequirePermission>
        } />
        
        <Route path="/clienti" element={<Navigate to="/anagrafica-clienti" replace />} />
        
        <Route path="/clienti/:id" element={
          <RequirePermission perm="clienti:read">
            <ClienteDetail />
          </RequirePermission>
        } />

        <Route path="/assessment-list" element={
            <RequirePermission perm="assessments:read">
                <AssessmentList />
            </RequirePermission>
        } />

        <Route path="/preventivi" element={
          <RequirePermission perm="preventivi:read">
            <Preventivatore />
          </RequirePermission>
        } />
        
        <Route path="/contratti" element={
          <RequirePermission perm="contratti:read">
            <Contratti />
          </RequirePermission>
        } />

        {/* SALES PIPELINE */}
        <Route path="/sales" element={
          <RequirePermission perm="clienti:read">
            <SalesPipeline />
          </RequirePermission>
        } />

        {/* INTEGRAZIONI */}
        <Route path="/integrazioni/shopify" element={
            <RequirePermission perm="clienti:read">
                <ShopifyIntegration />
            </RequirePermission>
        } />
        
        <Route path="/shopify_integrations" element={<Navigate to="/integrazioni/shopify" replace />} />
        <Route path="/shopify_integrations/:id" element={
          <RequirePermission perm="clienti:read">
            <ClienteDetail />
          </RequirePermission>
        } />

        {/* GESTIONE TEAM */}
        <Route path="/team" element={
            <RequirePermission perm="team:read">
                <ProductivityDashboard />
            </RequirePermission>
        } />
        
        {/* Collaboratori - Vista per tutti */}
        <Route path="/team/collaboratori" element={
            <RequirePermission perm="users:read">
                <TeamCollaboratorsView />
            </RequirePermission>
        } />

        {/* La mia produttività personale */}
        <Route path="/team/produttivita" element={
            <RequirePermission perm="task:read">
                <TeamOverview />
            </RequirePermission>
        } />

        <Route path="/team/gradimento-risposte" element={
            <RequirePermission perm="gradimento:read">
                <GradimentoList />
            </RequirePermission>
        } />

        <Route path="/team/gradimento-nuovo" element={
            <GradimentoForm />
        } />
        
        {/* CALENDARIO */}
        <Route path="/calendario" element={
            <RequirePermission perm="calendar:read">
                <Calendar />
            </RequirePermission>
        } />
        <Route path="/calendario/callback" element={
            <RequirePermission perm="calendar:read">
                <CalendarCallback />
            </RequirePermission>
        } />

        {/* IMPOSTAZIONI - Con sub-routes */}
        <Route path="/impostazioni" element={<Navigate to="/impostazioni/profile" replace />} />
        <Route path="/impostazioni/profile" element={<UserSettings />} />
        <Route path="/impostazioni/accounts" element={
          <RequirePermission perm="users:write">
            <Settings tab="accounts" />
          </RequirePermission>
        } />
        <Route path="/impostazioni/tasks" element={
          <RequirePermission perm="admin">
            <Settings tab="tasks" />
          </RequirePermission>
        } />
        <Route path="/impostazioni/integrations" element={
          <RequirePermission perm="admin">
            <Settings tab="integrations" />
          </RequirePermission>
        } />
        <Route path="/impostazioni/drive" element={
          <RequirePermission perm="admin">
            <Settings tab="drive" />
          </RequirePermission>
        } />
        
        {/* Redirect vecchie route */}
        <Route path="/accounts_manager" element={<Navigate to="/impostazioni/accounts" replace />} />
        
        <Route path="/profile" element={<ProfileForm />} />
        
        {/* PLACEHOLDERS */}
        <Route path="/investimenti" element={<div className="page-container"><h1>Investimenti</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/produttivita" element={<ProductivityDashboard />} />
        <Route path="/task" element={<TaskManager />} />
        <Route path="/workflow" element={<WorkflowBuilder />} />
        <Route path="/drive" element={<DrivePage />} />
        
          {/* CONTENUTI HUB */}
        <Route path="/contenuti" element={<ContenutiPage />} />
        
        {/* SUBTITLE WORKFLOW (legacy routes, redirect to contenuti) */}
        <Route path="/subtitles/jobs/:id" element={<SubtitleJobStatus />} />
        <Route path="/subtitles/inbox" element={<Navigate to="/contenuti" replace />} />
        <Route path="/subtitles/review/:id" element={<SubtitleReviewPage />} />

        <Route path="/attenzione-clienti" element={<div className="page-container"><h1>Attenzione Clienti</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/team/indice-benessere" element={<div className="page-container"><h1>Indice di Benessere</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/team/bonus" element={<div className="page-container"><h1>Bonus</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/team/procedure" element={<div className="page-container"><h1>Procedure</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/analisi" element={<div className="page-container"><h1>Analisi</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/report-form" element={<div className="page-container"><h1>Form Richieste</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/dashboard-generale" element={<div className="page-container"><h1>Dashboard Generale</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/manuale" element={<div className="page-container"><h1>Manuale Utente</h1><p>Sezione in sviluppo</p></div>} />
        <Route path="/sistema" element={<div className="page-container"><h1>Stato Sistema</h1><p>Sezione in sviluppo</p></div>} />

      </Route>

      {/* EVO AGENT — layout dedicato full-screen (fuori ShopifyLayout) */}
      <Route
        path="/evo-agent"
        element={
          <ProtectedRoute>
            <EvoAgentPage />
          </ProtectedRoute>
        }
      />

      {/* Redirect default */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <TasksConfigurationProvider>
      <AppRoutes />
      </TasksConfigurationProvider>
    </AuthProvider>
  )
}

export default App
