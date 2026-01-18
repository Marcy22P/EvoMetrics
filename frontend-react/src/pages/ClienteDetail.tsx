import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  LegacyCard,
  Banner,
  SkeletonPage,
  FormLayout,
  TextField,
  Select,
  BlockStack,
  Box,
  Toast,
  Frame
} from '@shopify/polaris';
import { SaveIcon, DeleteIcon } from '@shopify/polaris-icons';
import { clientiApi, type Cliente, type DettagliCliente, type Task } from '../services/clientiApi';

// Import Components
import ClienteHeader from '../components/clienti/ClienteHeader';
import ClienteReferente from '../components/clienti/ClienteReferente';
import ClienteCanali from '../components/clienti/ClienteCanali';
import ClienteBrand from '../components/clienti/ClienteBrand';
import ClienteStats from '../components/clienti/ClienteStats';
import ClienteRecordings from '../components/clienti/ClienteRecordings';
import ClienteTasks from '../components/clienti/ClienteTasks';
import ClienteDealHistory from '../components/clienti/ClienteDealHistory';
import ClienteDrive from '../components/clienti/ClienteDrive';

const ClienteDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [documents, setDocuments] = useState<{ preventivi: any[], contratti: any[] }>({ preventivi: [], contratti: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Default empty details
  const emptyDettagli: DettagliCliente = {
    referente: { nome: '', cognome: '', azienda: '', email: '', telefono: '' },
    canali: [],
    brand_manual: {},
    situazione_inizio: { fatturato: 0, spesa_adv: 0 },
    situazione_attuale: { fatturato: 0, spesa_adv: 0 },
    registrazioni: [],
    tasks: [],
    stato_umore: 'neutrale'
  };

  const loadCliente = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      // Parallellizza le chiamate
      const [data, docs] = await Promise.all([
          clientiApi.getCliente(id),
          clientiApi.getClienteDocuments(id).catch(err => {
              console.warn("Errore caricamento documenti:", err);
              return { preventivi: [], contratti: [] };
          })
      ]);
      
      // Ensure dettagli exists
      if (!data.dettagli) {
        data.dettagli = { ...emptyDettagli };
      } else {
        // Merge with defaults to avoid undefined errors
        data.dettagli = {
            ...emptyDettagli,
            ...data.dettagli,
            referente: { ...emptyDettagli.referente, ...(data.dettagli.referente || {}) },
            situazione_inizio: { ...emptyDettagli.situazione_inizio, ...(data.dettagli.situazione_inizio || {}) },
            situazione_attuale: { ...emptyDettagli.situazione_attuale, ...(data.dettagli.situazione_attuale || {}) },
        };
      }

      setCliente(data);
      setDocuments(docs);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento del cliente');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
      loadCliente();
  }, [loadCliente]);

  const handleSave = async () => {
    if (!cliente || !id) return;
    try {
      setSaving(true);
      await clientiApi.updateCliente(id, cliente);
      setToastMessage('Cliente salvato con successo');
    } catch (err: any) {
      setToastMessage(`Errore salvataggio: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateDettagli = (key: keyof DettagliCliente, value: any) => {
    if (!cliente) return;
    setCliente({
      ...cliente,
      dettagli: {
        ...cliente.dettagli,
        [key]: value
      }
    });
  };

  // Handlers for specific sections
  const handleReferenteChange = (field: string, value: string) => {
    if (!cliente?.dettagli) return;
    updateDettagli('referente', { ...cliente.dettagli.referente, [field]: value });
  };

  const handleBrandChange = (field: string, value: string) => {
    if (!cliente?.dettagli) return;
    updateDettagli('brand_manual', { ...cliente.dettagli.brand_manual, [field]: value });
  };

  const handleAddCanale = () => {
    if (!cliente?.dettagli) return;
    const newCanale = { id: Date.now().toString(), url_sito: '', nome_utente: '' };
    updateDettagli('canali', [...(cliente.dettagli.canali || []), newCanale]);
  };

  const handleRemoveCanale = (canaleId: string) => {
    if (!cliente?.dettagli?.canali) return;
    updateDettagli('canali', cliente.dettagli.canali.filter(c => c.id !== canaleId));
  };

  const handleChangeCanale = (canaleId: string, field: string, value: string) => {
    if (!cliente?.dettagli?.canali) return;
    const newCanali = cliente.dettagli.canali.map(c => 
      c.id === canaleId ? { ...c, [field]: value } : c
    );
    updateDettagli('canali', newCanali);
  };

  const handleStatsChange = (type: 'inizio' | 'attuale', field: string, value: any) => {
    if (!cliente?.dettagli) return;
    const key = type === 'inizio' ? 'situazione_inizio' : 'situazione_attuale';
    // ensure sub-object exists
    const currentStats = cliente.dettagli[key] || {};
    updateDettagli(key, { ...currentStats, [field]: value });
  };

  const handleAddRecording = () => {
    if (!cliente?.dettagli) return;
    const newRec = { id: Date.now().toString(), data: new Date().toISOString().split('T')[0] };
    updateDettagli('registrazioni', [...(cliente.dettagli.registrazioni || []), newRec]);
  };

  const handleChangeRecording = (recId: string, field: string, value: string) => {
    if (!cliente?.dettagli?.registrazioni) return;
    const newRecs = cliente.dettagli.registrazioni.map(r => 
      r.id === recId ? { ...r, [field]: value } : r
    );
    updateDettagli('registrazioni', newRecs);
  };

  // Task Handlers
  const handleAddTask = (newTask: Task) => {
    if (!cliente?.dettagli) return;
    const currentTasks = cliente.dettagli.tasks || [];
    updateDettagli('tasks', [...currentTasks, newTask]);
  };

  const handleUpdateTask = (taskId: string, field: keyof Task, value: any) => {
    if (!cliente?.dettagli?.tasks) return;
    const newTasks = cliente.dettagli.tasks.map(t => 
        t.id === taskId ? { ...t, [field]: value } : t
    );
    updateDettagli('tasks', newTasks);
  };

  const handleRemoveTask = (taskId: string) => {
    if (!cliente?.dettagli?.tasks) return;
    updateDettagli('tasks', cliente.dettagli.tasks.filter(t => t.id !== taskId));
  };


  // Preparazione dati per la tabella Deal History
  const dealsHistory = [
      ...documents.preventivi.map(p => ({
          id: p.id,
          data: p.data,
          tipo: 'Preventivo' as const,
          numero: p.numero,
          valore: p.totale || 0
      })),
      ...documents.contratti.map(c => ({
          id: c.id,
          data: c.data,
          tipo: 'Contratto' as const,
          numero: c.numero,
          valore: c.totale || 0
      }))
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  if (loading) return <SkeletonPage primaryAction />;
  if (error || !cliente) return <Banner tone="critical">{error || 'Cliente non trovato'}</Banner>;

  return (
    <Frame>
    <Page
      title={cliente.nome_azienda}
        backAction={{ content: 'Lista Clienti', onAction: () => navigate('/anagrafica-clienti') }}
        primaryAction={{
            content: 'Salva Modifiche',
            onAction: handleSave,
            loading: saving,
            icon: SaveIcon
        }}
      secondaryActions={[
        {
            content: 'Elimina',
          destructive: true,
            icon: DeleteIcon,
            onAction: async () => {
                if(window.confirm("Sei sicuro?")) {
                    await clientiApi.deleteCliente(cliente.id);
                    navigate('/anagrafica-clienti');
                }
            }
        }
      ]}
    >
      <Layout>
          {/* HEADER SECTION */}
        <Layout.Section>
            <LegacyCard sectioned>
              <ClienteHeader 
                nomeAzienda={cliente.nome_azienda}
                dataInizio={cliente.dettagli?.data_inizio}
                dataFine={cliente.dettagli?.data_fine}
                statoUmore={cliente.dettagli?.stato_umore}
              />
              <Box paddingBlockStart="400">
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Data Inizio Rapporto"
                      type="date"
                      value={cliente.dettagli?.data_inizio || ''}
                      onChange={(val) => updateDettagli('data_inizio', val)}
                      autoComplete="off"
                    />
                    <TextField
                      label="Data Fine Rapporto"
                      type="date"
                      value={cliente.dettagli?.data_fine || ''}
                      onChange={(val) => updateDettagli('data_fine', val)}
                      autoComplete="off"
                    />
                    <Select
                       label="Stato Umore"
                       options={[
                           {label: 'Felice 😃', value: 'felice'},
                           {label: 'Neutrale 😐', value: 'neutrale'},
                           {label: 'Triste 😞', value: 'triste'},
                       ]}
                       value={cliente.dettagli?.stato_umore || 'neutrale'}
                       onChange={(val) => updateDettagli('stato_umore', val)}
                    />
                  </FormLayout.Group>
                </FormLayout>
              </Box>
          </LegacyCard>
        </Layout.Section>

          {/* MAIN GRID */}
        <Layout.Section>
                    <BlockStack gap="400">
                <ClienteReferente 
                    referente={cliente.dettagli?.referente || emptyDettagli.referente!} 
                    documents={documents}
                    onChange={handleReferenteChange}
                    clienteId={cliente.id}
                />
                
                <ClienteDrive 
                    clienteId={cliente.id}
                    folderId={cliente.dettagli?.drive_folder_id}
                    clienteName={cliente.nome_azienda}
                />

                <ClienteCanali 
                    canali={cliente.dettagli?.canali || []}
                    onAdd={handleAddCanale}
                    onRemove={handleRemoveCanale}
                    onChange={handleChangeCanale}
                />

                <ClienteBrand
                    brand={cliente.dettagli?.brand_manual || {}}
                    onChange={handleBrandChange}
                />

                <ClienteStats
                    situazioneInizio={cliente.dettagli?.situazione_inizio || { fatturato: 0, spesa_adv: 0 }}
                    situazioneAttuale={cliente.dettagli?.situazione_attuale || { fatturato: 0, spesa_adv: 0 }}
                    obiettivo={cliente.dettagli?.obiettivo || ''}
                    onInizioChange={(f, v) => handleStatsChange('inizio', f as string, v)}
                    onAttualeChange={(f, v) => handleStatsChange('attuale', f as string, v)}
                    onObiettivoChange={(val) => updateDettagli('obiettivo', val)}
                />

                <ClienteRecordings 
                    registrazioni={cliente.dettagli?.registrazioni || []}
                    onAdd={handleAddRecording}
                    onChange={handleChangeRecording}
                />

                <ClienteTasks 
                    tasks={cliente.dettagli?.tasks || []}
                    onAdd={handleAddTask}
                    onUpdate={handleUpdateTask}
                    onRemove={handleRemoveTask}
                />

                <ClienteDealHistory deals={dealsHistory} />

                <LegacyCard title="Note Rapide" sectioned>
                    <TextField
                        label="Nota"
                        value={cliente.dettagli?.note_rapide || ''}
                        onChange={(val) => updateDettagli('note_rapide', val)}
                        multiline={4}
                        autoComplete="off"
                    />
            </LegacyCard>
             </BlockStack>
        </Layout.Section>
      </Layout>

        {toastMessage && (
            <Toast content={toastMessage} onDismiss={() => setToastMessage(null)} />
        )}
    </Page>
    </Frame>
  );
};

export default ClienteDetail;
