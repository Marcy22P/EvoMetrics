import React from 'react';
import { Field, Hint, RadioGroup, Select } from './FormComponents';
import { BarChartSummaryIcon } from '../Icons/AssessmentIcons';

const DatiStrumentiSection: React.FC = () => {
  const siNoOptions = [
    { value: 'si', label: 'Sì' },
    { value: 'no', label: 'No' }
  ];

  const analyticsOptions = [
    { value: '', label: 'Seleziona...' },
    { value: 'google_analytics', label: 'Google Analytics' },
    { value: 'facebook_pixel', label: 'Facebook Pixel' },
    { value: 'cms', label: 'CMS (Es. Shopify, WooCommerce...)' },
    { value: 'altro', label: 'Altro' }
  ];

  const trafficoOptions = [
    { value: '', label: 'Seleziona...' },
    { value: '0-1000', label: '0 - 1.000' },
    { value: '1000-5000', label: '1.000 - 5.000' },
    { value: '5000-20000', label: '5.000 - 20.000' },
    { value: '20000+', label: 'Più di 20.000' }
  ];

  const conversionOptions = [
    { value: '', label: 'Seleziona...' },
    { value: '1-3', label: '1-3%' },
    { value: '3-5', label: '3-5%' },
    { value: '5-10', label: '5-10%' },
    { value: '10+', label: 'Più del 10%' }
  ];

  const ricorrentiOptions = [
    { value: '', label: 'Seleziona...' },
    { value: '0-20', label: '0-20%' },
    { value: '20-50', label: '20-50%' },
    { value: '50-80', label: '50-80%' },
    { value: '80+', label: 'Più dell\'80%' }
  ];

  return (
    <fieldset id="dati-strumenti">
      <legend>5. Dati & strumenti</legend>

      <Field>
        <label className="block">Usate un sistema per vedere le visite al sito?</label>
        <RadioGroup 
          name="analytics_attivi" 
          options={siNoOptions}
          ariaLabel="Analytics attivi"
        />
      </Field>

      <Field conditional="analytics_attivi==si">
        <label htmlFor="quale_analytics">Quale sistema usate?</label>
        <Select 
          id="quale_analytics" 
          name="quale_analytics" 
          options={analyticsOptions}
        />
      </Field>

      <Field conditional="quale_analytics==altro">
        <label htmlFor="analytics_altro">Specifica il sistema</label>
        <input 
          type="text" 
          id="analytics_altro" 
          name="analytics_altro"
          placeholder="Nome del sistema che usate"
        />
      </Field>

      <Field>
        <label className="block">Avete un sistema per gestire i contatti clienti?</label>
        <RadioGroup 
          name="crm_attivo" 
          options={siNoOptions}
          ariaLabel="CRM attivo"
        />
        <Hint>Es: HubSpot, Salesforce, o anche un semplice Excel</Hint>
      </Field>

      <Field conditional="crm_attivo==si">
        <label htmlFor="quale_crm">Quale sistema usate?</label>
        <input 
          type="text" 
          id="quale_crm" 
          name="quale_crm"
          placeholder="Es: HubSpot, Excel, Google Sheets..."
        />
      </Field>

      <Field conditional="crm_attivo==si">
        <label htmlFor="quanti_contatti_anno">Quanti contatti gestite all'anno?</label>
        <input 
          type="text" 
          id="quanti_contatti_anno" 
          name="quanti_contatti_anno"
          placeholder="Es: 500, 1000, 5000..."
        />
        <Hint>Numero approssimativo di contatti clienti gestiti annualmente</Hint>
      </Field>

      <Field>
        <label htmlFor="dashboard_esistenti">Avete già dei report o dashboard?</label>
        <textarea 
          id="dashboard_esistenti" 
          name="dashboard_esistenti" 
          rows={3}
          placeholder="Es: Report vendite mensili, statistiche social..."
        />
        <Hint>Qualsiasi report che guardate regolarmente</Hint>
      </Field>

      <Field>
        <label htmlFor="upload_dashboard">Carica file di report/dashboard (facoltativo)</label>
        <input 
          type="file" 
          id="upload_dashboard" 
          name="upload_dashboard"
          accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
          multiple
        />
        <Hint>Puoi allegare screenshot o file dei tuoi report attuali (PDF, Excel, immagini)</Hint>
      </Field>

      <Field>
        <label className="block">Usate sistemi di tracciamento per la pubblicità?</label>
        <RadioGroup 
          name="pixel_tag_attivi" 
          options={siNoOptions}
          ariaLabel="Pixel/tag attivi"
        />
        <Hint>Es: Facebook Pixel, Google Tag Manager, altri codici di tracciamento</Hint>
      </Field>

      <Field conditional="pixel_tag_attivi==si">
        <label htmlFor="quali_tag">Quali sistemi di tracciamento usate?</label>
        <input 
          type="text" 
          id="quali_tag" 
          name="quali_tag"
          placeholder="Es: Facebook Pixel, Google Tag Manager..."
        />
      </Field>

      {/* SEZIONE AVANZATA (FACOLTATIVA) */}
      <details>
        <summary style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <BarChartSummaryIcon />
          Sezione Avanzata (facoltativa)
        </summary>
        <p style={{color: 'var(--c-muted)', fontSize: '0.9rem', marginBottom: 'var(--space-6)'}}>
          Questi dati sono utili ma non fondamentali. Compila solo se li conosci.
        </p>

        <Field>
          <label htmlFor="traffico_mensile">Quante visite riceve il sito al mese?</label>
          <Select 
            id="traffico_mensile" 
            name="traffico_mensile" 
            options={trafficoOptions}
          />
          <Hint>Numero di visite/sessioni mensili al sito web</Hint>
        </Field>

        <Field>
          <label htmlFor="conversion_rate">Quanti visitatori diventano clienti?</label>
          <Select 
            id="conversion_rate" 
            name="conversion_rate" 
            options={conversionOptions}
          />
          <Hint>Percentuale di conversione: quanti di chi visita il sito poi compra (stima va bene)</Hint>
        </Field>

        <Field>
          <label htmlFor="cpl_cpa">Quanto pagate per ogni contatto/vendita dalla pubblicità?</label>
          <input 
            type="text" 
            id="cpl_cpa" 
            name="cpl_cpa" 
            inputMode="decimal"
            placeholder="Es: 25€ per contatto, 100€ per vendita"
          />
          <Hint>Costo medio per acquisire un contatto o una vendita tramite ads (stima va bene)</Hint>
        </Field>

        <Field>
          <label htmlFor="clienti_ricorrenti_perc">Che percentuale di clienti torna ad acquistare?</label>
          <Select 
            id="clienti_ricorrenti_perc" 
            name="clienti_ricorrenti_perc" 
            options={ricorrentiOptions}
          />
          <Hint>Tasso di ritorno: clienti che fanno più di un acquisto (stima va bene)</Hint>
        </Field>
      </details>
    </fieldset>
  );
};

export default DatiStrumentiSection;
