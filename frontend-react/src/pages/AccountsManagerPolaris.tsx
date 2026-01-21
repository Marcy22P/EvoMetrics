import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Box,
  TextField,
  Modal,
  DataTable,
  Select,
  Spinner,
  Banner,
  EmptyState,
  Checkbox,
  Divider,
  ButtonGroup
} from '@shopify/polaris';
import { 
  PlusIcon, 
  RefreshIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import usersApi, { type User as UserType } from '../services/usersApi';
import { showToast } from '../utils/toast';

const ROLE_OPTIONS = [
  { label: 'User', value: 'user' },
  { label: 'Admin', value: 'admin' },
  { label: 'Superadmin', value: 'superadmin' },
];

const AccountsManager: React.FC = () => {
  const { user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modali
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  
  // State
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const [rejectionReason, setRejectionReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  
  // Form creazione
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'user',
  });

  // Carica utenti
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento utenti');
      showToast('Errore nel caricamento utenti', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && hasPermission('users:read')) {
      loadUsers();
    }
  }, [currentUser, hasPermission, loadUsers]);

  // Handlers
  const handleCreateUser = async () => {
    try {
      const userData = {
        ...newUser,
        password: newUser.password.trim() || undefined,
      };
      await usersApi.createUser(userData);
      showToast(
        userData.password 
          ? 'Utente creato. Accesso con username/password e Google OAuth.' 
          : 'Utente creato. Accesso solo tramite Google OAuth.',
        'success'
      );
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', role: 'user' });
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nella creazione utente', 'error');
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.updateUser(selectedUser.id, { role: newRole });
      showToast('Ruolo aggiornato', 'success');
      setShowRoleModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore aggiornamento ruolo', 'error');
    }
  };

  const handleUpdatePassword = async () => {
    if (!selectedUser || !newPassword) return;
    if (newPassword.length < 8) {
      showToast('Password minimo 8 caratteri', 'error');
      return;
    }
    try {
      await usersApi.updateUserPassword(selectedUser.id, newPassword);
      showToast('Password aggiornata', 'success');
      setShowPasswordModal(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Errore aggiornamento password', 'error');
    }
  };

  const handleToggleStatus = async (userId: number, currentStatus: boolean) => {
    try {
      await usersApi.updateUser(userId, { is_active: !currentStatus });
      showToast(`Utente ${!currentStatus ? 'attivato' : 'disattivato'}`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore aggiornamento stato', 'error');
    }
  };

  const handleLoadPermissions = async (user: UserType) => {
    try {
      const perms = await usersApi.getUserPermissions(user.id);
      setUserPermissions(perms.permissions || {});
      setSelectedUser(user);
      setShowPermissionsModal(true);
    } catch (err: any) {
      showToast(err.message || 'Errore caricamento permessi', 'error');
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.updateUserPermissions(selectedUser.id, userPermissions);
      showToast('Permessi aggiornati', 'success');
      setShowPermissionsModal(false);
      setSelectedUser(null);
    } catch (err: any) {
      showToast(err.message || 'Errore aggiornamento permessi', 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.deleteUser(selectedUser.id);
      showToast(`Utente ${selectedUser.username} eliminato`, 'success');
      setShowDeleteModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore eliminazione utente', 'error');
    }
  };

  const handleApproveUser = async (user: UserType) => {
    try {
      await usersApi.approveUser(user.id);
      showToast(`Utente ${user.username} approvato`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore approvazione', 'error');
    }
  };

  const handleRejectUser = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.rejectUser(selectedUser.id, rejectionReason || undefined);
      showToast(`Utente ${selectedUser.username} rifiutato`, 'success');
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore rifiuto', 'error');
    }
  };

  // Separare utenti
  const pendingUsers = users.filter(u => u.pending_approval === true);
  const activeUsers = users.filter(u => u.pending_approval !== true);

  // Helper
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getRoleTone = (role: string): 'warning' | 'info' | undefined => {
    switch (role) {
      case 'superadmin': return 'warning';
      case 'admin': return 'info';
      default: return undefined;
    }
  };

  // Permessi di default per collaboratori
  const defaultCollaboratorPerms: Record<string, boolean> = {
    'dashboard:read': true,
    'clienti:read': true,
    'sales:read': true,
    'team:read': true,
    'users:read': true,
    'gradimento:write': true,
    'gradimento:read': true,
    'task:read': true,
    'task:write': true,
    'calendar:read': true,
    'calendar:write': true,
    'settings:read': true,
  };

  const applyCollaboratorDefaults = () => {
    setUserPermissions(prev => ({
      ...prev,
      ...defaultCollaboratorPerms
    }));
    showToast('Permessi collaboratore applicati', 'success');
  };

  // Permessi disponibili - organizzati per area
  const permissionGroups = [
    {
      title: '⭐ Essenziali Collaboratore',
      perms: [
        { key: 'dashboard:read', label: 'Dashboard' },
        { key: 'users:read', label: 'Vedi Collaboratori' },
        { key: 'team:read', label: 'Visualizza Team' },
        { key: 'calendar:read', label: 'Calendario (Lettura)' },
        { key: 'calendar:write', label: 'Calendario (Scrittura)' },
        { key: 'settings:read', label: 'Impostazioni Profilo' },
      ],
    },
    {
      title: 'Finanza',
      perms: [
        { key: 'finanza:read', label: 'Situazione Finanziaria' },
        { key: 'finanza:write', label: 'Gestisci Movimenti' },
        { key: 'investimenti:read', label: 'Vedi Investimenti' },
        { key: 'investimenti:write', label: 'Gestisci Investimenti' },
      ],
    },
    {
      title: 'Clienti',
      perms: [
        { key: 'clienti:read', label: 'Visualizza' },
        { key: 'clienti:write', label: 'Crea / Modifica' },
        { key: 'clienti:delete', label: 'Elimina' },
      ],
    },
    {
      title: 'Sales Pipeline',
      perms: [
        { key: 'sales:read', label: 'Visualizza Lead' },
        { key: 'sales:write', label: 'Gestisci Lead' },
      ],
    },
    {
      title: 'Preventivi',
      perms: [
        { key: 'preventivi:read', label: 'Visualizza' },
        { key: 'preventivi:write', label: 'Crea / Modifica' },
        { key: 'preventivi:delete', label: 'Elimina' },
      ],
    },
    {
      title: 'Contratti',
      perms: [
        { key: 'contratti:read', label: 'Visualizza' },
        { key: 'contratti:write', label: 'Crea / Modifica' },
        { key: 'contratti:delete', label: 'Elimina' },
      ],
    },
    {
      title: 'Pagamenti',
      perms: [
        { key: 'pagamenti:read', label: 'Visualizza' },
        { key: 'pagamenti:write', label: 'Gestisci' },
      ],
    },
    {
      title: 'Team & Utenti',
      perms: [
        { key: 'team:write', label: 'Gestisci Team' },
        { key: 'users:write', label: 'Gestisci Collaboratori' },
      ],
    },
    {
      title: 'Gradimento',
      perms: [
        { key: 'gradimento:write', label: 'Compila Form' },
        { key: 'gradimento:read', label: 'Vedi Tutte le Risposte' },
      ],
    },
    {
      title: 'Task & Progetti',
      perms: [
        { key: 'task:read', label: 'Visualizza Task' },
        { key: 'task:write', label: 'Crea / Modifica Task' },
        { key: 'task:delete', label: 'Elimina Task' },
        { key: 'workflow:read', label: 'Visualizza Workflow' },
        { key: 'workflow:write', label: 'Gestisci Workflow' },
      ],
    },
    {
      title: 'Calendario',
      perms: [
        { key: 'calendar:read', label: 'Visualizza' },
        { key: 'calendar:write', label: 'Gestisci Eventi' },
      ],
    },
    {
      title: 'Analisi & Report',
      perms: [
        { key: 'analytics:read', label: 'Visualizza Analisi' },
      ],
    },
    {
      title: 'Impostazioni',
      perms: [
        { key: 'settings:read', label: 'Visualizza' },
        { key: 'settings:write', label: 'Modifica' },
      ],
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', width: '100%' }}>
        <BlockStack gap="400" align="center">
          <Spinner size="large" />
          <Text as="p" tone="subdued">Caricamento utenti...</Text>
        </BlockStack>
      </div>
    );
  }

  // Costruisci righe per DataTable
  const tableRows = activeUsers.map((user) => {
    const canEditRole = currentUser?.role === 'superadmin';
    const canSetPassword = currentUser?.role === 'superadmin' || 
      (currentUser?.role === 'admin' && user.role === 'user');
    const canDelete = currentUser?.id !== user.id;

    return [
      // Username
      user.username,
      // Ruolo
      <Badge key={`role-${user.id}`} tone={getRoleTone(user.role)}>
        {user.role.toUpperCase()}
      </Badge>,
      // Stato
      <Badge key={`status-${user.id}`} tone={user.is_active ? 'success' : 'critical'}>
        {user.is_active ? 'Attivo' : 'Inattivo'}
      </Badge>,
      // Data creazione
      formatDate(user.created_at),
      // Azioni
      hasPermission('users:update') ? (
        <ButtonGroup key={`actions-${user.id}`}>
          {canEditRole && (
            <Button
              size="slim"
              onClick={() => {
                setSelectedUser(user);
                setNewRole(user.role);
                setShowRoleModal(true);
              }}
            >
              Ruolo
            </Button>
          )}
          <Button
            size="slim"
            onClick={() => handleLoadPermissions(user)}
          >
            Permessi
          </Button>
          {canSetPassword && (
            <Button
              size="slim"
              onClick={() => {
                setSelectedUser(user);
                setNewPassword('');
                setShowPasswordModal(true);
              }}
            >
              Password
            </Button>
          )}
          <Button
            size="slim"
            tone={user.is_active ? 'critical' : undefined}
            onClick={() => handleToggleStatus(user.id, user.is_active)}
          >
            {user.is_active ? 'Disattiva' : 'Attiva'}
          </Button>
          {canDelete && (
            <Button
              size="slim"
              tone="critical"
              onClick={() => {
                setSelectedUser(user);
                setShowDeleteModal(true);
              }}
            >
              Elimina
            </Button>
          )}
        </ButtonGroup>
      ) : '-'
    ];
  });

  return (
    <BlockStack gap="500">
      {/* Header */}
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingLg" as="h2">Gestione Account</Text>
        <InlineStack gap="300">
          <Button icon={RefreshIcon} onClick={loadUsers}>Aggiorna</Button>
          {hasPermission('users:create') && (
            <Button variant="primary" icon={PlusIcon} onClick={() => setShowCreateModal(true)}>
              Nuovo Utente
            </Button>
          )}
        </InlineStack>
      </InlineStack>

      {error && (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          <p>{error}</p>
        </Banner>
      )}

      {/* Richieste in Attesa */}
      {pendingUsers.length > 0 && (
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h3">Richieste in Attesa</Text>
              <Badge tone="warning">{String(pendingUsers.length)}</Badge>
            </InlineStack>
            <Divider />
            <BlockStack gap="300">
              {pendingUsers.map(user => (
                <Box key={user.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="span" fontWeight="bold">{user.username}</Text>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {user.google_email || 'Email N/D'} • {formatDate(user.created_at)}
                      </Text>
                    </BlockStack>
                    <ButtonGroup>
                      <Button tone="success" onClick={() => handleApproveUser(user)}>
                        Approva
                      </Button>
                      <Button
                        tone="critical"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowRejectModal(true);
                        }}
                      >
                        Rifiuta
                      </Button>
                    </ButtonGroup>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>
      )}

      {/* Tabella Utenti */}
      {activeUsers.length === 0 ? (
        <Card>
          <EmptyState
            heading="Nessun utente"
            image=""
            action={hasPermission('users:create') ? {
              content: 'Crea Primo Utente',
              onAction: () => setShowCreateModal(true)
            } : undefined}
          >
            <p>Non ci sono utenti nel sistema.</p>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'text', 'text']}
            headings={['Username', 'Ruolo', 'Stato', 'Creato', 'Azioni']}
            rows={tableRows}
            hoverable
          />
        </Card>
      )}

      {/* Modal Crea Utente */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crea Nuovo Utente"
        primaryAction={{
          content: 'Crea Utente',
          onAction: handleCreateUser,
          disabled: !newUser.username.trim()
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setShowCreateModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Username"
              value={newUser.username}
              onChange={(v) => setNewUser(prev => ({ ...prev, username: v }))}
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="Password (Opzionale)"
              type="password"
              value={newUser.password}
              onChange={(v) => setNewUser(prev => ({ ...prev, password: v }))}
              autoComplete="new-password"
              helpText="Lascia vuoto per accesso solo Google OAuth"
            />
            <Select
              label="Ruolo"
              options={currentUser?.role === 'superadmin' ? ROLE_OPTIONS : [{ label: 'User', value: 'user' }]}
              value={newUser.role}
              onChange={(v) => setNewUser(prev => ({ ...prev, role: v }))}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Modal Modifica Ruolo */}
      <Modal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title={`Modifica Ruolo: ${selectedUser?.username}`}
        primaryAction={{
          content: 'Salva',
          onAction: handleUpdateRole
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setShowRoleModal(false)
        }]}
      >
        <Modal.Section>
          <Select
            label="Nuovo Ruolo"
            options={ROLE_OPTIONS}
            value={newRole}
            onChange={setNewRole}
          />
        </Modal.Section>
      </Modal>

      {/* Modal Password */}
      <Modal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title={`Imposta Password: ${selectedUser?.username}`}
        primaryAction={{
          content: 'Salva',
          onAction: handleUpdatePassword,
          disabled: newPassword.length < 8
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => {
            setShowPasswordModal(false);
            setNewPassword('');
          }
        }]}
      >
        <Modal.Section>
          <TextField
            label="Nuova Password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            helpText="Minimo 8 caratteri"
          />
        </Modal.Section>
      </Modal>

      {/* Modal Permessi */}
      <Modal
        open={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
        title={`Permessi: ${selectedUser?.username}`}
        primaryAction={{
          content: 'Salva Permessi',
          onAction: handleUpdatePermissions
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setShowPermissionsModal(false)
        }]}
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="500">
            {/* Pulsante per applicare permessi default collaboratore */}
            {selectedUser?.role === 'user' && (
              <Banner tone="info">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="span">Applica permessi standard per collaboratori</Text>
                  <Button onClick={applyCollaboratorDefaults}>
                    Applica Default
                  </Button>
                </InlineStack>
              </Banner>
            )}
            
            {permissionGroups.map((group, groupIndex) => (
              <Box 
                key={group.title} 
                padding="400" 
                background={groupIndex % 2 === 0 ? 'bg-surface-secondary' : undefined}
                borderRadius="200"
              >
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h4">{group.title}</Text>
                  <InlineStack gap="400" wrap>
                    {group.perms.map(perm => (
                      <div key={perm.key} style={{ minWidth: '150px' }}>
                        <Checkbox
                          label={perm.label}
                          checked={userPermissions[perm.key] || false}
                          onChange={(checked) => {
                            setUserPermissions(prev => ({
                              ...prev,
                              [perm.key]: checked
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </InlineStack>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Modal Elimina */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Conferma Eliminazione"
        primaryAction={{
          content: 'Elimina',
          onAction: handleDeleteUser,
          destructive: true
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setShowDeleteModal(false)
        }]}
      >
        <Modal.Section>
          <Banner tone="critical">
            <p>Eliminare definitivamente <strong>{selectedUser?.username}</strong>?</p>
            <p>Questa azione è irreversibile.</p>
          </Banner>
        </Modal.Section>
      </Modal>

      {/* Modal Rifiuta */}
      <Modal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Rifiuta Richiesta"
        primaryAction={{
          content: 'Rifiuta',
          onAction: handleRejectUser,
          destructive: true
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setShowRejectModal(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">Rifiutare la richiesta di <strong>{selectedUser?.username}</strong>?</Text>
            <TextField
              label="Motivo (opzionale)"
              value={rejectionReason}
              onChange={setRejectionReason}
              multiline={3}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
};

export default AccountsManager;
