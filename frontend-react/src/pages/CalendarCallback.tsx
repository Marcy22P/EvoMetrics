import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  Text,
  Spinner,
  Banner,
  Button,
  InlineStack,
  Icon,
} from '@shopify/polaris';
import { CheckCircleIcon, XCircleIcon } from '@shopify/polaris-icons';
import { calendarApi } from '../services/calendarApi';

const CalendarCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [calendarEmail, setCalendarEmail] = useState('');
  
  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state'); // user_id
      const error = searchParams.get('error');
      
      if (error) {
        setStatus('error');
        setErrorMessage(error === 'access_denied' 
          ? 'Autorizzazione negata. Non hai concesso i permessi richiesti.'
          : `Errore: ${error}`
        );
        return;
      }
      
      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Parametri mancanti nella risposta di Google.');
        return;
      }
      
      try {
        const redirectUri = `${window.location.origin}/calendario/callback`;
        const result = await calendarApi.completeAuth(code, redirectUri);
        
        if (result.success) {
          setStatus('success');
          setCalendarEmail(result.calendar_email || '');
        } else {
          throw new Error('Collegamento non riuscito');
        }
      } catch (e: any) {
        setStatus('error');
        setErrorMessage(e.message || 'Errore durante il collegamento');
      }
    };
    
    handleCallback();
  }, [searchParams]);
  
  const handleContinue = () => {
    // Torna alla pagina da cui era partito o al calendario
    const redirectPath = localStorage.getItem('calendar_oauth_redirect') || '/calendario';
    localStorage.removeItem('calendar_oauth_redirect');
    navigate(redirectPath);
  };
  
  return (
    <Page narrowWidth>
      <Card>
        <BlockStack gap="400" align="center">
          {status === 'loading' && (
            <>
              <Spinner size="large" />
              <Text as="p" variant="bodyMd" alignment="center">
                Collegamento in corso...
              </Text>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div style={{ color: '#34A853', fontSize: 48 }}>
                <Icon source={CheckCircleIcon} />
              </div>
              <BlockStack gap="200" align="center">
                <Text as="h2" variant="headingLg" alignment="center">
                  Calendario collegato!
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  Il tuo Google Calendar è stato collegato con successo.
                </Text>
                {calendarEmail && (
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    Account: {calendarEmail}
                  </Text>
                )}
              </BlockStack>
              <Button variant="primary" onClick={handleContinue}>
                Vai al Calendario
              </Button>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div style={{ color: '#EA4335', fontSize: 48 }}>
                <Icon source={XCircleIcon} />
              </div>
              <BlockStack gap="200" align="center">
                <Text as="h2" variant="headingLg" alignment="center">
                  Errore di collegamento
                </Text>
                <Banner tone="critical">
                  {errorMessage}
                </Banner>
              </BlockStack>
              <InlineStack gap="300">
                <Button onClick={() => navigate('/calendario')}>
                  Torna al Calendario
                </Button>
                <Button variant="primary" onClick={() => window.location.reload()}>
                  Riprova
                </Button>
              </InlineStack>
            </>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
};

export default CalendarCallback;
