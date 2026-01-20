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
} from '../Icons/AssessmentIcons';

interface AssessmentSummaryProps {
  isVisible: boolean;
  onToggle: () => void;
  onSectionClick: (sectionId: string) => void;
}

const AssessmentSummary: React.FC<AssessmentSummaryProps> = ({ 
  isVisible, 
  onToggle, 
  onSectionClick 
}) => {
  const sections = [
    { id: 'anagrafica', title: 'Anagrafica', icon: <BuildingIcon size="small" /> },
    { id: 'presenza-online', title: 'Presenza Online', icon: <GlobeIcon size="small" /> },
    { id: 'obiettivi', title: 'Obiettivi', icon: <TargetIcon size="small" /> },
    { id: 'marketing', title: 'Marketing', icon: <MegaphoneIcon size="small" /> },
    { id: 'dati', title: 'Dati e Strumenti', icon: <BarChartIcon size="small" /> },
    { id: 'ostacoli', title: 'Ostacoli', icon: <InfoIcon size="small" /> },
    { id: 'note', title: 'Note Finali', icon: <NotesIcon size="small" /> }
  ];

  if (!isVisible) {
    return (
      <button 
        className="assessment-summary-toggle" 
        onClick={onToggle}
        aria-label="Mostra sommario"
      >
        <ListIcon size="medium" />
      </button>
    );
  }

  return (
    <div className="assessment-summary">
      <div className="summary-header">
        <h3>Sezioni</h3>
        <button onClick={onToggle} aria-label="Chiudi sommario">×</button>
      </div>
      <ul className="summary-list">
        {sections.map(section => (
          <li key={section.id}>
            <button onClick={() => onSectionClick(section.id)}>
              <span className="section-icon">{section.icon}</span>
              <span className="section-title">{section.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AssessmentSummary;
