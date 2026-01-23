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
  EmptyState,
  Modal,
  Select,
  Button,
  Banner
} from '@shopify/polaris';
import {
  SearchIcon,
  EmailIcon,
  CalendarIcon,
  EditIcon
} from '@shopify/polaris-icons';
import { usersApi, type User } from '../services/usersApi';
import { useAuth } from '../hooks/useAuth';

// Lista ruoli disponibili (matching con Workflow Builder)
const AVAILABLE_JOB_ROLES = [
  'Project Manager',
  'Social Media Manager',
  'Copywriter',
  'Video Editor',
  'Media Buyer',
  'SEO Specialist',
  'Shopify Expert',
  'Fotografo',
  'Content Creator',
  'Developer',
  'Sales Development Representative',
  'Account Manager',
  'Graphic Designer',
];

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
  'Content Creator': '#0ea5e9',
  'Sales Development Representative': '#22c55e',
  'Account Manager': '#a855f7',
  'Graphic Designer': '#f43f5e',
};

// Card Collaboratore
const CollaboratorCard: React.FC<{ 
  user: User; 
  isAdmin: boolean;
  onEditClick: (user: User) => void;
}> = ({ user, isAdmin, onEditClick }) => {
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
        <InlineStack gap="400" blockAlign="center" align="space-between">
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
          {isAdmin && (
            <Button 
              icon={EditIcon} 
              variant="plain" 
              onClick={() => onEditClick(user)}
              accessibilityLabel="Modifica ruolo"
            />
          )}
        </InlineStack>

        <Divider />

        {/* Info */}
        <BlockStack gap="200">
          {user.job_title ? (
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
          ) : isAdmin ? (
            <Button variant="plain" onClick={() => onEditClick(user)}>
              + Assegna ruolo
            </Button>
          ) : (
            <Text as="span" variant="bodySm" tone="subdued">Ruolo non assegnato</Text>
          )}

          {user.google_email && (
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <div style={{ minWidth: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon source={EmailIcon} tone="subdued" />
              </div>
              <Text as="span" variant="bodySm" tone="subdued">{user.google_email}</Text>
            </InlineStack>
          )}

          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <div style={{ minWidth: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon source={CalendarIcon} tone="subdued" />
            </div>
            <Text as="span" variant="bodySm" tone="subdued">
              Iscritto da {user.created_at ? new Date(user.created_at).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'N/D'}
            </Text>
          </InlineStack>
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
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal per assegnare ruolo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedJobTitle, setSelectedJobTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
  
  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setSelectedJobTitle(user.job_title || '');
    setIsModalOpen(true);
  };
  
  const handleSaveJobTitle = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      await usersApi.updateUser(selectedUser.id, { job_title: selectedJobTitle || undefined });
      setSuccessMessage(`Ruolo aggiornato per ${selectedUser.nome || selectedUser.username}`);
      setIsModalOpen(false);
      loadUsers();
      
      // Nascondi messaggio dopo 3 secondi
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error('Errore salvataggio ruolo:', e);
    } finally {
      setSaving(false);
    }
  };
  
  // Opzioni per il select del ruolo
  const jobTitleOptions = [
    { label: 'Nessun ruolo assegnato', value: '' },
    ...AVAILABLE_JOB_ROLES.map(role => ({ label: role, value: role }))
  ];

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
        {/* Success Banner */}
        {successMessage && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
              <p>{successMessage}</p>
            </Banner>
          </Layout.Section>
        )}
        
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
                <CollaboratorCard 
                  key={user.id} 
                  user={user} 
                  isAdmin={isAdmin}
                  onEditClick={handleEditClick}
                />
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
      
      {/* Modal Assegna Ruolo */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Assegna Ruolo a ${selectedUser?.nome || selectedUser?.username || ''}`}
        primaryAction={{
          content: 'Salva',
          onAction: handleSaveJobTitle,
          loading: saving
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setIsModalOpen(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Seleziona il ruolo lavorativo per questo collaboratore. Il ruolo determina 
              quali task vengono suggerite automaticamente quando si crea un workflow.
            </Text>
            <Select
              label="Ruolo Lavorativo"
              options={jobTitleOptions}
              value={selectedJobTitle}
              onChange={setSelectedJobTitle}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default TeamCollaboratorsView;
