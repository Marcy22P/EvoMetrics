import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { ContrattoData } from '../types/contratto';
import ContrattoForm from '../components/contratti/ContrattoForm';
import { ContrattoPreview } from '../components/contratti/ContrattoPreview';
import { ImportPreventiviModal } from '../components/contratti/ImportPreventiviModal';
import DeleteContrattoModal from '../components/contratti/DeleteContrattoModal';
import { DashboardIcon } from '../components/Icons/AssessmentIcons';
import contrattiApi from '../services/contrattiApi';
import pagamentiApi from '../services/pagamentiApi';
import { showToast } from '../utils/toast';
import './Contratti.css';

const Contratti: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'modifica' | 'anteprima' | 'archivio'>('modifica');
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contrattiSalvati, setContrattiSalvati] = useState<ContrattoData[]>([]);
  const [isLoadingContratti, setIsLoadingContratti] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contrattoToDelete, setContrattoToDelete] = useState<ContrattoData | null>(null);

  // Dati iniziali del contratto
  const [contrattoData, setContrattoData] = useState<ContrattoData>({
    id: 'contratto_' + Date.now(),
    numero: 'CONT-' + Date.now().toString().slice(-6),
    datiCommittente: {
      ragioneSociale: '',
      citta: '',
      via: '',
      numero: '',
      cap: '',
      email: '',
      pec: '',
      cfPiva: '',
      legaleRappresentante: ''
    },
    tipologiaServizio: 'sito_marketing_linkbuilding',
    servizi: [
      { id: 'sito_web', nome: 'Sito Web', descrizione: 'Sviluppo e-commerce Shopify', attivato: true },
      { id: 'marketing', nome: 'Marketing', descrizione: 'Gestione social e campagne META', attivato: true },
      { id: 'linkbuilding', nome: 'Linkbuilding', descrizione: 'Attività SEO off-site', attivato: true }
    ],
    durata: {
      tipo: '12_mesi_senza_rinnovo',
      dataDecorrenza: '',
      dataScadenza: ''
    },
    compenso: {
      sitoWeb: {
        importoTotale: 0,
        modalitaPagamento: '50_50',
        acconto: 0,
        saldo: 0
      },
      marketing: {
        importoMensile: 0,
        giornoPagamento: 1
      }
    },
    note: '',
    status: 'bozza',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Carica i contratti salvati (memoizzato)
  const loadContratti = useCallback(async () => {
    setIsLoadingContratti(true);
    try {
      const contratti = await contrattiApi.getContratti();
      setContrattiSalvati(contratti);
    } catch (error) {
      showToast('Errore nel caricamento dei contratti', 'error');
    } finally {
      setIsLoadingContratti(false);
    }
  }, []);

  // Carica i contratti quando si passa alla tab archivio
  useEffect(() => {
    if (activeTab === 'archivio') {
      loadContratti();
    }
  }, [activeTab]);

  // Listener per aggiornamenti automatici dello status
  useEffect(() => {
    const handleContrattiAggiornati = () => {
      loadContratti();
    };

    window.addEventListener('contratti-aggiornati', handleContrattiAggiornati);
    
    return () => {
      window.removeEventListener('contratti-aggiornati', handleContrattiAggiornati);
    };
  }, [loadContratti]);

  const handleDataChange = useCallback((newData: ContrattoData) => {
    setContrattoData(newData);
    setIsModified(true);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const contrattoToSave = {
        ...contrattoData,
        updated_at: new Date().toISOString()
      };

      // Controlla se è un nuovo contratto (ID temporaneo o UUID non valido)
      const isNewContratto = contrattoData.id.startsWith('contratto_') || 
                            contrattoData.id.startsWith('contratto-') ||
                            !isValidUUID(contrattoData.id);

      if (isNewContratto) {
        // Nuovo contratto
        const response = await contrattiApi.createContratto(contrattoToSave);
        
        const newContrattoData = {
          ...contrattoToSave,
          id: response.id,
          numero: response.numero
        };
        setContrattoData(newContrattoData);
        
        // Aggiorna la lista contrattiSalvati con il nuovo contratto
        setContrattiSalvati(prev => [...prev, newContrattoData]);
        
        showToast('Contratto creato con successo!', 'success');
      } else {
        // Aggiorna contratto esistente
        await contrattiApi.updateContratto(contrattoData.id, contrattoToSave);
        
        // Aggiorna il contratto nella lista
        setContrattiSalvati(prev => 
          prev.map(c => c.id === contrattoData.id ? contrattoToSave : c)
        );
        
        showToast('Contratto aggiornato con successo!', 'success');
      }
      
      setIsModified(false);
    } catch (error) {
      showToast('Errore nel salvataggio del contratto', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [contrattoData, loadContratti]);

  // Helper function per verificare se un ID è un UUID valido (memoizzato)
  const isValidUUID = useCallback((id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }, []);

  const handleNewContratto = useCallback(() => {
    const newContratto: ContrattoData = {
      ...contrattoData,
      id: 'contratto_' + Date.now(),
      numero: 'CONT-' + Date.now().toString().slice(-6),
      datiCommittente: {
        ragioneSociale: '',
        citta: '',
        via: '',
        numero: '',
        cap: '',
        email: '',
        pec: '',
        cfPiva: '',
        legaleRappresentante: ''
      },
      note: '',
      status: 'bozza',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setContrattoData(newContratto);
    setIsModified(false);
  }, []);

  const handleLoadContratto = useCallback((contratto: ContrattoData) => {
    setContrattoData(contratto);
    setIsModified(false);
    setActiveTab('modifica');
  }, []);

  const handleDeleteContratto = useCallback((contrattoId: string) => {
    const contratto = contrattiSalvati.find(c => c.id === contrattoId);
    if (contratto) {
      setContrattoToDelete(contratto);
      setShowDeleteModal(true);
    }
  }, [contrattiSalvati]);

  const confirmDeleteContratto = useCallback(async () => {
    if (!contrattoToDelete) return;
    
    try {
      await contrattiApi.deleteContratto(contrattoToDelete.id);
      showToast('Contratto e pagamenti associati eliminati con successo!', 'success');
      loadContratti();
      
      // Invia un evento personalizzato per notificare la dashboard dell'eliminazione
      const event = new CustomEvent('dashboard-data-updated');
      window.dispatchEvent(event);
    } catch (error) {
      showToast('Errore nell\'eliminazione del contratto', 'error');
    } finally {
      setShowDeleteModal(false);
      setContrattoToDelete(null);
    }
  }, [contrattoToDelete, loadContratti]);

  const handleImportPreventivo = useCallback(() => {
    setShowImportModal(true);
  }, []);

  const handleContrattoCreated = useCallback((contratto: ContrattoData) => {
    setContrattiSalvati(prev => [...prev, contratto]);
    showToast('Contratto creato con successo dal preventivo', 'success');
    setActiveTab('archivio');
  }, []);

  const handleStatusChange = useCallback(async (contrattoId: string, newStatus: 'bozza' | 'inviato' | 'firmato' | 'estinto' | 'rescisso') => {
    try {
      // Trova il contratto da aggiornare
      const contrattoToUpdate = contrattiSalvati.find(c => c.id === contrattoId);
      if (!contrattoToUpdate) return;
      
      const oldStatus = contrattoToUpdate.status;

      // Crea una copia aggiornata del contratto con tutti i campi necessari
      const updatedContratto: ContrattoData = {
        ...contrattoToUpdate,
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      // Aggiorna il contratto nel database
      await contrattiApi.updateContratto(contrattoId, updatedContratto);

      // Aggiorna lo stato locale
      setContrattiSalvati(prev => 
        prev.map(c => c.id === contrattoId ? updatedContratto : c)
      );

      showToast(`Status aggiornato a: ${newStatus}`, 'success');
      
      // Se il contratto è passato a "firmato", genera automaticamente i pagamenti
      if (newStatus === 'firmato' && oldStatus !== 'firmato') {
        try {
          showToast('Generazione pagamenti in corso...', 'info');
          try {
            await pagamentiApi.generaPagamentiDaContratto(contrattoId);
            showToast('Pagamenti generati con successo!', 'success');
          } catch (error: any) {
            if (error.message && error.message.includes('già esistenti')) {
              showToast('Pagamenti già generati automaticamente', 'info');
            } else {
              showToast('I pagamenti potrebbero essere già stati generati automaticamente dal server', 'info');
            }
          }
          
          const event = new CustomEvent('pagamenti-aggiornati');
          window.dispatchEvent(event);
        } catch (error) {
          // Silently handle notification errors
        }
      }

      // Se il contratto è passato a "rescisso", gestisci i pagamenti
      if (newStatus === 'rescisso' && oldStatus !== 'rescisso') {
        try {
          showToast('Gestione pagamenti rescisso in corso...', 'info');
          const result = await pagamentiApi.gestisciPagamentiRescisso(contrattoId);
          showToast(
            `Contratto rescisso: eliminati ${result.deleted_count} pagamenti non pagati, preservati ${result.preserved_count} pagamenti pagati`, 
            'success'
          );
          
          const event = new CustomEvent('pagamenti-aggiornati');
          window.dispatchEvent(event);
        } catch (error) {
          showToast('Errore nella gestione pagamenti rescisso', 'error');
        }
      }
      
      // Se il contratto è passato da "firmato" a un altro stato (escluso "rescisso" e "estinto"), elimina i pagamenti
      if (oldStatus === 'firmato' && newStatus !== 'firmato' && newStatus !== 'rescisso' && newStatus !== 'estinto') {
        try {
          showToast('Eliminazione pagamenti in corso...', 'info');
          await pagamentiApi.deletePagamentiContratto(contrattoId);
          showToast('Pagamenti eliminati con successo!', 'success');
          
          const event = new CustomEvent('pagamenti-aggiornati');
          window.dispatchEvent(event);
        } catch (error) {
          showToast('Errore nell\'eliminazione dei pagamenti. Vai alla pagina Pagamenti e ricarica.', 'error');
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Errore sconosciuto';
      showToast(`Errore nell'aggiornamento dello status: ${errorMessage}`, 'error');
    }
  }, [contrattiSalvati]);

  return (
    <div className="contratti-container">
      {/* Header */}
      <div className="contratti-header">
        {/* Logo al centro */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <img 
            src="./assets/logo-evoluzione-white.png" 
            alt="Evoluzione Imprese" 
            style={{
              height: '50px',
              width: 'auto',
              objectFit: 'contain',
              marginBottom: '0.2rem'
            }}
          />
        </div>
        
        {/* Titolo con effetto al centro sotto al logo */}
        <h1>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          Contratti
        </h1>
        
        {/* Subtitle */}
        <p className="subtitle">Gestione completa dei contratti digitali</p>
        
        {/* Pulsante dashboard a destra allineato al titolo */}
        {user && (
          <div style={{ position: 'absolute', top: 'calc(50% - 35px)', right: '1.5rem', transform: 'translateY(-50%)' }}>
            <Link 
              to="/dashboard" 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)'
              }}
            >
              <DashboardIcon />
              Dashboard
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="contratti-tabs">
        <button 
          onClick={() => setActiveTab('modifica')}
          className={`tab-button ${activeTab === 'modifica' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
          </svg>
          Modifica
        </button>
        <button 
          onClick={() => setActiveTab('anteprima')}
          className={`tab-button ${activeTab === 'anteprima' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" />
          </svg>
          Anteprima
        </button>
        <button 
          onClick={() => setActiveTab('archivio')}
          className={`tab-button ${activeTab === 'archivio' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          Archivio
        </button>
      </div>

      {/* Content */}
      <div className="contratti-content">
        {activeTab === 'modifica' && (
          <div className="contratti-modifica">
            <div className="modifica-header">
              <div className="header-info">
                <h2>Modifica Contratto</h2>
                <p>Contratto: {contrattoData.numero}</p>
              </div>
              <div className="header-actions">
                <button 
                  onClick={handleNewContratto}
                  className="new-button"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
                  </svg>
                  Nuovo Contratto
                </button>
              </div>
            </div>
            
            <ContrattoForm
              contrattoData={contrattoData}
              onDataChange={handleDataChange}
              onSave={handleSave}
              isModified={isModified}
              isSaving={isSaving}
            />
          </div>
        )}

        {activeTab === 'anteprima' && (
          <div className="contratti-anteprima">
            <ContrattoPreview data={contrattoData} />
          </div>
        )}

        {activeTab === 'archivio' && (
          <div className="contratti-archivio">
            <div className="archivio-header">
              <h2>Archivio Contratti</h2>
              <div className="archivio-actions">
                <button 
                  onClick={handleImportPreventivo}
                  className="import-button"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                    <path d="M12,15L8,11H11V7H13V11H16L12,15Z" />
                  </svg>
                  Importa da Preventivo
                </button>
                <button 
                  onClick={loadContratti}
                  className="refresh-button"
                  disabled={isLoadingContratti}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z" />
                  </svg>
                  {isLoadingContratti ? 'Caricamento...' : 'Aggiorna'}
                </button>
              </div>
            </div>

            {isLoadingContratti ? (
              <div className="loading-placeholder">
                <div className="loading-spinner"></div>
                <p>Caricamento contratti...</p>
              </div>
            ) : contrattiSalvati.length === 0 ? (
              <div className="empty-placeholder">
                <div className="placeholder-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                  </svg>
                </div>
                <h3>Nessun contratto trovato</h3>
                <p>Non ci sono contratti salvati nel database</p>
              </div>
            ) : (
              <div className="contratti-list">
                {contrattiSalvati.map((contratto) => (
                  <div key={contratto.id} className="contratto-item">
                    <div className="contratto-info">
                      <h3>{contratto.numero}</h3>
                      <p><strong>Cliente:</strong> {contratto.datiCommittente.ragioneSociale || 'Non specificato'}</p>
                      <p><strong>Servizio:</strong> {contratto.tipologiaServizio}</p>
                      <div className="status-section">
                        <strong>Stato:</strong>
                        <select 
                          value={contratto.status}
                          onChange={(e) => handleStatusChange(contratto.id, e.target.value as 'bozza' | 'inviato' | 'firmato' | 'estinto' | 'rescisso')}
                          className={`status-select status-${contratto.status}`}
                          title={
                            contratto.status === 'bozza' ? 'Contratto in fase di creazione/modifica' :
                            contratto.status === 'inviato' ? 'Contratto inviato al cliente in attesa di firma' :
                            contratto.status === 'firmato' ? 'Contratto firmato dal cliente' :
                            contratto.status === 'estinto' ? 'Contratto terminato naturalmente alla scadenza' :
                            contratto.status === 'rescisso' ? 'Contratto terminato anticipatamente per recesso' :
                            ''
                          }
                        >
                          <option value="bozza">Bozza</option>
                          <option value="inviato">Inviato</option>
                          <option value="firmato">Firmato</option>
                          <option value="estinto">Estinto</option>
                          <option value="rescisso">Rescisso</option>
                        </select>
                      </div>
                      <p><strong>Creato:</strong> {new Date(contratto.created_at).toLocaleDateString('it-IT')}</p>
                    </div>
                    <div className="contratto-actions">
                      <button 
                        onClick={() => handleLoadContratto(contratto)}
                        className="action-button load-button"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                        </svg>
                        Modifica
                      </button>
                      <button 
                        onClick={() => handleDeleteContratto(contratto.id)}
                        className="action-button delete-button"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                        </svg>
                        Elimina
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Importazione Preventivi */}
      <ImportPreventiviModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onContrattoCreated={handleContrattoCreated}
      />

      {/* Modal Conferma Eliminazione */}
      {contrattoToDelete && (
        <DeleteContrattoModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setContrattoToDelete(null);
          }}
          onConfirm={confirmDeleteContratto}
          contratto={{
            numero: contrattoToDelete.numero,
            cliente: contrattoToDelete.datiCommittente.ragioneSociale,
            importo_totale: (contrattoToDelete.compenso.sitoWeb?.importoTotale || 0) + 
                          (contrattoToDelete.compenso.marketing.importoMensile * 12),
            status: contrattoToDelete.status
          }}
        />
      )}
    </div>
  );
};

export default Contratti;
