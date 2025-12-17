import React from 'react';
import { Page, Layout, Card, Text, BlockStack, Button, Box, InlineStack } from '@shopify/polaris';
import { ExternalIcon, LogoGoogleIcon } from '@shopify/polaris-icons';

const DrivePage: React.FC = () => {
    // URL Backend Clienti Service
    const CLIENTI_SERVICE_URL = import.meta.env.VITE_CLIENTI_SERVICE_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin);

    const handleConnectDrive = async () => {
        try {
            // Richiedi URL auth al backend (endpoint specifico per Drive)
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/google/login`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert("Errore generazione URL login");
            }
        } catch (e) {
            console.error(e);
            alert("Errore connessione backend");
        }
    };

    return (
        <Page title="Google Drive Aziendale" fullWidth>
            <Layout>
                <Layout.Section>
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <Card>
                            <Box padding="600">
                                <BlockStack gap="600" align="center">
                                    <div style={{ textAlign: 'center' }}>
                                        <Text as="h2" variant="headingLg" alignment="center">
                                            Gestione Documentale Centralizzata
                                        </Text>
                                        <Box paddingBlockStart="200">
                                            <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                                                Gestisci tutti i file aziendali in un'unica interfaccia integrata.
                                            </Text>
                                        </Box>
                                    </div>
                                    
                                    <BlockStack gap="400">
                                        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                            <BlockStack gap="200">
                                                <Text as="h3" variant="headingMd">Stato Connessione</Text>
                                                <Text as="p">
                                                    Per abilitare le funzionalità avanzate (navigazione deep, upload, creazione cartelle), 
                                                    è necessario connettere l'account Google Drive aziendale.
                                                </Text>
                                            </BlockStack>
                                        </Box>

                                        <InlineStack align="center" gap="400">
                                            <Button 
                                                variant="primary" 
                                                size="large"
                                                icon={LogoGoogleIcon} 
                                                onClick={handleConnectDrive}
                                            >
                                                Connetti Google Drive
                                            </Button>
                                            
                                            <Button 
                                                icon={ExternalIcon} 
                                                size="large"
                                                onClick={() => window.open('https://drive.google.com', '_blank')}
                                            >
                                                Apri Drive Esterno
                                            </Button>
                                        </InlineStack>
                                    </BlockStack>
                                </BlockStack>
                            </Box>
                        </Card>
                    </div>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default DrivePage;

