import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  OrderIcon, 
  MagicIcon 
} from '@shopify/polaris-icons';

import { PreventivatorForm } from '../components/preventivatore/PreventivatorForm';
import { PreventivoPreview } from '../components/preventivatore/PreventivoPreview';
import { PreventivoArchive } from '../components/preventivatore/PreventivoArchive';
import PreventivoAIChat from '../components/preventivatore/PreventivoAIChat';
import type { PreventivoData } from '../types/preventivo';
import { toast } from '../utils/toast';
import { preventiviApi } from '../services/preventiviApi';
import { generateDefaultTerminiCondizioni, calculateValiditaDate } from '../utils/preventivoUtils';
import { deepEqual } from '../utils/shallowEqual';

// Tipo esteso per preventivi salvati
type PreventivoSalvato = PreventivoData & { 
  id: string; 
  createdAt: string; 
  updatedAt: string;
  source: 'manual' | 'n8n' 
};


const Preventivatore: React.FC = () => {
  const [preventivoData, setPreventivoData] = useState<PreventivoData>(() => {
    const dataPreventivo = new Date().toISOString().split('T')[0];
    return {
      numero: '',
      data: dataPreventivo,
      validita: calculateValiditaDate(dataPreventivo),
      cliente: '',
      oggetto: '',
      tipologiaIntervento: '',
      tipologiaInterventoEcommerce: '',
      tipologiaInterventoMarketing: '',
      tipologiaInterventoVideoPost: '',
      tipologiaInterventoMetaAds: '',
      tipologiaInterventoGoogleAds: '',
      tipologiaInterventoSeo: '',
      tipologiaInterventoEmailMarketing: '',
      servizi: {
        ecommerce: [],
        emailMarketing: [],
        videoPost: [],
        metaAds: [],
        googleAds: [],
        seo: []
      },
      prezzi: {},
      note: '',
      terminiPagamento: '',
      terminiCondizioni: generateDefaultTerminiCondizioni(dataPreventivo)
    };
  });

  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'archive' | 'ai'>('edit');
  const [selectedTab, setSelectedTab] = useState(1); // Default Edit

  const [preventiviSalvati, setPreventiviSalvati] = useState<PreventivoSalvato[]>([]);
  const [currentPreventivoId, setCurrentPreventivoId] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<PreventivoData | null>(null);
  const [preventiviKey, setPreventiviKey] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = 'Preventivatore - Evoluzione Imprese';
  }, []);

  // Tabs handling
  const tabs = [
    {id: 'ai', content: 'Crea con AI', icon: MagicIcon, panelID: 'ai-content'},
    {id: 'edit', content: 'Modifica', icon: EditIcon, panelID: 'edit-content'},
    {id: 'preview', content: 'Anteprima', icon: ViewIcon, panelID: 'preview-content'},
    {id: 'archive', content: 'Archivio', icon: OrderIcon, panelID: 'archive-content'},
  ];

  const handleTabChange = useCallback((selectedTabIndex: number) => {
      setSelectedTab(selectedTabIndex);
      const modes = ['ai', 'edit', 'preview', 'archive'] as const;
      setViewMode(modes[selectedTabIndex]);
  }, []);

  useEffect(() => {
      const modes = ['ai', 'edit', 'preview', 'archive'];
      const index = modes.indexOf(viewMode);
      if (index !== -1 && index !== selectedTab) {
          setSelectedTab(index);
      }
  }, [viewMode, selectedTab]);


  // Carica preventivi salvati dal server
  useEffect(() => {
    const loadPreventivi = async () => {
      try {
        const preventivi = await preventiviApi.getAllPreventivi();
        const preventiviConvertiti = preventivi.map((p, index) => ({
          ...p,
          id: p.id || `prev_${Date.now()}_${index}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'manual' as const
        }));
        setPreventiviSalvati(preventiviConvertiti);
      } catch (error) {
        toast.error('❌ Errore di connessione', 'Impossibile caricare i preventivi dal server');
      }
    };

    loadPreventivi();
  }, []);

  // Monitora le modifiche
  useEffect(() => {
    if (lastSavedData) {
      const hasChanges = !deepEqual(preventivoData, lastSavedData);
      setIsModified(hasChanges);
    } else {
      const hasContent = Boolean(preventivoData.cliente || preventivoData.oggetto || 
                        Object.keys(preventivoData.prezzi).length > 0);
      setIsModified(hasContent);
    }
  }, [preventivoData, lastSavedData]);

  // Calcola totale
  const { subtotale, iva, totale } = useMemo(() => {
    if (preventivoData.subtotale && preventivoData.iva && preventivoData.totale) {
      return { 
        subtotale: preventivoData.subtotale, 
        iva: preventivoData.iva, 
        totale: preventivoData.totale 
      };
    }
    
    let subtotale = 0;
    Object.values(preventivoData.prezzi).forEach(prezzo => {
      const valore = parseFloat(prezzo.toString()) || 0;
      subtotale += valore;
    });
    const iva = subtotale * 0.22;
    const totale = subtotale + iva;
    
    return { subtotale, iva, totale };
  }, [preventivoData.subtotale, preventivoData.iva, preventivoData.totale, preventivoData.prezzi]);

  const handleDataChange = useCallback((newData: Partial<PreventivoData>) => {
    setPreventivoData(prev => ({ ...prev, ...newData }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!preventivoData.cliente || !preventivoData.oggetto) {
      toast.error('❌ Dati mancanti', 'Inserisci almeno cliente e oggetto del preventivo');
      return;
    }

    try {
      toast.loading('💾 Salvataggio sul server...', 'Connessione in corso...');

      let savedPreventivo;
      if (currentPreventivoId) {
        savedPreventivo = await preventiviApi.updatePreventivo(currentPreventivoId, preventivoData);
        toast.success('💾 Preventivo aggiornato!', `${savedPreventivo.numero} salvato sul server`);
      } else {
        savedPreventivo = await preventiviApi.createPreventivo(preventivoData);
        setCurrentPreventivoId(savedPreventivo.id || `prev_${Date.now()}`);
        toast.success('💾 Preventivo creato!', `${savedPreventivo.numero} salvato sul server`);
      }

      setPreventivoData(savedPreventivo);
      
      const preventivi = await preventiviApi.getAllPreventivi();
      const preventiviConvertiti = preventivi.map((p: PreventivoData) => ({
        ...p,
        id: p.id || `prev_${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'manual' as const
      }));
      setPreventiviSalvati(preventiviConvertiti);
      
      setLastSavedData({ ...savedPreventivo });
      setIsModified(false);

    } catch (error) {
      toast.error('❌ Errore server', 'Impossibile salvare. Controlla la connessione.');
    }
  }, [currentPreventivoId, preventivoData]);

  const handleSelectPreventivo = useCallback((preventivo: PreventivoData) => {
    const preventivoSalvato = preventivo as PreventivoSalvato;
    setPreventivoData(preventivo);
    setCurrentPreventivoId(preventivo.id || preventivoSalvato.id || null);
    setLastSavedData({ ...preventivo });
    setIsModified(false);
    setViewMode('edit');
  }, []);

  const handleNewPreventivo = useCallback(() => {
    const newPreventivo: PreventivoData = {
      numero: '',
      data: new Date().toISOString().split('T')[0],
      validita: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      cliente: '',
      oggetto: '',
      tipologiaIntervento: '',
      tipologiaInterventoEcommerce: '',
      tipologiaInterventoMarketing: '',
      tipologiaInterventoVideoPost: '',
      tipologiaInterventoMetaAds: '',
      tipologiaInterventoGoogleAds: '',
      tipologiaInterventoSeo: '',
      tipologiaInterventoEmailMarketing: '',
      servizi: {
        ecommerce: [],
        emailMarketing: [],
        videoPost: [],
        metaAds: [],
        googleAds: [],
        seo: []
      },
      prezzi: {},
      note: '',
      terminiPagamento: '',
      terminiCondizioni: ''
    };
    
    setPreventivoData(newPreventivo);
    setCurrentPreventivoId(null);
    setLastSavedData(null);
    setIsModified(false);
    setViewMode('edit');
  }, []);

  const handleApplyAI = useCallback((data: PreventivoData) => {
    setPreventivoData(prev => ({
      ...prev,
      ...data,
      data: data.data || prev.data,
      validita: data.validita || prev.validita,
      servizi: { ...prev.servizi, ...data.servizi },
      prezzi: { ...prev.prezzi, ...data.prezzi }
    }));
    setViewMode('edit');
    toast.success('🤖 Dati AI Applicati', 'Il preventivo è stato aggiornato con i suggerimenti dell\'AI.');
  }, []);

  const reloadPreventivi = useCallback(async () => {
    try {
      const preventivi = await preventiviApi.getAllPreventivi();
      const preventiviConvertiti = preventivi.map((p, index) => ({
        ...p,
        id: p.numero || `prev_${Date.now()}_${index}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'manual' as const
      }));
      setPreventiviSalvati(preventiviConvertiti);
      setPreventiviKey(prev => prev + 1);
    } catch (error) {
      toast.error('❌ Errore ricaricamento', 'Impossibile ricaricare i preventivi');
    }
  }, []);

  const handleDeletePreventivo = useCallback(async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await preventiviApi.deletePreventivo(id);
      toast.success('🗑️ Preventivo eliminato!', 'Preventivo rimosso dal database');
      setPreventiviSalvati(prev => prev.filter(p => p.id !== id));
      setPreventiviKey(prev => prev + 1);
      await reloadPreventivi();
      if (currentPreventivoId === id) {
        handleNewPreventivo();
      }
    } catch (error) {
      toast.error('❌ Errore eliminazione', 'Impossibile eliminare il preventivo. Riprova.');
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, currentPreventivoId, reloadPreventivi, handleNewPreventivo]);

  return (
    <Page
        title="Preventivatore"
        subtitle="Crea, gestisci e stampa preventivi professionali"
        compactTitle
        primaryAction={{
            content: viewMode === 'edit' ? 'Salva' : 'Nuovo Preventivo',
            onAction: viewMode === 'edit' ? handleSave : handleNewPreventivo,
            disabled: viewMode === 'edit' && !isModified,
        }}
    >
      <Layout>
        <Layout.Section>
            <LegacyCard>
                <LegacyTabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                    <Box padding="400">
                        {viewMode === 'ai' && (
                            <PreventivoAIChat onApplyPreventivo={handleApplyAI} />
                        )}
                        {viewMode === 'edit' && (
                            <PreventivatorForm
                                data={preventivoData}
                                onChange={handleDataChange}
                                totali={{ subtotale, iva, totale }}
                                onSave={handleSave}
                                isModified={isModified}
                            />
                        )}
                        {viewMode === 'preview' && (
                            <PreventivoPreview
                                data={preventivoData}
                                totali={{ subtotale, iva, totale }}
                            />
                        )}
                        {viewMode === 'archive' && (
                            <PreventivoArchive
                                key={preventiviKey}
                                onSelectPreventivo={handleSelectPreventivo}
                                onNewPreventivo={handleNewPreventivo}
                                onDeletePreventivo={handleDeletePreventivo}
                                preventivi={preventiviSalvati}
                            />
                        )}
                    </Box>
                </LegacyTabs>
            </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Preventivatore;
