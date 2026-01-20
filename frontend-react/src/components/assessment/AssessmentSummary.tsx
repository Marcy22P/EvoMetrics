import React from 'react';
import { 
  IconBuilding, 
  IconGlobe, 
  IconTarget, 
  IconMegaphone, 
  IconBarChart, 
  IconAlertTriangle, 
  IconFileText,
  IconClipboard 
} from '../AssessmentEnhanced';

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
    { id: 'anagrafica', title: 'Anagrafica', icon: <IconBuilding /> },
    { id: 'presenza-online', title: 'Presenza Online', icon: <IconGlobe /> },
    { id: 'obiettivi', title: 'Obiettivi', icon: <IconTarget /> },
    { id: 'marketing', title: 'Marketing', icon: <IconMegaphone /> },
    { id: 'dati', title: 'Dati e Strumenti', icon: <IconBarChart /> },
    { id: 'ostacoli', title: 'Ostacoli', icon: <IconAlertTriangle /> },
    { id: 'note', title: 'Note Finali', icon: <IconFileText /> }
  ];

  if (!isVisible) {
    return (
      <button 
        className="assessment-summary-toggle" 
        onClick={onToggle}
        aria-label="Mostra sommario"
      >
        <IconClipboard />
      </button>
    );
  }

  return (
    <div className="assessment-summary">
      <div className="summary-header">
        <h3>Sezioni</h3>
        <button onClick={onToggle} aria-label="Chiudi sommario">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
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
