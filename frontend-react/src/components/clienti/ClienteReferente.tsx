import React, { useState, useRef } from 'react';
import { LegacyCard, FormLayout, TextField, BlockStack, Button, InlineStack, Box, List, Text, Modal, Icon } from '@shopify/polaris';
import { UploadIcon, SearchIcon, NoteIcon } from '@shopify/polaris-icons';
import type { Referente } from '../../services/clientiApi';
import { clientiApi } from '../../services/clientiApi';
import { toast } from 'react-hot-toast';

interface ClienteReferenteProps {
  referente: Referente;
  documents: { preventivi: any[], contratti: any[], contratti_suggeriti?: any[] };
  onChange: (field: keyof Referente, value: string) => void;
  clienteId?: string;
  showDocuments?: boolean;
  onDocumentLinked?: () => void; // Callback per ricaricare i dati dopo il collegamento
}

const ClienteReferente: React.FC<ClienteReferenteProps> = ({ referente, documents, onChange, clienteId, showDocuments = true, onDocumentLinked }) => {
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  
  // File refs for hidden inputs
  const prevFileRef = useRef<HTMLInputElement>(null);
  const contrFileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'preventivo' | 'contratto') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Update filename in UI
    onChange(type === 'preventivo' ? 'file_preventivo' : 'file_contratto', file.name);

    // Call backend analysis
    try {
        setAnalyzingFile(true);
        const result = await clientiApi.analyzeDocument(file);
        
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(`Analisi completata: Valore stimato €${result.value}`);
            // Note: we don't automatically update a value field here anymore as per requirements, 
            // but we show the result. User can manually add it to deal history if they want.
        }
    } catch (err: any) {
        console.error(err);
        toast.error('Errore durante l\'analisi del file');
    } finally {
        setAnalyzingFile(false);
        // Reset input
        e.target.value = '';
    }
  };

  const triggerFileSelect = (type: 'preventivo' | 'contratto') => {
    if (type === 'preventivo') prevFileRef.current?.click();
    else contrFileRef.current?.click();
  };

  const handleLinkDocument = async (doc: any) => {
      try {
          if (doc.type === 'contratto' && clienteId && doc.id) {
              // Collega il contratto al cliente nel database
              await clientiApi.linkContrattoToCliente(doc.id, clienteId);
              toast.success(`Contratto #${doc.numero} collegato al cliente`);
              // Ricarica i dati per aggiornare la lista
              if (onDocumentLinked) onDocumentLinked();
          } else if (doc.type === 'preventivo') {
              // Per i preventivi, solo riferimento testuale per ora
              onChange('file_preventivo', `Preventivo #${doc.numero} (DB Link)`);
              toast.success('Preventivo collegato');
          } else {
              // Fallback per contratti senza clienteId
              onChange('file_contratto', `Contratto #${doc.numero} (DB Link)`);
              toast.success('Documento collegato');
          }
          setIsDbModalOpen(false);
      } catch (err: any) {
          console.error(err);
          toast.error(err.message || 'Errore nel collegamento del documento');
      }
  };

  return (
    <LegacyCard title="Info Referente" sectioned>
      <FormLayout>
        <FormLayout.Group>
          <TextField
            label="Nome"
            value={referente.nome || ''}
            onChange={(val) => onChange('nome', val)}
            autoComplete="given-name"
          />
          <TextField
            label="Cognome"
            value={referente.cognome || ''}
            onChange={(val) => onChange('cognome', val)}
            autoComplete="family-name"
          />
        </FormLayout.Group>

        <FormLayout.Group>
          <TextField
            label="Azienda"
            value={referente.azienda || ''}
            onChange={(val) => onChange('azienda', val)}
            autoComplete="organization"
          />
          <TextField
            label="E-mail"
            value={referente.email || ''}
            onChange={(val) => onChange('email', val)}
            autoComplete="email"
            type="email"
          />
        </FormLayout.Group>
        
        <TextField
          label="Telefono"
          value={referente.telefono || ''}
          onChange={(val) => onChange('telefono', val)}
          autoComplete="tel"
        />

        {/* Sezione Documenti - visibile solo se showDocuments è true */}
        {showDocuments && (
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingSm">Documenti Contrattuali</Text>
            <Button size="slim" icon={SearchIcon} onClick={() => setIsDbModalOpen(true)}>Cerca nel DB</Button>
          </InlineStack>
          
          <InlineStack gap="400">
             <div style={{flex: 1}}>
                 <input 
                    type="file" 
                    ref={prevFileRef} 
                    style={{display: 'none'}} 
                    accept=".pdf" 
                    onChange={(e) => handleFileSelect(e, 'preventivo')} 
                 />
                 <TextField 
                    label="Preventivo" 
                    value={referente.file_preventivo || ''} 
                    disabled 
                    autoComplete="off"
                    helpText="Carica PDF per analisi valore"
                    connectedRight={
                        <Button 
                            icon={UploadIcon} 
                            loading={analyzingFile}
                            onClick={() => triggerFileSelect('preventivo')}
                        >
                            Analizza
                        </Button>
                    }
                 />
             </div>
             <div style={{flex: 1}}>
                 <input 
                    type="file" 
                    ref={contrFileRef} 
                    style={{display: 'none'}} 
                    accept=".pdf" 
                    onChange={(e) => handleFileSelect(e, 'contratto')} 
                 />
                 <TextField 
                    label="Contratto" 
                    value={referente.file_contratto || ''} 
                    disabled 
                    autoComplete="off"
                    helpText="Carica PDF per analisi valore"
                    connectedRight={
                        <Button 
                            icon={UploadIcon} 
                            loading={analyzingFile}
                            onClick={() => triggerFileSelect('contratto')}
                        >
                            Analizza
                        </Button>
                    }
                 />
             </div>
          </InlineStack>
        </BlockStack>
        )}
      </FormLayout>

      {/* Modal Selezione Documenti da DB - visibile solo se showDocuments */}
      {showDocuments && (
      <Modal
        open={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
        title="Collega Documento dal Database"
        secondaryActions={[{content: 'Chiudi', onAction: () => setIsDbModalOpen(false)}]}
      >
        <Modal.Section>
            {/* Mostra i contratti suggeriti (non collegati) per il collegamento */}
            {(documents.preventivi.length > 0 || (documents.contratti_suggeriti && documents.contratti_suggeriti.length > 0)) ? (
                <BlockStack gap="400">
                    {documents.preventivi.length > 0 && (
                        <Box>
                            <Text as="h6" variant="headingXs">Preventivi Disponibili</Text>
                            <List>
                                {documents.preventivi.map(p => (
                                    <List.Item key={p.id}>
                                        <InlineStack gap="200" blockAlign="center">
                                            <span style={{flex: 1}}>Preventivo #{p.numero} - €{p.totale?.toLocaleString('it-IT')}</span>
                                            <Button size="slim" onClick={() => handleLinkDocument(p)}>Collega</Button>
                                        </InlineStack>
                                    </List.Item>
                                ))}
                            </List>
                        </Box>
                    )}
                    {documents.contratti_suggeriti && documents.contratti_suggeriti.length > 0 && (
                        <Box>
                            <Text as="h6" variant="headingXs">Contratti Disponibili (Match per Nome/Email)</Text>
                            <List>
                                {documents.contratti_suggeriti.map(c => (
                                    <List.Item key={c.id}>
                                        <InlineStack gap="200" blockAlign="center">
                                            <span style={{flex: 1}}>Contratto #{c.numero} - €{c.totale?.toLocaleString('it-IT')}</span>
                                            <Button size="slim" onClick={() => handleLinkDocument(c)}>Collega</Button>
                                        </InlineStack>
                                    </List.Item>
                                ))}
                            </List>
                        </Box>
                    )}
                </BlockStack>
            ) : (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200" align="center">
                        <Icon source={NoteIcon} tone="subdued" />
                        <Text as="p" tone="subdued" alignment="center">
                            Nessun documento disponibile per il collegamento.
                            {documents.contratti.length > 0 && " I contratti esistenti sono già collegati a questo cliente."}
                        </Text>
                    </BlockStack>
                </Box>
            )}
        </Modal.Section>
      </Modal>
      )}
    </LegacyCard>
  );
};

export default ClienteReferente;
