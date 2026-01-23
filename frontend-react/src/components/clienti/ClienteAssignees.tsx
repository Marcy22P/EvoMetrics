import React, { useState, useEffect } from 'react';
import {
  LegacyCard,
  BlockStack,
  InlineStack,
  Text,
  Avatar,
  Button,
  Badge,
  Modal,
  Checkbox,
  Spinner,
  Banner
} from '@shopify/polaris';
import { PersonRemoveIcon } from '@shopify/polaris-icons';
import { clientiApi, type ClienteAssignee } from '../../services/clientiApi';
import { usersApi, type User } from '../../services/usersApi';
import { useAuth } from '../../hooks/useAuth';

interface ClienteAssigneesProps {
  clienteId: string;
}

const ClienteAssignees: React.FC<ClienteAssigneesProps> = ({ clienteId }) => {
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('admin') || hasPermission('users:write');
  
  const [assignees, setAssignees] = useState<ClienteAssignee[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAssignees();
  }, [clienteId]);

  const loadAssignees = async () => {
    try {
      setLoading(true);
      const response = await clientiApi.getClienteAssignees(clienteId);
      setAssignees(response.assignees);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openAssignModal = async () => {
    try {
      const users = await usersApi.getUsers();
      setAllUsers(users.filter(u => u.is_active));
      // Pre-seleziona gli utenti già assegnati
      const currentIds = new Set(assignees.map(a => a.user_id));
      setSelectedUserIds(currentIds);
      setIsModalOpen(true);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleSaveAssignees = async () => {
    try {
      setSaving(true);
      await clientiApi.setClienteAssignees(clienteId, Array.from(selectedUserIds));
      await loadAssignees();
      setIsModalOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignee = async (userId: string) => {
    if (!confirm('Rimuovere questo collaboratore dal cliente?')) return;
    try {
      await clientiApi.removeClienteAssignee(clienteId, userId);
      await loadAssignees();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const getDisplayName = (assignee: ClienteAssignee) => {
    if (assignee.nome && assignee.cognome) {
      return `${assignee.nome} ${assignee.cognome}`;
    }
    return assignee.username;
  };

  const getRoleBadge = (role: string) => {
    const tones: Record<string, 'info' | 'success' | 'attention' | 'warning'> = {
      admin: 'success',
      superadmin: 'success',
      user: 'info',
    };
    return <Badge tone={tones[role] || 'info'}>{role}</Badge>;
  };

  if (loading) {
    return (
      <LegacyCard title="Collaboratori Assegnati" sectioned>
        <InlineStack align="center">
          <Spinner size="small" />
        </InlineStack>
      </LegacyCard>
    );
  }

  return (
    <>
      <LegacyCard 
        title="Collaboratori Assegnati"
        sectioned
        actions={isAdmin ? [
          {
            content: 'Gestisci',
            onAction: openAssignModal
          }
        ] : []}
      >
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        
        {assignees.length === 0 ? (
          <BlockStack gap="200">
            <Text as="p" tone="subdued">
              Nessun collaboratore assegnato a questo cliente.
            </Text>
            {isAdmin && (
              <Text as="p" variant="bodySm" tone="subdued">
                Clicca "Gestisci" per assegnare collaboratori.
              </Text>
            )}
          </BlockStack>
        ) : (
          <BlockStack gap="300">
            {assignees.map(assignee => (
              <InlineStack key={assignee.id} align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center">
                  <Avatar 
                    size="sm" 
                    name={getDisplayName(assignee)}
                    initials={assignee.nome && assignee.cognome 
                      ? `${assignee.nome[0]}${assignee.cognome[0]}` 
                      : assignee.username[0].toUpperCase()
                    }
                  />
                  <BlockStack gap="050">
                    <Text as="span" fontWeight="semibold">{getDisplayName(assignee)}</Text>
                    <Text as="span" variant="bodySm" tone="subdued">@{assignee.username}</Text>
                  </BlockStack>
                  {getRoleBadge(assignee.role)}
                </InlineStack>
                {isAdmin && (
                  <Button 
                    icon={PersonRemoveIcon} 
                    tone="critical" 
                    variant="plain"
                    onClick={() => handleRemoveAssignee(assignee.user_id)}
                  />
                )}
              </InlineStack>
            ))}
          </BlockStack>
        )}
      </LegacyCard>

      {/* Modal per assegnare utenti */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assegna Collaboratori"
        primaryAction={{
          content: 'Salva',
          onAction: handleSaveAssignees,
          loading: saving
        }}
        secondaryActions={[{
          content: 'Annulla',
          onAction: () => setIsModalOpen(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Seleziona i collaboratori che potranno visualizzare e gestire questo cliente.
            </Banner>
            
            {allUsers.length === 0 ? (
              <Text as="p" tone="subdued">Nessun utente disponibile</Text>
            ) : (
              <BlockStack gap="200">
                {allUsers.map(u => (
                  <InlineStack key={u.id} gap="300" blockAlign="center">
                    <Checkbox
                      label=""
                      checked={selectedUserIds.has(String(u.id))}
                      onChange={() => handleToggleUser(String(u.id))}
                    />
                    <Avatar 
                      size="sm" 
                      name={u.nome && u.cognome ? `${u.nome} ${u.cognome}` : u.username}
                    />
                    <BlockStack gap="050">
                      <Text as="span" fontWeight="medium">
                        {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : u.username}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        @{u.username} • {u.role}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
};

export default ClienteAssignees;
