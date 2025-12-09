import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  LegacyCard,
  BlockStack,
  Text,
  Badge,
  Button,
  Grid,
  Banner,
  Modal,
  TextField,
  InlineStack,
  Box,
  SkeletonPage,
  Divider,
  Icon,
  EmptyState
} from '@shopify/polaris';
import {
  DeleteIcon,
  ClipboardIcon,
  StoreIcon
} from '@shopify/polaris-icons';
import { toast } from 'react-hot-toast';
import { clientiApi, type Cliente, type MagicLink } from '../services/clientiApi';
import { shopifyApi, type ShopifyMetrics, type ShopifyTestResult } from '../services/shopifyApi';

const ClienteDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Stati Dati
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Stati Shopify
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyMetrics, setShopifyMetrics] = useState<ShopifyMetrics | null>(null);
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [shopName, setShopName] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [, setTestResult] = useState<ShopifyTestResult | null>(null); 
  
  // Stati Magic Links
  const [magicLinks, setMagicLinks] = useState<MagicLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  
  // Stati Cancellazione
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Caricamento Dati Cliente
  const loadCliente = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await clientiApi.getCliente(id);
      setCliente(data);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento del cliente');
      toast.error('Impossibile caricare il cliente');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Caricamento Metriche Shopify
  const loadShopifyMetrics = useCallback(async () => {
    if (!id) return;
    try {
      const metrics = await shopifyApi.getShopifyMetrics(id);
      setShopifyMetrics(metrics);
    } catch (err: any) {
      console.error('Errore caricamento metriche:', err);
      if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
        toast.error('Accesso negato alle metriche Shopify');
      }
    }
  }, [id]);

  // Check Connessione Shopify
  const checkShopifyConnection = useCallback(async () => {
    if (!id) return;
    try {
      const result = await shopifyApi.testShopifyConnection(id);
      if (result.connected) {
        setShopifyConnected(true);
        setTestResult(result);
        loadShopifyMetrics();
      } else {
        setShopifyConnected(false);
        setTestResult(result);
      }
    } catch (err) {
      setShopifyConnected(false);
    }
  }, [id, loadShopifyMetrics]);

  // Magic Links
  const loadMagicLinks = useCallback(async () => {
    if (!id) return;
    try {
      setLoadingLinks(true);
      const links = await clientiApi.getMagicLinks(id);
      setMagicLinks(links);
    } catch (err: any) {
      console.error('Errore caricamento magic links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadCliente();
      checkShopifyConnection();
      loadMagicLinks();
    }
  }, [id, loadCliente, checkShopifyConnection, loadMagicLinks]);

  // Gestione Connessione Shopify da URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('shopify_connected') === 'true') {
      setShopifyConnected(true);
      loadShopifyMetrics();
      window.history.replaceState({}, '', window.location.pathname);
      toast.success('Shopify connesso con successo!');
    }
  }, []);

  // Azioni
  const handleConnectShopify = () => {
    if (!id || !shopName) return;
    let shop = shopName.trim().toLowerCase();
    if (shop.endsWith('.myshopify.com')) {
      shop = shop.replace('.myshopify.com', '');
    }
    shop = `${shop}.myshopify.com`;
    shopifyApi.connectShopify(id, shop);
    setShowShopifyModal(false);
  };

  const handleTestConnection = async () => {
    if (!id) return;
    try {
      setTestingConnection(true);
      const result = await shopifyApi.testShopifyConnection(id);
      setTestResult(result);
      if (result.connected) {
        setShopifyConnected(true);
        loadShopifyMetrics();
        toast.success('Connessione attiva');
      } else {
        setShopifyConnected(false);
        toast.error('Connessione fallita');
      }
    } catch (err: any) {
      setTestResult({ connected: false, error: err.message });
      toast.error('Errore test connessione');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCreateMagicLink = async () => {
    if (!id) return;
    try {
      setCreatingLink(true);
      const newLink = await clientiApi.createMagicLink(id);
      setMagicLinks(prev => [newLink, ...prev]);
      navigator.clipboard.writeText(newLink.url);
      toast.success('Link generato e copiato!');
    } catch (err: any) {
      toast.error('Errore creazione link');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    if (!window.confirm('Revocare questo link?')) return;
    try {
      await clientiApi.revokeMagicLink(linkId);
      setMagicLinks(prev => prev.filter(l => l.id !== linkId));
      toast.success('Link revocato');
    } catch (err) {
      toast.error('Errore revoca link');
    }
  };

  const handleDeleteCliente = async () => {
    if (!id) return;
    try {
      setDeleting(true);
      await clientiApi.deleteCliente(id);
      toast.success('Cliente eliminato');
      navigate('/anagrafica-clienti');
    } catch (err) {
      toast.error('Errore eliminazione');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // UI Helpers
  if (loading) return <SkeletonPage primaryAction />;

  if (error || !cliente) {
    return (
      <Page>
        <Banner tone="critical" title="Cliente non trovato">
          <p>{error || 'Impossibile trovare il cliente specificato.'}</p>
          <Button onClick={() => navigate('/anagrafica-clienti')}>Torna alla lista</Button>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title={cliente.nome_azienda}
      backAction={{ content: 'Clienti', onAction: () => navigate('/anagrafica-clienti') }}
      secondaryActions={[
        {
          content: 'Elimina Cliente',
          onAction: () => setShowDeleteModal(true),
          destructive: true,
          icon: DeleteIcon
        }
      ]}
    >
      <Layout>
        {/* INFORMAZIONI GENERALI */}
        <Layout.Section>
          <LegacyCard title="Informazioni Cliente" sectioned>
            <BlockStack gap="400">
                <Grid>
                    <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 4, lg: 6, xl: 6}}>
                        <BlockStack gap="100">
                            <Text variant="headingSm" as="h6">Contatti</Text>
                            <Text variant="bodyMd" as="p">{cliente.contatti?.email || '-'}</Text>
                            <Text variant="bodyMd" as="p">{cliente.contatti?.telefono || '-'}</Text>
                        </BlockStack>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 6, lg: 6, xl: 6}}>
                        <BlockStack gap="100">
                            <Text variant="headingSm" as="h6">Note</Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                                {cliente.note || 'Nessuna nota presente.'}
                            </Text>
                        </BlockStack>
                    </Grid.Cell>
                </Grid>
                <Divider />
                <Text variant="bodySm" as="p" tone="subdued">
                    Registrato il {new Date(cliente.created_at).toLocaleDateString()}
                </Text>
            </BlockStack>
          </LegacyCard>
        </Layout.Section>

        {/* INTEGRAZIONE SHOPIFY */}
        <Layout.Section>
          <LegacyCard 
            title="Shopify Store" 
            actions={[
                {
                    content: testingConnection ? 'Test in corso...' : 'Test Connessione', 
                    onAction: handleTestConnection, 
                    disabled: testingConnection
                }
            ]}
          >
            <LegacyCard.Section>
                {!shopifyConnected ? (
                    <Banner tone="warning" title="Shopify non connesso">
                        <p>Collega lo store Shopify per vedere le metriche e sincronizzare gli ordini.</p>
                        <Box paddingBlockStart="200">
                            <Button onClick={() => setShowShopifyModal(true)}>Connetti Ora</Button>
                        </Box>
                    </Banner>
                ) : (
                    <BlockStack gap="400">
                        <Banner tone="success" title="Connessione Attiva">
                            <p>Lo store è connesso e sincronizzato.</p>
                        </Banner>
                        
                        {shopifyMetrics && (
                            <Grid>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
                                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                        <BlockStack gap="200">
                                            <Text variant="headingSm" as="h6" tone="subdued">Revenue (30gg)</Text>
                                            <Text variant="headingLg" as="p">
                                                €{shopifyMetrics.total_revenue.toLocaleString()}
                                            </Text>
                                        </BlockStack>
                                    </Box>
                                </Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
                                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                        <BlockStack gap="200">
                                            <Text variant="headingSm" as="h6" tone="subdued">Ordini</Text>
                                            <Text variant="headingLg" as="p">
                                                {shopifyMetrics.total_orders}
                                            </Text>
                                        </BlockStack>
                                    </Box>
                                </Grid.Cell>
                                <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
                                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                        <BlockStack gap="200">
                                            <Text variant="headingSm" as="h6" tone="subdued">AOV</Text>
                                            <Text variant="headingLg" as="p">
                                                €{shopifyMetrics.average_order_value.toFixed(2)}
                                            </Text>
                                        </BlockStack>
                                    </Box>
                                </Grid.Cell>
                            </Grid>
                        )}
                    </BlockStack>
                )}
            </LegacyCard.Section>
          </LegacyCard>
        </Layout.Section>

        {/* MAGIC LINKS */}
        <Layout.Section>
            <LegacyCard 
                title="Link Installazione (Magic Links)" 
                actions={[{
                    content: creatingLink ? 'Generazione...' : 'Genera Link', 
                    onAction: handleCreateMagicLink, 
                    disabled: creatingLink
                }]}
            >
                {loadingLinks ? (
                    <Box padding="400"><Text as="p" tone="subdued">Caricamento...</Text></Box>
                ) : magicLinks.length === 0 ? (
                    <EmptyState
                        heading="Nessun link generato"
                        action={{content: 'Genera primo link', onAction: handleCreateMagicLink}}
                        image=""
                    >
                        <p>Genera un link sicuro da inviare al cliente per l'installazione dell'app.</p>
                    </EmptyState>
                ) : (
                    <Box>
                        {magicLinks.map((link, idx) => (
                            <Box key={link.id} padding="400" borderBlockStartWidth={idx > 0 ? '025' : '0'} borderColor="border">
                                <InlineStack align="space-between" blockAlign="center">
                                    <BlockStack gap="100">
                                        <InlineStack gap="200">
                                            <Badge tone={link.status === 'active' ? 'success' : 'critical'}>{link.status}</Badge>
                                            <Text variant="bodySm" as="span" tone="subdued">
                                                Scade: {new Date(link.expires_at).toLocaleDateString()}
                                            </Text>
                                        </InlineStack>
                                        <Text variant="bodyMd" as="p" truncate>
                                            {link.url}
                                        </Text>
                                    </BlockStack>
                                    <InlineStack gap="200">
                                        <Button 
                                            icon={ClipboardIcon} 
                                            onClick={() => {
                                                navigator.clipboard.writeText(link.url);
                                                toast.success("Copiato");
                                            }}
                                            accessibilityLabel="Copia"
                                        />
                                        {link.status === 'active' && (
                                            <Button 
                                                icon={DeleteIcon} 
                                                tone="critical" 
                                                onClick={() => handleRevokeLink(link.id)}
                                                accessibilityLabel="Revoca"
                                            />
                                        )}
                                    </InlineStack>
                                </InlineStack>
                            </Box>
                        ))}
                    </Box>
                )}
            </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* MODAL CONNECT */}
      <Modal
        open={showShopifyModal}
        onClose={() => setShowShopifyModal(false)}
        title="Connetti Shopify Store"
        primaryAction={{
            content: 'Connetti',
            onAction: handleConnectShopify,
            disabled: !shopName
        }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setShowShopifyModal(false) }]}
      >
        <Modal.Section>
            <BlockStack gap="400">
                <p>Inserisci il nome del tuo store Shopify (es. <code>mystore.myshopify.com</code>)</p>
                <TextField
                    label="Store URL"
                    value={shopName}
                    onChange={(val) => setShopName(val)}
                    autoComplete="off"
                    placeholder="mystore.myshopify.com"
                    prefix={<Icon source={StoreIcon} />}
                />
            </BlockStack>
        </Modal.Section>
      </Modal>

      {/* MODAL DELETE */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Elimina Cliente"
        primaryAction={{
            content: 'Elimina Definitivamente',
            onAction: handleDeleteCliente,
            destructive: true,
            loading: deleting // Modal actions support loading in recent versions, if not I'll handle in button
        }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setShowDeleteModal(false) }]}
      >
        <Modal.Section>
            <Banner tone="critical">
                <p>
                    Sei sicuro di voler eliminare <strong>{cliente?.nome_azienda}</strong>? 
                    Questa azione è irreversibile e cancellerà tutti i dati associati.
                </p>
            </Banner>
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default ClienteDetail;
