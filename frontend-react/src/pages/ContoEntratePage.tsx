import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  IndexTable,
  Badge,
  Grid,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Icon
} from '@shopify/polaris';
import {
  RefreshIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  InfoIcon,
  ArrowRightIcon
} from '@shopify/polaris-icons';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface MatchDetail {
  id: string;
  cliente: string;
  importo: number;
  data_scadenza: string | null;
  status: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ReconciliationItem {
  transaction: {
    id: string;
    date: string;
    amount: number;
    description: string;
    account_name?: string;
  };
  match_status: 'matched' | 'potential' | 'unmatched';
  match_detail: MatchDetail | null;
}

const ContoEntratePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [stats, setStats] = useState({
    totalReale: 0,
    totalPrevisto: 0,
    matchedCount: 0
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sibill/reconciliation/incoming', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) throw new Error('Errore caricamento dati riconciliazione');

      const data: ReconciliationItem[] = await response.json();
      setItems(data);

      // Calcola Stats
      let matched = 0;
      const reale = data.reduce((acc, item) => acc + item.transaction.amount, 0);
      const previsto = data.reduce((acc, item) => {
        if (item.match_detail) {
          matched++;
          return acc + item.match_detail.importo;
        }
        return acc;
      }, 0);

      setStats({
        totalReale: reale,
        totalPrevisto: previsto,
        matchedCount: matched
      });

    } catch (error) {
      console.error("Errore:", error);
      toast.error("Impossibile caricare i dati di riconciliazione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sibill/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ force: true })
      });

      if (!response.ok) throw new Error('Errore durante la sincronizzazione');

      toast.success("Sincronizzazione avviata con successo");
      setTimeout(() => {
        loadData();
        setSyncing(false);
      }, 2000);

    } catch (error) {
      console.error("Errore sync:", error);
      toast.error("Impossibile sincronizzare con la banca");
      setSyncing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      if (!dateStr) return '-';
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: it });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string, confidence: string) => {
    if (status === 'matched' || confidence === 'high') {
      return <Badge tone="success" icon={CheckCircleIcon}>Conciliato</Badge>;
    }
    if (status === 'potential' || confidence === 'medium') {
      return <Badge tone="attention" icon={InfoIcon}>Da Verificare</Badge>;
    }
    return <Badge tone="critical" icon={AlertCircleIcon}>Non Trovato</Badge>;
  };

  if (loading && items.length === 0) {
    return (
      <SkeletonPage primaryAction>
        <Layout>
          <Layout.Section>
            <LegacyCard sectioned>
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText />
            </LegacyCard>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  const rowMarkup = items.map((item, idx) => (
    <IndexTable.Row
      id={item.transaction.id}
      key={item.transaction.id || idx}
      position={idx}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">{formatDate(item.transaction.date)}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div>
          <Text as="p" variant="bodyMd" fontWeight="medium">{item.transaction.description}</Text>
          {item.transaction.account_name && (
            <Text as="p" variant="bodyXs" tone="subdued">{item.transaction.account_name}</Text>
          )}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="success" fontWeight="bold">
          +€ {item.transaction.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Icon source={ArrowRightIcon} tone="subdued" />
      </IndexTable.Cell>
      <IndexTable.Cell>
        {item.match_detail ? (
          <div>
            <Text as="p" variant="bodyMd" fontWeight="medium">{item.match_detail.cliente}</Text>
            <Text as="p" variant="bodyXs" tone="subdued">
              Rata: € {item.match_detail.importo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </Text>
          </div>
        ) : (
          <Text as="span" tone="subdued">Nessun match trovato</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">
          {item.match_detail ? formatDate(item.match_detail.data_scadenza || '') : '-'}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getStatusBadge(item.match_status, item.match_detail?.confidence || 'low')}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Entrate & Riconciliazione"
      subtitle="Confronto automatico tra incassi reali (Sibill) e pagamenti attesi"
      primaryAction={{
        content: syncing ? 'Sincronizzazione...' : 'Sincronizza con Banca',
        icon: RefreshIcon,
        onAction: handleSync,
        loading: syncing,
        disabled: syncing
      }}
      secondaryActions={[
        {
          content: 'Aggiorna Dati',
          icon: ArrowUpIcon,
          onAction: loadData
        }
      ]}
      fullWidth
    >
      <Layout>
        {/* KPI CARDS */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
              <div style={{ height: '100%' }}>
                <LegacyCard>
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                        <Icon source={ArrowUpIcon} tone="success" />
                      </div>
                      <Text as="h2" variant="headingSm" tone="subdued">Totale Incassato (Sibill)</Text>
                    </div>
                    <Text as="p" variant="headingLg">
                      € {stats.totalReale.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </Text>
                  </div>
                </LegacyCard>
              </div>
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
              <div style={{ height: '100%' }}>
                <LegacyCard>
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                        <Icon source={CheckCircleIcon} tone="info" />
                      </div>
                      <Text as="h2" variant="headingSm" tone="subdued">Totale Conciliato</Text>
                    </div>
                    <Text as="p" variant="headingLg">
                      € {stats.totalPrevisto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </Text>
                  </div>
                </LegacyCard>
              </div>
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
              <div style={{ height: '100%' }}>
                <LegacyCard>
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                        <Icon source={CheckCircleIcon} tone="success" />
                      </div>
                      <Text as="h2" variant="headingSm" tone="subdued">Transazioni Conciliate</Text>
                    </div>
                    <Text as="p" variant="headingLg">
                      {stats.matchedCount} <Text as="span" variant="bodyMd" tone="subdued">/ {items.length}</Text>
                    </Text>
                  </div>
                </LegacyCard>
              </div>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* RECONCILIATION TABLE */}
        <Layout.Section>
          <LegacyCard>
            <IndexTable
              resourceName={{ singular: 'movimento', plural: 'movimenti' }}
              itemCount={items.length}
              headings={[
                {title: 'Data'},
                {title: 'Movimento Bancario (Sibill)'},
                {title: 'Importo'},
                {title: ''}, // Arrow column
                {title: 'Pagamento Gestionale'},
                {title: 'Scadenza'},
                {title: 'Stato'}
              ]}
              selectable={false}
            >
              {items.length === 0 ? (
                <IndexTable.Row id="empty" position={0}>
                  <IndexTable.Cell colSpan={7}>
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <Text as="p" tone="subdued">Nessuna entrata trovata</Text>
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ) : (
                rowMarkup
              )}
            </IndexTable>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default ContoEntratePage;
