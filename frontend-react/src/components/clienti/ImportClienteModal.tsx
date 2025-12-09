import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { clientiApi } from '../../services/clientiApi';
import './ImportClienteModal.css';

interface ImportClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClienteImported: () => void;
}

interface PreventivoSource {
  id: string;
  numero: string;
  cliente: string;
  data: string | null;
}

interface ContrattoSource {
  id: string;
  numero: string;
  ragioneSociale: string;
  email: string;
  telefono: string;
  citta: string;
  data: string | null;
}

export const ImportClienteModal: React.FC<ImportClienteModalProps> = React.memo(({
  isOpen,
  onClose,
  onClienteImported
}) => {
  const [sourceType, setSourceType] = useState<'preventivo' | 'contratto' | null>(null);
  const [preventivi, setPreventivi] = useState<PreventivoSource[]>([]);
  const [contratti, setContratti] = useState<ContrattoSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  const loadSources = useCallback(async () => {
    // Carica solo se non già caricati
    if (sourcesLoaded && preventivi.length > 0 && contratti.length > 0) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const sources = await clientiApi.getImportSources();
      setPreventivi(sources.preventivi || []);
      setContratti(sources.contratti || []);
      setSourcesLoaded(true);
    } catch (err: any) {
      console.error('Errore nel caricamento fonti:', err);
      setError(err.message || 'Errore nel caricamento delle fonti disponibili');
    } finally {
      setLoading(false);
    }
  }, [sourcesLoaded, preventivi.length, contratti.length]);

  useEffect(() => {
    if (isOpen) {
      // Carica solo quando il modal si apre e le fonti non sono già caricate
      if (!sourcesLoaded) {
        loadSources();
      }
      setSourceType(null);
      setSelectedSource(null);
      setError(null);
    }
  }, [isOpen, sourcesLoaded, loadSources]);

  const handleImport = useCallback(async () => {
    if (!sourceType || !selectedSource) {
      setError('Seleziona una fonte e un elemento da importare');
      return;
    }

    try {
      setImporting(true);
      setError(null);
      await clientiApi.importCliente(sourceType, selectedSource);
      // Rimuovi l'elemento importato dalla lista locale (ottimistic update)
      if (sourceType === 'preventivo') {
        setPreventivi(prev => prev.filter(p => p.id !== selectedSource));
      } else {
        setContratti(prev => prev.filter(c => c.id !== selectedSource));
      }
      onClienteImported();
      setSelectedSource(null);
      setSourceType(null);
    } catch (err: any) {
      console.error('Errore nell\'importazione:', err);
      setError(err.message || 'Errore nell\'importazione del cliente');
    } finally {
      setImporting(false);
    }
  }, [sourceType, selectedSource, onClienteImported]);

  const selectedItem = useMemo(() => {
    if (!sourceType || !selectedSource) return null;
    
    if (sourceType === 'preventivo') {
      return preventivi.find(p => p.id === selectedSource);
    } else {
      return contratti.find(c => c.id === selectedSource);
    }
  }, [sourceType, selectedSource, preventivi, contratti]);

  if (!isOpen) return null;

  return (
    <div className="import-cliente-modal-overlay" onClick={onClose}>
      <div className="import-cliente-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="import-cliente-modal-header">
          <h2>Importa Cliente</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="import-cliente-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="import-cliente-loading">
            Caricamento fonti disponibili...
          </div>
        ) : (
          <>
            {/* Selezione Tipo Fonte */}
            <div className="import-cliente-source-type">
              <h3>Seleziona Fonte</h3>
              <div className="source-type-buttons">
                <button
                  className={`source-type-btn ${sourceType === 'preventivo' ? 'active' : ''}`}
                  onClick={() => {
                    setSourceType('preventivo');
                    setSelectedSource(null);
                  }}
                  disabled={preventivi.length === 0}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                  </svg>
                  Preventivi ({preventivi.length})
                </button>
                <button
                  className={`source-type-btn ${sourceType === 'contratto' ? 'active' : ''}`}
                  onClick={() => {
                    setSourceType('contratto');
                    setSelectedSource(null);
                  }}
                  disabled={contratti.length === 0}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                  </svg>
                  Contratti ({contratti.length})
                </button>
              </div>
            </div>

            {/* Lista Elementi Disponibili */}
            {sourceType && (
              <div className="import-cliente-sources-list">
                <h3>
                  {sourceType === 'preventivo' ? 'Preventivi Disponibili' : 'Contratti Disponibili'}
                </h3>
                {sourceType === 'preventivo' ? (
                  preventivi.length === 0 ? (
                    <div className="empty-sources">
                      Nessun preventivo disponibile per l'import
                    </div>
                  ) : (
                    <div className="sources-list">
                      {preventivi.map((prev) => (
                        <div
                          key={prev.id}
                          className={`source-item ${selectedSource === prev.id ? 'selected' : ''}`}
                          onClick={() => setSelectedSource(prev.id)}
                        >
                          <div className="source-item-header">
                            <span className="source-number">{prev.numero}</span>
                            {prev.data && (
                              <span className="source-date">
                                {new Date(prev.data).toLocaleDateString('it-IT')}
                              </span>
                            )}
                          </div>
                          <div className="source-item-content">
                            <strong>{prev.cliente}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  contratti.length === 0 ? (
                    <div className="empty-sources">
                      Nessun contratto disponibile per l'import
                    </div>
                  ) : (
                    <div className="sources-list">
                      {contratti.map((contr) => (
                        <div
                          key={contr.id}
                          className={`source-item ${selectedSource === contr.id ? 'selected' : ''}`}
                          onClick={() => setSelectedSource(contr.id)}
                        >
                          <div className="source-item-header">
                            <span className="source-number">{contr.numero}</span>
                            {contr.data && (
                              <span className="source-date">
                                {new Date(contr.data).toLocaleDateString('it-IT')}
                              </span>
                            )}
                          </div>
                          <div className="source-item-content">
                            <strong>{contr.ragioneSociale}</strong>
                            {contr.email && <div className="source-detail">Email: {contr.email}</div>}
                            {contr.citta && <div className="source-detail">Città: {contr.citta}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Preview Dati */}
            {selectedItem && (
              <div className="import-cliente-preview">
                <h3>Anteprima Dati</h3>
                <div className="preview-content">
                  {sourceType === 'preventivo' ? (
                    <>
                      <div className="preview-row">
                        <label>Nome Azienda:</label>
                        <span>{(selectedItem as PreventivoSource).cliente}</span>
                      </div>
                      <div className="preview-row">
                        <label>Numero Preventivo:</label>
                        <span>{(selectedItem as PreventivoSource).numero}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="preview-row">
                        <label>Ragione Sociale:</label>
                        <span>{(selectedItem as ContrattoSource).ragioneSociale}</span>
                      </div>
                      <div className="preview-row">
                        <label>Email:</label>
                        <span>{(selectedItem as ContrattoSource).email || 'N/A'}</span>
                      </div>
                      <div className="preview-row">
                        <label>Indirizzo:</label>
                        <span>{(selectedItem as ContrattoSource).telefono || 'N/A'}</span>
                      </div>
                      <div className="preview-row">
                        <label>Città:</label>
                        <span>{(selectedItem as ContrattoSource).citta || 'N/A'}</span>
                      </div>
                      <div className="preview-row">
                        <label>Numero Contratto:</label>
                        <span>{(selectedItem as ContrattoSource).numero}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Azioni */}
            <div className="import-cliente-actions">
              <button className="btn-cancel" onClick={onClose} disabled={importing}>
                Annulla
              </button>
              <button
                className="btn-import"
                onClick={handleImport}
                disabled={!selectedSource || importing}
              >
                {importing ? 'Importazione...' : 'Importa Cliente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

ImportClienteModal.displayName = 'ImportClienteModal';

