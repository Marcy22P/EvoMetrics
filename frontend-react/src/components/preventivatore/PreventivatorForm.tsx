import React, { useCallback } from 'react';
import {
  LegacyCard,
  FormLayout,
  TextField,
  Checkbox,
  Text,
  BlockStack,
  InlineStack,
  Divider,
  Box,
  Grid,
  Icon
} from '@shopify/polaris';
import {
  CalendarIcon,
  PersonIcon,
  NoteIcon,
  SettingsIcon,
  ClipboardIcon
} from '@shopify/polaris-icons';

import type { PreventivoData, Totali } from '../../types/preventivo';
import { SERVIZI_DATA } from '../../types/preventivo';
import { generateEcommerceDescription, generateVideoPostDescription, generateMetaAdsDescription, generateGoogleAdsDescription, generateSeoDescription, generateEmailMarketingDescription, generateDefaultTerminiCondizioni, calculateValiditaDate } from '../../utils/preventivoUtils';

interface PreventivatorFormProps {
  data: PreventivoData;
  onChange: (newData: Partial<PreventivoData>) => void;
  totali: Totali;
  onSave?: () => void;
  isModified?: boolean;
}

export const PreventivatorForm: React.FC<PreventivatorFormProps> = ({ 
  data, 
  onChange, 
  totali
}) => {
  
  const handleInputChange = useCallback((field: keyof PreventivoData, value: any) => {
    if (field === 'data' && value) {
      const nuovaValidita = calculateValiditaDate(value);
      const nuoviTermini = generateDefaultTerminiCondizioni(value);
      
      onChange({ 
        [field]: value,
        validita: nuovaValidita,
        terminiCondizioni: nuoviTermini
      });
    } else {
      onChange({ [field]: value });
    }
  }, [onChange]);

  const handleServizioToggle = useCallback((categoriaKey: string, servizioId: string) => {
    const serviziAttuali = data.servizi[categoriaKey as keyof typeof data.servizi] || [];
    const isCurrentlySelected = serviziAttuali.includes(servizioId);

    const nuoviServizi = isCurrentlySelected
      ? serviziAttuali.filter((id: string) => id !== servizioId)
      : [...serviziAttuali, servizioId];
    
    const newPrezzi = { ...data.prezzi };
    if (isCurrentlySelected) {
      delete newPrezzi[servizioId];
    }
    
    onChange({
      servizi: {
        ...data.servizi,
        [categoriaKey]: nuoviServizi
      },
      prezzi: newPrezzi
    });
  }, [data.servizi, data.prezzi, onChange]);

  const handlePrezzoChange = useCallback((servizioId: string, prezzo: string) => {
    const newPrezzi = {
      ...data.prezzi,
      [servizioId]: prezzo
    };
    onChange({
      prezzi: newPrezzi
    });
  }, [data.prezzi, onChange]);

  // Helper per descrizioni
  const hasServices = (key: string) => (data.servizi[key as keyof typeof data.servizi] || []).length > 0;
  
  const handleDescriptionChange = (field: keyof PreventivoData, value: string) => {
    onChange({ [field]: value });
  };

  // Generatori descrizioni di default
  const descriptions = {
      ecommerce: generateEcommerceDescription(data.servizi, data.prezzi),
      videoPost: generateVideoPostDescription(data.servizi, data.prezzi),
      metaAds: generateMetaAdsDescription(data.servizi, data.prezzi),
      googleAds: generateGoogleAdsDescription(data.servizi, data.prezzi),
      seo: generateSeoDescription(data.servizi, data.prezzi),
      emailMarketing: generateEmailMarketingDescription(data.servizi, data.prezzi)
  };

  return (
    <BlockStack gap="500">
      {/* Dati Generali */}
      <LegacyCard title="Dati Generali" sectioned>
        <FormLayout>
            <FormLayout.Group>
                <TextField
                    label="Numero Preventivo"
              value={data.numero}
                    onChange={(val) => handleInputChange('numero', val)}
                    autoComplete="off"
              placeholder="Es: PREV-2025-001"
                    prefix={<Icon source={ClipboardIcon} />}
                />
                <TextField
                    label="Cliente"
                    value={data.cliente}
                    onChange={(val) => handleInputChange('cliente', val)}
                    autoComplete="organization"
                    placeholder="Nome del cliente"
                    prefix={<Icon source={PersonIcon} />}
                />
            </FormLayout.Group>
            
            <FormLayout.Group>
                <TextField
                    label="Data Emissione"
              type="date"
              value={data.data}
                    onChange={(val) => handleInputChange('data', val)}
                    autoComplete="off"
                    prefix={<Icon source={CalendarIcon} />}
                    helpText="La validità viene ricalcolata automaticamente"
                />
                <TextField
                    label="Validità"
              type="date"
              value={data.validita}
                    onChange={(val) => handleInputChange('validita', val)}
                    autoComplete="off"
                    prefix={<Icon source={CalendarIcon} />}
                />
            </FormLayout.Group>

            <TextField
                label="Oggetto del Preventivo"
                value={data.oggetto}
                onChange={(val) => handleInputChange('oggetto', val)}
                multiline={2}
                autoComplete="off"
                placeholder="Descrivi brevemente il progetto..."
            />

            <TextField
                label="Tipologia di Intervento (Generale)"
            value={data.tipologiaIntervento || ''}
                onChange={(val) => handleInputChange('tipologiaIntervento', val)}
                multiline={3}
                autoComplete="off"
            placeholder="Es. Servizi digitali e consulenza specializzata"
            />
        </FormLayout>
      </LegacyCard>

      {/* Selezione Servizi */}
      <LegacyCard title="Selezione Servizi">
        {SERVIZI_DATA.map((categoria) => (
             <LegacyCard.Section key={categoria.id} title={categoria.nome}>
                 <Text variant="bodySm" tone="subdued" as="p">{categoria.descrizione}</Text>
                 <Box paddingBlockStart="400">
                     <Grid>
              {categoria.sottoservizi.map((sottoservizio) => {
                             const isSelected = data.servizi[categoria.id as keyof typeof data.servizi]?.includes(sottoservizio.id);
                const prezzo = data.prezzi[sottoservizio.id] || '';
                
                return (
                                 <Grid.Cell key={sottoservizio.id} columnSpan={{xs: 6, sm: 6, md: 6, lg: 6, xl: 6}}>
                                     <Box 
                                        background={isSelected ? "bg-surface-secondary" : "bg-surface"}  
                                        borderColor={isSelected ? "border-focus" : "border"}
                                        borderWidth={isSelected ? "050" : "025"}
                                        padding="400" 
                                        borderRadius="300"
                                        shadow={isSelected ? "200" : "0"}
                                     >
                                        <BlockStack gap="200">
                                            <Checkbox
                                                label={
                                                    <Text as="span" variant="bodyMd" fontWeight="bold" tone="base">
                                                        {sottoservizio.nome}
                                                    </Text>
                                                }
                                                checked={isSelected}
                                                onChange={() => handleServizioToggle(categoria.id, sottoservizio.id)}
                                            />
                                            <div style={{ paddingLeft: '28px' }}>
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                    {sottoservizio.descrizione}
                                                </Text>
                                            </div>
                                            {isSelected && (
                                                <div style={{ paddingLeft: '28px', marginTop: '8px' }}>
                                                    <TextField
                                                        label="Prezzo (€)"
                                                        type="number"
                                                        value={prezzo?.toString() || ''}
                                                        onChange={(val) => handlePrezzoChange(sottoservizio.id, val)}
                                                        autoComplete="off"
                                                        prefix="€"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            )}
                                        </BlockStack>
                                     </Box>
                                 </Grid.Cell>
                );
              })}
                     </Grid>
                 </Box>
             </LegacyCard.Section>
          ))}
      </LegacyCard>

      {/* Descrizioni Specifiche (Mostra solo se servizi attivi) */}
      {(hasServices('ecommerce') || hasServices('videoPost') || hasServices('metaAds') || hasServices('googleAds') || hasServices('seo') || hasServices('emailMarketing')) && (
          <LegacyCard title="Dettagli Servizi" sectioned>
              <FormLayout>
                  {hasServices('ecommerce') && (
                      <TextField
                          label="Descrizione E-commerce"
                          value={data.tipologiaInterventoEcommerce || descriptions.ecommerce}
                          onChange={(val) => handleDescriptionChange('tipologiaInterventoEcommerce', val)}
                          multiline={4}
                          autoComplete="off"
                      />
                  )}
                  {hasServices('videoPost') && (
                      <TextField
                          label="Descrizione Video e Post"
                          value={data.tipologiaInterventoVideoPost || descriptions.videoPost}
                          onChange={(val) => handleDescriptionChange('tipologiaInterventoVideoPost', val)}
                          multiline={4}
                          autoComplete="off"
                      />
                  )}
                  {hasServices('metaAds') && (
                      <TextField
                          label="Descrizione Meta Ads"
                          value={data.tipologiaInterventoMetaAds || descriptions.metaAds}
                          onChange={(val) => handleDescriptionChange('tipologiaInterventoMetaAds', val)}
                          multiline={4}
                          autoComplete="off"
                      />
                  )}
                  {hasServices('googleAds') && (
                      <TextField
                          label="Descrizione Google Ads"
                          value={data.tipologiaInterventoGoogleAds || descriptions.googleAds}
                          onChange={(val) => handleDescriptionChange('tipologiaInterventoGoogleAds', val)}
                          multiline={4}
                          autoComplete="off"
                      />
                  )}
                  {hasServices('seo') && (
                      <TextField
                          label="Descrizione SEO"
                          value={data.tipologiaInterventoSeo || descriptions.seo}
                          onChange={(val) => handleDescriptionChange('tipologiaInterventoSeo', val)}
                          multiline={4}
                          autoComplete="off"
                      />
                  )}
                  {hasServices('emailMarketing') && (
                      <TextField
                          label="Descrizione Email Marketing"
                          value={data.tipologiaInterventoEmailMarketing || descriptions.emailMarketing}
                          onChange={(val) => handleDescriptionChange('tipologiaInterventoEmailMarketing', val)}
                          multiline={4}
                          autoComplete="off"
                      />
                  )}
              </FormLayout>
          </LegacyCard>
      )}

      {/* Condizioni e Note */}
      <LegacyCard title="Condizioni e Note" sectioned>
          <FormLayout>
              <TextField
                  label="Termini di Pagamento"
            value={data.terminiPagamento}
                  onChange={(val) => handleInputChange('terminiPagamento', val)}
                  autoComplete="off"
                  placeholder="Es: 30 giorni data fattura, Anticipo 50% - Saldo a consegna"
                  prefix={<Icon source={SettingsIcon} />}
              />
              
              <TextField
                  label="Termini e Condizioni"
            value={data.terminiCondizioni || generateDefaultTerminiCondizioni(data.data)}
                  onChange={(val) => handleInputChange('terminiCondizioni', val)}
                  multiline={4}
                  autoComplete="off"
                  helpText="Include la data di validità calcolata automaticamente"
              />
              
              <TextField
                  label="Note Aggiuntive"
            value={data.note}
                  onChange={(val) => handleInputChange('note', val)}
                  multiline={2}
                  autoComplete="off"
                  prefix={<Icon source={NoteIcon} />}
              />
          </FormLayout>
      </LegacyCard>

      {/* Riepilogo Costi */}
      <LegacyCard title="Riepilogo Preventivo" sectioned>
          <BlockStack gap="200" align="end">
              <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="bodyMd">Subtotale:</Text>
                  <Text as="span" variant="bodyMd">€ {totali.subtotale.toFixed(2)}</Text>
              </InlineStack>
              <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="bodyMd">IVA (22%):</Text>
                  <Text as="span" variant="bodyMd">€ {totali.iva.toFixed(2)}</Text>
              </InlineStack>
              <Divider />
              <InlineStack align="space-between" blockAlign="center">
                  <Text as="span" variant="headingMd" fontWeight="bold">TOTALE:</Text>
                  <Text as="span" variant="headingLg" fontWeight="bold" tone="success">€ {totali.totale.toFixed(2)}</Text>
              </InlineStack>
          </BlockStack>
      </LegacyCard>
    </BlockStack>
  );
};
