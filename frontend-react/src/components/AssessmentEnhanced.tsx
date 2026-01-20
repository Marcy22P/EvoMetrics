import React from 'react';

// Icone SVG per le sezioni - dimensioni fisse
const IconBuilding = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
    <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
  </svg>
);

const IconGlobe = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
    <path d="M2 12h20"/>
  </svg>
);

const IconTarget = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);

const IconMegaphone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
  </svg>
);

const IconBarChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>
  </svg>
);

const IconAlertTriangle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
);

const IconFileText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>
  </svg>
);

const IconClipboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
  </svg>
);

// Mappa step -> icona
const SECTION_ICONS: Record<number, React.FC> = {
  0: IconBuilding,
  1: IconGlobe,
  2: IconTarget,
  3: IconMegaphone,
  4: IconBarChart,
  5: IconAlertTriangle,
  6: IconFileText,
};

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, icon }) => {
  return (
    <div className="section-header">
      {icon && <div className="section-icon">{icon}</div>}
      <div className="section-titles">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
};

export const getStepIcon = (step: number): React.ReactNode => {
  const IconComponent = SECTION_ICONS[step] || IconClipboard;
  return <IconComponent />;
};

interface SectionDataItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  subtitle: string;
}

export const getSectionData = (): SectionDataItem[] => {
  return [
    {
      id: 'anagrafica',
      title: 'Anagrafica',
      icon: <IconBuilding />,
      description: 'Informazioni aziendali',
      subtitle: 'Chi siete e come contattarvi'
    },
    {
      id: 'presenza-online',
      title: 'Presenza Online',
      icon: <IconGlobe />,
      description: 'Sito web e social',
      subtitle: 'La vostra presenza digitale'
    },
    {
      id: 'obiettivi',
      title: 'Obiettivi',
      icon: <IconTarget />,
      description: 'Traguardi e sfide',
      subtitle: 'Cosa volete raggiungere'
    },
    {
      id: 'marketing',
      title: 'Marketing',
      icon: <IconMegaphone />,
      description: 'Strategie attuali',
      subtitle: 'Come promuovete la vostra azienda'
    },
    {
      id: 'dati',
      title: 'Dati e Strumenti',
      icon: <IconBarChart />,
      description: 'Analytics e CRM',
      subtitle: 'Gli strumenti che utilizzate'
    },
    {
      id: 'ostacoli',
      title: 'Ostacoli',
      icon: <IconAlertTriangle />,
      description: 'Sfide e blocchi',
      subtitle: 'Cosa vi sta frenando'
    },
    {
      id: 'note',
      title: 'Note Finali',
      icon: <IconFileText />,
      description: 'Considerazioni aggiuntive',
      subtitle: 'Altre informazioni utili'
    }
  ];
};

// Export icone per uso in altri componenti
export { IconBuilding, IconGlobe, IconTarget, IconMegaphone, IconBarChart, IconAlertTriangle, IconFileText, IconClipboard };
