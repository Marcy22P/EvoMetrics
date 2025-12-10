import React, { useState } from 'react';
import { LegacyCard, TextField, Button, BlockStack, InlineStack, Text, Box } from '@shopify/polaris';
import { MicrophoneIcon, PlayIcon, PauseCircleIcon } from '@shopify/polaris-icons';
import type { Registrazione } from '../../services/clientiApi';

interface ClienteRecordingsProps {
  registrazioni: Registrazione[];
  onAdd: () => void;
  onChange: (id: string, field: keyof Registrazione, value: string) => void;
}

const ClienteRecordings: React.FC<ClienteRecordingsProps> = ({ registrazioni, onAdd, onChange }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);

  const togglePlay = (id: string) => {
      if (playingId === id) {
          setPlayingId(null);
      } else {
          setPlayingId(id);
      }
  };

  return (
    <LegacyCard title="Registrazione Appuntamenti" sectioned actions={[{ content: 'Nuova Registrazione', onAction: onAdd }]}>
      {registrazioni.length === 0 ? (
        <Text as="p" tone="subdued">Nessuna registrazione salvata.</Text>
      ) : (
        <BlockStack gap="400">
          {registrazioni.map((rec) => (
            <Box key={rec.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="300">
                    <InlineStack gap="400" align="space-between" blockAlign="center">
                    <div style={{ flex: 1 }}>
                        <TextField
                        label="Titolo / Note"
                        value={rec.titolo || ''}
                        onChange={(val) => onChange(rec.id, 'titolo', val)}
                        autoComplete="off"
                        placeholder="Appuntamento del..."
                        labelHidden
                        />
                    </div>
                    <div style={{ width: '150px' }}>
                        <TextField
                        label="Data"
                        type="date"
                        value={rec.data || ''}
                        onChange={(val) => onChange(rec.id, 'data', val)}
                        autoComplete="off"
                        labelHidden
                        />
                    </div>
                    </InlineStack>
                    
                    <InlineStack gap="200" align="start" blockAlign="center">
                        <Button 
                            icon={playingId === rec.id ? PauseCircleIcon : PlayIcon} 
                            onClick={() => togglePlay(rec.id)}
                            tone={playingId === rec.id ? "critical" : undefined}
                        >
                            {playingId === rec.id ? 'Pausa' : 'Ascolta'}
                        </Button>
                        {playingId === rec.id && (
                            <Box paddingBlockStart="200" width="100%">
                                {/* Mock Waveform */}
                                <div style={{height: '4px', background: '#ccc', width: '200px', position: 'relative', borderRadius: '2px'}}>
                                    <div style={{
                                        position: 'absolute', 
                                        left: 0, 
                                        top: 0, 
                                        bottom: 0, 
                                        width: '50%', 
                                        background: 'var(--p-action-primary)',
                                        borderRadius: '2px',
                                        animation: 'progress 2s linear infinite'
                                    }} />
                                </div>
                                <Text as="span" variant="bodyXs" tone="subdued">00:34 / 01:15</Text>
                            </Box>
                        )}
                        <Button icon={MicrophoneIcon} variant="plain">Ri-registra</Button>
                    </InlineStack>
                </BlockStack>
            </Box>
          ))}
        </BlockStack>
      )}
    </LegacyCard>
  );
};

export default ClienteRecordings;
