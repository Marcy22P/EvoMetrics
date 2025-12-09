import React, { useState, useEffect } from 'react';
import type { PreventivoData } from '../../types/preventivo';
import type { ContrattoData } from '../../types/contratto';
import { convertPreventivoToContratto } from '../../utils/preventivoToContrattoMapper';
import { formatCurrencyWithWords } from '../../utils/contrattoUtils';
import { preventiviApi } from '../../services/preventiviApi';
import { contrattiApi } from '../../services/contrattiApi';
import './ImportPreventiviModal.css';

// Funzione helper per estrarre i servizi selezionati dal preventivo
const getServiziSelezionati = (preventivo: PreventivoData): string[] => {
  const servizi: string[] = [];
  
  Object.keys(preventivo.servizi).forEach(categoria => {
    const serviziCategoria = preventivo.servizi[categoria as keyof typeof preventivo.servizi];
    if (serviziCategoria && Array.isArray(serviziCategoria)) {
      serviziCategoria.forEach(servizioId => {
        servizi.push(servizioId);
      });
    }
  });
  
  return servizi;
};

interface ImportPreventiviModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContrattoCreated: (contratto: ContrattoData) => void;
}

export const ImportPreventiviModal: React.FC<ImportPreventiviModalProps> = ({
  isOpen,
  onClose,
  onContrattoCreated
}) => {
  const [preventivi, setPreventivi] = useState<PreventivoData[]>([]);
  const [selectedPreventivo, setSelectedPreventivo] = useState<PreventivoData | null>(null);
  const [previewContratto, setPreviewContratto] = useState<Partial<ContrattoData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPreventivi();
    }
  }, [isOpen]);

  const loadPreventivi = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await preventiviApi.getAllPreventivi();
      console.log('Preventivi caricati:', response);
      if (response && response.length > 0) {
        console.log('Primo preventivo:', response[0]);
        console.log('Servizi primo preventivo:', response[0].servizi);
      }
      setPreventivi(response || []);
    } catch (err) {
      console.error('Errore nel caricamento preventivi:', err);
      setError('Errore nel caricamento dei preventivi');
    } finally {
      setLoading(false);
    }
  };

  const handlePreventivoSelect = (preventivo: PreventivoData) => {
    console.log('Preventivo selezionato:', preventivo);
    console.log('Servizi preventivo selezionato:', preventivo.servizi);
    setSelectedPreventivo(preventivo);
    const contrattoPreview = convertPreventivoToContratto(preventivo);
    console.log('Contratto preview generato:', contrattoPreview);
    console.log('Servizi contratto preview:', contrattoPreview.servizi);
    setPreviewContratto(contrattoPreview);
  };

  const handleCreateContratto = async () => {
    if (!selectedPreventivo || !previewContratto) return;

    try {
      setCreating(true);
      const contrattoCompleto: ContrattoData = {
        id: `contratto-${Date.now()}`,
        numero: `CTR-${Date.now()}`,
        datiCommittente: previewContratto.datiCommittente || {
          ragioneSociale: '',
          email: '',
          citta: '',
          via: '',
          numero: '',
          cap: '',
          pec: '',
          cfPiva: '',
          legaleRappresentante: ''
        },
        tipologiaServizio: previewContratto.tipologiaServizio || 'marketing_adv',
        servizi: previewContratto.servizi || [],
        durata: previewContratto.durata || {
          tipo: '12_mesi_con_rinnovo',
          dataDecorrenza: new Date().toISOString().split('T')[0],
          dataScadenza: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        compenso: previewContratto.compenso || {
          marketing: {
            importoMensile: 0,
            giornoPagamento: 1
          }
        },
        note: previewContratto.note || `Contratto generato da preventivo ${selectedPreventivo.numero}`,
        status: 'bozza' as 'bozza' | 'inviato' | 'firmato' | 'estinto' | 'rescisso',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const response = await contrattiApi.createContratto(contrattoCompleto);
      // La risposta contiene il contratto creato con ID reale
      const createdContratto = {
        ...contrattoCompleto,
        id: response.id,
        numero: response.numero
      };
      onContrattoCreated(createdContratto);
      onClose();
    } catch (err) {
      console.error('Errore nella creazione del contratto:', err);
      setError('Errore nella creazione del contratto');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Importa Preventivo come Contratto</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading">Caricamento preventivi...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : (
            <div className="content-grid">
              {/* Left Side - Preventivi Selection */}
              <div className="preventivi-section">
                <h3>Seleziona Preventivo</h3>
                <div className="preventivi-list">
                  {preventivi.map((preventivo) => (
                    <div
                      key={preventivo.id}
                      className={`preventivo-card ${selectedPreventivo?.id === preventivo.id ? 'selected' : ''}`}
                      onClick={() => handlePreventivoSelect(preventivo)}
                    >
                      <div className="preventivo-header">
                        <h4>{preventivo.numero}</h4>
                        <span className="preventivo-date">
                          {new Date(preventivo.data).toLocaleDateString('it-IT')}
                        </span>
                      </div>
                      <div className="preventivo-client">
                        <strong>{preventivo.cliente}</strong>
                        <p>{preventivo.oggetto}</p>
                      </div>
                      <div className="preventivo-servizi">
                        <h5>Servizi Inclusi:</h5>
                        <div className="servizi-list">
                          {getServiziSelezionati(preventivo).length > 0 ? (
                            getServiziSelezionati(preventivo).slice(0, 3).map((servizio, index) => (
                              <span key={index} className="servizio-tag">
                                {servizio.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            ))
                          ) : (
                            <span className="no-servizi">Nessun servizio selezionato</span>
                          )}
                          {getServiziSelezionati(preventivo).length > 3 && (
                            <span className="servizi-more">
                              +{getServiziSelezionati(preventivo).length - 3} altri
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="preventivo-total">
                        <strong>Totale: {formatCurrencyWithWords(preventivo.totale || 0)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side - Contratto Preview */}
              <div className="contratto-section">
                <h3>Anteprima Contratto</h3>
                <div className="contratto-preview">
                  {previewContratto ? (
                    <div className="preview-content">
                      <div className="preview-section">
                        <h4>Dati Cliente</h4>
                        <p><strong>Ragione Sociale:</strong> {previewContratto.datiCommittente?.ragioneSociale}</p>
                        <p><strong>Email:</strong> {previewContratto.datiCommittente?.email}</p>
                        <p><strong>Città:</strong> {previewContratto.datiCommittente?.citta}</p>
                      </div>

                      <div className="preview-section">
                        <h4>Tipologia Servizio</h4>
                        <p>{previewContratto.tipologiaServizio?.replace(/_/g, ' ').toUpperCase()}</p>
                      </div>

                      <div className="preview-section">
                        <h4>Servizi Inclusi</h4>
                        <ul>
                          {previewContratto.servizi?.map((servizio, index) => (
                            <li key={index}>
                              <strong>{servizio.nome}:</strong> {servizio.descrizione}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="preview-section">
                        <h4>Compenso</h4>
                        {previewContratto.compenso?.sitoWeb && (
                          <p><strong>Sito Web:</strong> €{previewContratto.compenso.sitoWeb.importoTotale?.toLocaleString('it-IT')}</p>
                        )}
                        {previewContratto.compenso?.marketing && (
                          <p><strong>Marketing Mensile:</strong> €{previewContratto.compenso.marketing.importoMensile?.toLocaleString('it-IT')}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="preview-placeholder">
                      <p>Seleziona un preventivo per vedere l'anteprima del contratto</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Annulla
          </button>
          <button 
            className="btn-primary" 
            onClick={handleCreateContratto}
            disabled={!selectedPreventivo || creating}
          >
            {creating ? 'Creazione...' : 'Crea Contratto'}
          </button>
        </div>
      </div>
    </div>
  );
};