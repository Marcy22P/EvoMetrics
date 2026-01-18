import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Avatar,
  TextField,
  Select,
  Modal,
  FormLayout,
  Box,
  Tooltip,
  LegacyCard,
  List
} from '@shopify/polaris';
import {
  PlusIcon,
  EditIcon,
  CheckIcon,
  XIcon,
  LockIcon,
  FilterIcon
} from '@shopify/polaris-icons';
import { usersApi, type User } from '../services/usersApi';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';

const TeamCollaborators: React.FC = () => {
  // Data
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  
  // UI State
  const [queryValue, setQueryValue] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  
  // Selected User State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Form State
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', nome: '', cognome: '', job_title: '' });
  const [editUserForm, setEditUserForm] = useState<{ role: string, is_active: boolean, job_title: string }>({ role: 'user', is_active: true, job_title: '' });
  const [newPassword, setNewPassword] = useState('');

  const availableRoles = [
      'Project Manager',
      'Social Media Manager',
      'Copywriter',
      'Video Editor',
      'Media Buyer',
      'SEO Specialist',
      'Shopify Expert',
      'Fotografo',
      'Developer',
      'Admin',
      'Altro'
  ];

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (e: any) {
      toast.error(e.message || "Errore caricamento utenti");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    let result = users;
    
    // Search Filter
    if (queryValue) {
      const q = queryValue.toLowerCase();
      result = result.filter(u => 
        u.username.toLowerCase().includes(q) || 
        (u.nome && u.nome.toLowerCase().includes(q)) ||
        (u.cognome && u.cognome.toLowerCase().includes(q)) ||
        (u.google_email && u.google_email.toLowerCase().includes(q))
      );
    }
    
    return result;
  }, [users, queryValue]);

  // Handlers
  const handleCreateUser = async () => {
    try {
        await usersApi.createUser(newUser);
        toast.success("Utente creato con successo");
        setIsCreateModalOpen(false);
        setNewUser({ username: '', password: '', role: 'user', nome: '', cognome: '', job_title: '' });
        loadUsers();
    } catch (e: any) {
        toast.error(e.message);
    }
  };

  const handleUpdateUser = async () => {
      if (!selectedUser) return;
      try {
          await usersApi.updateUser(selectedUser.id, {
              role: editUserForm.role,
              is_active: editUserForm.is_active,
              job_title: editUserForm.job_title
          });
          
          toast.success("Utente aggiornato");
          setIsEditModalOpen(false);
          loadUsers();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleDeleteUser = async (user: User) => {
      if (!confirm(`Sei sicuro di voler eliminare ${user.username}?`)) return;
      try {
          await usersApi.deleteUser(user.id);
          toast.success("Utente eliminato");
          loadUsers();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleApproveUser = async (user: User) => {
      try {
          await usersApi.approveUser(user.id);
          toast.success("Utente approvato");
          loadUsers();
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleLoadPermissions = async (user: User) => {
      try {
          const res = await usersApi.getUserPermissions(user.id);
          setUserPermissions(res.permissions || {});
          setSelectedUser(user);
          setIsPermissionsModalOpen(true);
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  const handleSavePermissions = async () => {
      if (!selectedUser) return;
      try {
          await usersApi.updateUserPermissions(selectedUser.id, userPermissions);
          toast.success("Permessi aggiornati");
          setIsPermissionsModalOpen(false);
      } catch (e: any) {
          toast.error(e.message);
      }
  };
  
  const handleUpdatePassword = async () => {
      if (!selectedUser || !newPassword) return;
      if (newPassword.length < 8) return toast.error("La password deve essere almeno di 8 caratteri");
      
      try {
          await usersApi.updateUserPassword(selectedUser.id, newPassword);
          toast.success("Password aggiornata");
          setIsPasswordModalOpen(false);
          setNewPassword('');
      } catch (e: any) {
          toast.error(e.message);
      }
  };

  // Render Helpers
  const getRoleBadgeTone = (role: string) => {
      switch (role) {
          case 'superadmin': return 'critical';
          case 'admin': return 'warning';
          default: return 'info';
      }
  };

  const rowMarkup = filteredUsers.map((user, index) => (
      <IndexTable.Row id={user.id.toString()} key={user.id} position={index}>
          <IndexTable.Cell>
              <InlineStack gap="300" blockAlign="center">
                  <Avatar name={user.username} size="md" />
                  <BlockStack>
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                          {user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.username}
                      </Text>
                      {user.job_title && <Text as="span" variant="bodySm" tone="subdued">{user.job_title}</Text>}
                      {user.nome && user.cognome && (
                           <Text as="span" variant="bodySm" tone="subdued">@{user.username}</Text>
                      )}
                  </BlockStack>
              </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
              <Badge tone={getRoleBadgeTone(user.role) as any}>{user.role.toUpperCase()}</Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
              <Text as="span">{user.google_email || user.username}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
              {user.pending_approval ? (
                   <Badge tone="attention">IN ATTESA</Badge>
              ) : (
                   <Badge tone={user.is_active ? 'success' : 'info'}>{user.is_active ? 'ATTIVO' : 'DISATTIVO'}</Badge>
              )}
          </IndexTable.Cell>
          <IndexTable.Cell>
             <InlineStack gap="200">
                {user.pending_approval ? (
                    <>
                        <Tooltip content="Approva">
                            <Button icon={CheckIcon} tone="success" onClick={() => handleApproveUser(user)} />
                        </Tooltip>
                        <Tooltip content="Rifiuta/Elimina">
                             <Button icon={XIcon} tone="critical" onClick={() => handleDeleteUser(user)} />
                        </Tooltip>
                    </>
                ) : (
                    <>
                        <Button icon={EditIcon} onClick={() => {
                            setSelectedUser(user);
                            setEditUserForm({ role: user.role, is_active: user.is_active, job_title: user.job_title || '' });
                            setIsEditModalOpen(true);
                        }}>Dettagli</Button>
                        <Tooltip content="Permessi">
                            <Button icon={LockIcon} onClick={() => handleLoadPermissions(user)} />
                        </Tooltip>
                    </>
                )}
             </InlineStack>
          </IndexTable.Cell>
      </IndexTable.Row>
  ));
  
  const permissionGroups = [
      {
        title: 'Dashboard',
        perms: ['dashboard:read'],
      },
      {
        title: 'Gradimento',
        perms: ['gradimento:write', 'gradimento:read'],
      },
      {
        title: 'Preventivi',
        perms: ['preventivi:read', 'preventivi:write', 'preventivi:delete'],
      },
      {
        title: 'Contratti',
        perms: ['contratti:read', 'contratti:write', 'contratti:delete'],
      },
      {
        title: 'Pagamenti',
        perms: ['pagamenti:read', 'pagamenti:write'],
      },
      {
        title: 'Clienti',
        perms: ['clienti:read', 'clienti:write', 'clienti:delete'],
      },
      {
        title: 'Users',
        perms: ['users:read', 'users:write', 'users:update', 'users:delete', 'users:create'],
      },
      {
        title: 'Task',
        perms: ['task:read', 'task:write', 'task:delete'],
      }
  ];

  return (
    <Page
        title="Collaboratori"
        subtitle="Gestione utenti e permessi"
        primaryAction={
            <Button variant="primary" icon={PlusIcon} onClick={() => setIsCreateModalOpen(true)}>Nuovo Membro</Button>
        }
        fullWidth
    >
        <Layout>
            <Layout.Section>
                <Card padding="0">
                    <Box padding="400">
                        <TextField 
                            label="Cerca utente" 
                            value={queryValue} 
                            onChange={setQueryValue} 
                            autoComplete="off" 
                            prefix={<FilterIcon />}
                            placeholder="Nome, email, username..."
                            labelHidden
                        />
                    </Box>
                    <IndexTable
                        resourceName={{singular: 'utente', plural: 'utenti'}}
                        itemCount={filteredUsers.length}
                        headings={[
                            {title: 'Utente'},
                            {title: 'Ruolo'},
                            {title: 'Email'},
                            {title: 'Stato'},
                            {title: 'Azioni'}
                        ]}
                        selectable={false}
                        loading={loading}
                    >
                        {rowMarkup}
                    </IndexTable>
                </Card>
            </Layout.Section>
        </Layout>

        {/* CREATE MODAL */}
        <Modal
            open={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Nuovo Membro Team"
            primaryAction={{ content: 'Crea', onAction: handleCreateUser }}
            secondaryActions={[{ content: 'Annulla', onAction: () => setIsCreateModalOpen(false) }]}
        >
            <Modal.Section>
                <FormLayout>
                    <TextField label="Username" value={newUser.username} onChange={(v) => setNewUser({...newUser, username: v})} autoComplete="off" />
                    <FormLayout.Group>
                         <TextField label="Nome (Opzionale)" value={newUser.nome} onChange={(v) => setNewUser({...newUser, nome: v})} autoComplete="off" />
                         <TextField label="Cognome (Opzionale)" value={newUser.cognome} onChange={(v) => setNewUser({...newUser, cognome: v})} autoComplete="off" />
                    </FormLayout.Group>
                    <TextField 
                        label="Password (Opzionale)" 
                        type="password" 
                        value={newUser.password} 
                        onChange={(v) => setNewUser({...newUser, password: v})} 
                        autoComplete="new-password" 
                        helpText="Se vuota, l'utente potrà accedere solo con Google"
                    />
                    <Select
                        label="Ruolo"
                        options={['user', 'admin', 'superadmin']}
                        value={newUser.role}
                        onChange={(v) => setNewUser({...newUser, role: v})}
                    />
                </FormLayout>
            </Modal.Section>
        </Modal>

        {/* EDIT MODAL */}
        <Modal
            open={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            title={`Modifica ${selectedUser?.username}`}
            primaryAction={{ content: 'Salva', onAction: handleUpdateUser }}
        >
            <Modal.Section>
                <FormLayout>
                    <Select
                        label="Ruolo"
                        options={['user', 'admin', 'superadmin']}
                        value={editUserForm.role}
                        onChange={(v) => setEditUserForm({...editUserForm, role: v})}
                    />
                     <Select
                        label="Stato Account"
                        options={[{label: 'Attivo', value: 'true'}, {label: 'Disattivato', value: 'false'}]}
                        value={String(editUserForm.is_active)}
                        onChange={(v) => setEditUserForm({...editUserForm, is_active: v === 'true'})}
                    />
                    
                    <Select
                        label="Ruolo Operativo"
                        options={[{label: 'Nessuno', value: ''}, ...availableRoles.map(r => ({label: r, value: r}))]}
                        value={editUserForm.job_title}
                        onChange={(v) => setEditUserForm({...editUserForm, job_title: v})}
                    />
                    
                    <Box paddingBlockStart="400">
                        <Button onClick={() => setIsPasswordModalOpen(true)}>Reimposta Password</Button>
                    </Box>

                    {selectedUser && (
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">Dettagli Utente</Text>
                            <List>
                                <List.Item>ID: {selectedUser.id}</List.Item>
                                <List.Item>Creato il: {format(new Date(selectedUser.created_at), 'dd MMM yyyy', {locale: it})}</List.Item>
                                <List.Item>Google ID: {selectedUser.google_id ? 'Collegato ✅' : 'Non collegato'}</List.Item>
                            </List>
                        </BlockStack>
                    )}
                </FormLayout>
            </Modal.Section>
        </Modal>

        {/* PERMISSIONS MODAL */}
        <Modal
            open={isPermissionsModalOpen}
            onClose={() => setIsPermissionsModalOpen(false)}
            title={`Permessi di ${selectedUser?.username}`}
            primaryAction={{ content: 'Salva Permessi', onAction: handleSavePermissions }}
            size="large"
        >
            <Modal.Section>
                 <div style={{ columns: '2 auto', gap: '20px' }}>
                    {permissionGroups.map(group => (
                        <Box key={group.title} paddingBlockEnd="400" >
                            <LegacyCard title={group.title} sectioned>
                                <BlockStack gap="200">
                                    {group.perms.map(perm => (
                                        <InlineStack key={perm} align="space-between">
                                            <Text as="span">{perm.split(':')[1].toUpperCase()}</Text>
                                            <input 
                                                type="checkbox" 
                                                checked={!!userPermissions[perm]} 
                                                onChange={() => setUserPermissions(prev => ({...prev, [perm]: !prev[perm]}))}
                                            />
                                        </InlineStack>
                                    ))}
                                </BlockStack>
                            </LegacyCard>
                        </Box>
                    ))}
                 </div>
            </Modal.Section>
        </Modal>
        
        {/* PASSWORD MODAL */}
        <Modal
            open={isPasswordModalOpen}
            onClose={() => setIsPasswordModalOpen(false)}
            title="Reimposta Password"
            primaryAction={{ content: 'Salva Nuova Password', onAction: handleUpdatePassword, disabled: newPassword.length < 8 }}
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

    </Page>
  );
};

export default TeamCollaborators;
