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
  Icon,
  Select,
  Box,
  Tooltip
} from '@shopify/polaris';
import {
  RefreshIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  InfoIcon,
  MagicIcon
} from '@shopify/polaris-icons';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface ExpenseCategory {
  key: string;
  label: string;
  deductibility: string;
  type: string;
  description: string;
}

interface ExpenseItem {
  transaction: {
    id: string;
    account_id: string;
    date: string;
    amount: number;
    description: string | null;
    category: string | null;
    direction: string;
    account_name: string | null;
  };
  category: ExpenseCategory;
  is_ai_categorized: boolean;
  ai_confidence: number;
  ai_reasoning: string | null;
}

const ContoUscitePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stats, setStats] = useState({
    totalUscite: 0,
    totalDeducibile: 0,
    categorizedCount: 0
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [expensesRes, categoriesRes] = await Promise.all([
        fetch('/api/sibill/expenses?limit=2000', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        }),
        fetch('/api/sibill/expense-categories', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        })
      ]);

      if (!expensesRes.ok || !categoriesRes.ok) {
        throw new Error('Errore caricamento dati');
      }

      const expenses: ExpenseItem[] = await expensesRes.json();
      const cats: ExpenseCategory[] = await categoriesRes.json();
      
      setItems(expenses);
      setCategories(cats);

      // Calcola statistiche
      const total = expenses.reduce((acc, item) => acc + Math.abs(item.transaction.amount), 0);
      const categorized = expenses.filter(item => item.category.key !== 'altro').length;
      
      // Stima deducibilità (semplificata - in realtà serve calcolo più complesso)
      const deducibile = expenses.reduce((acc, item) => {
        const deductibility = item.category.deductibility;
        let percentage = 100;
        if (deductibility.includes('20%')) percentage = 20;
        else if (deductibility.includes('70%')) percentage = 70;
        else if (deductibility.includes('75%')) percentage = 75;
        else if (deductibility.includes('80%')) percentage = 80;
        else if (deductibility.includes('50%')) percentage = 50;
        else if (deductibility.includes('Variabile') || deductibility.includes('Da verificare')) percentage = 0;
        
        return acc + (Math.abs(item.transaction.amount) * percentage / 100);
      }, 0);

      setStats({
        totalUscite: total,
        totalDeducibile: deducibile,
        categorizedCount: categorized
      });

    } catch (error) {
      console.error("Errore:", error);
      toast.error("Impossibile caricare i dati delle uscite");
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

  // Filtra items per categoria selezionata
  const filteredItems = selectedCategory === 'all' 
    ? items 
    : items.filter(item => item.category.key === selectedCategory);

  const categoryOptions = [
    { label: 'Tutte le categorie', value: 'all' },
    ...categories.map(cat => ({ label: cat.label, value: cat.key }))
  ];

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

  const rowMarkup = filteredItems.map((item, idx) => (
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
          <Text as="p" variant="bodyMd" fontWeight="medium">{item.transaction.description || 'N/A'}</Text>
          {item.transaction.account_name && (
            <Text as="p" variant="bodyXs" tone="subdued">{item.transaction.account_name}</Text>
          )}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="critical" fontWeight="bold">
          -€ {Math.abs(item.transaction.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge tone={item.category.key === 'altro' ? 'new' : 'info'}>
            {item.category.label}
          </Badge>
          {item.is_ai_categorized && (
            <Tooltip content={`Categorizzato da AI (Confidenza: ${item.ai_confidence}%) - ${item.ai_reasoning || ''}`}>
              <div style={{ cursor: 'help' }}>
                <Icon source={MagicIcon} tone="magic" />
              </div>
            </Tooltip>
          )}
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" tone="subdued">
          {item.category.deductibility}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Uscite & Categorizzazione"
      subtitle="Analisi e categorizzazione automatica delle spese secondo le regole fiscali italiane"
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
          icon: ArrowDownIcon,
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
                        <Icon source={ArrowDownIcon} tone="critical" />
                      </div>
                      <Text as="h2" variant="headingSm" tone="subdued">Totale Uscite</Text>
                    </div>
                    <Text as="p" variant="headingLg" tone="critical">
                      € {stats.totalUscite.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
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
                      <Text as="h2" variant="headingSm" tone="subdued">Totale Deducibile (Stima)</Text>
                    </div>
                    <Text as="p" variant="headingLg" tone="success">
                      € {stats.totalDeducibile.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
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
                        <Icon source={InfoIcon} tone="info" />
                      </div>
                      <Text as="h2" variant="headingSm" tone="subdued">Categorizzate</Text>
                    </div>
                    <Text as="p" variant="headingLg">
                      {stats.categorizedCount} <Text as="span" variant="bodyMd" tone="subdued">/ {items.length}</Text>
                    </Text>
                  </div>
                </LegacyCard>
              </div>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* FILTER */}
        <Layout.Section>
          <LegacyCard sectioned>
            <Box paddingBlockEnd="400">
              <Select
                label="Filtra per categoria"
                options={categoryOptions}
                value={selectedCategory}
                onChange={setSelectedCategory}
              />
            </Box>
          </LegacyCard>
        </Layout.Section>

        {/* EXPENSES TABLE */}
        <Layout.Section>
          <LegacyCard>
            <IndexTable
              resourceName={{ singular: 'uscita', plural: 'uscite' }}
              itemCount={filteredItems.length}
              headings={[
                {title: 'Data'},
                {title: 'Descrizione'},
                {title: 'Importo'},
                {title: 'Categoria'},
                {title: 'Deducibilità'}
              ]}
              selectable={false}
            >
              {filteredItems.length === 0 ? (
                <IndexTable.Row id="empty" position={0}>
                  <IndexTable.Cell colSpan={5}>
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <Text as="p" tone="subdued">Nessuna uscita trovata</Text>
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

export default ContoUscitePage;

