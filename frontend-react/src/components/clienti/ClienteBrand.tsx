import React, { useState } from 'react';
import { LegacyCard, FormLayout, TextField, Grid, BlockStack, Button, InlineStack, Box, Spinner, Text, DropZone } from '@shopify/polaris';
import { DeleteIcon } from '@shopify/polaris-icons';
import type { BrandManual } from '../../services/clientiApi';
import { clientiApi } from '../../services/clientiApi';
import { toast } from 'react-hot-toast';

interface ClienteBrandProps {
  brand: BrandManual;
  onChange: (field: keyof BrandManual, value: string) => void;
  clienteId?: string;
}

const ColorPicker: React.FC<{ label: string; value: string; onChange: (val: string) => void }> = ({ label, value, onChange }) => (
  <BlockStack gap="100">
    <span className="Polaris-Text--root Polaris-Text--bodyMd">{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input 
        type="color" 
        value={value || '#000000'} 
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '40px', height: '40px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '4px' }} 
      />
      <TextField label={label} labelHidden value={value} onChange={onChange} autoComplete="off" />
    </div>
  </BlockStack>
);

const ClienteBrand: React.FC<ClienteBrandProps> = ({ brand, onChange, clienteId }) => {
  const [uploading, setUploading] = useState(false);

  const handleDropZoneDrop = (_dropFiles: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      handleLogoUpload(acceptedFiles[0]);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!clienteId) {
      toast.error('Salva prima il cliente per caricare il logo');
      return;
    }

    // Verifica che sia un'immagine
    if (!file.type.startsWith('image/')) {
      toast.error('Solo immagini sono accettate');
      return;
    }

    try {
      setUploading(true);
      
      // Carica su Drive nella cartella del cliente
      const result = await clientiApi.uploadDriveFile(clienteId, file);
      
      if (result.webViewLink) {
        // Converte il link Drive in un link diretto per l'immagine
        // Il formato webViewLink è: https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk
        // Lo convertiamo in: https://drive.google.com/uc?export=view&id=FILE_ID
        const fileIdMatch = result.webViewLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const directLink = fileIdMatch 
          ? `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`
          : result.webViewLink;
        
        onChange('logo', directLink);
        toast.success('Logo caricato su Drive!');
      }
    } catch (err: any) {
      console.error('Upload logo error:', err);
      toast.error('Errore nel caricamento del logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    onChange('logo', '');
    toast.success('Logo rimosso');
  };

  const validImageUrl = brand.logo && (
    brand.logo.startsWith('http://') || 
    brand.logo.startsWith('https://') ||
    brand.logo.startsWith('data:image/')
  );

  return (
    <LegacyCard title="Brand Manual" sectioned>
      <FormLayout>
        {/* Logo Section */}
        <BlockStack gap="300">
          <Text as="span" variant="headingSm">Logo</Text>
          
          {validImageUrl ? (
            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="400" blockAlign="center">
                  <div style={{ 
                    width: '80px', 
                    height: '80px', 
                    borderRadius: '8px', 
                    overflow: 'hidden',
                    border: '1px solid var(--p-color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fff'
                  }}>
                    <img 
                      src={brand.logo} 
                      alt="Logo Cliente" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '100%', 
                        objectFit: 'contain' 
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">Logo Caricato</Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Clicca per vedere su Drive
                    </Text>
                  </BlockStack>
                </InlineStack>
                <InlineStack gap="200">
                  <Button 
                    onClick={() => window.open(brand.logo, '_blank')}
                    size="slim"
                  >
                    Apri
                  </Button>
                  <Button 
                    icon={DeleteIcon} 
                    tone="critical" 
                    variant="plain"
                    onClick={handleRemoveLogo}
                  />
                </InlineStack>
              </InlineStack>
            </Box>
          ) : (
            <DropZone 
              onDrop={handleDropZoneDrop} 
              accept="image/*"
              type="image"
              allowMultiple={false}
            >
              {uploading ? (
                <Box padding="800">
                  <InlineStack align="center" gap="200">
                    <Spinner size="small" />
                    <Text as="span">Caricamento in corso...</Text>
                  </InlineStack>
                </Box>
              ) : (
                <DropZone.FileUpload actionHint="oppure trascina un'immagine" />
              )}
            </DropZone>
          )}
          
          {/* URL manuale */}
          <TextField
            label="URL Logo (manuale)"
            value={brand.logo || ''}
            onChange={(val) => onChange('logo', val)}
            autoComplete="off"
            helpText="Incolla un URL diretto o carica dal tuo computer"
          />
        </BlockStack>
        
        {/* Colori */}
        <BlockStack gap="200">
          <Text as="span" variant="headingSm">Palette Colori</Text>
          <Grid>
            <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
              <ColorPicker label="Principale" value={brand.colore_principale || ''} onChange={(val) => onChange('colore_principale', val)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
              <ColorPicker label="Secondario" value={brand.colore_secondario || ''} onChange={(val) => onChange('colore_secondario', val)} />
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 4, lg: 4, xl: 4}}>
              <ColorPicker label="Terziario" value={brand.colore_terziario || ''} onChange={(val) => onChange('colore_terziario', val)} />
            </Grid.Cell>
          </Grid>
          
          {/* Preview palette */}
          {(brand.colore_principale || brand.colore_secondario || brand.colore_terziario) && (
            <Box paddingBlockStart="200">
              <InlineStack gap="200">
                {brand.colore_principale && (
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    backgroundColor: brand.colore_principale, 
                    borderRadius: '8px',
                    border: '1px solid var(--p-color-border)'
                  }} />
                )}
                {brand.colore_secondario && (
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    backgroundColor: brand.colore_secondario, 
                    borderRadius: '8px',
                    border: '1px solid var(--p-color-border)'
                  }} />
                )}
                {brand.colore_terziario && (
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    backgroundColor: brand.colore_terziario, 
                    borderRadius: '8px',
                    border: '1px solid var(--p-color-border)'
                  }} />
                )}
              </InlineStack>
            </Box>
          )}
        </BlockStack>

        {/* Font */}
        <BlockStack gap="200">
          <Text as="span" variant="headingSm">Typography</Text>
          <FormLayout.Group>
            <TextField
              label="Font Titolo"
              value={brand.font_titolo || ''}
              onChange={(val) => onChange('font_titolo', val)}
              autoComplete="off"
              placeholder="es. Montserrat"
            />
            <TextField
              label="Font Sottotitolo"
              value={brand.font_sottotitolo || ''}
              onChange={(val) => onChange('font_sottotitolo', val)}
              autoComplete="off"
              placeholder="es. Open Sans"
            />
            <TextField
              label="Font Descrizioni"
              value={brand.font_descrizioni || ''}
              onChange={(val) => onChange('font_descrizioni', val)}
              autoComplete="off"
              placeholder="es. Roboto"
            />
          </FormLayout.Group>
        </BlockStack>
      </FormLayout>
    </LegacyCard>
  );
};

export default ClienteBrand;
