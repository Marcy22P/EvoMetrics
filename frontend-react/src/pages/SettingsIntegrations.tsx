import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Box,
  Spinner,
  Banner,
  Divider,
  Icon
} from '@shopify/polaris';
import { 
  RefreshIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  AlertTriangleIcon
} from '@shopify/polaris-icons';

interface ServiceInfo {
  status: 'online' | 'offline' | 'configured' | 'not_configured';
  type: 'internal' | 'external';
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  summary: string;
  services: Record<string, ServiceInfo>;
  environment: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

// Nomi leggibili per i servizi
const SERVICE_LABELS: Record<string, { name: string; description: string }> = {
  // Interni
  auth: { name: 'Autenticazione', description: 'Login e gestione sessioni' },
  users: { name: 'Utenti', description: 'Gestione account e permessi' },
  sales: { name: 'Sales Pipeline', description: 'Gestione lead e vendite' },
  productivity: { name: 'Produttività', description: 'Task e workflow' },
  clienti: { name: 'Clienti', description: 'Anagrafica clienti' },
  preventivi: { name: 'Preventivi', description: 'Gestione preventivi' },
  contratti: { name: 'Contratti', description: 'Gestione contratti' },
  pagamenti: { name: 'Pagamenti', description: 'Gestione pagamenti' },
  assessments: { name: 'Assessment', description: 'Form di valutazione' },
  gradimento: { name: 'Gradimento', description: 'Feedback settimanale' },
  email: { name: 'Email', description: 'Invio notifiche email' },
  mcp: { name: 'MCP', description: 'Model Context Protocol' },
  sibill: { name: 'Sibill', description: 'Categorizzazione bancaria' },
  shopify: { name: 'Shopify', description: 'Integrazione e-commerce' },
  database: { name: 'Database', description: 'PostgreSQL' },
  // Esterni
  google_drive: { name: 'Google Drive', description: 'Archiviazione documenti' },
  google_calendar: { name: 'Google Calendar', description: 'Sincronizzazione eventi' },
  clickfunnel: { name: 'ClickFunnel', description: 'Ricezione lead via webhook' },
};

const SettingsIntegrations: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/health/services`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: HealthResponse = await response.json();
      setHealthData(data);
      setLastCheck(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di connessione');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const getStatusBadge = (status: ServiceInfo['status']) => {
    switch (status) {
      case 'online':
        return <Badge tone="success">Online</Badge>;
      case 'offline':
        return <Badge tone="critical">Offline</Badge>;
      case 'configured':
        return <Badge tone="success">Configurato</Badge>;
      case 'not_configured':
        return <Badge tone="warning">Non configurato</Badge>;
      default:
        return <Badge>Sconosciuto</Badge>;
    }
  };

  const getStatusIcon = (status: ServiceInfo['status']) => {
    switch (status) {
      case 'online':
      case 'configured':
        return <Icon source={CheckCircleIcon} tone="success" />;
      case 'offline':
        return <Icon source={XCircleIcon} tone="critical" />;
      case 'not_configured':
        return <Icon source={AlertTriangleIcon} tone="warning" />;
      default:
        return <Icon source={ClockIcon} tone="subdued" />;
    }
  };

  const renderServiceRow = (key: string, info: ServiceInfo) => {
    const labels = SERVICE_LABELS[key] || { name: key, description: '' };
    
    return (
      <Box 
        key={key} 
        padding="300" 
        background={info.status === 'offline' ? 'bg-surface-critical' : 'bg-surface-secondary'}
        borderRadius="200"
      >
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            {getStatusIcon(info.status)}
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">{labels.name}</Text>
              <Text as="span" variant="bodySm" tone="subdued">{labels.description}</Text>
            </BlockStack>
          </InlineStack>
          <InlineStack gap="200" blockAlign="center">
            {info.error && (
              <Text as="span" variant="bodySm" tone="critical">{info.error.substring(0, 30)}...</Text>
            )}
            {getStatusBadge(info.status)}
          </InlineStack>
        </InlineStack>
      </Box>
    );
  };

  if (isLoading && !healthData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', width: '100%' }}>
        <BlockStack gap="400" align="center">
          <Spinner size="large" />
          <Text as="p" tone="subdued">Verifica servizi in corso...</Text>
        </BlockStack>
      </div>
    );
  }

  const internalServices = healthData 
    ? Object.entries(healthData.services).filter(([_, info]) => info.type === 'internal')
    : [];
  const externalServices = healthData 
    ? Object.entries(healthData.services).filter(([_, info]) => info.type === 'external')
    : [];
  
  const onlineInternal = internalServices.filter(([_, info]) => info.status === 'online').length;
  const totalInternal = internalServices.length;

  return (
    <BlockStack gap="500">
      {/* Header */}
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text variant="headingLg" as="h2">Integrazioni</Text>
          <Text as="p" tone="subdued">
            Monitoraggio servizi backend e integrazioni esterne
          </Text>
        </BlockStack>
        <InlineStack gap="300" blockAlign="center">
          {lastCheck && (
            <Text as="span" variant="bodySm" tone="subdued">
              Ultimo check: {lastCheck.toLocaleTimeString('it-IT')}
            </Text>
          )}
          <Button 
            icon={RefreshIcon} 
            onClick={checkHealth}
            loading={isLoading}
          >
            Verifica
          </Button>
        </InlineStack>
      </InlineStack>

      {error && (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          <p>Errore durante la verifica: {error}</p>
        </Banner>
      )}

      {healthData && (
        <>
          {/* Summary */}
          <Banner tone={healthData.status === 'ok' ? 'success' : 'warning'}>
            <p>
              <strong>{onlineInternal}/{totalInternal}</strong> servizi interni online
              {healthData.status === 'degraded' && ' • Alcuni servizi potrebbero essere non disponibili'}
            </p>
          </Banner>

          {/* Servizi Interni */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h3">Servizi Backend</Text>
                <Badge tone="info">{`${onlineInternal}/${totalInternal}`}</Badge>
              </InlineStack>
              <Divider />
              <BlockStack gap="200">
                {internalServices.map(([key, info]) => renderServiceRow(key, info))}
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Servizi Esterni */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h3">Integrazioni Esterne</Text>
                <Badge tone="info">{`${externalServices.filter(([_, i]) => i.status === 'configured').length}/${externalServices.length}`}</Badge>
              </InlineStack>
              <Divider />
              <BlockStack gap="200">
                {externalServices.map(([key, info]) => renderServiceRow(key, info))}
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Info Configurazione */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">Ambiente</Text>
              <Divider />
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Ambiente</Text>
                  <Badge tone={healthData.environment === 'production' ? 'success' : 'attention'}>
                    {healthData.environment === 'production' ? 'Produzione' : 'Sviluppo'}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">ClickFunnel Webhook</Text>
                  <Text as="span" fontWeight="medium" variant="bodySm">
                    {`${window.location.origin}/webhook/clickfunnels`}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </>
      )}
    </BlockStack>
  );
};

export default SettingsIntegrations;
