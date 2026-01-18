import React, { useState, useMemo, useCallback } from 'react';
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
  Box,
  Grid,
  EmptyState,
  Icon,
} from '@shopify/polaris';
import { DeleteIcon, ViewIcon, PersonIcon, WorkIcon, GlobeIcon, NoteIcon } from '@shopify/polaris-icons';
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
      const date = new Date(created_at).toLocaleDateString('it-IT');

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">{data.ragione_sociale || 'Azienda Sconosciuta'}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <BlockStack gap="100">
                <Text as="span" variant="bodySm">{data.referente_nome}</Text>
                <Text as="span" tone="subdued" variant="bodyXs">{data.referente_email}</Text>
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {data.settore_attivita || '-'}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone="info">{date}</Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
             <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button icon={ViewIcon} onClick={() => { setSelectedAssessment(assessment); setIsDetailModalOpen(true); }} variant="plain" accessibilityLabel="Vedi dettagli" />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button icon={DeleteIcon} onClick={() => { setAssessmentToDelete(id); setIsDeleteModalOpen(true); }} tone="critical" variant="plain" accessibilityLabel="Elimina" />
                </div>
             </div>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  const renderDetailSection = (title: string, IconSource: React.FunctionComponent<React.SVGProps<SVGSVGElement>>, data: {[key: string]: any}) => {
    const entries = Object.entries(data).filter(([, v]) => v);
    if (entries.length === 0) return null;

    return (
        <Box paddingBlockEnd="400">
            <BlockStack gap="200">
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div style={{width: '20px', height: '20px'}}>
                        <Icon source={IconSource} tone="subdued" />
                    </div>
                    <Text variant="headingSm" as="h3" tone="subdued">{title}</Text>
                </div>
                <Box paddingBlockStart="200">
                    <Grid>
                        {entries.map(([k, v]) => (
                            <Grid.Cell key={k} columnSpan={{xs: 6, sm: 6, md: 4, lg: 4, xl: 4}}>
                                <BlockStack gap="100">
                                    <Text variant="bodyXs" tone="subdued" as="p">{k}</Text>
                                    <Text variant="bodyMd" as="p">{Array.isArray(v) ? v.join(', ') : String(v)}</Text>
                                </BlockStack>
                            </Grid.Cell>
                        ))}
                    </Grid>
                </Box>
            </BlockStack>
        </Box>
    );
  };

  if (!hasPermission('assessments:read')) {
      return <Page title="Accesso Negato"><Text as="p" tone="critical">Non hai i permessi per visualizzare questa pagina.</Text></Page>;
  }

  return (
    <Page title="Assessment Digitali">
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
                    queryPlaceholder="Cerca assessment..."
                />
            </div>
            {isLoading ? (
                 <div style={{padding: '2rem', textAlign: 'center'}}>Caricamento...</div>
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
                    {title: 'Settore'},
                    {title: 'Data Invio'},
                    {title: 'Azioni', hidden: true}
                ]}
                emptyState={
                    <EmptyState
                        heading="Nessun assessment trovato"
                        action={{content: 'Ricarica', onAction: fetchAssessments}}
                        image=""
                    >
                        <p>Non ci sono ancora assessment compilati.</p>
                    </EmptyState>
                }
                >
                {rowMarkup}
                </IndexTable>
            )}
          </LegacyCard>
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
                    {renderDetailSection("Anagrafica", PersonIcon, {
                        'Referente': selectedAssessment.data.referente_nome,
                        'Email': selectedAssessment.data.referente_email,
                        'Telefono': selectedAssessment.data.referente_telefono,
                        'Ragione Sociale': selectedAssessment.data.ragione_sociale,
                        'Settore': selectedAssessment.data.settore_attivita,
                        'Dimensione Team': selectedAssessment.data.dimensione_team
                    })}
                    
                    {renderDetailSection("Business", WorkIcon, {
                        'Descrizione': selectedAssessment.data.descrizione_business,
                        'Decisori': selectedAssessment.data.decisori_coinvolti,
                         'Chi fa cosa': selectedAssessment.data.chi_fa_cosa,
                         'Metrica Successo': selectedAssessment.data.metrica_successo
                    })}

                    {renderDetailSection("Presenza Online", GlobeIcon, {
                        'Sito Web': selectedAssessment.data.sito_web_presente,
                        'URL': selectedAssessment.data.sito_web_url,
                        'E-commerce': selectedAssessment.data.piattaforma_ecommerce,
                        'Traffico': selectedAssessment.data.traffico_mensile,
                        'Social': selectedAssessment.data.social_attivi,
                        'Budget Indicativo': selectedAssessment.data.budget_indicativo
                    })}

                    {renderDetailSection("Note & Extra", NoteIcon, {
                        'Note': selectedAssessment.data.note_finali,
                        'CRM': selectedAssessment.data.quale_crm,
                        'Analytics': selectedAssessment.data.quale_analytics
                    })}
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
