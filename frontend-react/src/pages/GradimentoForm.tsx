import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  ChoiceList,
  RangeSlider,
  Banner,
  Text,
  BlockStack,
  Box,
  InlineStack
} from '@shopify/polaris';
import { useAuth } from '../hooks/useAuth';
import { gradimentoApi, type GradimentoRisposte } from '../services/gradimentoApi';
import { useNavigate } from 'react-router-dom';
import './GradimentoForm.css';

const GradimentoForm: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  
  // Sezione 1
  const [cosePrincipali, setCosePrincipali] = useState('');
  const [lasciatoIndietro, setLasciatoIndietro] = useState<string[]>(['no']);
  const [lasciatoIndietroDesc, setLasciatoIndietroDesc] = useState('');
  const [qualita, setQualita] = useState(3);
  const [produttivita, setProduttivita] = useState(3);

  // Sezione 2
  const [blocchi, setBlocchi] = useState<string[]>(['no']);
  const [blocchiDesc, setBlocchiDesc] = useState('');
  const [ostacoliInterni, setOstacoliInterni] = useState('');
  const [difficoltaEsterne, setDifficoltaEsterne] = useState('');

  // Sezione 3
  const [allineamento, setAllineamento] = useState(3);
  const [supporto, setSupporto] = useState('');
  const [ringraziamenti, setRingraziamenti] = useState('');

  // Sezione 4
  const [priorita, setPriorita] = useState('');
  const [risorse, setRisorse] = useState('');

  // Sezione 5
  const [statoAnimo, setStatoAnimo] = useState<string[]>([]);
  const [pensieroLibero, setPensieroLibero] = useState('');

  // Precompila anagrafica
  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setCognome(user.cognome || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Costruisci oggetto risposte
      const risposte: GradimentoRisposte = {
        nome,
        cognome,
        email,
        cose_principali: cosePrincipali,
        lasciato_indietro: lasciatoIndietro[0] === 'si' ? `Sì — ${lasciatoIndietroDesc}` : 'No, tutto fatto',
        soddisfazione_qualita: qualita,
        organizzazione_produttivita: produttivita,
        blocchi_rallentamenti: blocchi[0] === 'si' ? `Sì — ${blocchiDesc}` : 'No, tutto fatto',
        ostacoli_interni: ostacoliInterni,
        difficolta_esterne: difficoltaEsterne,
        allineamento_team: allineamento,
        supporto_chiarezza: supporto,
        ringraziamenti: ringraziamenti,
        priorita_prossima_settimana: priorita,
        risorse_necessarie: risorse,
        stato_animo: statoAnimo[0] || '',
        pensiero_libero: pensieroLibero
      };

      await gradimentoApi.salvaGradimento(risposte);
      setSuccess(true);
      window.scrollTo(0, 0);
      
    } catch (err: any) {
      setError(err.message || 'Errore durante l\'invio del form');
      window.scrollTo(0, 0);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    nome, cognome, email, cosePrincipali, lasciatoIndietro, lasciatoIndietroDesc,
    qualita, produttivita, blocchi, blocchiDesc, ostacoliInterni, difficoltaEsterne,
    allineamento, supporto, ringraziamenti, priorita, risorse, statoAnimo, pensieroLibero
  ]);

  if (success) {
    return (
      <Page title="Weekly Review">
        <Layout>
          <Layout.Section>
            <Banner tone="success" title="Feedback inviato con successo!" onDismiss={() => setSuccess(false)}>
              <p>Grazie per il tuo contributo. Le tue risposte sono state salvate.</p>
            </Banner>
            <Box paddingBlockStart="400">
                <Button onClick={() => navigate('/team/gradimento-risposte')}>Vedi i tuoi gradimenti passati</Button>
            </Box>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Weekly Review – Form" subtitle="Compila questo form per condividere il tuo feedback settimanale">
      <Layout>
        <Layout.Section>
          {error && (
            <Banner tone="critical" title="Errore" onDismiss={() => setError(null)}>
              <p>{error}</p>
            </Banner>
          )}

          <FormLayout>
            {/* Anagrafica */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Anagrafica</Text>
                <FormLayout.Group>
                  <TextField label="Nome" value={nome} onChange={setNome} autoComplete="given-name" disabled />
                  <TextField label="Cognome" value={cognome} onChange={setCognome} autoComplete="family-name" disabled />
                </FormLayout.Group>
                <TextField label="Email" value={email} onChange={setEmail} autoComplete="email" type="email" disabled />
              </BlockStack>
            </Card>

            {/* Sezione 1 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">1. Cosa hai fatto questa settimana</Text>
                
                <TextField
                  label="1. Quali sono le 3 cose principali che hai portato a termine?"
                  value={cosePrincipali}
                  onChange={setCosePrincipali}
                  multiline={4}
                  autoComplete="off"
                  helpText="Puoi scrivere liberamente o incollare i link alle task in ClickUp"
                />

                <Box>
                  <Text as="p" variant="bodyMd">2. Hai lasciato indietro qualcosa?</Text>
                  <ChoiceList
                    title=""
                    choices={[
                      {label: 'No, tutto fatto', value: 'no'},
                      {label: 'Sì — scrivi brevemente cosa e perché', value: 'si'},
                    ]}
                    selected={lasciatoIndietro}
                    onChange={setLasciatoIndietro}
                  />
                  {lasciatoIndietro[0] === 'si' && (
                    <Box paddingBlockStart="200">
                        <TextField
                        label="Descrizione"
                        value={lasciatoIndietroDesc}
                        onChange={setLasciatoIndietroDesc}
                        autoComplete="off"
                        multiline={2}
                        placeholder="Cosa e perché..."
                        />
                    </Box>
                  )}
                </Box>

                <Box>
                    <Text as="p" variant="bodyMd">3. Quanto ti senti soddisfatta/o della qualità del tuo lavoro?</Text>
                    <RangeSlider
                        label="Qualità Lavoro"
                        labelHidden
                        min={1}
                        max={5}
                        step={1}
                        value={qualita}
                        onChange={(val) => setQualita(Number(val))}
                        output
                    />
                </Box>

                <Box>
                    <Text as="p" variant="bodyMd">4. Quanto ti senti organizzata/o produttiva/o questa settimana?</Text>
                    <RangeSlider
                        label="Produttività"
                        labelHidden
                        min={1}
                        max={5}
                        step={1}
                        value={produttivita}
                        onChange={(val) => setProduttivita(Number(val))}
                        output
                    />
                </Box>
              </BlockStack>
            </Card>

            {/* Sezione 2 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">2. Ostacoli e miglioramenti</Text>

                <Box>
                  <Text as="p" variant="bodyMd">5. Hai avuto blocchi o rallentamenti? Se sì, indicarne la causa:</Text>
                  <ChoiceList
                    title=""
                    choices={[
                      {label: 'No, tutto fatto', value: 'no'},
                      {label: 'Sì — scrivi brevemente cosa e perché', value: 'si'},
                    ]}
                    selected={blocchi}
                    onChange={setBlocchi}
                  />
                  {blocchi[0] === 'si' && (
                    <Box paddingBlockStart="200">
                        <TextField
                        label="Descrizione"
                        value={blocchiDesc}
                        onChange={setBlocchiDesc}
                        autoComplete="off"
                        multiline={2}
                        placeholder="Cosa e perché..."
                        />
                    </Box>
                  )}
                </Box>

                <TextField
                  label="6. Hai riscontrato qualche ostacolo interno legato al team, alla comunicazione o al processo di lavoro?"
                  value={ostacoliInterni}
                  onChange={setOstacoliInterni}
                  multiline={3}
                  autoComplete="off"
                  helpText="Se sì, descrivilo brevemente"
                />

                <TextField
                  label="7. Hai avuto difficoltà o rallentamenti causati da clienti, fornitori o fattori esterni al team?"
                  value={difficoltaEsterne}
                  onChange={setDifficoltaEsterne}
                  multiline={3}
                  autoComplete="off"
                  helpText="Se sì, descrivere brevemente"
                />
              </BlockStack>
            </Card>

            {/* Sezione 3 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">3. Collaborazione e comunicazione</Text>

                <Box>
                    <Text as="p" variant="bodyMd">7. Ti sei sentita/o allineata/o con il team questa settimana?</Text>
                    <RangeSlider
                        label="Allineamento Team"
                        labelHidden
                        min={1}
                        max={5}
                        step={1}
                        value={allineamento}
                        onChange={(val) => setAllineamento(Number(val))}
                        output
                    />
                </Box>

                <TextField
                  label="8. Ti servirebbe più supporto o chiarezza da qualcuno (PM, collega, cliente)?"
                  value={supporto}
                  onChange={setSupporto}
                  multiline={3}
                  autoComplete="off"
                  helpText="Se sì, scrivi da chi e su cosa"
                />

                <TextField
                  label="9. C’è qualcuno del team che vuoi ringraziare o riconoscere per aver fatto un buon lavoro?"
                  value={ringraziamenti}
                  onChange={setRingraziamenti}
                  multiline={3}
                  autoComplete="off"
                  helpText="Facoltativo ma sempre bello da leggere!"
                />
              </BlockStack>
            </Card>

            {/* Sezione 4 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">4. Prossima settimana</Text>
                
                <TextField
                  label="10. Quali sono le 3 priorità principali su cui ti concentrerai?"
                  value={priorita}
                  onChange={setPriorita}
                  multiline={4}
                  autoComplete="off"
                />

                <TextField
                  label="11. Ti serve qualche risorsa, accesso o informazione per farle bene?"
                  value={risorse}
                  onChange={setRisorse}
                  multiline={3}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            {/* Sezione 5 */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">5. Stato d’animo</Text>

                <ChoiceList
                  title="13. Come ti sei sentita/o in generale questa settimana?"
                  choices={[
                    {label: 'Stressata/o', value: 'Stressata/o'},
                    {label: "Un po’ sotto pressione", value: "Un po’ sotto pressione"},
                    {label: 'Bilanciata/o', value: 'Bilanciata/o'},
                    {label: 'Serena/o e motivata/o', value: 'Serena/o e motivata/o'},
                    {label: 'Super carica/o', value: 'Super carica/o'},
                  ]}
                  selected={statoAnimo}
                  onChange={setStatoAnimo}
                />

                <TextField
                  label="14. Un pensiero libero per chiudere la settimana:"
                  value={pensieroLibero}
                  onChange={setPensieroLibero}
                  multiline={4}
                  autoComplete="off"
                  helpText="Un piccolo successo, un’idea, o qualcosa che ti va di condividere"
                />
              </BlockStack>
            </Card>

            <Box paddingBlockStart="400" paddingBlockEnd="800">
                <InlineStack align="end">
                    <Button 
                        variant="primary" 
                        size="large" 
                        onClick={handleSubmit} 
                        loading={isSubmitting}
                        disabled={!cosePrincipali || !priorita || statoAnimo.length === 0}
                    >
                        Invia Gradimento
                    </Button>
                </InlineStack>
            </Box>

          </FormLayout>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default GradimentoForm;
