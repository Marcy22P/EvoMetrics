import React, { useState, useEffect } from 'react';
import { 
  FormLayout, 
  TextField, 
  Select, 
  LegacyCard, 
  Box, 
  Text,
  Button,
  Grid,
  BlockStack,
  InlineStack,
  Divider,
  Banner,
  Checkbox
} from '@shopify/polaris';
import { MagicIcon, SaveIcon } from '@shopify/polaris-icons';
import type { ContrattoData } from '../../types/contratto';
import { 
  generateArticolo2Oggetto, 
  generateArticolo2SitoWeb, 
  generateArticolo2Marketing, 
  generateArticolo2Linkbuilding,
  generateArticolo3Modalita,
  generateArticolo4Durata,
  generateArticolo5Compenso,
  generateArticolo6Proprieta,
  generateArticolo7Responsabilita,
  generateArticolo8NormeRinvio,
  generateArticolo9ForoCompetente,
  hasSitoWeb as checkHasSitoWeb,
  hasMarketing as checkHasMarketing,
  hasLinkbuilding as checkHasLinkbuilding,
  formatCurrencyWithWords
} from '../../utils/contrattoUtils';

interface ContrattoFormProps {
  contrattoData: ContrattoData;
  onDataChange: (data: ContrattoData) => void;
  onSave: () => void;
  isModified: boolean;
  isSaving: boolean;
}

const ContrattoForm: React.FC<ContrattoFormProps> = ({
  contrattoData,
  onDataChange,
  onSave,
  isModified,
  isSaving
}) => {
  const [formData, setFormData] = useState<ContrattoData>(contrattoData);
  
  // Stato separato per i valori di input dei campi numerici
  const [inputValues, setInputValues] = useState({
    importoTotale: contrattoData.compenso.sitoWeb?.importoTotale?.toString() || '',
    importoMensile: contrattoData.compenso.marketing.importoMensile?.toString() || ''
  });

  // Sincronizza formData con contrattoData solo se l'ID è diverso (nuovo contratto caricato)
  useEffect(() => {
    // Evita loop infiniti: aggiorna solo se l'ID è cambiato o se è un nuovo contratto
    if (contrattoData.id !== formData.id || !formData.durata?.dataDecorrenza) {
      setFormData(contrattoData);
      setInputValues({
        importoTotale: contrattoData.compenso.sitoWeb?.importoTotale?.toString() || '',
        importoMensile: contrattoData.compenso.marketing.importoMensile?.toString() || ''
      });
    }
  }, [contrattoData.id]); 

  const handleInputChange = (field: string, value: any) => {
    const newData = { ...formData };
    
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (parent === 'datiCommittente') {
        newData.datiCommittente = { ...newData.datiCommittente, [child]: value };
      } else if (parent === 'durata') {
        newData.durata = { ...newData.durata, [child]: value };
      } else if (parent === 'compenso') {
        if (child.includes('.')) {
          const [subParent, subChild] = child.split('.');
          if (subParent === 'sitoWeb') {
            if (!newData.compenso.sitoWeb) {
              newData.compenso.sitoWeb = {
                importoTotale: 0,
                modalitaPagamento: '50_50',
                acconto: 0,
                saldo: 0
              };
            }
            newData.compenso.sitoWeb = { ...newData.compenso.sitoWeb, [subChild]: value };
          } else if (subParent === 'marketing') {
            newData.compenso.marketing = { ...newData.compenso.marketing, [subChild]: value };
          }
        } else {
          newData.compenso = { ...newData.compenso, [child]: value };
        }
      }
    } else {
      (newData as any)[field] = value;
    }
    
    setFormData(newData);
    onDataChange(newData);
  };


  const calculateDataScadenza = (tipo: string, dataDecorrenza: string, customMesi?: number) => {
    if (!dataDecorrenza) return '';
    
    const decorrenza = new Date(dataDecorrenza);
    let scadenza = new Date(decorrenza);
    
    switch (tipo) {
      case '12_mesi_senza_rinnovo':
      case '12_mesi_con_rinnovo':
        scadenza.setMonth(scadenza.getMonth() + 12);
        break;
      case '6_6_mesi_senza_rinnovo':
        scadenza.setMonth(scadenza.getMonth() + 6);
        break;
      case '3_mesi_con_rinnovo':
      case '3_mesi_senza_rinnovo':
        scadenza.setMonth(scadenza.getMonth() + 3);
        break;
      case 'spot_una_tantum':
        scadenza.setDate(scadenza.getDate() + 60); // Stimato 8 settimane
        break;
      case 'custom':
        if (customMesi && customMesi > 0) {
          scadenza.setMonth(scadenza.getMonth() + customMesi);
        }
        break;
    }
    
    return scadenza.toISOString().split('T')[0];
  };

  const handleDurataChange = (tipo: string) => {
    // Usa il valore corrente dallo state invece che dal DOM
    const dataDecorrenzaCorrente = formData.durata?.dataDecorrenza || '';
    const customMesi = formData.durata?.customMesi || 0;
    
    const dataScadenza = dataDecorrenzaCorrente ? calculateDataScadenza(tipo, dataDecorrenzaCorrente, customMesi) : '';
    
    const newData = { ...formData };
    newData.durata = {
      ...newData.durata,
      tipo: tipo as any,
      dataDecorrenza: dataDecorrenzaCorrente,
      dataScadenza: dataScadenza,
      // Reset custom values if switching away from custom, or keep them if custom
      customMesi: tipo === 'custom' ? customMesi : undefined,
      customRinnovo: tipo === 'custom' ? (formData.durata.customRinnovo || false) : undefined
    };
    
    if (dataDecorrenzaCorrente && dataScadenza) {
      const options = tipo === 'custom' ? { mesi: customMesi, rinnovo: newData.durata.customRinnovo } : undefined;
      newData.articolo4Durata = generateArticolo4Durata(tipo, dataDecorrenzaCorrente, dataScadenza, options);
    } else if (tipo === 'custom' && (!customMesi || customMesi === 0)) {
      // Clear duration text if custom months is invalid
       newData.articolo4Durata = '';
    }
    
    setFormData(newData);
    onDataChange(newData);
  };

  const handleCustomDurataChange = (key: 'mesi' | 'rinnovo', value: any) => {
    const newData = { ...formData };
    const currentDurata = newData.durata;
    
    if (key === 'mesi') {
      const mesi = parseInt(value) || 0;
      currentDurata.customMesi = mesi;
      
      // Recalculate expiry
      if (currentDurata.dataDecorrenza) {
        currentDurata.dataScadenza = calculateDataScadenza('custom', currentDurata.dataDecorrenza, mesi);
      }
    } else {
      currentDurata.customRinnovo = value;
    }
    
    // Regenerate article if we have date and months
    if (currentDurata.dataDecorrenza && currentDurata.dataScadenza && currentDurata.customMesi) {
      newData.articolo4Durata = generateArticolo4Durata(
        'custom', 
        currentDurata.dataDecorrenza, 
        currentDurata.dataScadenza,
        { mesi: currentDurata.customMesi, rinnovo: currentDurata.customRinnovo }
      );
    }
    
    setFormData(newData);
    onDataChange(newData);
  };

  const handleDataDecorrenzaChange = (data: string) => {
    const dataScadenza = calculateDataScadenza(formData.durata.tipo, data, formData.durata.customMesi);
    
    const newData = { ...formData };
    newData.durata = {
      ...newData.durata,
      dataDecorrenza: data,
      dataScadenza: dataScadenza
    };
    
    const options = formData.durata.tipo === 'custom' ? { mesi: formData.durata.customMesi, rinnovo: formData.durata.customRinnovo } : undefined;
    newData.articolo4Durata = generateArticolo4Durata(newData.durata.tipo, data, dataScadenza, options);
    
    setFormData(newData);
    onDataChange(newData);
  };

  const calculateRate = (importoTotale: number, modalita: string) => {
    const importo = importoTotale || 0;
    
    if (modalita === '50_50') {
      return {
        acconto: importo * 0.5,
        saldo: importo * 0.5
      };
    } else if (modalita === '40_30_30') {
      return {
        acconto: importo * 0.4,
        secondaRata: importo * 0.3,
        saldo: importo * 0.3
      };
    }
    return { acconto: 0, saldo: 0 };
  };

  const handleImportoTotaleInput = (value: string) => {
    setInputValues(prev => ({ ...prev, importoTotale: value }));
    
    const numValue = value === '' ? 0 : parseInt(value.replace(/[^0-9]/g, ''));
    if (!isNaN(numValue)) {
      const modalita = formData.compenso.sitoWeb?.modalitaPagamento || '50_50';
      const rate = calculateRate(numValue, modalita);
      
      const newData = { ...formData };
      if (!newData.compenso.sitoWeb) {
        newData.compenso.sitoWeb = {
          importoTotale: numValue,
          modalitaPagamento: modalita,
          acconto: rate.acconto,
          saldo: rate.saldo
        };
      } else {
        const updatedSitoWeb = {
          ...newData.compenso.sitoWeb,
          importoTotale: numValue,
          acconto: rate.acconto,
          saldo: rate.saldo
        };
        
        if (rate.secondaRata) {
          updatedSitoWeb.secondaRata = rate.secondaRata;
        } else {
          delete updatedSitoWeb.secondaRata;
        }
        
        newData.compenso.sitoWeb = updatedSitoWeb;
      }
      
      newData.articolo5Compenso = generateArticolo5Compenso(newData);
      
      setFormData(newData);
      onDataChange(newData);
    }
  };

  const handleImportoMensileInput = (value: string) => {
    setInputValues(prev => ({ ...prev, importoMensile: value }));
    
    const numValue = value === '' ? 0 : parseInt(value.replace(/[^0-9]/g, ''));
    if (!isNaN(numValue)) {
      const newData = { ...formData };
      newData.compenso.marketing.importoMensile = numValue;
      
      newData.articolo5Compenso = generateArticolo5Compenso(newData);
      
      setFormData(newData);
      onDataChange(newData);
    }
  };

  const handleGiornoPagamentoChange = (giorno: string) => {
    const giornoNum = parseInt(giorno);
    const newData = { ...formData };
    newData.compenso.marketing.giornoPagamento = giornoNum;
    
    newData.articolo5Compenso = generateArticolo5Compenso(newData);
    
    setFormData(newData);
    onDataChange(newData);
  };

  const handleModalitaPagamentoChange = (modalita: string) => {
    const importo = formData.compenso.sitoWeb?.importoTotale || 0;
    const rate = calculateRate(importo, modalita);
    
    const newData = { ...formData };
    if (!newData.compenso.sitoWeb) {
      newData.compenso.sitoWeb = {
        importoTotale: importo,
        modalitaPagamento: modalita as '50_50' | '40_30_30',
        acconto: rate.acconto,
        saldo: rate.saldo
      };
    } else {
      const updatedSitoWeb = {
        ...newData.compenso.sitoWeb,
        modalitaPagamento: modalita as '50_50' | '40_30_30',
        acconto: rate.acconto,
        saldo: rate.saldo
      };
      
      if (rate.secondaRata) {
        updatedSitoWeb.secondaRata = rate.secondaRata;
      } else {
        delete updatedSitoWeb.secondaRata;
      }
      
      newData.compenso.sitoWeb = updatedSitoWeb;
    }
    
    newData.articolo5Compenso = generateArticolo5Compenso(newData);
    
    setFormData(newData);
    onDataChange(newData);
  };

  const generateAutomaticContent = () => {
    const newData = { ...formData };
    newData.articolo2Oggetto = generateArticolo2Oggetto(formData.tipologiaServizio);
    if (checkHasSitoWeb(formData.tipologiaServizio)) {
      newData.articolo2SitoWeb = generateArticolo2SitoWeb(formData.tipologiaServizio);
    }
    if (checkHasMarketing(formData.tipologiaServizio)) {
      newData.articolo2Marketing = generateArticolo2Marketing(formData.tipologiaServizio);
    }
    if (checkHasLinkbuilding(formData.tipologiaServizio)) {
      newData.articolo2Linkbuilding = generateArticolo2Linkbuilding();
    }
    newData.articolo3Modalita = generateArticolo3Modalita();
    const options = formData.durata.tipo === 'custom' ? { mesi: formData.durata.customMesi, rinnovo: formData.durata.customRinnovo } : undefined;
    newData.articolo4Durata = generateArticolo4Durata(formData.durata.tipo, formData.durata.dataDecorrenza, formData.durata.dataScadenza, options);
    newData.articolo5Compenso = generateArticolo5Compenso(formData);
    newData.articolo6Proprieta = generateArticolo6Proprieta();
    newData.articolo7Responsabilita = generateArticolo7Responsabilita();
    newData.articolo8NormeRinvio = generateArticolo8NormeRinvio();
    newData.articolo9ForoCompetente = generateArticolo9ForoCompetente();
    
    setFormData(newData);
    onDataChange(newData);
  };

  const hasSitoWeb = checkHasSitoWeb(formData.tipologiaServizio);
  const hasMarketing = checkHasMarketing(formData.tipologiaServizio);

  return (
    <BlockStack gap="500">
      {/* Banner Modifiche non salvate */}
      {isModified && (
        <Banner title="Modifiche non salvate" tone="warning">
          <p>Ricordati di salvare le modifiche prima di uscire.</p>
        </Banner>
      )}

      {/* Dati Committente */}
      <LegacyCard title="Dati Committente" sectioned>
        <FormLayout>
          <FormLayout.Group>
            <TextField
              label="Ragione Sociale"
              value={formData.datiCommittente.ragioneSociale}
              onChange={(val) => handleInputChange('datiCommittente.ragioneSociale', val)}
              autoComplete="organization"
            />
            <TextField
              label="C.F./P.IVA"
              value={formData.datiCommittente.cfPiva}
              onChange={(val) => handleInputChange('datiCommittente.cfPiva', val)}
              autoComplete="off"
            />
          </FormLayout.Group>
          
          <FormLayout.Group>
            <TextField
              label="Via"
              value={formData.datiCommittente.via}
              onChange={(val) => handleInputChange('datiCommittente.via', val)}
              autoComplete="address-line1"
            />
            <TextField
              label="Numero"
              value={formData.datiCommittente.numero}
              onChange={(val) => handleInputChange('datiCommittente.numero', val)}
              autoComplete="address-line2"
            />
          </FormLayout.Group>

          <FormLayout.Group>
            <TextField
              label="Città"
              value={formData.datiCommittente.citta}
              onChange={(val) => handleInputChange('datiCommittente.citta', val)}
              autoComplete="address-level2"
            />
            <TextField
              label="CAP"
              value={formData.datiCommittente.cap}
              onChange={(val) => handleInputChange('datiCommittente.cap', val)}
              autoComplete="postal-code"
            />
          </FormLayout.Group>

          <FormLayout.Group>
            <TextField
              label="E-mail"
              type="email"
              value={formData.datiCommittente.email}
              onChange={(val) => handleInputChange('datiCommittente.email', val)}
              autoComplete="email"
            />
            <TextField
              label="PEC"
              type="email"
              value={formData.datiCommittente.pec}
              onChange={(val) => handleInputChange('datiCommittente.pec', val)}
              autoComplete="email"
            />
          </FormLayout.Group>

          <TextField
            label="Legale Rappresentante"
            value={formData.datiCommittente.legaleRappresentante}
            onChange={(val) => handleInputChange('datiCommittente.legaleRappresentante', val)}
            autoComplete="name"
          />
        </FormLayout>
      </LegacyCard>

      {/* Tipologia e Durata */}
      <LegacyCard title="Dettagli Contratto" sectioned>
        <FormLayout>
          <Select
            label="Tipologia Servizio"
            options={[
              {label: 'Sito web + Marketing + Linkbuilding', value: 'sito_marketing_linkbuilding'},
              {label: 'Sito web + Marketing', value: 'sito_marketing'},
              {label: 'Marketing (content + adv)', value: 'marketing_content_adv'},
              {label: 'Marketing (adv)', value: 'marketing_adv'},
              {label: 'Solo Sito Web', value: 'solo_sito'},
              {label: 'Marketing (solo content)', value: 'marketing_content'},
            ]}
            value={formData.tipologiaServizio}
            onChange={(val) => handleInputChange('tipologiaServizio', val)}
          />

          <Divider />
          <Text as="h3" variant="headingSm">Durata</Text>

          <FormLayout.Group>
            <Select
              label="Tipo Durata"
              options={[
                {label: '12 mesi senza tacito rinnovo', value: '12_mesi_senza_rinnovo'},
                {label: '12 mesi con tacito rinnovo', value: '12_mesi_con_rinnovo'},
                {label: '6+6 mesi senza tacito rinnovo', value: '6_6_mesi_senza_rinnovo'},
                {label: '3 mesi con tacito rinnovo', value: '3_mesi_con_rinnovo'},
                {label: '3 mesi senza tacito rinnovo', value: '3_mesi_senza_rinnovo'},
                {label: 'Spot (Una Tantum)', value: 'spot_una_tantum'},
                {label: 'Personalizzata', value: 'custom'},
              ]}
              value={formData.durata?.tipo || '12_mesi_senza_rinnovo'}
              onChange={handleDurataChange}
            />
            <TextField
              label="Data Decorrenza"
              type="date"
              value={formData.durata?.dataDecorrenza || ''}
              onChange={handleDataDecorrenzaChange}
              autoComplete="off"
            />
            <TextField
              label="Data Scadenza"
              type="date"
              value={formData.durata?.dataScadenza || ''}
              readOnly
              autoComplete="off"
              helpText="Calcolata automaticamente"
            />
          </FormLayout.Group>

          {formData.durata?.tipo === 'custom' && (
            <Box paddingBlockStart="200">
              <InlineStack gap="400" align="start">
                <div style={{width: '150px'}}>
                  <TextField
                    label="Numero Mesi"
                    type="number"
                    value={formData.durata.customMesi?.toString() || ''}
                    onChange={(val) => handleCustomDurataChange('mesi', val)}
                    autoComplete="off"
                  />
                </div>
                <div style={{marginTop: '28px'}}>
                  <Checkbox
                    label="Tacito Rinnovo"
                    checked={formData.durata.customRinnovo || false}
                    onChange={(val) => handleCustomDurataChange('rinnovo', val)}
                  />
                </div>
              </InlineStack>
            </Box>
          )}
        </FormLayout>
      </LegacyCard>

      {/* Compenso */}
      <LegacyCard title="Compenso e Pagamenti" sectioned>
        <FormLayout>
          {hasSitoWeb && (
            <Box>
              <Text as="h3" variant="headingSm" fontWeight="bold">Sito Web</Text>
              <Box paddingBlockStart="200">
                <FormLayout.Group>
                  <TextField
                    label="Importo Totale (€)"
                    value={inputValues.importoTotale}
                    onChange={handleImportoTotaleInput}
                    autoComplete="off"
                    prefix="€"
                  />
                  <Select
                    label="Modalità Pagamento"
                    options={[
                      {label: '50% acconto + 50% a consegna', value: '50_50'},
                      {label: '40% acconto + 30% a 30gg + 30% a consegna', value: '40_30_30'},
                    ]}
                    value={formData.compenso.sitoWeb?.modalitaPagamento || '50_50'}
                    onChange={handleModalitaPagamentoChange}
                  />
                </FormLayout.Group>
                
                <Grid>
                  <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                    <TextField
                      label="Acconto"
                      value={formData.compenso.sitoWeb?.acconto ? formatCurrencyWithWords(formData.compenso.sitoWeb.acconto) : '0 €'}
                      readOnly
                      autoComplete="off"
                    />
                  </Grid.Cell>
                  
                  {formData.compenso.sitoWeb?.modalitaPagamento === '40_30_30' && (
                    <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                      <TextField
                        label="Seconda Rata"
                        value={formData.compenso.sitoWeb?.secondaRata ? formatCurrencyWithWords(formData.compenso.sitoWeb.secondaRata) : '0 €'}
                        readOnly
                        autoComplete="off"
                      />
                    </Grid.Cell>
                  )}
                  
                  <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                    <TextField
                      label="Saldo"
                      value={formData.compenso.sitoWeb?.saldo ? formatCurrencyWithWords(formData.compenso.sitoWeb.saldo) : '0 €'}
                      readOnly
                      autoComplete="off"
                    />
                  </Grid.Cell>
                </Grid>
              </Box>
              {hasMarketing && <Box paddingBlockStart="400"><Divider /></Box>}
            </Box>
          )}

          {hasMarketing && (
            <Box paddingBlockStart={hasSitoWeb ? "400" : "0"}>
              <Text as="h3" variant="headingSm" fontWeight="bold">Marketing</Text>
              <Box paddingBlockStart="200">
                <FormLayout.Group>
                  <TextField
                    label="Importo Mensile (€)"
                    value={inputValues.importoMensile}
                    onChange={handleImportoMensileInput}
                    autoComplete="off"
                    prefix="€"
                  />
                  <Select
                    label="Giorno Pagamento"
                    options={Array.from({ length: 31 }, (_, i) => ({
                      label: (i + 1).toString(),
                      value: (i + 1).toString()
                    }))}
                    value={(formData.compenso.marketing.giornoPagamento || 1).toString()}
                    onChange={handleGiornoPagamentoChange}
                  />
                </FormLayout.Group>
              </Box>
            </Box>
          )}
        </FormLayout>
      </LegacyCard>

      {/* Note */}
      <LegacyCard title="Note Aggiuntive" sectioned>
        <TextField
          label="Note"
          value={formData.note}
          onChange={(val) => handleInputChange('note', val)}
          multiline={4}
          autoComplete="off"
          placeholder="Inserisci eventuali note particolari..."
        />
      </LegacyCard>

      {/* Articoli */}
      <LegacyCard title="Articoli del Contratto" sectioned>
        <Box paddingBlockEnd="400">
          <Banner title="Generazione Automatica" tone="info">
            <p>I contenuti degli articoli vengono generati in base ai servizi selezionati. Puoi modificarli manualmente qui sotto.</p>
            <Box paddingBlockStart="200">
              <Button icon={MagicIcon} onClick={generateAutomaticContent}>Rigenera Contenuti</Button>
            </Box>
          </Banner>
        </Box>

        <FormLayout>
          <Box>
            <Text as="h3" variant="headingSm">ART. 2 - OGGETTO</Text>
            <Box paddingBlockStart="200">
              <TextField
                label="2.1 Oggetto"
                value={formData.articolo2Oggetto || ''}
                onChange={(val) => handleInputChange('articolo2Oggetto', val)}
                multiline={4}
                autoComplete="off"
              />
            </Box>
            
            {hasSitoWeb && (
              <Box paddingBlockStart="200">
                <TextField
                  label="2.2 Sito Web"
                  value={formData.articolo2SitoWeb || ''}
                  onChange={(val) => handleInputChange('articolo2SitoWeb', val)}
                  multiline={6}
                  autoComplete="off"
                />
              </Box>
            )}

            {hasMarketing && (
              <Box paddingBlockStart="200">
                <TextField
                  label="2.3 Marketing"
                  value={formData.articolo2Marketing || ''}
                  onChange={(val) => handleInputChange('articolo2Marketing', val)}
                  multiline={6}
                  autoComplete="off"
                />
              </Box>
            )}

            {checkHasLinkbuilding(formData.tipologiaServizio) && (
              <Box paddingBlockStart="200">
                <TextField
                  label="2.4 Linkbuilding"
                  value={formData.articolo2Linkbuilding || ''}
                  onChange={(val) => handleInputChange('articolo2Linkbuilding', val)}
                  multiline={4}
                  autoComplete="off"
                />
              </Box>
            )}
          </Box>

          <TextField
            label="ART. 3 - MODALITÀ DI ESECUZIONE"
            value={formData.articolo3Modalita || ''}
            onChange={(val) => handleInputChange('articolo3Modalita', val)}
            multiline={4}
            autoComplete="off"
          />

          <TextField
            label="ART. 4 - DURATA"
            value={formData.articolo4Durata || ''}
            onChange={(val) => handleInputChange('articolo4Durata', val)}
            multiline={4}
            autoComplete="off"
          />

          <TextField
            label="ART. 5 - COMPENSO"
            value={formData.articolo5Compenso || ''}
            onChange={(val) => handleInputChange('articolo5Compenso', val)}
            multiline={4}
            autoComplete="off"
          />

          <TextField
            label="ART. 6 - PROPRIETÀ"
            value={formData.articolo6Proprieta || ''}
            onChange={(val) => handleInputChange('articolo6Proprieta', val)}
            multiline={4}
            autoComplete="off"
          />

          <TextField
            label="ART. 7 - RESPONSABILITÀ"
            value={formData.articolo7Responsabilita || ''}
            onChange={(val) => handleInputChange('articolo7Responsabilita', val)}
            multiline={2}
            autoComplete="off"
          />

          <TextField
            label="ART. 8 - NORME DI RINVIO"
            value={formData.articolo8NormeRinvio || ''}
            onChange={(val) => handleInputChange('articolo8NormeRinvio', val)}
            multiline={2}
            autoComplete="off"
          />

          <TextField
            label="ART. 9 - FORO COMPETENTE"
            value={formData.articolo9ForoCompetente || ''}
            onChange={(val) => handleInputChange('articolo9ForoCompetente', val)}
            multiline={2}
            autoComplete="off"
          />
        </FormLayout>
      </LegacyCard>

      {/* Action Bar */}
      <Box paddingBlock="400">
        <InlineStack align="end" gap="300">
          <Button 
            variant="primary" 
            size="large"
            icon={SaveIcon} 
            onClick={onSave} 
            loading={isSaving}
            disabled={isSaving}
          >
            Salva Contratto
          </Button>
        </InlineStack>
      </Box>
    </BlockStack>
  );
};

export default ContrattoForm;
