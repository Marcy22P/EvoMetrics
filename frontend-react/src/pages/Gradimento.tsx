import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import './Gradimento.css';
import { CheckCircleIcon, SendIcon } from '../components/Icons';

interface GradimentoRisposte {
  // Anagrafica
  nome: string;
  cognome: string;
  email: string;
  
  // Sezione 1: Cosa hai fatto questa settimana
  cose_principali: string;
  lasciato_indietro: string;
  soddisfazione_qualita: number;
  organizzazione_produttivita: number;
  
  // Sezione 2: Ostacoli e miglioramenti
  blocchi_rallentamenti: string;
  ostacoli_interni?: string;
  difficolta_esterne?: string;
  
  // Sezione 3: Collaborazione e comunicazione
  allineamento_team: number;
  supporto_chiarezza?: string;
  ringraziamenti?: string;
  
  // Sezione 4: Prossima settimana
  priorita_prossima_settimana: string;
  risorse_necessarie?: string;
  
  // Sezione 5: Stato d'animo
  stato_animo: string;
  pensiero_libero?: string;
}

const Gradimento: React.FC = () => {
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [formData, setFormData] = useState<GradimentoRisposte>({
    nome: '',
    cognome: '',
    email: '',
    cose_principali: '',
    lasciato_indietro: '',
    soddisfazione_qualita: 0,
    organizzazione_produttivita: 0,
    blocchi_rallentamenti: '',
    ostacoli_interni: '',
    difficolta_esterne: '',
    allineamento_team: 0,
    supporto_chiarezza: '',
    ringraziamenti: '',
    priorita_prossima_settimana: '',
    risorse_necessarie: '',
    stato_animo: '',
    pensiero_libero: ''
  });

  // Carica profilo utente e precompila anagrafica (usa dati da useAuth invece di chiamata API)
  useEffect(() => {
    const loadProfile = () => {
      if (!user) {
        setLoadingProfile(false);
        return;
      }
      
      try {
        // Usa i dati dell'utente già disponibili da useAuth
          setFormData(prev => ({
            ...prev,
          nome: user.nome || prev.nome,
          cognome: user.cognome || prev.cognome,
          email: user.email || prev.email
          }));
      } catch (error) {
        console.error('Errore nel caricamento profilo:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleInputChange = (field: keyof GradimentoRisposte, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
      const GRADIMENTO_SERVICE_URL =
        import.meta.env.VITE_GRADIMENTO_SERVICE_URL ||
        (window.location.hostname === 'localhost'
          ? 'http://localhost:10000'
          : window.location.origin);
      
      const response = await fetch(`${GRADIMENTO_SERVICE_URL}/api/gradimento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSubmitted(true);
        console.log('✅ Gradimento inviato con successo');
      } else {
        console.error('❌ Errore nell\'invio del gradimento');
      }
    } catch (error) {
      console.error('❌ Errore di rete:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="gradimento-container">
        <div className="thank-you-page">
          <div className="thank-you-content">
            <CheckCircleIcon size={48} />
            <h1>Grazie per il tuo feedback!</h1>
            <p>Le tue risposte sono state salvate con successo.</p>
            <p>Il tuo contributo è prezioso per migliorare il nostro ambiente di lavoro.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="gradimento-container">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Caricamento profilo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gradimento-container">
      <div className="gradimento-header">
        <div className="gradimento-logo">
          <img src="./assets/logo-evoluzione-white.png" alt="Evoluzione Imprese" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
        <h1>Weekly Review – Form</h1>
        <p>Compila questo form per condividere il tuo feedback settimanale</p>
      </div>

      <form onSubmit={handleSubmit} className="gradimento-form">
        {/* Anagrafica */}
        <div className="form-section">
          <h2 className="section-title">Anagrafica</h2>
          
          <div className="anagrafica-grid">
            <div className="question-group">
              <label className="question-label">
                Nome *
              </label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => handleInputChange('nome', e.target.value)}
                className="ultra-modern-input"
                required
                placeholder="Inserisci il tuo nome"
              />
            </div>

            <div className="question-group">
              <label className="question-label">
                Cognome *
              </label>
              <input
                type="text"
                value={formData.cognome}
                onChange={(e) => handleInputChange('cognome', e.target.value)}
                className="ultra-modern-input"
                required
                placeholder="Inserisci il tuo cognome"
              />
            </div>

            <div className="question-group">
              <label className="question-label">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="ultra-modern-input"
                required
                placeholder="Inserisci la tua email"
              />
            </div>

          </div>
        </div>

        {/* Sezione 1: Cosa hai fatto questa settimana */}
        <div className="form-section">
          <h2 className="section-title">1. Cosa hai fatto questa settimana</h2>
          
          <div className="question-group">
            <label className="question-label">
              1. Quali sono le 3 cose principali che hai portato a termine?
            </label>
            <p className="question-help">
              Puoi scrivere liberamente o incollare i link alle task in ClickUp
            </p>
            <textarea
              value={formData.cose_principali}
              onChange={(e) => handleInputChange('cose_principali', e.target.value)}
              className="ultra-modern-textarea"
              rows={4}
              required
            />
          </div>

          <div className="question-group">
            <label className="question-label">
              2. Hai lasciato indietro qualcosa?
            </label>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="lasciato_indietro"
                  value="No, tutto fatto"
                  checked={formData.lasciato_indietro === 'No, tutto fatto'}
                  onChange={(e) => handleInputChange('lasciato_indietro', e.target.value)}
                />
                <span className="radio-custom"></span>
                No, tutto fatto
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="lasciato_indietro"
                  value="Sì"
                  checked={formData.lasciato_indietro === 'Sì' || formData.lasciato_indietro.startsWith('Sì —')}
                  onChange={(e) => handleInputChange('lasciato_indietro', e.target.value)}
                />
                <span className="radio-custom"></span>
                Sì — scrivi brevemente cosa e perché
              </label>
            </div>
            {(formData.lasciato_indietro === 'Sì' || formData.lasciato_indietro.startsWith('Sì —')) && (
              <textarea
                value={formData.lasciato_indietro === 'Sì' ? '' : (formData.lasciato_indietro as string).replace('Sì — ', '')}
                onChange={(e) => {
                  const newValue = e.target.value;
                  handleInputChange('lasciato_indietro', newValue ? `Sì — ${newValue}` : 'Sì');
                }}
                className="ultra-modern-textarea"
                rows={3}
                placeholder="Descrivi cosa hai lasciato indietro e perché..."
              />
            )}
          </div>

          <div className="question-group">
            <label className="question-label">
              3. Quanto ti senti soddisfatta/o della qualità del tuo lavoro?
            </label>
            <div className="rating-group">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="rating-option">
                  <input
                    type="radio"
                    name="soddisfazione_qualita"
                    value={value}
                    checked={formData.soddisfazione_qualita === value}
                    onChange={(e) => handleInputChange('soddisfazione_qualita', parseInt(e.target.value))}
                  />
                  <span className="rating-custom">{value}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="question-group">
            <label className="question-label">
              4. Quanto ti senti organizzata/o produttiva/o questa settimana?
            </label>
            <div className="rating-group">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="rating-option">
                  <input
                    type="radio"
                    name="organizzazione_produttivita"
                    value={value}
                    checked={formData.organizzazione_produttivita === value}
                    onChange={(e) => handleInputChange('organizzazione_produttivita', parseInt(e.target.value))}
                  />
                  <span className="rating-custom">{value}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Sezione 2: Ostacoli e miglioramenti */}
        <div className="form-section">
          <h2 className="section-title">2. Ostacoli e miglioramenti</h2>
          
          <div className="question-group">
            <label className="question-label">
              5. Hai avuto blocchi o rallentamenti? Se sì, indicarne la causa:
            </label>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="blocchi_rallentamenti"
                  value="No, tutto fatto"
                  checked={formData.blocchi_rallentamenti === 'No, tutto fatto'}
                  onChange={(e) => handleInputChange('blocchi_rallentamenti', e.target.value)}
                />
                <span className="radio-custom"></span>
                No, tutto fatto
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="blocchi_rallentamenti"
                  value="Sì"
                  checked={formData.blocchi_rallentamenti === 'Sì' || formData.blocchi_rallentamenti.startsWith('Sì —')}
                  onChange={(e) => handleInputChange('blocchi_rallentamenti', e.target.value)}
                />
                <span className="radio-custom"></span>
                Sì — scrivi brevemente cosa e perché
              </label>
            </div>
            {(formData.blocchi_rallentamenti === 'Sì' || formData.blocchi_rallentamenti.startsWith('Sì —')) && (
              <textarea
                value={formData.blocchi_rallentamenti === 'Sì' ? '' : (formData.blocchi_rallentamenti as string).replace('Sì — ', '')}
                onChange={(e) => {
                  const newValue = e.target.value;
                  handleInputChange('blocchi_rallentamenti', newValue ? `Sì — ${newValue}` : 'Sì');
                }}
                className="ultra-modern-textarea"
                rows={3}
                placeholder="Descrivi i blocchi o rallentamenti..."
              />
            )}
          </div>

          <div className="question-group">
            <label className="question-label">
              6. Hai riscontrato qualche ostacolo interno legato al team, alla comunicazione o al processo di lavoro?
            </label>
            <p className="question-help">
              Se sì, descrivilo brevemente
            </p>
            <textarea
              value={formData.ostacoli_interni || ''}
              onChange={(e) => handleInputChange('ostacoli_interni', e.target.value)}
              className="ultra-modern-textarea"
              rows={3}
              placeholder="Descrivi eventuali ostacoli interni..."
            />
          </div>

          <div className="question-group">
            <label className="question-label">
              7. Hai avuto difficoltà o rallentamenti causati da clienti, fornitori o fattori esterni al team?
            </label>
            <p className="question-help">
              Se sì, descrivere brevemente
            </p>
            <textarea
              value={formData.difficolta_esterne || ''}
              onChange={(e) => handleInputChange('difficolta_esterne', e.target.value)}
              className="ultra-modern-textarea"
              rows={3}
              placeholder="Descrivi eventuali difficoltà esterne..."
            />
          </div>
        </div>

        {/* Sezione 3: Collaborazione e comunicazione */}
        <div className="form-section">
          <h2 className="section-title">3. Collaborazione e comunicazione</h2>
          
          <div className="question-group">
            <label className="question-label">
              8. Ti sei sentita/o allineata/o con il team questa settimana?
            </label>
            <div className="rating-group">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className="rating-option">
                  <input
                    type="radio"
                    name="allineamento_team"
                    value={value}
                    checked={formData.allineamento_team === value}
                    onChange={(e) => handleInputChange('allineamento_team', parseInt(e.target.value))}
                  />
                  <span className="rating-custom">{value}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="question-group">
            <label className="question-label">
              9. Ti servirebbe più supporto o chiarezza da qualcuno (PM, collega, cliente)?
            </label>
            <p className="question-help">
              Se sì, scrivi da chi e su cosa
            </p>
            <textarea
              value={formData.supporto_chiarezza || ''}
              onChange={(e) => handleInputChange('supporto_chiarezza', e.target.value)}
              className="ultra-modern-textarea"
              rows={3}
              placeholder="Descrivi di quale supporto o chiarezza avresti bisogno..."
            />
          </div>

          <div className="question-group">
            <label className="question-label">
              10. C'è qualcuno del team che vuoi ringraziare o riconoscere per aver fatto un buon lavoro?
            </label>
            <p className="question-help">
              Facoltativo ma sempre bello da leggere!
            </p>
            <textarea
              value={formData.ringraziamenti || ''}
              onChange={(e) => handleInputChange('ringraziamenti', e.target.value)}
              className="ultra-modern-textarea"
              rows={3}
              placeholder="Ringrazia qualcuno del team..."
            />
          </div>
        </div>

        {/* Sezione 4: Prossima settimana */}
        <div className="form-section">
          <h2 className="section-title">4. Prossima settimana</h2>
          
          <div className="question-group">
            <label className="question-label">
              11. Quali sono le 3 priorità principali su cui ti concentrerai?
            </label>
            <textarea
              value={formData.priorita_prossima_settimana}
              onChange={(e) => handleInputChange('priorita_prossima_settimana', e.target.value)}
              className="ultra-modern-textarea"
              rows={4}
              required
            />
          </div>

          <div className="question-group">
            <label className="question-label">
              12. Ti serve qualche risorsa, accesso o informazione per farle bene?
            </label>
            <textarea
              value={formData.risorse_necessarie || ''}
              onChange={(e) => handleInputChange('risorse_necessarie', e.target.value)}
              className="ultra-modern-textarea"
              rows={3}
              placeholder="Descrivi le risorse di cui avresti bisogno..."
            />
          </div>
        </div>

        {/* Sezione 5: Stato d'animo */}
        <div className="form-section">
          <h2 className="section-title">5. Stato d'animo</h2>
          
          <div className="question-group">
            <label className="question-label">
              13. Come ti sei sentita/o in generale questa settimana?
            </label>
            <div className="radio-group">
              {[
                'Stressata/o',
                'Un po\' sotto pressione',
                'Bilanciata/o',
                'Serena/o e motivata/o',
                'Super carica/o'
              ].map((option) => (
                <label key={option} className="radio-option">
                  <input
                    type="radio"
                    name="stato_animo"
                    value={option}
                    checked={formData.stato_animo === option}
                    onChange={(e) => handleInputChange('stato_animo', e.target.value)}
                  />
                  <span className="radio-custom"></span>
                  {option}
                </label>
              ))}
            </div>
          </div>

          <div className="question-group">
            <label className="question-label">
              14. Un pensiero libero per chiudere la settimana:
            </label>
            <p className="question-help">
              Un piccolo successo, un'idea, o qualcosa che ti va di condividere
            </p>
            <textarea
              value={formData.pensiero_libero || ''}
              onChange={(e) => handleInputChange('pensiero_libero', e.target.value)}
              className="ultra-modern-textarea"
              rows={4}
              placeholder="Condividi un pensiero libero..."
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="submit-section">
          <button
            type="submit"
            disabled={isSubmitting}
            className="submit-button"
          >
            {isSubmitting ? (
              <>
                <div className="spinner"></div>
                Invio in corso...
              </>
            ) : (
              <>
                <SendIcon size={20} />
                Invia Gradimento
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Gradimento;
