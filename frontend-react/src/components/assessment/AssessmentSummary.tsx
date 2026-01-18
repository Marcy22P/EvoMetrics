import React from 'react';

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
    { id: 'anagrafica', title: 'Anagrafica', icon: '🏢' },
    { id: 'presenza-online', title: 'Presenza Online', icon: '🌐' },
    { id: 'obiettivi', title: 'Obiettivi', icon: '🎯' },
    { id: 'marketing', title: 'Marketing', icon: '📣' },
    { id: 'dati', title: 'Dati e Strumenti', icon: '📊' },
    { id: 'ostacoli', title: 'Ostacoli', icon: '⚠️' },
    { id: 'note', title: 'Note Finali', icon: '📝' }
  ];

  if (!isVisible) {
    return (
      <button 
        className="assessment-summary-toggle" 
        onClick={onToggle}
        aria-label="Mostra sommario"
      >
        📋
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
