import React from 'react';

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

export const getStepIcon = (step: number): string => {
  const icons: Record<number, string> = {
    1: '🏢',
    2: '🌐',
    3: '🎯',
    4: '📣',
    5: '📊',
    6: '⚠️',
    7: '📝'
  };
  return icons[step] || '📋';
};

interface SectionDataItem {
  id: string;
  title: string;
  icon: string;
  description: string;
  subtitle: string;
}

export const getSectionData = (): SectionDataItem[] => {
  return [
    {
      id: 'anagrafica',
      title: 'Anagrafica',
      icon: '🏢',
      description: 'Informazioni aziendali',
      subtitle: 'Chi siete e come contattarvi'
    },
    {
      id: 'presenza-online',
      title: 'Presenza Online',
      icon: '🌐',
      description: 'Sito web e social',
      subtitle: 'La vostra presenza digitale'
    },
    {
      id: 'obiettivi',
      title: 'Obiettivi',
      icon: '🎯',
      description: 'Traguardi e sfide',
      subtitle: 'Cosa volete raggiungere'
    },
    {
      id: 'marketing',
      title: 'Marketing',
      icon: '📣',
      description: 'Strategie attuali',
      subtitle: 'Come promuovete la vostra azienda'
    },
    {
      id: 'dati',
      title: 'Dati e Strumenti',
      icon: '📊',
      description: 'Analytics e CRM',
      subtitle: 'Gli strumenti che utilizzate'
    },
    {
      id: 'ostacoli',
      title: 'Ostacoli',
      icon: '⚠️',
      description: 'Sfide e blocchi',
      subtitle: 'Cosa vi sta frenando'
    },
    {
      id: 'note',
      title: 'Note Finali',
      icon: '📝',
      description: 'Considerazioni aggiuntive',
      subtitle: 'Altre informazioni utili'
    }
  ];
};
