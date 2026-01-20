import React, { useState, useMemo, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  Filters,
  Modal,
  BlockStack,
  Box,
  InlineStack,
  EmptyState,
  Divider,
  Tooltip,
  ButtonGroup,
} from '@shopify/polaris';
import { 
  DeleteIcon, 
  ViewIcon, 
  PlusIcon,
  RefreshIcon,
  ExternalIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-hot-toast';
import { getServiceUrl } from '../utils/apiConfig';

// Interfaccia dati Assessment
interface AssessmentData {
  id: string;
  created_at: string;
  data: {
    referente_nome?: string;
    referente_email?: string;
    referente_telefono?: string;
    ragione_sociale?: string;
    settore_attivita?: string;
    dimensione_team?: string;
    descrizione_business?: string;
    decisori_coinvolti?: string;
    chi_fa_cosa?: string;
    sito_web_presente?: string;
    sito_web_url?: string;
    piattaforma_ecommerce?: string;
    social_attivi?: string[];
    traffico_mensile?: string;
    budget_indicativo?: string;
    metrica_successo?: string;
    cpl_cpa?: string;
    conversion_rate?: string;
    clienti_ricorrenti_perc?: string;
    quale_crm?: string;
    quale_analytics?: string;
    dashboard_esistenti?: string;
    quali_tag?: string;
    note_finali?: string;
    [key: string]: any;
  };
}

const AssessmentList: React.FC = () => {
  const { hasPermission } = useAuth();
  const [assessmentsData, setAssessmentsData] = useState<AssessmentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [queryValue, setQueryValue] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [assessmentToDelete, setAssessmentToDelete] = useState<string | null>(null);

  // Caricamento dati
  const fetchAssessments = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const ASSESSMENTS_SERVICE_URL = getServiceUrl('assessments');
      
      const response = await fetch(`${ASSESSMENTS_SERVICE_URL}/api/assessments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAssessmentsData(data.assessments || []);
      } else {
          toast.error("Errore nel caricamento degli assessment");
      }
    } catch (error) {
      console.error('Errore caricamento assessments:', error);
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (hasPermission('assessments:read')) {
      fetchAssessments();
    }
  }, [hasPermission, fetchAssessments]);

  const handleDelete = async () => {
    if (!assessmentToDelete) return;

    try {
       const token = localStorage.getItem('auth_token');
       const ASSESSMENTS_SERVICE_URL = getServiceUrl('assessments');

       const response = await fetch(`${ASSESSMENTS_SERVICE_URL}/api/assessments/${assessmentToDelete}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
       });

       if (response.ok) {
        setAssessmentsData(prev => prev.filter(a => a.id !== assessmentToDelete));
        toast.success("Assessment eliminato");
       } else {
        toast.error("Impossibile eliminare l'assessment");
       }
    } catch (error) {
       toast.error("Errore durante l'eliminazione");
    } finally {
        setIsDeleteModalOpen(false);
        setAssessmentToDelete(null);
    }
  };

  // URL Assessment pubblico
  const assessmentPublicUrl = `${window.location.origin}/assessment`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(assessmentPublicUrl);
    toast.success('Link copiato negli appunti');
  };

  const handleOpenAssessment = () => {
    window.open('/assessment', '_blank');
  };

  // Filtri
  const handleQueryValueChange = useCallback((value: string) => setQueryValue(value), []);
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
  }, [handleQueryValueRemove]);

  const filteredAssessments = useMemo(() => {
    if (!queryValue.trim()) return assessmentsData;
    const term = queryValue.toLowerCase();
    return assessmentsData.filter(item => {
      const data = item.data || {};
      const nome = (data.referente_nome || '').toLowerCase();
      const email = (data.referente_email || '').toLowerCase();
      const azienda = (data.ragione_sociale || '').toLowerCase();
      return `${nome} ${email} ${azienda}`.includes(term);
    });
  }, [assessmentsData, queryValue]);

  // Gestione Tabella
  const resourceName = {
    singular: 'assessment',
    plural: 'assessments',
  };

  const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(filteredAssessments as any);

  const rowMarkup = filteredAssessments.map(
    (assessment, index) => {
      const {id, created_at, data} = assessment;
      const date = new Date(created_at).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {data.ragione_sociale || 'Azienda non specificata'}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodyMd">{data.referente_nome || '-'}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodySm" tone="subdued">{data.referente_email || '-'}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone="info">{date}</Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <ButtonGroup>
              <Tooltip content="Visualizza dettagli">
                <Button 
                  icon={ViewIcon} 
                  onClick={() => { setSelectedAssessment(assessment); setIsDetailModalOpen(true); }} 
                  variant="tertiary"
                  accessibilityLabel="Vedi dettagli" 
                />
              </Tooltip>
              <Tooltip content="Elimina">
                <Button 
                  icon={DeleteIcon} 
                  onClick={() => { setAssessmentToDelete(id); setIsDeleteModalOpen(true); }} 
                  tone="critical" 
                  variant="tertiary"
                  accessibilityLabel="Elimina" 
                />
              </Tooltip>
            </ButtonGroup>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  // Render sezione dettaglio nel modale
  const renderDetailSection = (title: string, items: Array<{label: string, value: any}>) => {
    const validItems = items.filter(item => item.value);
    if (validItems.length === 0) return null;

    return (
      <Box paddingBlockEnd="500">
        <BlockStack gap="300">
          <Text variant="headingSm" as="h3" fontWeight="semibold">{title}</Text>
          <Divider />
          <Box paddingBlockStart="200">
            {validItems.map((item, idx) => (
              <Box key={idx} paddingBlockEnd="200">
                <InlineStack gap="400" wrap={false}>
                  <Box minWidth="140px">
                    <Text variant="bodySm" tone="subdued" as="span">{item.label}</Text>
                  </Box>
                  <Text variant="bodyMd" as="span" breakWord>
                    {Array.isArray(item.value) ? item.value.join(', ') : String(item.value)}
                  </Text>
                </InlineStack>
              </Box>
            ))}
          </Box>
        </BlockStack>
      </Box>
    );
  };

  if (!hasPermission('assessments:read')) {
      return (
        <Page title="Accesso Negato">
          <Card>
            <Text as="p" tone="critical">Non hai i permessi per visualizzare questa pagina.</Text>
          </Card>
        </Page>
      );
  }

  return (
    <Page 
      title="Assessment Digitali"
      primaryAction={{
        content: 'Compila Assessment',
        icon: PlusIcon,
        onAction: handleOpenAssessment,
      }}
      secondaryActions={[
        {
          content: 'Copia Link',
          icon: ExternalIcon,
          onAction: handleCopyLink,
        },
        {
          content: 'Aggiorna',
          icon: RefreshIcon,
          onAction: fetchAssessments,
        }
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h2">Assessment Compilati</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    {filteredAssessments.length} assessment totali
                  </Text>
                </BlockStack>
                <Box minWidth="280px">
                  <Filters
                    queryValue={queryValue}
                    filters={[]}
                    appliedFilters={[]}
                    onQueryChange={handleQueryValueChange}
                    onQueryClear={handleQueryValueRemove}
                    onClearAll={handleClearAll}
                    queryPlaceholder="Cerca..."
                  />
                </Box>
              </InlineStack>
            </Box>
            {isLoading ? (
              <Box padding="800">
                <BlockStack gap="200" align="center">
                  <Text as="p" tone="subdued">Caricamento...</Text>
                </BlockStack>
              </Box>
            ) : (
              <IndexTable
                resourceName={resourceName}
                itemCount={filteredAssessments.length}
                selectedItemsCount={
                  allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  {title: 'Azienda'},
                  {title: 'Referente'},
                  {title: 'Email'},
                  {title: 'Data'},
                  {title: 'Azioni', hidden: true}
                ]}
                emptyState={
                  <EmptyState
                    heading="Nessun assessment"
                    action={{
                      content: 'Compila Assessment',
                      icon: PlusIcon,
                      onAction: handleOpenAssessment
                    }}
                    secondaryAction={{
                      content: 'Copia link',
                      onAction: handleCopyLink
                    }}
                    image=""
                  >
                    <p>Condividi il link dell'assessment con i tuoi potenziali clienti.</p>
                  </EmptyState>
                }
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* MODALE DETTAGLIO */}
      <Modal
        open={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedAssessment?.data.ragione_sociale || 'Dettaglio Assessment'}
        size="large"
        primaryAction={{
          content: 'Chiudi',
          onAction: () => setIsDetailModalOpen(false),
        }}
      >
        <Modal.Section>
          {selectedAssessment && (
            <BlockStack gap="400">
              {renderDetailSection("Anagrafica", [
                {label: 'Referente', value: selectedAssessment.data.referente_nome},
                {label: 'Email', value: selectedAssessment.data.referente_email},
                {label: 'Telefono', value: selectedAssessment.data.referente_telefono},
                {label: 'Ragione Sociale', value: selectedAssessment.data.ragione_sociale},
                {label: 'Settore', value: selectedAssessment.data.settore_attivita},
                {label: 'Team', value: selectedAssessment.data.dimensione_team}
              ])}
              
              {renderDetailSection("Business", [
                {label: 'Descrizione', value: selectedAssessment.data.descrizione_business},
                {label: 'Decisori', value: selectedAssessment.data.decisori_coinvolti},
                {label: 'Chi fa cosa', value: selectedAssessment.data.chi_fa_cosa},
                {label: 'Metrica Successo', value: selectedAssessment.data.metrica_successo}
              ])}

              {renderDetailSection("Presenza Online", [
                {label: 'Sito Web', value: selectedAssessment.data.sito_web_presente},
                {label: 'URL', value: selectedAssessment.data.sito_web_url},
                {label: 'E-commerce', value: selectedAssessment.data.piattaforma_ecommerce},
                {label: 'Traffico', value: selectedAssessment.data.traffico_mensile},
                {label: 'Social', value: selectedAssessment.data.social_attivi},
                {label: 'Budget', value: selectedAssessment.data.budget_indicativo}
              ])}

              {renderDetailSection("Strumenti e Note", [
                {label: 'CRM', value: selectedAssessment.data.quale_crm},
                {label: 'Analytics', value: selectedAssessment.data.quale_analytics},
                {label: 'Note', value: selectedAssessment.data.note_finali}
              ])}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      {/* MODALE ELIMINAZIONE */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Elimina Assessment"
        primaryAction={{
          content: 'Elimina',
          onAction: handleDelete,
          destructive: true
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setIsDeleteModalOpen(false)
        }]}
      >
        <Modal.Section>
          <Text as="p">Sei sicuro di voler eliminare questo assessment? L'azione non è reversibile.</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default AssessmentList;
