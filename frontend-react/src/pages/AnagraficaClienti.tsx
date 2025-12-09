import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  LegacyCard,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  Filters,
  Modal,
  BlockStack,
  InlineStack,
  Box,
  EmptyState,
  Banner,
  TextField,
  FormLayout
} from '@shopify/polaris';
import {
  PlusIcon,
  ImportIcon
} from '@shopify/polaris-icons';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { clientiApi } from '../services/clientiApi';
import type { Cliente } from '../services/clientiApi';

const AnagraficaClienti: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  // Stati
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryValue, setQueryValue] = useState('');
  
  // Stati Import
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importSources, setImportSources] = useState<{preventivi: any[], contratti: any[]} | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);

  // Stati Creazione
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCliente, setNewCliente] = useState({
    nome_azienda: '',
    email: '',
    telefono: '',
    indirizzo: '',
    note: ''
  });

  // Caricamento dati
  const fetchClienti = useCallback(async () => {
    setLoading(true);
    try {
      const data = await clientiApi.getClienti();
      setClienti(data);
    } catch (error) {
      console.error(error);
      toast.error("Errore nel caricamento clienti");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasPermission('clienti:read')) {
      fetchClienti();
    }
  }, [hasPermission, fetchClienti]);

  // Filtri
  const handleQueryValueChange = useCallback((value: string) => setQueryValue(value), []);
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
  }, [handleQueryValueRemove]);

  const filteredClienti = clienti.filter((cliente) => {
    const search = queryValue.toLowerCase();
    return (
      cliente.nome_azienda.toLowerCase().includes(search) ||
      cliente.contatti?.email?.toLowerCase().includes(search)
    );
  });

  // Gestione Tabella
  const resourceName = {
    singular: 'cliente',
    plural: 'clienti',
  };

  const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(filteredClienti as any);

  // Gestione Importazione
  const handleOpenImportModal = async () => {
    setIsImportModalOpen(true);
    setLoadingImport(true);
    try {
      const sources = await clientiApi.getImportSources();
      setImportSources(sources);
    } catch (e) {
      toast.error("Impossibile caricare le fonti di importazione");
    } finally {
      setLoadingImport(false);
    }
  };

  const handleImport = async (type: 'preventivo' | 'contratto', id: string) => {
    try {
      await clientiApi.importCliente(type, id);
      toast.success("Cliente importato con successo");
      fetchClienti();
    } catch (e) {
      toast.error("Errore durante l'importazione");
    }
  };

  // Gestione Creazione
  const handleCreateCliente = async () => {
    if (!newCliente.nome_azienda) {
      toast.error("Il nome azienda è obbligatorio");
      return;
    }
    setCreating(true);
    try {
      await clientiApi.createCliente({
        nome_azienda: newCliente.nome_azienda,
        contatti: {
          email: newCliente.email,
          telefono: newCliente.telefono,
          indirizzo: newCliente.indirizzo
        },
        note: newCliente.note,
        source: 'manual',
        integrazioni: {},
        servizi_attivi: []
      });
      toast.success("Cliente creato con successo");
      setIsCreateModalOpen(false);
      setNewCliente({ nome_azienda: '', email: '', telefono: '', indirizzo: '', note: '' });
      fetchClienti();
    } catch (e) {
      toast.error("Errore nella creazione del cliente");
    } finally {
      setCreating(false);
    }
  };

  // Markup Tabella
  const rowMarkup = filteredClienti.map(
    ({id, nome_azienda, contatti, servizi_attivi, created_at}, index) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
        onClick={() => navigate(`/clienti/${id}`)}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {nome_azienda}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{contatti?.email || '-'}</IndexTable.Cell>
        <IndexTable.Cell>{contatti?.telefono || '-'}</IndexTable.Cell>
        <IndexTable.Cell>
            {servizi_attivi && servizi_attivi.length > 0 ? (
                <InlineStack gap="200">
                    {servizi_attivi.slice(0, 2).map(s => <Badge key={s} tone="info">{s}</Badge>)}
                    {servizi_attivi.length > 2 && <Badge>{`+${servizi_attivi.length - 2}`}</Badge>}
                </InlineStack>
            ) : '-'}
        </IndexTable.Cell>
        <IndexTable.Cell>
             <Text variant="bodySm" as="span" tone="subdued">
                {new Date(created_at).toLocaleDateString('it-IT')}
             </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  const emptyStateMarkup = (
    <EmptyState
      heading="Gestisci i tuoi clienti"
      action={{content: 'Importa Clienti', onAction: handleOpenImportModal, icon: ImportIcon}}
      secondaryAction={{content: 'Aggiungi Manualmente', onAction: () => setIsCreateModalOpen(true)}}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Importa clienti esistenti da Preventivi o Contratti, oppure creane di nuovi.</p>
    </EmptyState>
  );

  if (!hasPermission('clienti:read')) return <Page title="Accesso Negato"><Text as="p" tone="critical">Non hai i permessi per visualizzare questa pagina.</Text></Page>;

  return (
    <Page
      title="Clienti"
      primaryAction={{content: 'Importa Clienti', onAction: handleOpenImportModal, icon: ImportIcon}}
      secondaryActions={[
          {content: 'Nuovo Cliente', onAction: () => setIsCreateModalOpen(true), icon: PlusIcon}
      ]}
    >
      <Layout>
        <Layout.Section>
          <LegacyCard>
             <div style={{padding: '16px', borderBottom: '1px solid #dfe3e8'}}>
                <Filters
                    queryValue={queryValue}
                    filters={[]}
                    appliedFilters={[]}
                    onQueryChange={handleQueryValueChange}
                    onQueryClear={handleQueryValueRemove}
                    onClearAll={handleClearAll}
                    queryPlaceholder="Cerca clienti..."
                />
            </div>
            <IndexTable
              resourceName={resourceName}
              itemCount={filteredClienti.length}
              selectedItemsCount={
                allResourcesSelected ? 'All' : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                {title: 'Azienda'},
                {title: 'Email'},
                {title: 'Telefono'},
                {title: 'Servizi Attivi'},
                {title: 'Registrato il'},
              ]}
              loading={loading}
              emptyState={emptyStateMarkup}
            >
              {rowMarkup}
            </IndexTable>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* MODALE IMPORTAZIONE */}
      <Modal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Importa Clienti"
        primaryAction={{
            content: 'Chiudi',
            onAction: () => setIsImportModalOpen(false),
        }}
      >
        <Modal.Section>
            {loadingImport ? (
                <div style={{textAlign: 'center', padding: '2rem'}}>Caricamento fonti...</div>
            ) : (
                <BlockStack gap="500">
                    <Banner title="Importazione Intelligente" tone="info">
                        <p>Il sistema rileva automaticamente i clienti da Preventivi e Contratti non ancora registrati.</p>
                    </Banner>

                    <Box>
                        <Text variant="headingSm" as="h3">Da Preventivi Accettati</Text>
                        <Box paddingBlockStart="300">
                            {importSources?.preventivi && importSources.preventivi.length > 0 ? (
                                <BlockStack gap="200">
                                    {importSources.preventivi.map((p: any) => (
                                        <div key={p.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f1f2f3', borderRadius: '8px'}}>
                                            <div>
                                                <Text variant="bodyMd" fontWeight="bold" as="p">{p.cliente || 'Senza Nome'}</Text>
                                                <Text variant="bodySm" tone="subdued" as="p">Preventivo #{p.numero || p.id}</Text>
                                            </div>
                                            <Button size="slim" onClick={() => handleImport('preventivo', p.id)}>Importa</Button>
                                        </div>
                                    ))}
                                </BlockStack>
                            ) : (
                                <Text tone="subdued" as="p">Nessun preventivo da importare.</Text>
                            )}
                        </Box>
                    </Box>

                    <Box>
                        <Text variant="headingSm" as="h3">Da Contratti</Text>
                        <Box paddingBlockStart="300">
                            {importSources?.contratti && importSources.contratti.length > 0 ? (
                                <BlockStack gap="200">
                                    {importSources.contratti.map((c: any) => (
                                        <div key={c.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f1f2f3', borderRadius: '8px'}}>
                                            <div>
                                                <Text variant="bodyMd" fontWeight="bold" as="p">{c.ragioneSociale || 'Senza Nome'}</Text>
                                                <Text variant="bodySm" tone="subdued" as="p">Contratto #{c.numero || 'N/A'}</Text>
                                            </div>
                                            <Button size="slim" onClick={() => handleImport('contratto', c.id)}>Importa</Button>
                                        </div>
                                    ))}
                                </BlockStack>
                            ) : (
                                <Text tone="subdued" as="p">Nessun contratto da importare.</Text>
                            )}
                        </Box>
                    </Box>
                </BlockStack>
            )}
        </Modal.Section>
      </Modal>

      {/* MODALE NUOVO CLIENTE */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nuovo Cliente"
        primaryAction={{
            content: 'Crea Cliente',
            onAction: handleCreateCliente,
            loading: creating,
            disabled: !newCliente.nome_azienda
        }}
        secondaryActions={[{
            content: 'Annulla',
            onAction: () => setIsCreateModalOpen(false)
        }]}
      >
        <Modal.Section>
            <FormLayout>
                <TextField
                    label="Nome Azienda *"
                    value={newCliente.nome_azienda}
                    onChange={(val) => setNewCliente({...newCliente, nome_azienda: val})}
                    autoComplete="off"
                    placeholder="Es. Mario Rossi SRL"
                />
                <TextField
                    label="Email"
                    value={newCliente.email}
                    onChange={(val) => setNewCliente({...newCliente, email: val})}
                    autoComplete="email"
                    type="email"
                />
                <TextField
                    label="Telefono"
                    value={newCliente.telefono}
                    onChange={(val) => setNewCliente({...newCliente, telefono: val})}
                    autoComplete="tel"
                    type="tel"
                />
                <TextField
                    label="Indirizzo"
                    value={newCliente.indirizzo}
                    onChange={(val) => setNewCliente({...newCliente, indirizzo: val})}
                    autoComplete="address-line1"
                />
                <TextField
                    label="Note"
                    value={newCliente.note}
                    onChange={(val) => setNewCliente({...newCliente, note: val})}
                    autoComplete="off"
                    multiline={3}
                />
            </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default AnagraficaClienti;
