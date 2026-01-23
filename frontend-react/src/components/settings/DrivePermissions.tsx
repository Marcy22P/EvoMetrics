import React, { useState, useEffect } from 'react';
import {
    Card, Text, BlockStack, InlineStack, Box, Button, Banner,
    IndexTable, Badge, Checkbox, Modal, Spinner, Select
} from '@shopify/polaris';
// Icons not needed - using emoji instead
import { getServiceUrl } from '../../utils/apiConfig';

interface FolderPermission {
    can_read: boolean;
    can_write: boolean;
    granted_at?: string;
    granted_by?: string;
}

interface UserPermissions {
    [folder_type: string]: FolderPermission;
}

interface AllPermissions {
    [user_id: string]: UserPermissions;
}

interface User {
    id: number;
    username: string;
    role: string;
}

const FOLDER_TYPES = ['procedure', 'contratti', 'preventivi'] as const;
const FOLDER_LABELS: Record<string, string> = {
    procedure: 'Procedure',
    contratti: 'Contratti',
    preventivi: 'Preventivi'
};

const DrivePermissions: React.FC = () => {
    const [permissions, setPermissions] = useState<AllPermissions>({});
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Modal per aggiungere permessi
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedFolder, setSelectedFolder] = useState<string>('procedure');
    const [canRead, setCanRead] = useState(true);
    const [canWrite, setCanWrite] = useState(false);

    const CLIENTI_SERVICE_URL = getServiceUrl('clienti');
    const USER_SERVICE_URL = getServiceUrl('users');

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('auth_token');

        try {
            // Fetch permessi
            const permRes = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/permissions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (permRes.ok) {
                const permData = await permRes.json();
                setPermissions(permData.permissions || {});
            }

            // Fetch utenti
            const usersRes = await fetch(`${USER_SERVICE_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (usersRes.ok) {
                const usersData = await usersRes.json();
                // La risposta è direttamente un array, non { users: [...] }
                const allUsers = Array.isArray(usersData) ? usersData : (usersData.users || []);
                // Filtra solo utenti non-admin (gli admin hanno già tutti i permessi)
                const nonAdminUsers = allUsers.filter(
                    (u: User) => u.role !== 'admin' && u.role !== 'superadmin'
                );
                setUsers(nonAdminUsers);
            }
        } catch (e) {
            console.error('Error fetching drive permissions:', e);
            setError('Errore caricamento permessi');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleTogglePermission = async (userId: string, folderType: string, field: 'can_read' | 'can_write', currentValue: boolean) => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        const token = localStorage.getItem('auth_token');

        const currentPerms = permissions[userId]?.[folderType] || { can_read: false, can_write: false };
        const newPerms = {
            folder_type: folderType,
            can_read: field === 'can_read' ? !currentValue : currentPerms.can_read,
            can_write: field === 'can_write' ? !currentValue : currentPerms.can_write
        };

        // Se togli read, togli anche write
        if (field === 'can_read' && currentValue) {
            newPerms.can_write = false;
        }

        try {
            const res = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/permissions/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newPerms)
            });

            if (res.ok) {
                setSuccess('Permessi aggiornati');
                fetchData();
            } else {
                setError('Errore aggiornamento permessi');
            }
        } catch (e) {
            setError('Errore di rete');
        } finally {
            setSaving(false);
        }
    };

    const handleAddPermission = async () => {
        if (!selectedUserId) return;

        setSaving(true);
        setError(null);
        const token = localStorage.getItem('auth_token');

        try {
            const res = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/permissions/${selectedUserId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folder_type: selectedFolder,
                    can_read: canRead,
                    can_write: canWrite
                })
            });

            if (res.ok) {
                setSuccess('Permesso aggiunto');
                setIsModalOpen(false);
                setSelectedUserId('');
                fetchData();
            } else {
                setError('Errore aggiunta permesso');
            }
        } catch (e) {
            setError('Errore di rete');
        } finally {
            setSaving(false);
        }
    };

    const getUserName = (userId: string): string => {
        const user = users.find(u => String(u.id) === userId);
        return user?.username || `Utente ${userId}`;
    };

    if (loading) {
        return (
            <Card>
                <Box padding="600">
                    <InlineStack align="center">
                        <Spinner />
                    </InlineStack>
                </Box>
            </Card>
        );
    }

    // Prepara righe per la tabella
    const rows: Array<{ userId: string; username: string; permissions: UserPermissions }> = [];
    
    // Aggiungi utenti che hanno permessi
    Object.keys(permissions).forEach(userId => {
        rows.push({
            userId,
            username: getUserName(userId),
            permissions: permissions[userId]
        });
    });

    // Aggiungi utenti senza permessi
    users.forEach(user => {
        if (!permissions[String(user.id)]) {
            rows.push({
                userId: String(user.id),
                username: user.username,
                permissions: {}
            });
        }
    });

    const userOptions = users.map(u => ({
        label: u.username,
        value: String(u.id)
    }));

    const folderOptions = FOLDER_TYPES.map(f => ({
        label: FOLDER_LABELS[f],
        value: f
    }));

    return (
        <Card>
            <Box padding="400">
                <BlockStack gap="400">
                    <InlineStack align="space-between">
                        <Text as="h2" variant="headingMd">Permessi Cartelle Drive</Text>
                        <Button onClick={() => setIsModalOpen(true)} variant="primary">
                            Aggiungi Permesso
                        </Button>
                    </InlineStack>

                    <Banner tone="info">
                        <p>
                            Gli <strong>Admin</strong> hanno accesso completo a tutte le cartelle. 
                            Qui puoi gestire l'accesso per i <strong>collaboratori</strong> alle cartelle 
                            Procedure, Contratti e Preventivi. Le cartelle dei clienti sono automaticamente 
                            visibili quando un cliente viene assegnato.
                        </p>
                    </Banner>

                    {error && (
                        <Banner tone="critical" onDismiss={() => setError(null)}>
                            <p>{error}</p>
                        </Banner>
                    )}

                    {success && (
                        <Banner tone="success" onDismiss={() => setSuccess(null)}>
                            <p>{success}</p>
                        </Banner>
                    )}

                    {rows.length === 0 ? (
                        <Banner tone="warning">
                            <p>Nessun collaboratore trovato. Aggiungi utenti con ruolo "user" per gestire i permessi.</p>
                        </Banner>
                    ) : (
                        <IndexTable
                            resourceName={{ singular: 'utente', plural: 'utenti' }}
                            itemCount={rows.length}
                            headings={[
                                { title: 'Utente' },
                                { title: 'Procedure' },
                                { title: 'Contratti' },
                                { title: 'Preventivi' },
                            ]}
                            selectable={false}
                        >
                            {rows.map((row, index) => (
                                <IndexTable.Row id={row.userId} key={row.userId} position={index}>
                                    <IndexTable.Cell>
                                        <InlineStack gap="200" align="center">
                                            <div style={{ minWidth: '20px' }}>
                                                <span style={{ color: '#5C6AC4' }}>👤</span>
                                            </div>
                                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                                                {row.username}
                                            </Text>
                                        </InlineStack>
                                    </IndexTable.Cell>
                                    {FOLDER_TYPES.map(folderType => {
                                        const perms = row.permissions[folderType] || { can_read: false, can_write: false };
                                        return (
                                            <IndexTable.Cell key={folderType}>
                                                <InlineStack gap="200">
                                                    <Checkbox
                                                        label="Leggi"
                                                        labelHidden
                                                        checked={perms.can_read}
                                                        onChange={() => handleTogglePermission(row.userId, folderType, 'can_read', perms.can_read)}
                                                        disabled={saving}
                                                    />
                                                    <Badge tone={perms.can_read ? 'success' : 'new'}>
                                                        {perms.can_read ? 'Leggi' : '-'}
                                                    </Badge>
                                                    <Checkbox
                                                        label="Scrivi"
                                                        labelHidden
                                                        checked={perms.can_write}
                                                        onChange={() => handleTogglePermission(row.userId, folderType, 'can_write', perms.can_write)}
                                                        disabled={saving || !perms.can_read}
                                                    />
                                                    <Badge tone={perms.can_write ? 'attention' : 'new'}>
                                                        {perms.can_write ? 'Scrivi' : '-'}
                                                    </Badge>
                                                </InlineStack>
                                            </IndexTable.Cell>
                                        );
                                    })}
                                </IndexTable.Row>
                            ))}
                        </IndexTable>
                    )}
                </BlockStack>
            </Box>

            <Modal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Aggiungi Permesso Drive"
                primaryAction={{
                    content: 'Aggiungi',
                    onAction: handleAddPermission,
                    loading: saving,
                    disabled: !selectedUserId
                }}
                secondaryActions={[{
                    content: 'Annulla',
                    onAction: () => setIsModalOpen(false)
                }]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <Select
                            label="Utente"
                            options={[{ label: 'Seleziona utente...', value: '' }, ...userOptions]}
                            value={selectedUserId}
                            onChange={setSelectedUserId}
                        />
                        <Select
                            label="Cartella"
                            options={folderOptions}
                            value={selectedFolder}
                            onChange={setSelectedFolder}
                        />
                        <InlineStack gap="400">
                            <Checkbox
                                label="Lettura"
                                checked={canRead}
                                onChange={setCanRead}
                            />
                            <Checkbox
                                label="Scrittura"
                                checked={canWrite}
                                onChange={setCanWrite}
                                disabled={!canRead}
                            />
                        </InlineStack>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Card>
    );
};

export default DrivePermissions;
