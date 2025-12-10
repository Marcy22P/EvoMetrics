import React, { useState, useEffect, useCallback } from 'react';
import { 
  Page, 
  Layout, 
  LegacyCard, 
  LegacyTabs, 
  Box
} from '@shopify/polaris';
import { 
  EditIcon, 
  ViewIcon, 
  OrderIcon 
} from '@shopify/polaris-icons';

import type { ContrattoData } from '../types/contratto';
import ContrattoForm from '../components/contratti/ContrattoForm';
import { ContrattoPreview } from '../components/contratti/ContrattoPreview';
import { ImportPreventiviModal } from '../components/contratti/ImportPreventiviModal';
import { ContrattoArchive } from '../components/contratti/ContrattoArchive';
import contrattiApi from '../services/contrattiApi';
import pagamentiApi from '../services/pagamentiApi';
import { showToast } from '../utils/toast';

const Contratti: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState(0); // 0: Modifica, 1: Anteprima, 2: Archivio
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contrattiSalvati, setContrattiSalvati] = useState<ContrattoData[]>([]);
  const [isLoadingContratti, setIsLoadingContratti] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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

  // Tabs configuration
  const tabs = [
    {id: 'edit', content: 'Modifica', icon: EditIcon, panelID: 'edit-content'},
    {id: 'preview', content: 'Anteprima', icon: ViewIcon, panelID: 'preview-content'},
    {id: 'archive', content: 'Archivio', icon: OrderIcon, panelID: 'archive-content'},
  ];

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

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

  // Carica i contratti quando si passa alla tab archivio (index 2)
  useEffect(() => {
    if (selectedTab === 2) {
      loadContratti();
    }
  }, [selectedTab, loadContratti]);

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

  // Helper function per verificare se un ID è un UUID valido
  const isValidUUID = useCallback((id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
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
  }, [contrattoData, isValidUUID]);

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
    setSelectedTab(0); // Switch to Edit tab
  }, [contrattoData]);

  const handleLoadContratto = useCallback((contratto: ContrattoData) => {
    setContrattoData(contratto);
    setIsModified(false);
    setSelectedTab(0); // Switch to Edit tab
  }, []);

  const handleDeleteContratto = useCallback(async (contrattoId: string) => {
    try {
      await contrattiApi.deleteContratto(contrattoId);
      showToast('Contratto eliminato con successo!', 'success');
      
      // Aggiorna stato locale
      setContrattiSalvati(prev => prev.filter(c => c.id !== contrattoId));
      
      // Invia un evento personalizzato per notificare la dashboard dell'eliminazione
      const event = new CustomEvent('dashboard-data-updated');
      window.dispatchEvent(event);
      
      // Se stavamo modificando il contratto eliminato, resettiamo il form
      if (contrattoData.id === contrattoId) {
        handleNewContratto();
      }
    } catch (error) {
      showToast('Errore nell\'eliminazione del contratto', 'error');
      throw error; // Rilancia per gestire lo stato nel componente figlio se necessario
    }
  }, [contrattoData.id, handleNewContratto]);

  const handleStatusUpdate = useCallback(async (contrattoId: string, newStatus: string) => {
      try {
        const contratto = contrattiSalvati.find(c => c.id === contrattoId);
        if (!contratto) return;
        
        const oldStatus = contratto.status;
        
        // Verifica che newStatus sia uno dei valori validi per il tipo status
        const validStatuses = ['bozza', 'inviato', 'firmato', 'estinto', 'rescisso'];
        if (!validStatuses.includes(newStatus)) {
            console.error(`Invalid status: ${newStatus}`);
            return;
        }

        await contrattiApi.updateContratto(contrattoId, { status: newStatus } as any);
        
        // Aggiorna stato locale
        setContrattiSalvati(prev => 
            prev.map(c => c.id === contrattoId ? { ...c, status: newStatus as ContrattoData['status'] } : c)
        );

        showToast(`Status aggiornato a: ${newStatus}`, 'success');
        
        // Gestione effetti collaterali (pagamenti)
        if (newStatus === 'firmato' && oldStatus !== 'firmato') {
            try {
              await pagamentiApi.generaPagamentiDaContratto(contrattoId);
              showToast('Pagamenti generati automaticamente', 'success');
            } catch (e) { console.error(e); }
        }
      } catch (error) {
        showToast('Errore aggiornamento status', 'error');
      }
  }, [contrattiSalvati]);

  const handleImportPreventivo = useCallback(() => {
    setShowImportModal(true);
  }, []);

  const handleContrattoCreated = useCallback((contratto: ContrattoData) => {
    setContrattiSalvati(prev => [...prev, contratto]);
    setContrattoData(contratto);
    showToast('Contratto creato con successo dal preventivo', 'success');
    setSelectedTab(0); // Vai alla tab Modifica
  }, []);

  return (
    <Page
      title="Contratti"
      subtitle="Gestione completa dei contratti digitali"
      compactTitle
      primaryAction={{
        content: selectedTab === 0 ? 'Salva Contratto' : 'Nuovo Contratto',
        onAction: selectedTab === 0 ? handleSave : handleNewContratto,
        disabled: selectedTab === 0 && (!isModified || isSaving),
        loading: isSaving
      }}
      secondaryActions={selectedTab === 2 ? [
        {
          content: 'Importa da Preventivo',
          onAction: handleImportPreventivo,
        },
        {
          content: 'Aggiorna Lista',
          onAction: loadContratti,
          loading: isLoadingContratti
        }
      ] : []}
    >
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <LegacyTabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
              <Box padding="400">
                {selectedTab === 0 && (
                  <ContrattoForm
                    contrattoData={contrattoData}
                    onDataChange={handleDataChange}
                    onSave={handleSave}
                    isModified={isModified}
                    isSaving={isSaving}
                  />
                )}
                {selectedTab === 1 && (
                  <ContrattoPreview data={contrattoData} />
                )}
                {selectedTab === 2 && (
                  <ContrattoArchive 
                    contratti={contrattiSalvati}
                    isLoading={isLoadingContratti}
                    onSelectContratto={handleLoadContratto}
                    onNewContratto={handleNewContratto}
                    onDeleteContratto={handleDeleteContratto}
                    onUpdateStatus={handleStatusUpdate}
                  />
                )}
              </Box>
            </LegacyTabs>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* Modal Importazione Preventivi */}
      <ImportPreventiviModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onContrattoCreated={handleContrattoCreated}
      />
    </Page>
  );
};

export default Contratti;
