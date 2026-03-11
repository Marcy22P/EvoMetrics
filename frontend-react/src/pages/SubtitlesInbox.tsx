import React, { useState, useEffect } from 'react';
import { Page, Layout, Card, IndexTable, Badge, Text, Button, InlineStack, Spinner, Box, Tabs, ButtonGroup } from '@shopify/polaris';
import { getSubtitleJobs } from '../services/subtitlesApi';
import type { SubtitleJob } from '../services/subtitlesApi';
import { useNavigate } from 'react-router-dom';

const SubtitlesInbox: React.FC = () => {
  const [allJobs, setAllJobs] = useState<SubtitleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAllJobs();
  }, []);

  const fetchAllJobs = async () => {
    setLoading(true);
    try {
      // Carica TUTTI i job (l'admin vede tutto, l'editor vede solo i suoi)
      const jobList = await getSubtitleJobs({});
      // Ordina per data discendente
      const sorted = Array.isArray(jobList) 
        ? jobList.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : (jobList as any).jobs?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];
      setAllJobs(sorted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Tab filtri
  const tabs = [
    { id: 'in_review', content: `Da Revisionare (${allJobs.filter(j => j.status === 'in_review').length})`, panelID: 'in_review' },
    { id: 'generated', content: `Generati (${allJobs.filter(j => j.status === 'generated').length})`, panelID: 'generated' },
    { id: 'approved', content: `Approvati (${allJobs.filter(j => j.status === 'approved').length})`, panelID: 'approved' },
    { id: 'all', content: `Tutti (${allJobs.length})`, panelID: 'all' },
  ];

  const statusFilter = tabs[selectedTab]?.id;
  const filteredJobs = statusFilter === 'all'
    ? allJobs
    : allJobs.filter(j => j.status === statusFilter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generated': return <Badge tone="success">Generato</Badge>;
      case 'processing': return <Badge tone="attention">In lavorazione</Badge>;
      case 'queued': return <Badge tone="info">In coda</Badge>;
      case 'error': return <Badge tone="critical">Errore</Badge>;
      case 'in_review': return <Badge tone="warning">In Revisione</Badge>;
      case 'approved': return <Badge tone="success">Approvato</Badge>;
      case 'rejected': return <Badge tone="critical">Respinto</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const resourceName = { singular: 'contenuto', plural: 'contenuti' };

  const rowMarkup = filteredJobs.map(
    (job, index) => (
      <IndexTable.Row id={job.id} key={job.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{job.input_drive_file_name || 'Video'}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd">{(job as any).cliente_name || job.cliente_id}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {job.content_type === 'organico' ? <Badge tone="info">Organico</Badge> : <Badge tone="attention">Paid Ads</Badge>}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {getStatusBadge(job.status)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(job.created_at).toLocaleDateString('it-IT')}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <ButtonGroup>
            {job.status === 'in_review' && (
              <Button variant="primary" onClick={() => navigate(`/subtitles/review/${job.id}`)} size="slim">Rivedi</Button>
            )}
            <Button onClick={() => navigate(`/subtitles/jobs/${job.id}`)} size="slim">Dettaglio</Button>
          </ButtonGroup>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page title="Gestione Contenuti - Sottotitoli" fullWidth>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {loading ? (
                <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
              ) : (
                <IndexTable
                  resourceName={resourceName}
                  itemCount={filteredJobs.length}
                  headings={[
                    { title: 'File Video' },
                    { title: 'Cliente' },
                    { title: 'Tipo' },
                    { title: 'Stato' },
                    { title: 'Data' },
                    { title: 'Azioni' },
                  ]}
                  selectable={false}
                  emptyState={
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <Text as="p" tone="subdued">
                        {statusFilter === 'in_review'
                          ? "Nessun contenuto in attesa di revisione."
                          : statusFilter === 'generated'
                            ? "Nessun contenuto generato in attesa."
                            : "Nessun contenuto trovato."}
                      </Text>
                    </div>
                  }
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default SubtitlesInbox;
