import React, { useState, useEffect } from 'react';
import './Assessment.css';
import { SectionHeader, getStepIcon, getSectionData } from '../components/AssessmentEnhanced';
import { CheckCircleIcon, SendIcon } from '../components/Icons';
import { RocketIcon, ChartIcon, FlashIcon, TargetIcon, CheckmarkIcon } from '../components/Icons/AssessmentIcons';
import AnagraficaSection from '../components/assessment/AnagraficaSection';
import PresenzaOnlineSection from '../components/assessment/PresenzaOnlineSection';
import ObiettiviSection from '../components/assessment/ObiettiviSection';
import MarketingSection from '../components/assessment/MarketingSection';
import DatiStrumentiSection from '../components/assessment/DatiStrumentiSection';
import OstacoliSection from '../components/assessment/OstacoliSection';
import NoteFinaliSection from '../components/assessment/NoteFinaliSection';
import ThankYouPage from '../components/assessment/ThankYouPage';
import AssessmentSummary from '../components/assessment/AssessmentSummary';

const Assessment: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [realProgress, setRealProgress] = useState(0);
  const sectionData = getSectionData();

  // Set page title
  useEffect(() => {
    document.title = 'Valutazione Digitale per Aziende - Evoluzione Imprese';
  }, []);

  // Helper function per icone progress
  const getProgressIcon = (progress: number) => {
    if (progress < 25) return <RocketIcon />;
    if (progress < 50) return <ChartIcon />;
    if (progress < 75) return <FlashIcon />;
    if (progress < 100) return <TargetIcon />;
    return <CheckmarkIcon />;
  };

  const getProgressText = (progress: number) => {
    if (progress < 25) return 'Iniziamo!';
    if (progress < 50) return 'Ottimo progresso!';
    if (progress < 75) return 'Ci siamo quasi!';
    if (progress < 100) return 'Ultimo sprint!';
    return 'Completato!';
  };

  // Progress Bar Reale basata sui campi compilati (SOLO VISIBILI E OBBLIGATORI)
  useEffect(() => {
    const updateRealProgress = () => {
    let totalFields = 0;
    let completedFields = 0;

    // Helper per verificare se un elemento è visibile
    const isVisible = (element: Element): boolean => {
      const style = window.getComputedStyle(element);
      const parent = element.closest('.form-field, fieldset, .question');
      const parentStyle = parent ? window.getComputedStyle(parent) : null;
      
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             (!parentStyle || (parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden'));
    };

    // CAMPI OBBLIGATORI: solo quelli veramente essenziali (sezioni 1-5)
    const requiredFields = [
      'nomeAzienda', 'settore', 'numeroDipendenti', 'email', 'telefono', 'citta', 'provincia', // Anagrafica
      'sitoWeb', 'socialPresenti', 'vendeOnline', // Presenza Online  
      'obiettivi', 'budgetIndicativo', // Obiettivi
      'attivitaMarketing', 'responsabileMarketing', // Marketing
      'sistemaAnalytics', 'gestioneContatti', 'sistemiTracciamento' // Dati
      // NOTA: sezioni 6 (Ostacoli) e 7 (Note Finali) sono OPZIONALI
      // NOTA: upload_dashboard è (facoltativo)
    ];

    // Conta solo i campi obbligatori e visibili
    requiredFields.forEach(fieldName => {
      const field = document.querySelector(`[name="${fieldName}"]`);
      if (field && isVisible(field)) {
        totalFields++;
        
        // Controlla se è compilato
        const input = field as HTMLInputElement;
        if (input.type === 'radio' || input.type === 'checkbox') {
          const checked = document.querySelector(`input[name="${fieldName}"]:checked`);
          if (checked) completedFields++;
        } else {
          const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          if (element.value && element.value.trim() !== '') completedFields++;
        }
      }
    });

    // CAMPI CONDIZIONALI: contali solo se il loro trigger è attivo
    const conditionalFields: { [key: string]: () => boolean } = {
      'urlSito': () => {
        const sitoWeb = document.querySelector('input[name="sitoWeb"]:checked') as HTMLInputElement;
        return sitoWeb?.value === 'si';
      },
      'piattaformaEcommerce': () => {
        const vendeOnline = document.querySelector('input[name="vendeOnline"]:checked') as HTMLInputElement;
        return vendeOnline?.value === 'si';
      },
      'qualeSistema': () => {
        const sistemaAnalytics = document.querySelector('input[name="sistemaAnalytics"]:checked') as HTMLInputElement;
        return sistemaAnalytics?.value === 'si';
      },
      'quantiContatti': () => {
        const gestioneContatti = document.querySelector('input[name="gestioneContatti"]:checked') as HTMLInputElement;
        return gestioneContatti?.value === 'si';
      }
    };

    // Conta campi condizionali solo se attivi
    Object.keys(conditionalFields).forEach(fieldName => {
      const shouldCount = conditionalFields[fieldName]();
      const field = document.querySelector(`[name="${fieldName}"]`);
      
      if (shouldCount && field && isVisible(field)) {
        totalFields++;
        const input = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (input.value && input.value.trim() !== '') completedFields++;
      }
    });

    const progress = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
    setRealProgress(Math.round(progress));
    
    // Invia evento personalizzato per sincronizzare il summary
    const progressEvent = new CustomEvent('progressUpdate', {
      detail: { progress: Math.round(progress), completedFields, totalFields }
    });
    window.dispatchEvent(progressEvent);
    
    // Debug console per verificare funzionamento
    console.log(`Progress Update: ${completedFields}/${totalFields} = ${Math.round(progress)}%`);
    console.log(`Completed fields: ${completedFields}, Total fields: ${totalFields}`);
  };

    // Attendi che il DOM sia completamente caricato
    const initProgressTracking = () => {
      // Monitora tutti gli input esistenti
      const inputs = document.querySelectorAll('input, textarea, select');
      console.log(`Found ${inputs.length} form elements`);
      
      const handleInputChange = () => {
        setTimeout(updateRealProgress, 100); // Delay per permettere aggiornamento DOM
        
        // Rimuovi messaggio di errore quando utente interagisce
        if (submitError) {
          setSubmitError(null);
          // Rimuovi i bordi rossi dalle sezioni
          document.querySelectorAll('fieldset[id]').forEach(section => {
            (section as HTMLElement).style.border = 'none';
          });
        }
      };

      inputs.forEach(input => {
        input.addEventListener('change', handleInputChange);
        input.addEventListener('input', handleInputChange);
      });

      // Update iniziale
      updateRealProgress();

      return inputs;
    };

    // Inizializza dopo un breve delay per assicurarsi che il DOM sia pronto
    const timeout = setTimeout(() => {
      const inputs = initProgressTracking();
      
      // Update ogni 3 secondi per sicurezza
      const interval = setInterval(updateRealProgress, 3000);

      // Cleanup function
      return () => {
        inputs.forEach(input => {
          input.removeEventListener('change', updateRealProgress);
          input.removeEventListener('input', updateRealProgress);
        });
        clearInterval(interval);
      };
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    // Inizializza logiche condizionali (equivalente di assessment.js)
    initConditionalLogic();
    initNullCheckboxes();
  }, []);

  const initConditionalLogic = () => {
    const conditionalElements = document.querySelectorAll('[data-condition]');
    
    conditionalElements.forEach(el => {
      const condition = el.getAttribute('data-condition');
      if (!condition) return;

      if (condition.includes('_includes_')) {
        // Gestione checkbox "includes"
        const [field, value] = condition.split('_includes_');
        const inputs = document.querySelectorAll(`[name="${field}"]`);

        function updateIncludes() {
          const checkedValues = Array.from(inputs)
            .filter((i: any) => i.checked)
            .map((i: any) => i.value);
          const show = checkedValues.includes(value);
          (el as HTMLElement).style.display = show ? '' : 'none';
          el.setAttribute('aria-hidden', show ? 'false' : 'true');
        }

        inputs.forEach(i => i.addEventListener('change', updateIncludes));
        updateIncludes();

      } else {
        // Gestione radio/select "equals"
        const [field, expected] = condition.split('==').map(s => s.trim());
        const inputs = document.querySelectorAll(`[name="${field}"]`);

        function updateEquals() {
          const radioChecked = Array.from(inputs).find((i: any) => i.checked);
          const selectValue = document.querySelector(`select[name="${field}"]`) as HTMLSelectElement;
          const val = radioChecked ? (radioChecked as HTMLInputElement).value : selectValue?.value;
          const show = val === expected;
          (el as HTMLElement).style.display = show ? '' : 'none';
          el.setAttribute('aria-hidden', show ? 'false' : 'true');
        }

        inputs.forEach(i => i.addEventListener('change', updateEquals));
        // Per select
        const selectEl = document.querySelector(`select[name="${field}"]`);
        if (selectEl) selectEl.addEventListener('change', updateEquals);

        updateEquals();
      }
    });
  };

  const initNullCheckboxes = () => {
    const nullCheckboxes = document.querySelectorAll('input[type="checkbox"][name$="_null"]');
    
    nullCheckboxes.forEach(chk => {
      const baseName = chk.getAttribute('name')?.replace(/_null$/, '');
      if (!baseName) return;
      
      const targets = document.querySelectorAll(`[name="${baseName}"]`);

      function toggleNull() {
        const isChecked = (chk as HTMLInputElement).checked;
        targets.forEach(target => {
          (target as HTMLInputElement).disabled = isChecked;
          if (isChecked) {
            if ((target as HTMLInputElement).type === 'checkbox' || (target as HTMLInputElement).type === 'radio') {
              (target as HTMLInputElement).checked = false;
            } else {
              (target as HTMLInputElement).value = '';
            }
          }
        });
      }

      chk.addEventListener('change', toggleNull);
      toggleNull();
    });
  };

  // Funzione per aggiornare la progress bar
  const updateProgress = () => {
    const allSections = document.querySelectorAll('fieldset[id]');
    let completedSections = 0;

    allSections.forEach(section => {
      const inputs = section.querySelectorAll('input[required], select[required], textarea[required]');
      const completed = Array.from(inputs).every((input: any) => {
        if (input.type === 'checkbox' || input.type === 'radio') {
          const group = section.querySelectorAll(`[name="${input.name}"]`);
          return Array.from(group).some((g: any) => g.checked);
        }
        return input.value.trim() !== '';
      });
      
      if (completed) completedSections++;
    });

    // Aggiorna progresso in tempo reale invece di step discreti
    // Il progresso ora è calcolato dinamicamente in realProgress
  };

  // Observer per monitorare cambiamenti nei form
  useEffect(() => {
    const observer = new MutationObserver(() => {
      updateProgress();
    });

    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      observer.observe(form, { 
        childList: true, 
        subtree: true, 
        attributes: true, 
        attributeFilter: ['checked', 'value'] 
      });

      // Event listeners per input changes
      form.addEventListener('input', updateProgress);
      form.addEventListener('change', updateProgress);
    });

    return () => {
      observer.disconnect();
      forms.forEach(form => {
        form.removeEventListener('input', updateProgress);
        form.removeEventListener('change', updateProgress);
      });
    };
  }, []);

  const validateAllFields = () => {
    let isValid = true;
    let firstInvalidField: Element | null = null;
    const incompleteList: string[] = [];

    // Helper per verificare se un elemento è visibile (stesso del conteggio)
    const isVisible = (element: Element): boolean => {
      const style = window.getComputedStyle(element);
      const parent = element.closest('.form-field, fieldset, .question');
      const parentStyle = parent ? window.getComputedStyle(parent) : null;
      
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             (!parentStyle || (parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden'));
    };

    // STESSI CAMPI OBBLIGATORI del conteggio (solo sezioni 1-5)
    const requiredFields = [
      { name: 'nomeAzienda', label: 'Nome Azienda' },
      { name: 'settore', label: 'Settore' },
      { name: 'numeroDipendenti', label: 'Numero Dipendenti' },
      { name: 'email', label: 'Email' },
      { name: 'telefono', label: 'Telefono' },
      { name: 'citta', label: 'Città' },
      { name: 'provincia', label: 'Provincia' },
      { name: 'sitoWeb', label: 'Sito Web' },
      { name: 'socialPresenti', label: 'Social Presenti' },
      { name: 'vendeOnline', label: 'Vende Online' },
      { name: 'obiettivi', label: 'Obiettivi' },
      { name: 'budgetIndicativo', label: 'Budget Indicativo' },
      { name: 'attivitaMarketing', label: 'Attività Marketing' },
      { name: 'responsabileMarketing', label: 'Responsabile Marketing' },
      { name: 'sistemaAnalytics', label: 'Sistema Analytics' },
      { name: 'gestioneContatti', label: 'Gestione Contatti' },
      { name: 'sistemiTracciamento', label: 'Sistemi Tracciamento' }
      // NOTA: sezioni 6 (Ostacoli) e 7 (Note Finali) sono OPZIONALI
    ];

    // Valida solo campi obbligatori e visibili
    requiredFields.forEach(({ name, label }) => {
      const field = document.querySelector(`[name="${name}"]`);
      if (field && isVisible(field)) {
        let hasValue = false;
        
        const input = field as HTMLInputElement;
        if (input.type === 'radio') {
          const checked = document.querySelector(`input[name="${name}"]:checked`);
          hasValue = !!checked;
        } else if (input.type === 'checkbox') {
          const checked = document.querySelector(`input[name="${name}"]:checked`);
          hasValue = !!checked;
        } else {
          const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          hasValue = !!(element.value && element.value.trim() !== '');
        }
        
        if (!hasValue) {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = field;
          incompleteList.push(label);
        }
      }
    });

    // CAMPI CONDIZIONALI: valida solo se attivi
    const conditionalFields = [
      { name: 'urlSito', label: 'URL Sito', condition: () => {
        const sitoWeb = document.querySelector('input[name="sitoWeb"]:checked') as HTMLInputElement;
        return sitoWeb?.value === 'si';
      }},
      { name: 'piattaformaEcommerce', label: 'Piattaforma E-commerce', condition: () => {
        const vendeOnline = document.querySelector('input[name="vendeOnline"]:checked') as HTMLInputElement;
        return vendeOnline?.value === 'si';
      }},
      { name: 'qualeSistema', label: 'Quale Sistema Analytics', condition: () => {
        const sistemaAnalytics = document.querySelector('input[name="sistemaAnalytics"]:checked') as HTMLInputElement;
        return sistemaAnalytics?.value === 'si';
      }},
      { name: 'quantiContatti', label: 'Quanti Contatti', condition: () => {
        const gestioneContatti = document.querySelector('input[name="gestioneContatti"]:checked') as HTMLInputElement;
        return gestioneContatti?.value === 'si';
      }}
    ];

    conditionalFields.forEach(({ name, label, condition }) => {
      if (condition()) {
        const field = document.querySelector(`[name="${name}"]`);
        if (field && isVisible(field)) {
          const input = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          if (!input.value || input.value.trim() === '') {
            isValid = false;
            if (!firstInvalidField) firstInvalidField = field;
            incompleteList.push(label);
          }
        }
      }
    });

    return { isValid, firstInvalidSection: firstInvalidField, incompleteList };
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    // Validazione completa prima dell'invio
    const validation = validateAllFields();
    
    if (!validation.isValid) {
      const sectionList = validation.incompleteList.join(', ');
      setSubmitError(`Compila tutte le sezioni prima di inviare l'assessment. Sezioni mancanti: ${sectionList}. Le opzioni "Non ho i dati a disposizione" sono considerate valide.`);
      setIsSubmitting(false);
      
      // Evidenzia le sezioni incomplete con un bordo rosso
      document.querySelectorAll('fieldset[id]').forEach(section => {
        const legend = section.querySelector('legend');
        const sectionTitle = legend ? legend.textContent : section.id;
        if (validation.incompleteList.includes(sectionTitle || section.id)) {
          (section as HTMLElement).style.border = '2px solid #ef4444';
          (section as HTMLElement).style.borderRadius = '8px';
          (section as HTMLElement).style.padding = '1rem';
          (section as HTMLElement).style.marginBottom = '1rem';
        } else {
          (section as HTMLElement).style.border = 'none';
        }
      });
      
      // Scroll alla prima sezione non compilata
      if (validation.firstInvalidSection) {
        (validation.firstInvalidSection as Element).scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
      return;
    }

    // Se arriviamo qui, rimuovi i bordi rossi se presenti
    document.querySelectorAll('fieldset[id]').forEach(section => {
      (section as HTMLElement).style.border = 'none';
    });

    try {
      const formData = new FormData(e.currentTarget);
      const data: Record<string, any> = {};

      // Converti FormData in oggetto
      formData.forEach((value, key) => {
        if (data[key]) {
          // Campo multiplo (array)
          if (Array.isArray(data[key])) {
            data[key].push(value);
          } else {
            data[key] = [data[key], value];
          }
        } else {
          data[key] = value;
        }
      });

      // Gestione campi multipli (checkbox)
      const multiFields = ['social_attivi', 'obiettivi', 'canali_attivi', 'creativita', 'disponibilita_test'];
      multiFields.forEach(field => {
        const values = formData.getAll(field);
        if (values.length > 0) {
          data[field] = values;
        }
      });

      // Invia tramite Assessments Service
      const assessmentsApi = (await import('../services/assessmentsApi')).default;
      await assessmentsApi.submitAssessment(data);

      // Successo - mostra thank you page
      setShowThankYou(true);

    } catch (error) {
      console.error('Errore invio form:', error);
      setSubmitError(error instanceof Error ? error.message : 'Errore sconosciuto');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showThankYou) {
    return <ThankYouPage visible={true} />;
  }

  return (
    <div className="assessment-container">
      {/* Header migliorato */}
            {/* Assessment Summary */}
      <AssessmentSummary 
        isVisible={showSummary}
        onToggle={() => setShowSummary(!showSummary)}
        onSectionClick={(sectionId: string) => console.log('Navigate to:', sectionId)}
      />

      {/* Header con Progress Bar Reale */}
      <div className="assessment-header">
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <img 
            src="./assets/logo-evoluzione-white.png" 
            alt="Evoluzione Imprese" 
            style={{
              height: '60px',
              width: 'auto',
              objectFit: 'contain',
              marginBottom: '0.2rem'
            }}
          />
        </div>
        <h1>
          <CheckCircleIcon />
          Valutazione Digitale per Aziende
        </h1>
        <p className="subtitle">
          Analisi completa per identificare opportunità di crescita e ottimizzazione digitale per la tua azienda.
        </p>
      </div>

      {/* Progress Bar Ultra Moderna e Reale */}
      <div className="progress-container">
        <div className="progress-header">
          <span className="progress-title">PERCENTUALE COMPLETATA</span>
          <span className="progress-percentage">{realProgress}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${realProgress}%` }}></div>
        </div>
        <div className="progress-stats">
          <span className="progress-label">
            {getProgressIcon(realProgress)}
            {getProgressText(realProgress)}
          </span>
        </div>
      </div>

      <form id="unifiedForm" onSubmit={handleSubmit} noValidate>
        {/* Anagrafica con header migliorato */}
        <SectionHeader 
          icon={getStepIcon(0)}
          title={sectionData[0].title}
          subtitle={sectionData[0].subtitle}
        />
        <AnagraficaSection />

        {/* Presenza Online */}
        <SectionHeader 
          icon={getStepIcon(1)}
          title={sectionData[1].title}
          subtitle={sectionData[1].subtitle}
        />
        <PresenzaOnlineSection />

        {/* Obiettivi */}
        <SectionHeader 
          icon={getStepIcon(2)}
          title={sectionData[2].title}
          subtitle={sectionData[2].subtitle}
        />
        <ObiettiviSection />

        {/* Marketing */}
        <SectionHeader 
          icon={getStepIcon(3)}
          title={sectionData[3].title}
          subtitle={sectionData[3].subtitle}
        />
        <MarketingSection />

        {/* Dati e Strumenti */}
        <SectionHeader 
          icon={getStepIcon(4)}
          title={sectionData[4].title}
          subtitle={sectionData[4].subtitle}
        />
        <DatiStrumentiSection />

        {/* Ostacoli */}
        <SectionHeader 
          icon={getStepIcon(5)}
          title={sectionData[5].title}
          subtitle={sectionData[5].subtitle}
        />
        <OstacoliSection />

        {/* Note Finali */}
        <SectionHeader 
          icon={getStepIcon(6)}
          title={sectionData[6].title}
          subtitle={sectionData[6].subtitle}
        />
        <NoteFinaliSection />

        {/* Submit migliorato */}
        <div className="submit-section">
          <button 
            type="submit" 
            className="submit-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="loading-spinner" />
                Invio in corso...
              </>
            ) : (
              <>
                <SendIcon size={20} />
                Invia Assessment
              </>
            )}
          </button>
          
          {submitError && (
            <div className="validation-error-container" style={{
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
              border: '1px solid #ef4444',
              borderRadius: '12px',
              padding: '1.5rem',
              marginTop: '1.5rem',
              color: '#dc2626',
              fontSize: '0.95rem',
              lineHeight: '1.6',
              boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.1)',
              position: 'relative'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <div style={{
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  flexShrink: 0,
                  marginTop: '2px'
                }}>!</div>
                <div>
                  <div style={{
                    fontWeight: '600',
                    marginBottom: '8px',
                    color: '#b91c1c'
                  }}>
                    Assessment Incompleto
                  </div>
                  <div>{submitError}</div>
                  <div style={{
                    marginTop: '12px',
                    fontSize: '0.875rem',
                    color: '#991b1b',
                    fontStyle: 'italic'
                  }}>
                    Suggerimento: Usa il riepilogo in alto per navigare velocemente alle sezioni mancanti
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default Assessment;
