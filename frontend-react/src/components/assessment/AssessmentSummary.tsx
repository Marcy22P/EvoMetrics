import React, { useState, useEffect } from 'react';
import { 
  UserIcon, 
  GlobeIcon, 
  TargetIcon, 
  MegaphoneIcon, 
  BarChartIcon, 
  LightningIcon, 
  NotesIcon,
  ListIcon
} from '../Icons/AssessmentIcons';

interface SummarySection {
  id: string;
  title: string;
  icon: string;
  completed: boolean;
  fields: string[];
}

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
  const [sections] = useState<SummarySection[]>([
    {
      id: 'anagrafica',
      title: 'Anagrafica',
      icon: 'user',
      completed: false,
      fields: ['ragione_sociale', 'settore', 'numero_dipendenti', 'fatturato_annuale']
    },
    {
      id: 'presenza-online',
      title: 'Presenza Online',
      icon: 'globe',
      completed: false,
      fields: ['sito_web', 'social_media', 'e_commerce']
    },
    {
      id: 'obiettivi',
      title: 'Obiettivi',
      icon: 'target',
      completed: false,
      fields: ['obiettivi_principali', 'priorita_immediate']
    },
    {
      id: 'marketing',
      title: 'Marketing & Comunicazione',
      icon: 'megaphone',
      completed: false,
      fields: ['attivita_marketing', 'budget_marketing', 'canali_comunicazione']
    },
    {
      id: 'dati-strumenti',
      title: 'Dati & Strumenti',
      icon: 'chart',
      completed: false,
      fields: ['strumenti_analisi', 'gestione_dati_clienti', 'automazione_processi']
    },
    {
      id: 'ostacoli',
      title: 'Ostacoli & Sfide',
      icon: 'lightning',
      completed: false,
      fields: ['principali_sfide', 'risorse_mancanti']
    },
    {
      id: 'note-finali',
      title: 'Note Finali',
      icon: 'notes',
      completed: false,
      fields: ['note_aggiuntive', 'consenso_contatto']
    }
  ]);

  const [overallProgress, setOverallProgress] = useState(0);

  useEffect(() => {
    const handleProgressUpdate = (event: any) => {
      const { progress } = event.detail;
      setOverallProgress(progress);
      console.log(`📊 Summary received progress update: ${progress}%`);
    };

    // Ascolta eventi di progress update dal componente principale
    window.addEventListener('progressUpdate', handleProgressUpdate);

    return () => {
      window.removeEventListener('progressUpdate', handleProgressUpdate);
    };
  }, [sections.length]);

  // Helper function per renderizzare le icone
  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case 'user': return <UserIcon />;
      case 'globe': return <GlobeIcon />;
      case 'target': return <TargetIcon />;
      case 'megaphone': return <MegaphoneIcon />;
      case 'chart': return <BarChartIcon />;
      case 'lightning': return <LightningIcon />;
      case 'notes': return <NotesIcon />;
      case 'list': return <ListIcon />;
      default: return <UserIcon />;
    }
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId) || 
                   document.querySelector(`[data-section="${sectionId}"]`);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      });
      onSectionClick(sectionId);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button 
        className={`summary-toggle ${isVisible ? 'active' : ''}`}
        onClick={onToggle}
        aria-label="Toggle Assessment Summary"
      >
        <div className="toggle-icon">
          <svg viewBox="0 0 24 24" className="toggle-svg">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
        </div>
        <span className="toggle-text">
          {isVisible ? 'Nascondi Riepilogo' : 'Mostra Riepilogo'}
        </span>
        <div className="progress-ring">
          <svg viewBox="0 0 36 36" className="progress-svg">
            <path
              className="progress-circle-bg"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="2"
              fill="none"
            />
            <path
              className="progress-circle"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              stroke="#ffffff"
              strokeWidth="2"
              fill="none"
              strokeDasharray={`${overallProgress}, 100`}
            />
          </svg>
          <span className="progress-text">{Math.round(overallProgress)}%</span>
        </div>
      </button>

      {/* Summary Panel */}
      <div className={`assessment-summary ${isVisible ? 'visible' : ''}`}>
        <div className="summary-header">
          <h3 className="summary-title">
            <ListIcon />
            Riepilogo Assessment
          </h3>
          <div className="overall-progress">
            <div className="progress-info">
              <span className="progress-label">Progresso Totale</span>
              <span className="progress-value">{Math.round(overallProgress)}%</span>
            </div>
            <div className="progress-bar-summary">
              <div 
                className="progress-fill-summary" 
                style={{ width: `${overallProgress}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="summary-sections">
          {sections.map((section, index) => (
            <div 
              key={section.id}
              className={`summary-section ${section.completed ? 'completed' : ''}`}
              onClick={() => scrollToSection(section.id)}
            >
              <div className="section-status">
                {renderIcon(section.icon)}
                <div className="status-indicator">
                  {section.completed ? (
                    <svg viewBox="0 0 24 24" className="check-icon">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  ) : (
                    <span className="section-number">{index + 1}</span>
                  )}
                </div>
              </div>
              <div className="section-info">
                <h4 className="section-title">{section.title}</h4>
                <div className="section-progress">
                  <div className="field-indicators">
                    {section.fields.map((fieldName, fieldIndex) => {
                      const field = document.querySelector(`[name="${fieldName}"]`) as HTMLInputElement;
                      let isCompleted = false;
                      
                      if (field) {
                        if (field.type === 'checkbox' || field.type === 'radio') {
                          isCompleted = !!document.querySelector(`[name="${fieldName}"]:checked`);
                        } else {
                          isCompleted = field.value.trim() !== '';
                        }
                      }
                      
                      return (
                        <div 
                          key={fieldIndex}
                          className={`field-dot ${isCompleted ? 'completed' : ''}`}
                        ></div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="nav-arrow">
                <svg viewBox="0 0 24 24">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                </svg>
              </div>
            </div>
          ))}
        </div>

        <div className="summary-footer">
          <div className="completion-stats">
            <div className="stat">
              <span className="stat-number">{sections.filter(s => s.completed).length}</span>
              <span className="stat-label">Sezioni Completate</span>
            </div>
            <div className="stat">
              <span className="stat-number">{sections.length - sections.filter(s => s.completed).length}</span>
              <span className="stat-label">Rimanenti</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isVisible && <div className="summary-overlay" onClick={onToggle}></div>}
    </>
  );
};

export default AssessmentSummary;
