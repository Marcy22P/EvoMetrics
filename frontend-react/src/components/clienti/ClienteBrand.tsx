import React from 'react';
import { LegacyCard, FormLayout, TextField, Grid, BlockStack } from '@shopify/polaris';
import type { BrandManual } from '../../services/clientiApi';

interface ClienteBrandProps {
  brand: BrandManual;
  onChange: (field: keyof BrandManual, value: string) => void;
}

const ColorPicker: React.FC<{ label: string; value: string; onChange: (val: string) => void }> = ({ label, value, onChange }) => (
  <BlockStack gap="100">
    <span className="Polaris-Text--root Polaris-Text--bodyMd">{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input 
        type="color" 
        value={value || '#000000'} 
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '40px', height: '40px', padding: 0, border: 'none', cursor: 'pointer' }} 
      />
      <TextField label={label} labelHidden value={value} onChange={onChange} autoComplete="off" />
    </div>
  </BlockStack>
);

const ClienteBrand: React.FC<ClienteBrandProps> = ({ brand, onChange }) => {
  return (
    <LegacyCard title="Brand Manual" sectioned>
      <FormLayout>
        <TextField
          label="Logo URL"
          value={brand.logo || ''}
          onChange={(val) => onChange('logo', val)}
          autoComplete="off"
          helpText="Inserisci l'URL del logo o caricalo (funzionalità upload in arrivo)"
        />
        
        <BlockStack gap="200">
          <span className="Polaris-Text--root Polaris-Text--headingSm">Colori</span>
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
        </BlockStack>

        <BlockStack gap="200">
          <span className="Polaris-Text--root Polaris-Text--headingSm">Font</span>
          <FormLayout.Group>
            <TextField
              label="Titolo"
              value={brand.font_titolo || ''}
              onChange={(val) => onChange('font_titolo', val)}
              autoComplete="off"
            />
            <TextField
              label="Sottotitolo"
              value={brand.font_sottotitolo || ''}
              onChange={(val) => onChange('font_sottotitolo', val)}
              autoComplete="off"
            />
            <TextField
              label="Descrizioni"
              value={brand.font_descrizioni || ''}
              onChange={(val) => onChange('font_descrizioni', val)}
              autoComplete="off"
            />
          </FormLayout.Group>
        </BlockStack>
      </FormLayout>
    </LegacyCard>
  );
};

export default ClienteBrand;
