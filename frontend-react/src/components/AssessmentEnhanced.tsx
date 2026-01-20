import React from 'react';
import { 
  BuildingIcon, 
  GlobeIcon, 
  TargetIcon, 
  MegaphoneIcon, 
  BarChartIcon, 
  InfoIcon, 
  NotesIcon,
  ListIcon
} from './Icons/AssessmentIcons';

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
  const icons: Record<number, React.ReactNode> = {
    0: <BuildingIcon size="large" />,
    1: <GlobeIcon size="large" />,
    2: <TargetIcon size="large" />,
    3: <MegaphoneIcon size="large" />,
    4: <BarChartIcon size="large" />,
    5: <InfoIcon size="large" />,
    6: <NotesIcon size="large" />
  };
  return icons[step] || <ListIcon size="large" />;
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
      icon: <BuildingIcon />,
      description: 'Informazioni aziendali',
      subtitle: 'Chi siete e come contattarvi'
    },
    {
      id: 'presenza-online',
      title: 'Presenza Online',
      icon: <GlobeIcon />,
      description: 'Sito web e social',
      subtitle: 'La vostra presenza digitale'
    },
    {
      id: 'obiettivi',
      title: 'Obiettivi',
      icon: <TargetIcon />,
      description: 'Traguardi e sfide',
      subtitle: 'Cosa volete raggiungere'
    },
    {
      id: 'marketing',
      title: 'Marketing',
      icon: <MegaphoneIcon />,
      description: 'Strategie attuali',
      subtitle: 'Come promuovete la vostra azienda'
    },
    {
      id: 'dati',
      title: 'Dati e Strumenti',
      icon: <BarChartIcon />,
      description: 'Analytics e CRM',
      subtitle: 'Gli strumenti che utilizzate'
    },
    {
      id: 'ostacoli',
      title: 'Ostacoli',
      icon: <InfoIcon />,
      description: 'Sfide e blocchi',
      subtitle: 'Cosa vi sta frenando'
    },
    {
      id: 'note',
      title: 'Note Finali',
      icon: <NotesIcon />,
      description: 'Considerazioni aggiuntive',
      subtitle: 'Altre informazioni utili'
    }
  ];
};
