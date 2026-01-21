import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  TextField,
  Box,
  InlineGrid,
  Divider,
  Icon,
  Spinner,
  EmptyState
} from '@shopify/polaris';
import {
  SearchIcon,
  EmailIcon,
  CalendarIcon
} from '@shopify/polaris-icons';
import { usersApi, type User } from '../services/usersApi';

// Colori per job titles
const JOB_COLORS: Record<string, string> = {
  'Project Manager': '#f59e0b',
  'Social Media Manager': '#ec4899',
  'Copywriter': '#10b981',
  'Video Editor': '#6366f1',
  'Media Buyer': '#ef4444',
  'SEO Specialist': '#14b8a6',
  'Shopify Expert': '#84cc16',
  'Fotografo': '#f97316',
  'Developer': '#3b82f6',
  'Admin': '#8b5cf6',
};

// Card Collaboratore
const CollaboratorCard: React.FC<{ user: User }> = ({ user }) => {
  const initials = user.nome && user.cognome 
    ? `${user.nome[0]}${user.cognome[0]}`.toUpperCase()
    : user.username.substring(0, 2).toUpperCase();

  const fullName = user.nome && user.cognome 
    ? `${user.nome} ${user.cognome}` 
    : user.username;

  const jobColor = JOB_COLORS[user.job_title || ''] || '#64748b';

  return (
    <Card>
      <BlockStack gap="400">
        {/* Header con Avatar */}
        <InlineStack gap="400" blockAlign="center">
          <div style={{ 
            width: 56, 
            height: 56, 
            borderRadius: '50%', 
            background: `linear-gradient(135deg, ${jobColor}20, ${jobColor}40)`,
            border: `2px solid ${jobColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 'bold',
            color: jobColor
          }}>
            {initials}
          </div>
          <BlockStack gap="050">
            <Text as="span" variant="headingMd" fontWeight="bold">{fullName}</Text>
            <Text as="span" variant="bodySm" tone="subdued">@{user.username}</Text>
          </BlockStack>
        </InlineStack>

        <Divider />

        {/* Info */}
        <BlockStack gap="200">
          {user.job_title && (
            <InlineStack gap="200" blockAlign="center">
              <div style={{
                padding: '4px 12px',
                borderRadius: '16px',
                background: `${jobColor}15`,
                border: `1px solid ${jobColor}30`,
              }}>
                <Text as="span" variant="bodySm" fontWeight="medium" >
                  <span style={{ color: jobColor }}>{user.job_title}</span>
                </Text>
              </div>
            </InlineStack>
          )}

          {user.google_email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '16px', display: 'inline-flex', flexShrink: 0 }}>
                <Icon source={EmailIcon} tone="subdued" />
              </span>
              <Text as="span" variant="bodySm" tone="subdued">{user.google_email}</Text>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '16px', height: '16px', display: 'inline-flex', flexShrink: 0 }}>
              <Icon source={CalendarIcon} tone="subdued" />
            </span>
            <Text as="span" variant="bodySm" tone="subdued">
              Iscritto da {user.created_at ? new Date(user.created_at).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'N/D'}
            </Text>
          </div>
        </BlockStack>

        {/* Badge Ruolo e Stato */}
        <InlineStack gap="200">
          <Badge tone={user.role === 'admin' || user.role === 'superadmin' ? 'info' : undefined}>
            {user.role === 'superadmin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'Collaboratore'}
          </Badge>
          <Badge tone={user.is_active ? 'success' : 'critical'}>
            {user.is_active ? 'Attivo' : 'Inattivo'}
          </Badge>
        </InlineStack>
      </BlockStack>
    </Card>
  );
};

const TeamCollaboratorsView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.getUsers();
      // Mostra solo utenti attivi per i collaboratori
      setUsers(data.filter(u => u.is_active && !u.pending_approval));
    } catch (e: any) {
      console.error('Errore caricamento utenti:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    
    const q = searchQuery.toLowerCase();
    return users.filter(u => 
      u.username.toLowerCase().includes(q) || 
      (u.nome && u.nome.toLowerCase().includes(q)) ||
      (u.cognome && u.cognome.toLowerCase().includes(q)) ||
      (u.job_title && u.job_title.toLowerCase().includes(q)) ||
      (u.google_email && u.google_email.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const activeUsers = users.filter(u => u.is_active);
    const admins = activeUsers.filter(u => u.role === 'admin' || u.role === 'superadmin');
    const jobTitles = new Set(activeUsers.map(u => u.job_title).filter(Boolean));
    
    return {
      total: activeUsers.length,
      admins: admins.length,
      collaborators: activeUsers.length - admins.length,
      roles: jobTitles.size
    };
  }, [users]);

  if (loading) {
    return (
      <Page title="Collaboratori">
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="800">
                <BlockStack gap="400" align="center">
                  <Spinner size="large" />
                  <Text as="p" tone="subdued">Caricamento team...</Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page 
      title="Il Nostro Team"
      subtitle={`${stats.total} collaboratori attivi`}
    >
      <Layout>
        {/* Stats */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="100" align="center">
                <Text as="p" variant="heading2xl" alignment="center">{stats.total}</Text>
                <Text as="p" tone="subdued" alignment="center">Totale Team</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100" align="center">
                <Text as="p" variant="heading2xl" alignment="center">{stats.admins}</Text>
                <Text as="p" tone="subdued" alignment="center">Admin</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100" align="center">
                <Text as="p" variant="heading2xl" alignment="center">{stats.collaborators}</Text>
                <Text as="p" tone="subdued" alignment="center">Collaboratori</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100" align="center">
                <Text as="p" variant="heading2xl" alignment="center">{stats.roles}</Text>
                <Text as="p" tone="subdued" alignment="center">Ruoli</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Search */}
        <Layout.Section>
          <Card>
            <TextField
              label=""
              labelHidden
              placeholder="Cerca collaboratore per nome, ruolo o email..."
              value={searchQuery}
              onChange={setSearchQuery}
              prefix={<Icon source={SearchIcon} />}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setSearchQuery('')}
            />
          </Card>
        </Layout.Section>

        {/* Grid Collaboratori */}
        <Layout.Section>
          {filteredUsers.length > 0 ? (
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
              {filteredUsers.map(user => (
                <CollaboratorCard key={user.id} user={user} />
              ))}
            </InlineGrid>
          ) : (
            <Card>
              <EmptyState
                heading="Nessun collaboratore trovato"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" tone="subdued">
                  {searchQuery 
                    ? `Nessun risultato per "${searchQuery}"`
                    : 'Non ci sono collaboratori attivi al momento.'
                  }
                </Text>
              </EmptyState>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default TeamCollaboratorsView;
