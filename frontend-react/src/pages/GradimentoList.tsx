import React, { useEffect, useState } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  InlineStack,
  Badge,
  Banner,
  Spinner,
  Divider,
  Grid
} from '@shopify/polaris';
import { useAuth } from '../hooks/useAuth';
import { gradimentoApi, type GradimentoSettimanale } from '../services/gradimentoApi';
import { useNavigate } from 'react-router-dom';

const GradimentoList: React.FC = () => {
    const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [gradimenti, setGradimenti] = useState<GradimentoSettimanale[]>([]);
    const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGradimenti = async () => {
            try {
        const data = await gradimentoApi.getGradimenti();
        setGradimenti(data);
      } catch (err: any) {
        setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

    if (hasPermission('gradimento:read')) {
        fetchGradimenti();
    }
  }, [hasPermission]);

  if (!hasPermission('gradimento:read')) {
    return (
        <Page>
            <Banner tone="critical" title="Accesso Negato">
                <p>Non hai i permessi per visualizzare questa pagina.</p>
            </Banner>
        </Page>
    );
  }

  if (isLoading) {
    return (
      <Page title="Risposte Weekly Review">
        <Box padding="400">
            <InlineStack align="center">
                <Spinner size="large" />
            </InlineStack>
        </Box>
      </Page>
    );
  }

  const getVotoBadgeTone = (voto: number): 'success' | 'attention' | 'critical' => {
      if (voto >= 4) return 'success';
      if (voto === 3) return 'attention';
      return 'critical';
  };

  return (
    <Page 
        title="Risposte Weekly Review" 
        subtitle="Feedback settimanali del team"
        primaryAction={{
            content: 'Compila Nuova',
            onAction: () => navigate('/team/gradimento-nuovo')
        }}
    >
      <Layout>
        <Layout.Section>
          {error && (
            <Banner tone="critical" title="Errore caricamento" onDismiss={() => setError(null)}>
              <p>{error}</p>
            </Banner>
          )}

          {gradimenti.length === 0 && !error ? (
              <Card>
                  <Box padding="400">
                      <Text as="p" variant="bodyMd" tone="subdued">Nessuna risposta presente.</Text>
                  </Box>
              </Card>
          ) : (
             <BlockStack gap="400">
                    {gradimenti.map((g) => (
                    <Card key={g.id}>
                        <BlockStack gap="400">
                            {/* Header Card */}
                            <InlineStack align="space-between" blockAlign="center">
                                <BlockStack gap="050">
                                    <Text as="h2" variant="headingMd">
                                        {g.risposte.nome} {g.risposte.cognome}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        {new Date(g.data_compilazione).toLocaleDateString('it-IT', { 
                                            weekday: 'long', 
                                            year: 'numeric', 
                                            month: 'long', 
                                            day: 'numeric' 
                                        })}
                                    </Text>
                                </BlockStack>
                                <InlineStack gap="200">
                                    <Badge tone={getVotoBadgeTone(Number(g.risposte.soddisfazione_qualita))}>
                                        {`Qualità: ${g.risposte.soddisfazione_qualita}/5`}
                                    </Badge>
                                    <Badge tone={getVotoBadgeTone(Number(g.risposte.organizzazione_produttivita))}>
                                        {`Produttività: ${g.risposte.organizzazione_produttivita}/5`}
                                    </Badge>
                                    <Badge tone={getVotoBadgeTone(Number(g.risposte.allineamento_team))}>
                                        {`Allineamento: ${g.risposte.allineamento_team}/5`}
                                    </Badge>
                                </InlineStack>
                            </InlineStack>

                            <Divider />

                            {/* Contenuto Principale - Grid Layout */}
                            <Grid>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 6, lg: 6, xl: 6}}>
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingSm">Cose principali fatte</Text>
                                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                                            <Text as="p" variant="bodyMd">{g.risposte.cose_principali}</Text>
                                        </Box>
                                    </BlockStack>
                                </Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 6, lg: 6, xl: 6}}>
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingSm">Priorità prossima settimana</Text>
                                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                                            <Text as="p" variant="bodyMd">{g.risposte.priorita_prossima_settimana}</Text>
                                        </Box>
                                    </BlockStack>
                                </Grid.Cell>
                            </Grid>

                            {/* Dettagli Condizionali */}
                            {(g.risposte.ostacoli_interni || g.risposte.difficolta_esterne || (g.risposte.lasciato_indietro && !g.risposte.lasciato_indietro.startsWith('No'))) && (
                                <>
                                    <Divider />
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingSm" tone="critical">Criticità & Ostacoli</Text>
                                        
                                        {g.risposte.lasciato_indietro && !g.risposte.lasciato_indietro.startsWith('No') && (
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="bold">Lasciato indietro:</Text> {g.risposte.lasciato_indietro}
                                            </Text>
                                        )}
                                        
                                {g.risposte.ostacoli_interni && (
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="bold">Ostacoli Interni:</Text> {g.risposte.ostacoli_interni}
                                            </Text>
                                        )}
                                        
                                        {g.risposte.difficolta_esterne && (
                                            <Text as="p" variant="bodyMd">
                                                <Text as="span" fontWeight="bold">Difficoltà Esterne:</Text> {g.risposte.difficolta_esterne}
                                            </Text>
                                        )}
                                    </BlockStack>
                                </>
                            )}

                            {/* Footer Card */}
                            <Box paddingBlockStart="200">
                                <InlineStack gap="400" align="start">
                                    {g.risposte.stato_animo && (
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Mood: <Text as="span" fontWeight="bold">{g.risposte.stato_animo}</Text>
                                        </Text>
                                    )}
                                    {g.risposte.pensiero_libero && (
                                         <Text as="p" variant="bodySm" tone="subdued">
                                            Pensiero: "{g.risposte.pensiero_libero}"
                                         </Text>
                                )}
                                </InlineStack>
                            </Box>
                        </BlockStack>
                    </Card>
                    ))}
             </BlockStack>
            )}
        </Layout.Section>
      </Layout>
    </Page>
    );
};

export default GradimentoList;
