import React from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Box
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import AccountsManager from './AccountsManagerPolaris';
import SettingsTasks from './SettingsTasks';
import SettingsIntegrations from './SettingsIntegrations';
import { useAuth } from '../hooks/useAuth';

interface SettingsProps {
  tab: 'accounts' | 'tasks' | 'integrations';
}

const Settings: React.FC<SettingsProps> = ({ tab }) => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  // Verifica permessi per la tab
  const canAccessAccounts = hasPermission('users:read');

  // Se non ha permessi per la tab corrente, redirect
  if (tab === 'accounts' && !canAccessAccounts) {
    return (
      <Page title="Impostazioni">
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="600">
                <BlockStack gap="200" align="center">
                  <Text variant="headingMd" as="h2">Accesso non autorizzato</Text>
                  <Text as="p" tone="subdued">Non hai i permessi per accedere a questa sezione.</Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const getTitle = () => {
    switch (tab) {
      case 'accounts': return 'Gestione Account';
      case 'tasks': return 'Categorie Task';
      case 'integrations': return 'Integrazioni';
      default: return 'Impostazioni';
    }
  };

  const renderContent = () => {
    switch (tab) {
      case 'accounts':
        return <AccountsManager />;
      case 'tasks':
        return <SettingsTasks embedded />;
      case 'integrations':
        return <SettingsIntegrations />;
      default:
        return null;
    }
  };

  return (
    <Page 
      title={getTitle()}
      backAction={{ content: 'Impostazioni', onAction: () => navigate('/impostazioni/accounts') }}
    >
      <Layout>
        <Layout.Section>
          {renderContent()}
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Settings;
