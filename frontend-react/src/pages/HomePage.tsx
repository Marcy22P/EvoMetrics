import React, { useEffect, useState } from 'react';
import { 
  Page, 
  Layout, 
  Card, 
  Text, 
  BlockStack, 
  CalloutCard, 
  Button, 
  InlineGrid, 
  Divider,
  Box,
  Icon
} from '@shopify/polaris';
import { 
  PlusIcon, 
  ArrowRightIcon, 
  WalletIcon, 
  ReceiptIcon, 
  ClipboardIcon,
  PersonIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

// Configurazione Endpoint
import { getServiceUrl } from '../utils/apiConfig';

const API_GATEWAY_URL = getServiceUrl('api-gateway');

interface DashboardStats {
  assessments: number;
  preventivi: number;
  contratti: number;
  pagamenti: number;
  gradimento: number;
  // Aggiungiamo campi finanziari opzionali che potrebbero arrivare in futuro
  total_balance?: number;
  monthly_in?: number;
}

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    assessments: 0, preventivi: 0, contratti: 0, pagamenti: 0, gradimento: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_GATEWAY_URL}/api/dashboard/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            setStats(data);
        }
      } catch (error) {
        console.error("Errore fetch stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return <Page title="Caricamento..."><Layout><Layout.Section><Card><Box padding="400"><Text as="p">Caricamento dashboard in corso...</Text></Box></Card></Layout.Section></Layout></Page>;
  }

  return (
    <Page 
        title={`Bentornato, ${user?.username || 'Admin'}`}
        subtitle="Ecco il riepilogo delle attività di Evoluzione Imprese"
        compactTitle
        primaryAction={{
            content: 'Nuovo Preventivo',
            icon: PlusIcon,
            onAction: () => navigate('/preventivi')
        }}
        secondaryActions={[
            {
                content: 'Sincronizza Banca',
                icon: WalletIcon,
                onAction: () => navigate('/conto')
            }
        ]}
    >
      <Layout>
        {/* SEZIONE FINANZIARIA (CALLOUT) */}
        <Layout.Section>
             <CalloutCard
                title="Situazione Finanziaria & Liquidità"
                illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
                primaryAction={{
                    content: 'Vedi Conto',
                    onAction: () => navigate('/conto')
                }}
                secondaryAction={{
                    content: 'Riconciliazione',
                    onAction: () => navigate('/conto/entrate')
                }}
            >
                <p>Gestisci i flussi di cassa e monitora le entrate. Attualmente ci sono <strong>{stats.pagamenti} pagamenti</strong> in attesa di verifica.</p>
            </CalloutCard>
        </Layout.Section>

        {/* KPI PRINCIPALI */}
        <Layout.Section>
            <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Metriche Operative</Text>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                    <Card>
                        <BlockStack gap="200">
                            <InlineGrid columns="auto 1fr" gap="400" alignItems="center">
                                <Box background="bg-surface-active" padding="200" borderRadius="200">
                                    <Icon source={ClipboardIcon} tone="base" />
                                </Box>
                                <BlockStack gap="050">
                                    <Text as="h3" variant="headingSm" fontWeight="medium">Preventivi</Text>
                                    <Text as="p" tone="subdued">Ultimi 30 giorni</Text>
                                </BlockStack>
                            </InlineGrid>
                            <Text as="p" variant="heading2xl">{stats.preventivi}</Text>
                            <Button variant="plain" onClick={() => navigate('/preventivi')}>Gestisci preventivi</Button>
                        </BlockStack>
                    </Card>
                    
                    <Card>
                        <BlockStack gap="200">
                            <InlineGrid columns="auto 1fr" gap="400" alignItems="center">
                                <Box background="bg-surface-active" padding="200" borderRadius="200">
                                    <Icon source={ReceiptIcon} tone="base" />
                                </Box>
                                <BlockStack gap="050">
                                    <Text as="h3" variant="headingSm" fontWeight="medium">Contratti Attivi</Text>
                                    <Text as="p" tone="subdued">Progetti in corso</Text>
                                </BlockStack>
                            </InlineGrid>
                            <Text as="p" variant="heading2xl">{stats.contratti}</Text>
                            <Button variant="plain" onClick={() => navigate('/contratti')}>Vedi contratti</Button>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="200">
                            <InlineGrid columns="auto 1fr" gap="400" alignItems="center">
                                <Box background="bg-surface-active" padding="200" borderRadius="200">
                                    <Icon source={PersonIcon} tone="base" />
                                </Box>
                                <BlockStack gap="050">
                                    <Text as="h3" variant="headingSm" fontWeight="medium">Nuovi Lead</Text>
                                    <Text as="p" tone="subdued">Da Assessment</Text>
                                </BlockStack>
                            </InlineGrid>
                            <Text as="p" variant="heading2xl">{stats.assessments}</Text>
                            <Button variant="plain" onClick={() => navigate('/assessment-list')}>Vedi assessments</Button>
                        </BlockStack>
                    </Card>
                </InlineGrid>
            </BlockStack>
        </Layout.Section>

        <Layout.Section>
            <Divider />
        </Layout.Section>

        {/* DETTAGLI & AZIONI RAPIDE */}
        <Layout.Section variant="oneHalf">
             <Card>
                <BlockStack gap="400">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text as="h2" variant="headingMd">Attività Recenti</Text>
                        <Button variant="plain" icon={ArrowRightIcon} onClick={() => navigate('/dashboard')}>Tutte</Button>
                    </div>
                    <BlockStack gap="300">
                        <Box paddingBlockEnd="200" borderBlockEndWidth="025" borderColor="border">
                            <InlineGrid columns="1fr auto" alignItems="center">
                                <BlockStack gap="050">
                                    <Text as="p" fontWeight="bold">Aggiornamento Sistema</Text>
                                    <Text as="p" tone="subdued">Dashboard aggiornata al nuovo design Polaris</Text>
                                </BlockStack>
                                <Text as="span" tone="subdued">Oggi</Text>
                            </InlineGrid>
                        </Box>
                        <Box paddingBlockEnd="200" borderBlockEndWidth="025" borderColor="border">
                            <InlineGrid columns="1fr auto" alignItems="center">
                                <BlockStack gap="050">
                                    <Text as="p" fontWeight="bold">Pagamenti</Text>
                                    <Text as="p" tone="subdued">Verifica scadenze in Entrate</Text>
                                </BlockStack>
                                <Button size="micro" onClick={() => navigate('/conto/entrate')}>Verifica</Button>
                            </InlineGrid>
                        </Box>
                    </BlockStack>
                </BlockStack>
             </Card>
        </Layout.Section>
        
        <Layout.Section variant="oneHalf">
             <Card>
                <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Azioni Rapide</Text>
                    <BlockStack gap="200">
                        <Button icon={PersonIcon} fullWidth textAlign="left" onClick={() => navigate('/anagrafica-clienti')}>Nuovo Cliente</Button>
                        <Button icon={ClipboardIcon} fullWidth textAlign="left" onClick={() => navigate('/preventivi')}>Nuovo Preventivo</Button>
                        <Button icon={WalletIcon} fullWidth textAlign="left" onClick={() => navigate('/conto')}>Gestione Conto</Button>
                    </BlockStack>
                </BlockStack>
             </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
};

export default HomePage;
