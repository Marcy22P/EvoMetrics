import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  LegacyCard,
  IndexTable,
  Badge,
  Text,
  useIndexResourceState,
  Filters,
  Select,
  TextField,
  Modal,
  BlockStack,
  InlineStack,
  Box,
  Icon,
  LegacyTabs
} from '@shopify/polaris';
import {
  ExportIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@shopify/polaris-icons';
import { pagamentiApi } from '../services/pagamentiApi';
import type { PagamentoSalvato } from '../types/pagamento';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

// Tipi per i filtri
type TabType = 'tutti' | 'da_pagare' | 'scaduti' | 'pagato';

const EntratePage: React.FC = () => {
  // Stati
  const [pagamenti, setPagamenti] = useState<PagamentoSalvato[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<number>(0);
  const [queryValue, setQueryValue] = useState('');
  const [clientiOptions, setClientiOptions] = useState<{label: string, value: string}[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Stati per Modale Dettaglio/Pagamento
  const [selectedPagamento, setSelectedPagamento] = useState<PagamentoSalvato | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bonifico');

  // Gestione Tabs
  const tabs = [
    { id: 'tutti', content: 'Tutti', accessibilityLabel: 'Tutti i pagamenti', panelID: 'tutti-content' },
    { id: 'da_pagare', content: 'Da Pagare', accessibilityLabel: 'Pagamenti in attesa', panelID: 'da-pagare-content' },
    { id: 'scaduti', content: 'Scaduti', accessibilityLabel: 'Pagamenti scaduti', panelID: 'scaduti-content' },
    { id: 'pagato', content: 'Pagati', accessibilityLabel: 'Pagamenti completati', panelID: 'pagati-content' },
  ];

  const handleTabChange = useCallback(
    (selectedTabIndex: number) => setSelectedTab(selectedTabIndex),
    [],
  );

  // Caricamento Clienti
  const loadClienti = async () => {
    try {
      const names = await pagamentiApi.getClientiUnici();
      setClientiOptions(names.map(n => ({ label: n, value: n })));
    } catch (e) {
      console.error("Errore caricamento clienti", e);
    }
  };

  useEffect(() => {
    loadClienti();
    const interval = setInterval(loadClienti, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Pagamenti
  const fetchPagamenti = async () => {
    setLoading(true);
    try {
      const currentTabId = tabs[selectedTab].id as TabType;
      
      const data = await pagamentiApi.getAllPagamenti({
        status: currentTabId === 'tutti' ? undefined : currentTabId,
        search: queryValue,
        cliente: selectedCliente.length > 0 ? selectedCliente[0] : undefined, // API supporta un solo cliente per ora
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 100
      });
      setPagamenti(data);
    } catch (error) {
      console.error("Errore fetch pagamenti", error);
      toast.error("Errore nel caricamento delle scadenze");
    } finally {
      setLoading(false);
    }
  };

  // Debounce fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPagamenti();
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedTab, queryValue, selectedCliente, dateFrom, dateTo]);

  // Gestione Modale
  const handleRowClick = (pagamento: PagamentoSalvato) => {
    setSelectedPagamento(pagamento);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('bonifico');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedPagamento(null), 300);
  };

  // Azioni Pagamento
  const handleMarcaPagato = async () => {
    if (!selectedPagamento) return;
    try {
      const dateToSend = new Date(paymentDate);
      await pagamentiApi.marcaPagato(selectedPagamento.id, {
        data_pagamento: dateToSend.toISOString(),
        metodo_pagamento: paymentMethod
      });
      toast.success("Pagamento registrato");
      fetchPagamenti();
      handleCloseModal();
    } catch (error) {
      toast.error("Errore registrazione pagamento");
    }
  };

  const handleAnnullaPagamento = async () => {
    if (!selectedPagamento) return;
    // Usiamo window.confirm per semplicità, idealmente un altro modale
    if (!window.confirm("Sei sicuro di voler annullare questo incasso?")) return;
    try {
      await pagamentiApi.annullaPagamento(selectedPagamento.id);
      toast.success("Incasso annullato");
      fetchPagamenti();
      handleCloseModal();
    } catch (error) {
      toast.error("Errore annullamento");
    }
  };

  // Helpers UI
  const formatDateSafe = (dateString: string | null | undefined, formatStr: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data invalida';
    try {
      return format(date, formatStr, { locale: it });
    } catch (e) {
      return 'Errore data';
    }
  };

  const getStatusBadge = (status: string, dataScadenza: string) => {
    const isScaduto = status === 'da_pagare' && new Date(dataScadenza) < new Date();
    
    if (status === 'pagato') {
      return <Badge tone="success">Pagato</Badge>;
    } else if (isScaduto) {
      return <Badge tone="critical">Scaduto</Badge>;
    } else {
      return <Badge tone="attention">In Attesa</Badge>;
    }
  };

  // Filtri UI
  const handleQueryValueChange = useCallback((value: string) => setQueryValue(value), []);
  const handleClienteRemove = useCallback(() => setSelectedCliente([]), []);
  const handleDateFromChange = useCallback((value: string) => setDateFrom(value), []);
  const handleDateToChange = useCallback((value: string) => setDateTo(value), []);
  const handleFiltersClearAll = useCallback(() => {
    setQueryValue('');
    setSelectedCliente([]);
    setDateFrom('');
    setDateTo('');
  }, []);

  const filters = [
    {
      key: 'cliente',
      label: 'Cliente',
      filter: (
        <Select
          label="Cliente"
          options={[{label: 'Tutti', value: ''}, ...clientiOptions]}
          value={selectedCliente[0] || ''}
          onChange={(val) => setSelectedCliente(val ? [val] : [])}
        />
      ),
      shortcut: true,
    },
    {
        key: 'dateRange',
        label: 'Periodo Scadenza',
        filter: (
            <div style={{padding: '10px'}}>
                <TextField
                    label="Da"
                    type="date"
                    value={dateFrom}
                    onChange={handleDateFromChange}
                    autoComplete="off"
                />
                <div style={{marginTop: '10px'}}>
                     <TextField
                        label="A"
                        type="date"
                        value={dateTo}
                        onChange={handleDateToChange}
                        autoComplete="off"
                    />
                </div>
            </div>
        )
    }
  ];

  const appliedFilters = [];
  if (selectedCliente.length > 0) {
    appliedFilters.push({
      key: 'cliente',
      label: `Cliente: ${selectedCliente[0]}`,
      onRemove: handleClienteRemove,
    });
  }
  if (dateFrom || dateTo) {
      appliedFilters.push({
          key: 'dateRange',
          label: `Periodo: ${dateFrom} - ${dateTo}`,
          onRemove: () => { setDateFrom(''); setDateTo(''); }
      })
  }

  // Table Resource
  const resourceName = {
    singular: 'scadenza',
    plural: 'scadenze',
  };

  const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(pagamenti as any);

  const rowMarkup = pagamenti.map(
    (pagamento, index) => {
        const { id, cliente, data_scadenza, importo, status, metodo_pagamento } = pagamento;
        const formattedDate = formatDateSafe(data_scadenza, 'dd MMM yyyy');
        const formattedAmount = `€ ${importo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
        
        return (
          <IndexTable.Row
            id={id}
            key={id}
            selected={selectedResources.includes(id)}
            position={index}
            onClick={() => handleRowClick(pagamento)}
          >
            <IndexTable.Cell>
              <Text variant="bodyMd" fontWeight="bold" as="span">
                #{id.substring(0, 8)}
              </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>{formattedDate}</IndexTable.Cell>
            <IndexTable.Cell>{cliente}</IndexTable.Cell>
            <IndexTable.Cell>{getStatusBadge(status, data_scadenza)}</IndexTable.Cell>
            <IndexTable.Cell>
                <Text variant="bodyMd" fontWeight="bold" as="span">
                    {formattedAmount}
                </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Text variant="bodySm" as="span" tone="subdued">
                    {metodo_pagamento || '-'}
                </Text>
            </IndexTable.Cell>
          </IndexTable.Row>
        );
    },
  );

  return (
    <Page
      title="Gestione Scadenze"
      subtitle="Monitora e gestisci le entrate e i pagamenti in scadenza"
      primaryAction={{
        content: 'Esporta',
        icon: ExportIcon,
        onAction: () => toast.success("Export avviato (simulazione)")
      }}
    >
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <LegacyTabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <div style={{padding: '16px', borderBottom: '1px solid #dfe3e8'}}>
                    <Filters
                        queryValue={queryValue}
                        filters={filters}
                        appliedFilters={appliedFilters}
                        onQueryChange={handleQueryValueChange}
                        onQueryClear={() => setQueryValue('')}
                        onClearAll={handleFiltersClearAll}
                        queryPlaceholder="Cerca per ID o importo..."
                    />
                </div>
                <IndexTable
                resourceName={resourceName}
                itemCount={pagamenti.length}
                selectedItemsCount={
                    allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                    {title: 'Ordine'},
                    {title: 'Scadenza'},
                    {title: 'Cliente'},
                    {title: 'Stato'},
                    {title: 'Importo'},
                    {title: 'Metodo'},
                ]}
                loading={loading}
                >
                {rowMarkup}
                </IndexTable>
            </LegacyTabs>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* MODALE DETTAGLIO */}
      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title={selectedPagamento ? `Dettaglio Scadenza #${selectedPagamento.id.substring(0,8)}` : 'Dettaglio'}
        primaryAction={
            selectedPagamento?.status !== 'pagato' ? {
                content: 'Segna come Pagato',
                onAction: handleMarcaPagato,
                icon: CheckCircleIcon
            } : {
                content: 'Chiudi',
                onAction: handleCloseModal
            }
        }
        secondaryActions={
             selectedPagamento?.status === 'pagato' ? [
                 {
                     content: 'Annulla Incasso',
                     onAction: handleAnnullaPagamento,
                     destructive: true,
                     icon: XCircleIcon
                 }
             ] : [
                 {
                     content: 'Chiudi',
                     onAction: handleCloseModal
                 }
             ]
        }
      >
        <Modal.Section>
            {selectedPagamento && (
                <BlockStack gap="400">
                    {/* Header Info */}
                    <InlineStack align="space-between">
                        <BlockStack gap="100">
                            <Text variant="headingMd" as="h3">{selectedPagamento.cliente}</Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                                Contratto: {selectedPagamento.contratto_numero || 'N/A'}
                            </Text>
                        </BlockStack>
                        {getStatusBadge(selectedPagamento.status, selectedPagamento.data_scadenza)}
                    </InlineStack>
                    
                    <Box paddingBlock="200" borderColor="border" borderBlockEndWidth="025">
                        <InlineStack align="space-between">
                            <Text variant="bodyMd" as="p" tone="subdued">Importo</Text>
                            <Text variant="headingLg" as="p">
                                € {selectedPagamento.importo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                            </Text>
                        </InlineStack>
                    </Box>

                    <BlockStack gap="200">
                        <Text variant="headingSm" as="h4">Dettagli</Text>
                        <Text variant="bodyMd" as="p">
                            <Text variant="bodyMd" fontWeight="bold" as="span">Descrizione: </Text> 
                            {selectedPagamento.descrizione || 'Nessuna descrizione'}
                        </Text>
                        <InlineStack gap="200">
                            <Icon source={CalendarIcon} tone="subdued" />
                            <Text variant="bodyMd" as="span">
                                Scadenza: {formatDateSafe(selectedPagamento.data_scadenza, 'dd MMMM yyyy')}
                            </Text>
                        </InlineStack>
                    </BlockStack>

                    {selectedPagamento.status === 'pagato' ? (
                        <Box padding="400" background="bg-surface-success" borderRadius="200">
                             <BlockStack gap="200">
                                <InlineStack gap="200" align="start">
                                    <Icon source={CheckCircleIcon} tone="success" />
                                    <Text variant="headingSm" as="h4" tone="success">Incasso Registrato</Text>
                                </InlineStack>
                                <Text variant="bodyMd" as="p">
                                    Data: {formatDateSafe(selectedPagamento.data_pagamento, 'dd MMMM yyyy')}
                                    <br/>
                                    Metodo: <span style={{textTransform: 'capitalize'}}>{selectedPagamento.metodo_pagamento}</span>
                                </Text>
                             </BlockStack>
                        </Box>
                    ) : (
                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="400">
                                <Text variant="headingSm" as="h4">Registra Pagamento</Text>
                                <InlineStack gap="400">
                                    <div style={{flex: 1}}>
                                        <TextField
                                            label="Data Pagamento"
                                            type="date"
                                            value={paymentDate}
                                            onChange={(val) => setPaymentDate(val)}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div style={{flex: 1}}>
                                        <Select
                                            label="Metodo"
                                            options={[
                                                {label: 'Bonifico', value: 'bonifico'},
                                                {label: 'Carta di Credito', value: 'carta'},
                                                {label: 'PayPal', value: 'paypal'},
                                                {label: 'Contanti', value: 'contanti'},
                                                {label: 'Altro', value: 'altro'},
                                            ]}
                                            value={paymentMethod}
                                            onChange={(val) => setPaymentMethod(val)}
                                        />
                                    </div>
                                </InlineStack>
                            </BlockStack>
                        </Box>
                    )}
                    
                    <TextField
                        label="Note"
                        value={selectedPagamento.note || ''}
                        multiline={3}
                        autoComplete="off"
                        readOnly
                        helpText="Le note possono essere modificate nella sezione dettagli completa (non implementato in questo modal rapido)"
                        onChange={() => {}}
                    />

                </BlockStack>
            )}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default EntratePage;
