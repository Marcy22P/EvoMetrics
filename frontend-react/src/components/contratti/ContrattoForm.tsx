import React, { useState, useEffect } from 'react';
import type { ContrattoData } from '../../types/contratto';
import { 
  generateArticolo2Oggetto, 
  generateArticolo2SitoWeb, 
  generateArticolo2Marketing, 
  generateArticolo2Linkbuilding,
  generateArticolo3Modalita,
  generateArticolo4Durata,
  generateArticolo5Compenso,
  generateArticolo6Proprieta,
  generateArticolo7Responsabilita,
  generateArticolo8NormeRinvio,
  generateArticolo9ForoCompetente,
  hasSitoWeb as checkHasSitoWeb,
  hasMarketing as checkHasMarketing,
  hasLinkbuilding as checkHasLinkbuilding,
  formatCurrencyWithWords
} from '../../utils/contrattoUtils';
import './ContrattoForm.css';

interface ContrattoFormProps {
  contrattoData: ContrattoData;
  onDataChange: (data: ContrattoData) => void;
  onSave: () => void;
  isModified: boolean;
  isSaving: boolean;
}

const ContrattoForm: React.FC<ContrattoFormProps> = ({
  contrattoData,
  onDataChange,
  onSave,
  isModified,
  isSaving
}) => {
  const [formData, setFormData] = useState<ContrattoData>(contrattoData);
  
  // Stato separato per i valori di input dei campi numerici
  const [inputValues, setInputValues] = useState({
    importoTotale: contrattoData.compenso.sitoWeb?.importoTotale?.toString() || '',
    importoMensile: contrattoData.compenso.marketing.importoMensile?.toString() || ''
  });

  // Sincronizza formData con contrattoData solo se l'ID è diverso (nuovo contratto caricato)
  useEffect(() => {
    // Evita loop infiniti: aggiorna solo se l'ID è cambiato o se è un nuovo contratto
    if (contrattoData.id !== formData.id || !formData.durata?.dataDecorrenza) {
    setFormData(contrattoData);
    setInputValues({
      importoTotale: contrattoData.compenso.sitoWeb?.importoTotale?.toString() || '',
      importoMensile: contrattoData.compenso.marketing.importoMensile?.toString() || ''
    });
    }
  }, [contrattoData.id]); // Solo quando cambia l'ID del contratto

  const handleInputChange = (field: string, value: any) => {
    const newData = { ...formData };
    
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (parent === 'datiCommittente') {
        newData.datiCommittente = { ...newData.datiCommittente, [child]: value };
      } else if (parent === 'durata') {
        newData.durata = { ...newData.durata, [child]: value };
      } else if (parent === 'compenso') {
        if (child.includes('.')) {
          const [subParent, subChild] = child.split('.');
          if (subParent === 'sitoWeb') {
            if (!newData.compenso.sitoWeb) {
              newData.compenso.sitoWeb = {
                importoTotale: 0,
                modalitaPagamento: '50_50',
                acconto: 0,
                saldo: 0
              };
            }
            newData.compenso.sitoWeb = { ...newData.compenso.sitoWeb, [subChild]: value };
          } else if (subParent === 'marketing') {
            newData.compenso.marketing = { ...newData.compenso.marketing, [subChild]: value };
          }
        } else {
          newData.compenso = { ...newData.compenso, [child]: value };
        }
      }
    } else {
      (newData as any)[field] = value;
    }
    
    setFormData(newData);
    onDataChange(newData);
  };


  const calculateDataScadenza = (tipo: string, dataDecorrenza: string) => {
    if (!dataDecorrenza) return '';
    
    const decorrenza = new Date(dataDecorrenza);
    let scadenza = new Date(decorrenza);
    
    switch (tipo) {
      case '12_mesi_senza_rinnovo':
      case '12_mesi_con_rinnovo':
        scadenza.setMonth(scadenza.getMonth() + 12);
        break;
      case '6_6_mesi_senza_rinnovo':
        scadenza.setMonth(scadenza.getMonth() + 6);
        break;
      case '3_mesi_con_rinnovo':
      case '3_mesi_senza_rinnovo':
        scadenza.setMonth(scadenza.getMonth() + 3);
        break;
    }
    
    return scadenza.toISOString().split('T')[0];
  };

  const handleDurataChange = (tipo: string) => {
    // Leggi la data di decorrenza direttamente dall'input DOM per essere sicuri di avere il valore più aggiornato
    const dataDecorrenzaInput = document.getElementById('data-decorrenza-input') as HTMLInputElement;
    const dataDecorrenzaCorrente = dataDecorrenzaInput?.value || formData.durata?.dataDecorrenza || '';
    
    // Calcola la data di scadenza solo se c'è una data di decorrenza
    const dataScadenza = dataDecorrenzaCorrente ? calculateDataScadenza(tipo, dataDecorrenzaCorrente) : '';
    
    const newData = { ...formData };
    newData.durata = {
      ...newData.durata,
      tipo: tipo as any,
      dataDecorrenza: dataDecorrenzaCorrente,
      dataScadenza: dataScadenza
    };
    
    // Aggiorna automaticamente l'articolo 4 solo se abbiamo entrambe le date
    if (dataDecorrenzaCorrente && dataScadenza) {
      newData.articolo4Durata = generateArticolo4Durata(tipo, dataDecorrenzaCorrente, dataScadenza);
    }
    
    setFormData(newData);
    onDataChange(newData);
  };

  const handleDataDecorrenzaChange = (data: string) => {
    const dataScadenza = calculateDataScadenza(formData.durata.tipo, data);
    
    const newData = { ...formData };
    newData.durata = {
      ...newData.durata,
      dataDecorrenza: data,
      dataScadenza: dataScadenza
    };
    
    // Aggiorna automaticamente l'articolo 4
    newData.articolo4Durata = generateArticolo4Durata(newData.durata.tipo, data, dataScadenza);
    
    setFormData(newData);
    onDataChange(newData);
  };

  const calculateRate = (importoTotale: number, modalita: string) => {
    const importo = importoTotale || 0;
    
    if (modalita === '50_50') {
      return {
        acconto: importo * 0.5,
        saldo: importo * 0.5
      };
    } else if (modalita === '40_30_30') {
      return {
        acconto: importo * 0.4,
        secondaRata: importo * 0.3,
        saldo: importo * 0.3
      };
    }
    return { acconto: 0, saldo: 0 };
  };

  const handleImportoTotaleInput = (value: string) => {
    // Aggiorna solo lo stato di input
    setInputValues(prev => ({ ...prev, importoTotale: value }));
    
    // Converti in numero solo se valido
    const numValue = value === '' ? 0 : parseInt(value.replace(/[^0-9]/g, ''));
    if (!isNaN(numValue)) {
      const modalita = formData.compenso.sitoWeb?.modalitaPagamento || '50_50';
      const rate = calculateRate(numValue, modalita);
      
      const newData = { ...formData };
      if (!newData.compenso.sitoWeb) {
        newData.compenso.sitoWeb = {
          importoTotale: numValue,
          modalitaPagamento: modalita,
          acconto: rate.acconto,
          saldo: rate.saldo
        };
      } else {
        const updatedSitoWeb = {
          ...newData.compenso.sitoWeb,
          importoTotale: numValue,
          acconto: rate.acconto,
          saldo: rate.saldo
        };
        
        // Aggiungi secondaRata solo se necessario, altrimenti rimuovila
        if (rate.secondaRata) {
          updatedSitoWeb.secondaRata = rate.secondaRata;
        } else {
          delete updatedSitoWeb.secondaRata;
        }
        
        newData.compenso.sitoWeb = updatedSitoWeb;
      }
      
      // Aggiorna automaticamente l'articolo 5
      newData.articolo5Compenso = generateArticolo5Compenso(newData);
      
      setFormData(newData);
      onDataChange(newData);
    }
  };

  const handleImportoMensileInput = (value: string) => {
    // Aggiorna solo lo stato di input
    setInputValues(prev => ({ ...prev, importoMensile: value }));
    
    // Converti in numero solo se valido
    const numValue = value === '' ? 0 : parseInt(value.replace(/[^0-9]/g, ''));
    if (!isNaN(numValue)) {
      const newData = { ...formData };
      newData.compenso.marketing.importoMensile = numValue;
      
      // Aggiorna automaticamente l'articolo 5
      newData.articolo5Compenso = generateArticolo5Compenso(newData);
      
      setFormData(newData);
      onDataChange(newData);
    }
  };

  const handleGiornoPagamentoChange = (giorno: number) => {
    const newData = { ...formData };
    newData.compenso.marketing.giornoPagamento = giorno;
    
    // Aggiorna automaticamente l'articolo 5
    newData.articolo5Compenso = generateArticolo5Compenso(newData);
    
    setFormData(newData);
    onDataChange(newData);
  };

  const handleModalitaPagamentoChange = (modalita: string) => {
    const importo = formData.compenso.sitoWeb?.importoTotale || 0;
    const rate = calculateRate(importo, modalita);
    
    const newData = { ...formData };
    if (!newData.compenso.sitoWeb) {
      newData.compenso.sitoWeb = {
        importoTotale: importo,
        modalitaPagamento: modalita as '50_50' | '40_30_30',
        acconto: rate.acconto,
        saldo: rate.saldo
      };
    } else {
      const updatedSitoWeb = {
        ...newData.compenso.sitoWeb,
        modalitaPagamento: modalita as '50_50' | '40_30_30',
        acconto: rate.acconto,
        saldo: rate.saldo
      };
      
      // Aggiungi secondaRata solo se necessario, altrimenti rimuovila
      if (rate.secondaRata) {
        updatedSitoWeb.secondaRata = rate.secondaRata;
      } else {
        delete updatedSitoWeb.secondaRata;
      }
      
      newData.compenso.sitoWeb = updatedSitoWeb;
    }
    
    // Aggiorna automaticamente l'articolo 5
    newData.articolo5Compenso = generateArticolo5Compenso(newData);
    
    setFormData(newData);
    onDataChange(newData);
  };

  const hasSitoWeb = formData.tipologiaServizio === 'sito_marketing_linkbuilding' || formData.tipologiaServizio === 'sito_marketing';

  return (
    <div className="contratto-form">
      {/* Dati Committente */}
      <div className="form-section">
        <h2>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
          </svg>
          Dati Committente
        </h2>
        
        <div className="form-grid">
          <div className="form-field">
            <label>Ragione Sociale *</label>
            <input
              type="text"
              value={formData.datiCommittente.ragioneSociale}
              onChange={(e) => handleInputChange('datiCommittente.ragioneSociale', e.target.value)}
              placeholder="Inserisci la ragione sociale"
            />
          </div>
          
          <div className="form-field">
            <label>Città *</label>
            <input
              type="text"
              value={formData.datiCommittente.citta}
              onChange={(e) => handleInputChange('datiCommittente.citta', e.target.value)}
              placeholder="Città"
            />
          </div>
          
          <div className="form-field">
            <label>Via *</label>
            <input
              type="text"
              value={formData.datiCommittente.via}
              onChange={(e) => handleInputChange('datiCommittente.via', e.target.value)}
              placeholder="Via"
            />
          </div>
          
          <div className="form-field">
            <label>Numero *</label>
            <input
              type="text"
              value={formData.datiCommittente.numero}
              onChange={(e) => handleInputChange('datiCommittente.numero', e.target.value)}
              placeholder="n."
            />
          </div>
          
          <div className="form-field">
            <label>CAP *</label>
            <input
              type="text"
              value={formData.datiCommittente.cap}
              onChange={(e) => handleInputChange('datiCommittente.cap', e.target.value)}
              placeholder="CAP"
            />
          </div>
          
          <div className="form-field">
            <label>E-mail *</label>
            <input
              type="email"
              value={formData.datiCommittente.email}
              onChange={(e) => handleInputChange('datiCommittente.email', e.target.value)}
              placeholder="email@esempio.com"
            />
          </div>
          
          <div className="form-field">
            <label>PEC</label>
            <input
              type="email"
              value={formData.datiCommittente.pec}
              onChange={(e) => handleInputChange('datiCommittente.pec', e.target.value)}
              placeholder="pec@esempio.com"
            />
          </div>
          
          <div className="form-field">
            <label>C.F./P.IVA *</label>
            <input
              type="text"
              value={formData.datiCommittente.cfPiva}
              onChange={(e) => handleInputChange('datiCommittente.cfPiva', e.target.value)}
              placeholder="Codice Fiscale o P.IVA"
            />
          </div>
          
          <div className="form-field">
            <label>Legale Rappresentante *</label>
            <input
              type="text"
              value={formData.datiCommittente.legaleRappresentante}
              onChange={(e) => handleInputChange('datiCommittente.legaleRappresentante', e.target.value)}
              placeholder="Nome e Cognome"
            />
          </div>
        </div>
      </div>

      {/* Tipologia Servizio */}
      <div className="form-section">
        <h2>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          Tipologia Servizio
        </h2>
        
        <div className="form-field">
          <label>Seleziona il tipo di servizio *</label>
          <select
            value={formData.tipologiaServizio}
            onChange={(e) => handleInputChange('tipologiaServizio', e.target.value)}
          >
            <option value="sito_marketing_linkbuilding">Sito web + Marketing + Linkbuilding</option>
            <option value="sito_marketing">Sito web + Marketing</option>
            <option value="marketing_content_adv">Marketing (content + adv)</option>
            <option value="marketing_adv">Marketing (adv)</option>
          </select>
        </div>
      </div>

      {/* Durata Contratto */}
      <div className="form-section">
        <h2>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19,3H18V1H16V3H8V1H6V3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V8H19V19Z" />
          </svg>
          Durata Contratto
        </h2>
        
        <div className="form-grid">
          <div className="form-field">
            <label>Tipo Durata *</label>
            <select
              value={formData.durata?.tipo || '12_mesi_senza_rinnovo'}
              onChange={(e) => {
                e.preventDefault();
                handleDurataChange(e.target.value);
              }}
            >
              <option value="12_mesi_senza_rinnovo">12 mesi senza tacito rinnovo</option>
              <option value="12_mesi_con_rinnovo">12 mesi con tacito rinnovo</option>
              <option value="6_6_mesi_senza_rinnovo">6+6 mesi senza tacito rinnovo</option>
              <option value="3_mesi_con_rinnovo">3 mesi con tacito rinnovo</option>
              <option value="3_mesi_senza_rinnovo">3 mesi senza tacito rinnovo</option>
            </select>
          </div>
          
          <div className="form-field">
            <label>Data Decorrenza *</label>
            <input
              type="date"
              id="data-decorrenza-input"
              value={formData.durata?.dataDecorrenza || ''}
              onChange={(e) => handleDataDecorrenzaChange(e.target.value)}
            />
          </div>
          
          <div className="form-field">
            <label>Data Scadenza</label>
            <input
              type="date"
              value={formData.durata?.dataScadenza || ''}
              readOnly
              className="readonly-field"
            />
            <small>Calcolata automaticamente</small>
          </div>
        </div>
      </div>

      {/* Compenso */}
      <div className="form-section">
        <h2>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7,15H9C9,16.08 10.37,17 12,17C13.63,17 15,16.08 15,15C15,13.9 13.96,13.5 11.76,12.97C9.64,12.44 7,11.78 7,9C7,7.21 8.47,5.69 10.5,5.18V3H13.5V5.18C15.53,5.69 17,7.21 17,9H15C15,7.92 13.63,7 12,7C10.37,7 9,7.92 9,9C9,10.1 10.04,10.5 12.24,11.03C14.36,11.56 17,12.22 17,15C17,16.79 15.53,18.31 13.5,18.82V21H10.5V18.82C8.47,18.31 7,16.79 7,15Z" />
          </svg>
          Compenso e Modalità di Pagamento
        </h2>
        
        {hasSitoWeb && (
          <div className="compenso-sito-web">
            <h3>Sito Web</h3>
            <div className="form-grid">
              <div className="form-field">
                <label>Importo Totale (€) *</label>
                <input
                  type="text"
                  value={inputValues.importoTotale}
                  onChange={(e) => handleImportoTotaleInput(e.target.value)}
                  placeholder="Inserisci importo (es: 5000)"
                />
              </div>
              
              <div className="form-field">
                <label>Modalità Pagamento *</label>
                <select
                  value={formData.compenso.sitoWeb?.modalitaPagamento || '50_50'}
                  onChange={(e) => handleModalitaPagamentoChange(e.target.value)}
                >
                  <option value="50_50">50% acconto + 50% a consegna</option>
                  <option value="40_30_30">40% acconto + 30% a 30gg + 30% a consegna</option>
                </select>
              </div>
              
              <div className="form-field">
                <label>Acconto (€)</label>
                <input
                  type="text"
                  value={formData.compenso.sitoWeb?.acconto ? formatCurrencyWithWords(formData.compenso.sitoWeb.acconto) : '0 € (zero/00)'}
                  readOnly
                  className="readonly-field"
                />
              </div>
              
              {formData.compenso.sitoWeb?.modalitaPagamento === '40_30_30' && (
                <div className="form-field">
                  <label>Seconda Rate (€)</label>
                  <input
                    type="text"
                    value={formData.compenso.sitoWeb?.secondaRata ? formatCurrencyWithWords(formData.compenso.sitoWeb.secondaRata) : '0 € (zero/00)'}
                    readOnly
                    className="readonly-field"
                  />
                </div>
              )}
              
              <div className="form-field">
                <label>Saldo (€)</label>
                <input
                  type="text"
                  value={formData.compenso.sitoWeb?.saldo ? formatCurrencyWithWords(formData.compenso.sitoWeb.saldo) : '0 € (zero/00)'}
                  readOnly
                  className="readonly-field"
                />
              </div>
            </div>
          </div>
        )}
        
        <div className="compenso-marketing">
          <h3>Marketing</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Importo Mensile (€) *</label>
              <input
                type="text"
                value={inputValues.importoMensile}
                onChange={(e) => handleImportoMensileInput(e.target.value)}
                placeholder="Inserisci importo mensile (es: 1200)"
              />
            </div>
            
            <div className="form-field">
              <label>Giorno Pagamento *</label>
              <select
                value={formData.compenso.marketing.giornoPagamento || 1}
                onChange={(e) => handleGiornoPagamentoChange(parseInt(e.target.value))}
              >
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="form-section">
        <h2>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          Note Aggiuntive
        </h2>
        
        <div className="form-field">
          <label>Note</label>
          <textarea
            value={formData.note}
            onChange={(e) => handleInputChange('note', e.target.value)}
            placeholder="Inserisci eventuali note particolari..."
            rows={4}
          />
        </div>
      </div>

      {/* Articoli Dinamici */}
      <div className="form-section articoli-section">
        <h2>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          Articoli del Contratto
        </h2>
        <p className="section-description">
          I contenuti degli articoli vengono generati automaticamente in base ai servizi selezionati. 
          Puoi modificare i testi qui sotto per personalizzare il contratto.
        </p>
        
        <div className="articoli-actions">
          <button
            type="button"
            onClick={() => {
              const newData = { ...formData };
              newData.articolo2Oggetto = generateArticolo2Oggetto(formData.tipologiaServizio);
              if (checkHasSitoWeb(formData.tipologiaServizio)) {
                newData.articolo2SitoWeb = generateArticolo2SitoWeb();
              }
              if (checkHasMarketing()) {
                newData.articolo2Marketing = generateArticolo2Marketing(formData.tipologiaServizio);
              }
              if (checkHasLinkbuilding(formData.tipologiaServizio)) {
                newData.articolo2Linkbuilding = generateArticolo2Linkbuilding();
              }
              newData.articolo3Modalita = generateArticolo3Modalita();
              newData.articolo4Durata = generateArticolo4Durata(formData.durata.tipo, formData.durata.dataDecorrenza, formData.durata.dataScadenza);
              newData.articolo5Compenso = generateArticolo5Compenso(formData);
              newData.articolo6Proprieta = generateArticolo6Proprieta();
              newData.articolo7Responsabilita = generateArticolo7Responsabilita();
              newData.articolo8NormeRinvio = generateArticolo8NormeRinvio();
              newData.articolo9ForoCompetente = generateArticolo9ForoCompetente();
              
              setFormData(newData);
              onDataChange(newData);
            }}
            className="generate-button"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M11,16.5L18,9.5L16.5,8L11,13.5L7.5,10L6,11.5L11,16.5Z" />
            </svg>
            Genera Contenuti Automatici
          </button>
        </div>

        {/* ART. 2 - OGGETTO DELLA PRESTAZIONE */}
        <div className="articolo-container">
          <h3>ART. 2 - OGGETTO DELLA PRESTAZIONE</h3>
          
          <div className="articolo-subsection">
            <h4>2.1 Oggetto</h4>
            <div className="form-field">
              <label>Descrizione Oggetto</label>
              <textarea
                value={formData.articolo2Oggetto || ''}
                onChange={(e) => handleInputChange('articolo2Oggetto', e.target.value)}
                placeholder={generateArticolo2Oggetto(formData.tipologiaServizio)}
                rows={6}
              />
            </div>
          </div>

          {/* 2.2 Sito Web - Solo se presente */}
          {checkHasSitoWeb(formData.tipologiaServizio) && (
            <div className="articolo-subsection">
              <h4>2.2 Sito Web</h4>
              <div className="form-field">
                <label>Descrizione Sito Web</label>
              <textarea
                value={formData.articolo2SitoWeb || ''}
                onChange={(e) => handleInputChange('articolo2SitoWeb', e.target.value)}
                placeholder={generateArticolo2SitoWeb()}
                rows={12}
              />
              </div>
            </div>
          )}

          {/* 2.3 Marketing - Sempre presente */}
          {checkHasMarketing() && (
            <div className="articolo-subsection">
              <h4>2.3 Marketing</h4>
              <div className="form-field">
                <label>Descrizione Marketing</label>
              <textarea
                value={formData.articolo2Marketing || ''}
                onChange={(e) => handleInputChange('articolo2Marketing', e.target.value)}
                placeholder={generateArticolo2Marketing(formData.tipologiaServizio)}
                rows={10}
              />
              </div>
            </div>
          )}

          {/* 2.4 Linkbuilding - Solo se presente */}
          {checkHasLinkbuilding(formData.tipologiaServizio) && (
            <div className="articolo-subsection">
              <h4>2.4 Linkbuilding</h4>
              <div className="form-field">
                <label>Descrizione Linkbuilding</label>
              <textarea
                value={formData.articolo2Linkbuilding || ''}
                onChange={(e) => handleInputChange('articolo2Linkbuilding', e.target.value)}
                placeholder={generateArticolo2Linkbuilding()}
                rows={8}
              />
              </div>
            </div>
          )}
        </div>

        {/* ART. 3 - MODALITÀ DI ESECUZIONE DELLA PRESTAZIONE PROFESSIONALE */}
        <div className="articolo-container">
          <h3>ART. 3 - MODALITÀ DI ESECUZIONE DELLA PRESTAZIONE PROFESSIONALE</h3>
          <div className="form-field">
            <label>Descrizione Modalità</label>
            <textarea
              value={formData.articolo3Modalita || ''}
              onChange={(e) => handleInputChange('articolo3Modalita', e.target.value)}
              placeholder={generateArticolo3Modalita()}
              rows={6}
            />
          </div>
        </div>

        {/* ART. 4 - DURATA DEL CONTRATTO */}
        <div className="articolo-container">
          <h3>ART. 4 - DURATA DEL CONTRATTO</h3>
          <div className="form-field">
            <label>Descrizione Durata</label>
            <textarea
              value={formData.articolo4Durata || ''}
              onChange={(e) => handleInputChange('articolo4Durata', e.target.value)}
              placeholder={generateArticolo4Durata(formData.durata.tipo, formData.durata.dataDecorrenza, formData.durata.dataScadenza)}
              rows={8}
            />
          </div>
        </div>

        {/* ART. 5 - COMPENSO E MODALITÀ DI PAGAMENTO */}
        <div className="articolo-container">
          <h3>ART. 5 - COMPENSO E MODALITÀ DI PAGAMENTO</h3>
          <div className="form-field">
            <label>Descrizione Compenso</label>
            <textarea
              value={formData.articolo5Compenso || ''}
              onChange={(e) => handleInputChange('articolo5Compenso', e.target.value)}
              placeholder={generateArticolo5Compenso(formData)}
              rows={8}
            />
          </div>
        </div>

        {/* ART. 6 - PROPRIETÀ E RISERVATEZZA DEI RISULTATI */}
        <div className="articolo-container">
          <h3>ART. 6 - PROPRIETÀ E RISERVATEZZA DEI RISULTATI</h3>
          <div className="form-field">
            <label>Descrizione Proprietà e Riservatezza</label>
            <textarea
              value={formData.articolo6Proprieta || ''}
              onChange={(e) => handleInputChange('articolo6Proprieta', e.target.value)}
              placeholder="Articolo 6 - Proprietà e riservatezza dei risultati"
              rows={6}
            />
          </div>
        </div>

        {/* ART. 7 - RESPONSABILITÀ */}
        <div className="articolo-container">
          <h3>ART. 7 - RESPONSABILITÀ</h3>
          <div className="form-field">
            <label>Descrizione Responsabilità</label>
            <textarea
              value={formData.articolo7Responsabilita || ''}
              onChange={(e) => handleInputChange('articolo7Responsabilita', e.target.value)}
              placeholder="Articolo 7 - Responsabilità"
              rows={3}
            />
          </div>
        </div>

        {/* ART. 8 - NORME DI RINVIO */}
        <div className="articolo-container">
          <h3>ART. 8 - NORME DI RINVIO</h3>
          <div className="form-field">
            <label>Descrizione Norme di Rinvio</label>
            <textarea
              value={formData.articolo8NormeRinvio || ''}
              onChange={(e) => handleInputChange('articolo8NormeRinvio', e.target.value)}
              placeholder="Articolo 8 - Norme di rinvio"
              rows={4}
            />
          </div>
        </div>

        {/* ART. 9 - FORO COMPETENTE */}
        <div className="articolo-container">
          <h3>ART. 9 - FORO COMPETENTE</h3>
          <div className="form-field">
            <label>Descrizione Foro Competente</label>
            <textarea
              value={formData.articolo9ForoCompetente || ''}
              onChange={(e) => handleInputChange('articolo9ForoCompetente', e.target.value)}
              placeholder="Articolo 9 - Foro competente"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="form-actions">
        <button
          onClick={onSave}
          disabled={isSaving}
          className={`save-button ${isModified ? 'modified' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z" />
          </svg>
          {isSaving ? 'Salvataggio...' : 'Salva Contratto'}
        </button>
        
        <div className="save-info">
          {isModified && (
            <div className="modified-indicator">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,16.5L18,9.5L16.5,8L11,13.5L7.5,10L6,11.5L11,16.5Z" />
              </svg>
              Modifiche non salvate
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContrattoForm;
