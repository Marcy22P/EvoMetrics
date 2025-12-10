import React from 'react';
import { LegacyCard, FormLayout, TextField, Button, BlockStack, InlineStack, Box, Text, Divider } from '@shopify/polaris';
import { DeleteIcon } from '@shopify/polaris-icons';
import type { Canale } from '../../services/clientiApi';

interface ClienteCanaliProps {
  canali: Canale[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, field: keyof Canale, value: string) => void;
}

const ClienteCanali: React.FC<ClienteCanaliProps> = ({ canali, onAdd, onRemove, onChange }) => {
  return (
    <LegacyCard title="Info Canali" sectioned actions={[{ content: 'Aggiungi Canale', onAction: onAdd }]}>
      {canali.length === 0 ? (
        <Text as="p" tone="subdued">Nessun canale aggiunto.</Text>
      ) : (
        <BlockStack gap="500">
          {canali.map((canale, index) => (
            <Box key={canale.id}>
              {index > 0 && <Box paddingBlockEnd="400"><Divider /></Box>}
              <BlockStack gap="300">
                <InlineStack align="space-between">
                   <Text variant="headingSm" as="h6">Canale {index + 1}</Text>
                   <Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => onRemove(canale.id)}>Rimuovi</Button>
                </InlineStack>
                <FormLayout>
                  <TextField
                    label="URL Sito"
                    value={canale.url_sito || ''}
                    onChange={(val) => onChange(canale.id, 'url_sito', val)}
                    autoComplete="off"
                    placeholder="https://..."
                  />
                  <FormLayout.Group>
                    <TextField
                      label="Nome Utente / Email"
                      value={canale.nome_utente || ''}
                      onChange={(val) => onChange(canale.id, 'nome_utente', val)}
                      autoComplete="off"
                    />
                    <TextField
                      label="Password"
                      value={canale.password || ''}
                      onChange={(val) => onChange(canale.id, 'password', val)}
                      autoComplete="off"
                      type="password"
                    />
                  </FormLayout.Group>
                  <TextField
                    label="Via Negozio (se fisico)"
                    value={canale.via_negozio || ''}
                    onChange={(val) => onChange(canale.id, 'via_negozio', val)}
                    autoComplete="off"
                  />
                </FormLayout>
              </BlockStack>
            </Box>
          ))}
        </BlockStack>
      )}
    </LegacyCard>
  );
};

export default ClienteCanali;
