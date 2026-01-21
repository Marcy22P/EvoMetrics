import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Badge,
  Divider,
  Box,
  Icon
} from '@shopify/polaris';
import {
  LockIcon,
  CalendarIcon,
  CheckIcon,
  XIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { getServiceUrl } from '../utils/apiConfig';
import toast from 'react-hot-toast';

const API_URL = getServiceUrl('user');

const UserSettings: React.FC = () => {
  const { user, token, verifyToken } = useAuth();
  
  // Profile State
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  // Calendar State
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Load user data
  useEffect(() => {
    if (user) {
      const u = user as any;
      setNome(u.nome || '');
      setCognome(u.cognome || '');
      setEmail(u.email || u.google_email || '');
      setCalendarConnected(!!u.is_google_calendar_connected);
    }
  }, [user]);

  // Save Profile
  const handleSaveProfile = async () => {
    if (!user?.id || !token) return;
    
    setProfileLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nome, cognome, email })
      });

      if (!response.ok) {
        throw new Error('Errore salvataggio profilo');
      }

      await verifyToken(token);
      toast.success('Profilo aggiornato!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProfileLoading(false);
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    if (!user?.id || !token) return;
    
    if (newPassword !== confirmPassword) {
      toast.error('Le password non coincidono');
      return;
    }
    
    if (newPassword.length < 8) {
      toast.error('La password deve essere almeno 8 caratteri');
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Errore cambio password');
      }

      toast.success('Password cambiata con successo!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  // Disconnect Calendar
  const handleDisconnectCalendar = async () => {
    if (!user?.id || !token) return;
    
    setCalendarLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}/disconnect-calendar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Errore disconnessione calendario');
      }

      setCalendarConnected(false);
      await verifyToken(token);
      toast.success('Calendario disconnesso!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCalendarLoading(false);
    }
  };

  // Connect Calendar
  const handleConnectCalendar = () => {
    const callbackUrl = `${window.location.origin}/calendario/callback`;
    window.location.href = `${API_URL}/api/google/calendar/auth?callback_url=${encodeURIComponent(callbackUrl)}`;
  };

  const initials = nome && cognome 
    ? `${nome[0]}${cognome[0]}`.toUpperCase() 
    : user?.username?.substring(0, 2).toUpperCase() || 'U';

  return (
    <Page title="Impostazioni Profilo" subtitle="Gestisci il tuo account e le tue preferenze">
      <Layout>
        {/* Profilo */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center">
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: 'white'
                }}>
                  {initials}
                </div>
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">Il Tuo Profilo</Text>
                  <Text as="span" tone="subdued">@{user?.username}</Text>
                  <Badge tone={user?.is_active ? 'success' : 'critical'}>
                    {user?.is_active ? 'Attivo' : 'Inattivo'}
                  </Badge>
                </BlockStack>
              </InlineStack>

              <Divider />

              <BlockStack gap="300">
                <TextField
                  label="Nome"
                  value={nome}
                  onChange={setNome}
                  autoComplete="given-name"
                />
                <TextField
                  label="Cognome"
                  value={cognome}
                  onChange={setCognome}
                  autoComplete="family-name"
                />
                <TextField
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  autoComplete="email"
                  disabled={!!(user as any)?.google_email}
                  helpText={(user as any)?.google_email ? 'Email collegata a Google' : undefined}
                />
              </BlockStack>

              <Button 
                variant="primary" 
                onClick={handleSaveProfile} 
                loading={profileLoading}
              >
                Salva Modifiche
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Cambio Password */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', display: 'inline-flex', flexShrink: 0 }}>
                  <Icon source={LockIcon} />
                </span>
                <Text as="h2" variant="headingMd">Cambia Password</Text>
              </div>

              <BlockStack gap="300">
                <TextField
                  label="Password Attuale"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  type="password"
                  autoComplete="current-password"
                />
                <TextField
                  label="Nuova Password"
                  value={newPassword}
                  onChange={setNewPassword}
                  type="password"
                  autoComplete="new-password"
                  helpText="Minimo 8 caratteri"
                />
                <TextField
                  label="Conferma Nuova Password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  type="password"
                  autoComplete="new-password"
                  error={confirmPassword && newPassword !== confirmPassword ? 'Le password non coincidono' : undefined}
                />
              </BlockStack>

              <Button 
                onClick={handleChangePassword} 
                loading={passwordLoading}
                disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}
              >
                Cambia Password
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Google Calendar */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', display: 'inline-flex', flexShrink: 0 }}>
                  <Icon source={CalendarIcon} />
                </span>
                <Text as="h2" variant="headingMd">Google Calendar</Text>
              </div>

              <Box padding="400" background={calendarConnected ? "bg-surface-success" : "bg-surface-secondary"} borderRadius="200">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '20px', height: '20px', display: 'inline-flex', flexShrink: 0 }}>
                    <Icon source={calendarConnected ? CheckIcon : XIcon} tone={calendarConnected ? "success" : "subdued"} />
                  </span>
                  <BlockStack gap="050">
                    <Text as="span" fontWeight="semibold">
                      {calendarConnected ? 'Calendario Collegato' : 'Calendario Non Collegato'}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {calendarConnected 
                        ? 'I tuoi eventi sono sincronizzati' 
                        : 'Collega per sincronizzare i tuoi eventi'
                      }
                    </Text>
                  </BlockStack>
                </div>
              </Box>

              {calendarConnected ? (
                <Button 
                  tone="critical"
                  onClick={handleDisconnectCalendar} 
                  loading={calendarLoading}
                >
                  Disconnetti Calendario
                </Button>
              ) : (
                <Button 
                  variant="primary"
                  onClick={handleConnectCalendar} 
                  loading={calendarLoading}
                >
                  Collega Google Calendar
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Info Account */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Informazioni Account</Text>
              <Divider />
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Ruolo</Text>
                <Badge>{user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Collaboratore'}</Badge>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Job Title</Text>
                <Text as="span">{(user as any)?.job_title || '-'}</Text>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Registrato il</Text>
                <Text as="span">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('it-IT') : '-'}
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default UserSettings;
