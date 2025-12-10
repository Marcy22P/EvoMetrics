import React from 'react';
import { LegacyCard, FormLayout, TextField, Grid, Text, Box, Select, BlockStack } from '@shopify/polaris';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Situazione } from '../../services/clientiApi';

interface ClienteStatsProps {
  situazioneInizio: Situazione;
  situazioneAttuale: Situazione;
  obiettivo: string;
  onInizioChange: (field: keyof Situazione, value: any) => void;
  onAttualeChange: (field: keyof Situazione, value: any) => void;
  onObiettivoChange: (val: string) => void;
}

const ClienteStats: React.FC<ClienteStatsProps> = ({ 
  situazioneInizio, 
  situazioneAttuale, 
  obiettivo, 
  onInizioChange, 
  onAttualeChange,
  onObiettivoChange 
}) => {
  
  const chartData = [
    { name: 'Inizio', fatturato: situazioneInizio.fatturato, adv: situazioneInizio.spesa_adv },
    { name: 'Attuale', fatturato: situazioneAttuale.fatturato, adv: situazioneAttuale.spesa_adv },
  ];

  return (
    <BlockStack gap="400">
      <LegacyCard title="Obiettivo Strategico" sectioned>
        <Select
          label="Obiettivo principale"
          options={[
            {label: 'Notorietà di marca/prodotto', value: 'notorieta'},
            {label: 'Considerazione di marca/prodotto', value: 'considerazione'},
            {label: 'Acquisizione Contatti/ Clienti', value: 'acquisizione'},
            {label: 'Profitto', value: 'profitto'},
            {label: 'Fidelizzazione del cliente', value: 'fidelizzazione'},
          ]}
          value={obiettivo}
          onChange={onObiettivoChange}
        />
      </LegacyCard>

      <Grid>
        {/* Situazione Inizio */}
        <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 6, lg: 6, xl: 6}}>
          <LegacyCard title="Situazione Inizio Commessa" sectioned>
            <FormLayout>
              <TextField
                label="Fatturato Cliente (€)"
                type="number"
                value={situazioneInizio.fatturato?.toString() || '0'}
                onChange={(val) => onInizioChange('fatturato', parseFloat(val))}
                autoComplete="off"
                helpText="Inserisci il fatturato del cliente all'inizio del rapporto (NON il valore del contratto)"
              />
              <TextField
                label="Spesa ADV Cliente (€)"
                type="number"
                value={situazioneInizio.spesa_adv?.toString() || '0'}
                onChange={(val) => onInizioChange('spesa_adv', parseFloat(val))}
                autoComplete="off"
                helpText="Budget investito dal cliente in advertising"
              />
              <TextField
                label="Grafico Statico (URL Immagine)"
                value={situazioneInizio.grafico_img || ''}
                onChange={(val) => onInizioChange('grafico_img', val)}
                autoComplete="off"
                placeholder="https://..."
              />
              {situazioneInizio.grafico_img && (
                <div style={{ padding: '8px', border: '1px solid #dfe3e8', borderRadius: '4px', marginTop: '8px' }}>
                  <img src={situazioneInizio.grafico_img} alt="Grafico Iniziale" style={{maxWidth: '100%', maxHeight: '200px'}} />
                </div>
              )}
            </FormLayout>
          </LegacyCard>
        </Grid.Cell>

        {/* Situazione Attuale */}
        <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 6, lg: 6, xl: 6}}>
          <LegacyCard title="Situazione Attuale" sectioned>
            <FormLayout>
              <TextField
                label="Fatturato Cliente (€)"
                type="number"
                value={situazioneAttuale.fatturato?.toString() || '0'}
                onChange={(val) => onAttualeChange('fatturato', parseFloat(val))}
                autoComplete="off"
                helpText="Fatturato aggiornato del cliente"
              />
              <TextField
                label="Spesa ADV Cliente (€)"
                type="number"
                value={situazioneAttuale.spesa_adv?.toString() || '0'}
                onChange={(val) => onAttualeChange('spesa_adv', parseFloat(val))}
                autoComplete="off"
                helpText="Budget attuale investito in advertising"
              />
              
              <Box paddingBlockStart="400" minHeight="200px">
                <Text as="h3" variant="headingSm">Confronto Performance</Text>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => `€${Number(value).toLocaleString()}`} />
                      <Bar dataKey="fatturato" fill="#8884d8" name="Fatturato" />
                      <Bar dataKey="adv" fill="#82ca9d" name="Spesa ADV" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Box>
            </FormLayout>
          </LegacyCard>
        </Grid.Cell>
      </Grid>
    </BlockStack>
  );
};

export default ClienteStats;
