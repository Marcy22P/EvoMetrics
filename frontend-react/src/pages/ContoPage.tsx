import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  Button,
  IndexTable,
  useIndexResourceState,
  Badge,
  Grid,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Icon
} from '@shopify/polaris';
import {
  RefreshIcon,
  ExportIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  WalletIcon,
  BillIcon
} from '@shopify/polaris-icons';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { sibillApi, type ContoSummary, type SibillTransaction } from '../services/sibillApi';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const ContoPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [kpiData, setKpiData] = useState<ContoSummary | null>(null);
  const [transactions, setTransactions] = useState<SibillTransaction[]>([]);
  const [chartData, setChartData] = useState<Array<{ name: string; entrate: number; uscite: number }>>([]);

  const loadData = useCallback(async () => {
    try {
      const [summary, allTxs] = await Promise.all([
        sibillApi.getSummary(),
        sibillApi.getTransactions(100, 0)
      ]);
      
      setKpiData(summary);
      
      const sortedTxs = [...allTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(sortedTxs.slice(0, 5));
      
      // Chart Data Processing
      const chartDataMap = new Map<string, { entrate: number; uscite: number; date: Date }>();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      sortedTxs.forEach(tx => {
        try {
          const txDate = new Date(tx.date);
          if (!isNaN(txDate.getTime()) && txDate >= thirtyDaysAgo) {
            const dateKey = format(txDate, 'dd MMM', { locale: it });
            if (!chartDataMap.has(dateKey)) {
              chartDataMap.set(dateKey, { entrate: 0, uscite: 0, date: txDate });
            }
            const dayData = chartDataMap.get(dateKey)!;
            if (tx.direction === 'in') {
              dayData.entrate += Math.abs(tx.amount);
            } else {
              dayData.uscite += Math.abs(tx.amount);
            }
          }
        } catch (e) { console.error(e); }
      });
      
      const chartDataArray = Array.from(chartDataMap.entries())
        .map(([name, data]) => ({
          name,
          entrate: Math.round(data.entrate * 100) / 100,
          uscite: Math.round(data.uscite * 100) / 100,
          date: data.date.getTime()
        }))
        .sort((a, b) => a.date - b.date)
        .map(({ date, ...rest }) => rest);
      
      setChartData(chartDataArray);
    } catch (error: any) {
      console.error("Errore caricamento dati:", error);
      toast.error("Impossibile caricare i dati aggiornati");
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
      await sibillApi.triggerSync(false);
      toast.success("Sincronizzazione avviata");
      setTimeout(() => {
        loadData();
      }, 2000);
    } catch (error: any) {
      toast.error("Errore nella sincronizzazione");
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'dd MMM yyyy', { locale: it }); } catch { return dateStr; }
  };

  const resourceName = { singular: 'movimento', plural: 'movimenti' };
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(transactions as any);

  const rowMarkup = transactions.map(
    (t, index) => (
      <IndexTable.Row
        id={t.id}
        key={t.id}
        selected={selectedResources.includes(t.id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{formatDate(t.date)}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{t.description}</IndexTable.Cell>
        <IndexTable.Cell>
            <Badge tone={t.category ? 'info' : 'new'}>{t.category || 'Altro'}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
            <Text as="span" tone={t.direction === 'in' ? 'success' : 'critical'} fontWeight="bold">
                {t.direction === 'in' ? '+' : ''} € {Math.abs(t.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  if (loading) {
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

  // Costruzione sottotitolo con info sync
  const subtitle = kpiData?.last_sync 
    ? `Panoramica movimenti bancari e flussi di cassa • Ultimo sync: ${format(new Date(kpiData.last_sync), 'dd MMM HH:mm', { locale: it })}`
    : "Panoramica movimenti bancari e flussi di cassa";

  return (
    <Page
      title="Situazione Finanziaria"
      subtitle={subtitle}
      primaryAction={{
        content: syncing ? 'Sincronizzazione...' : 'Sincronizza Sibill',
        icon: RefreshIcon,
        onAction: handleSync,
        loading: syncing,
        disabled: syncing
      }}
      secondaryActions={[
        {
            content: 'Export',
            icon: ExportIcon,
            accessibilityLabel: 'Export dati',
            onAction: () => toast.success('Export avviato')
        }
      ]}
      fullWidth
    >
      <Layout>
        {/* KPI CARDS */}
        <Layout.Section>
            <Grid>
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                    <div style={{ height: '100%' }}>
                        <LegacyCard>
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                                        <Icon source={WalletIcon} tone="base" />
                                    </div>
                                    <Text as="h2" variant="headingSm" tone="subdued">Saldo Attuale</Text>
                                </div>
                                <Text as="p" variant="headingLg">
                                    € {kpiData?.total_balance.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}
                                </Text>
                            </div>
                        </LegacyCard>
                    </div>
                </Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                    <div style={{ height: '100%' }}>
                        <LegacyCard>
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                                        <Icon source={ArrowUpIcon} tone="success" />
                                    </div>
                                    <Text as="h2" variant="headingSm" tone="subdued">Entrate (Mese)</Text>
                                </div>
                                <Text as="p" variant="headingLg" tone="success">
                                    € {kpiData?.monthly_in.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}
                                </Text>
                            </div>
                        </LegacyCard>
                    </div>
                </Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                    <div style={{ height: '100%' }}>
                        <LegacyCard>
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                                        <Icon source={ArrowDownIcon} tone="critical" />
                                    </div>
                                    <Text as="h2" variant="headingSm" tone="subdued">Uscite (Mese)</Text>
                                </div>
                                <Text as="p" variant="headingLg" tone="critical">
                                    € {kpiData?.monthly_out.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0,00'}
                                </Text>
                            </div>
                        </LegacyCard>
                    </div>
                </Grid.Cell>
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                    <div style={{ height: '100%' }}>
                        <LegacyCard>
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                                        <Icon source={BillIcon} tone="base" />
                                    </div>
                                    <Text as="h2" variant="headingSm" tone="subdued">Posizione IVA</Text>
                                </div>
                                <Text as="p" variant="headingLg" tone={(kpiData?.iva_debit || 0) > (kpiData?.iva_credit || 0) ? 'critical' : 'success'}>
                                    {(kpiData?.iva_debit || 0) > (kpiData?.iva_credit || 0) ? '-' : '+'} € {Math.abs((kpiData?.iva_credit || 0) - (kpiData?.iva_debit || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                </Text>
                            </div>
                        </LegacyCard>
                    </div>
                </Grid.Cell>
            </Grid>
        </Layout.Section>

        {/* CHART */}
        <Layout.Section>
            <LegacyCard title="Andamento Cashflow" sectioned>
                <div style={{ height: '350px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorEntrate" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorUscite" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e3e5" />
                            <XAxis dataKey="name" stroke="#6d7175" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis 
                                stroke="#6d7175" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false}
                                tickFormatter={(val) => `€${val}`} 
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Area type="monotone" dataKey="entrate" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorEntrate)" name="Entrate" />
                            <Area type="monotone" dataKey="uscite" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorUscite)" name="Uscite" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </LegacyCard>
        </Layout.Section>

        {/* TRANSACTIONS TABLE */}
        <Layout.Section>
            <LegacyCard>
                <IndexTable
                    resourceName={resourceName}
                    itemCount={transactions.length}
                    selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                    onSelectionChange={handleSelectionChange}
                    headings={[
                        {title: 'Data'},
                        {title: 'Descrizione'},
                        {title: 'Categoria'},
                        {title: 'Importo', alignment: 'start'},
                    ]}
                    selectable={false}
                >
                    {rowMarkup}
                </IndexTable>
                <div style={{ padding: '1rem', borderTop: '1px solid var(--p-color-border-subdued)', display: 'flex', justifyContent: 'center' }}>
                    <Button variant="plain">Vedi tutti i movimenti</Button>
                </div>
            </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default ContoPage;
