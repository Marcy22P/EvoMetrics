import React, { useState } from 'react';
import { 
  LegacyCard, 
  TextField, 
  Button, 
  BlockStack, 
  InlineStack, 
  Text, 
  Box, 
  Icon,
  DropZone,
  Spinner,
  Badge
} from '@shopify/polaris';
import { 
  ExternalIcon,
  DeleteIcon,
  MicrophoneIcon,
  FileIcon
} from '@shopify/polaris-icons';
import type { Registrazione } from '../../services/clientiApi';
import { clientiApi } from '../../services/clientiApi';
import { toast } from 'react-hot-toast';

interface ClienteRecordingsProps {
  registrazioni: Registrazione[];
  onAdd: (registrazione: Registrazione) => void;
  onChange: (id: string, field: keyof Registrazione, value: string) => void;
  onRemove?: (id: string) => void;
  clienteId?: string;
}

const ClienteRecordings: React.FC<ClienteRecordingsProps> = ({ 
  registrazioni, 
  onAdd, 
  onChange, 
  onRemove,
  clienteId 
}) => {
  const [uploading, setUploading] = useState(false);

  const handleDropZoneDrop = async (_dropFiles: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      await handleFileUpload(acceptedFiles[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!clienteId) {
      toast.error('Salva prima il cliente per caricare file');
      return;
    }

    // Verifica che sia audio o video
    const isMedia = file.type.startsWith('audio/') || file.type.startsWith('video/');
    if (!isMedia) {
      toast.error('Solo file audio o video sono accettati');
      return;
    }

    try {
      setUploading(true);
      
      // Prima verifica se esiste la cartella "Registrazioni Appuntamenti"
      // Per semplicità, carichiamo direttamente nella cartella principale
      // In futuro si può creare una sottocartella
      const result = await clientiApi.uploadDriveFile(clienteId, file);
      
      if (result.id) {
        // Crea la registrazione
        const newRec: Registrazione = {
          id: Date.now().toString(),
          titolo: file.name.replace(/\.[^/.]+$/, ''), // Nome senza estensione
          data: new Date().toISOString().split('T')[0],
          url: result.webViewLink || '',
          drive_file_id: result.id,
          mime_type: file.type,
          durata: '' // TODO: Estrarre durata dal file
        };
        
        onAdd(newRec);
        toast.success('Registrazione caricata su Drive!');
      }
    } catch (err: any) {
      console.error('Upload recording error:', err);
      toast.error('Errore nel caricamento');
    } finally {
      setUploading(false);
    }
  };

  const getMediaIcon = (mimeType?: string) => {
    if (!mimeType) return FileIcon;
    if (mimeType.startsWith('video/')) return FileIcon; // Video icon
    if (mimeType.startsWith('audio/')) return MicrophoneIcon;
    return FileIcon;
  };

  const getMediaBadge = (mimeType?: string) => {
    if (!mimeType) return null;
    if (mimeType.startsWith('video/')) return <Badge tone="attention">Video</Badge>;
    if (mimeType.startsWith('audio/')) return <Badge tone="info">Audio</Badge>;
    return null;
  };

  return (
    <LegacyCard title="Registrazione Appuntamenti" sectioned>
      <BlockStack gap="400">
        {/* Upload Zone */}
        <DropZone 
          onDrop={handleDropZoneDrop} 
          accept="audio/*,video/*"
          type="file"
          allowMultiple={false}
        >
          {uploading ? (
            <Box padding="600">
              <InlineStack align="center" gap="200">
                <Spinner size="small" />
                <Text as="span">Caricamento su Drive...</Text>
              </InlineStack>
            </Box>
          ) : (
            <DropZone.FileUpload actionHint="o trascina file audio/video" />
          )}
        </DropZone>

        {/* Lista registrazioni */}
        {registrazioni.length === 0 ? (
          <Box padding="400" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200" align="center">
              <Icon source={MicrophoneIcon} tone="subdued" />
              <Text as="p" tone="subdued" alignment="center">
                Nessuna registrazione salvata. Carica file audio o video.
              </Text>
            </BlockStack>
          </Box>
        ) : (
          <BlockStack gap="300">
            {registrazioni.map((rec) => (
              <Box key={rec.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <div style={{ minWidth: '20px' }}>
                        <Icon source={getMediaIcon(rec.mime_type)} tone="base" />
                      </div>
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">{rec.titolo || 'Registrazione'}</Text>
                        <InlineStack gap="200">
                          {getMediaBadge(rec.mime_type)}
                          {rec.data && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              {new Date(rec.data).toLocaleDateString('it-IT')}
                            </Text>
                          )}
                          {rec.durata && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              Durata: {rec.durata}
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                    
                    <InlineStack gap="200">
                      {rec.url && (
                        <Button 
                          icon={ExternalIcon} 
                          size="slim"
                          onClick={() => window.open(rec.url, '_blank')}
                        >
                          Apri
                        </Button>
                      )}
                      {onRemove && (
                        <Button 
                          icon={DeleteIcon} 
                          tone="critical" 
                          variant="plain"
                          onClick={() => onRemove(rec.id)}
                        />
                      )}
                    </InlineStack>
                  </InlineStack>
                  
                  {/* Modifica titolo inline */}
                  <TextField
                    label="Titolo/Note"
                    labelHidden
                    value={rec.titolo || ''}
                    onChange={(val) => onChange(rec.id, 'titolo', val)}
                    autoComplete="off"
                    placeholder="Aggiungi titolo o note..."
                  />
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </LegacyCard>
  );
};

export default ClienteRecordings;
