import React from 'react';
import { Field, Hint, CheckboxGroup, Select } from './FormComponents';

const ObiettiviSection: React.FC = () => {
  const obiettiviOptions = [
    { value: 'piu_vendite', label: 'Più vendite' },
    { value: 'piu_contatti', label: 'Più contatti/richieste' },
    { value: 'visite_negozio', label: 'Più visite in negozio/ufficio' },
    { value: 'prenotazioni', label: 'Più prenotazioni' },
    { value: 'brand_awareness', label: 'Farci conoscere di più' },
    { value: 'fidelizzazione', label: 'Fidelizzare i clienti attuali' },
    { value: 'nuovo_mercato', label: 'Entrare in un nuovo mercato' },
    { value: 'altro', label: 'Altro' }
  ];

  const metricaOptions = [
    { value: '', label: 'Seleziona...' },
    { value: 'fatturato', label: 'Fatturato / Vendite' },
    { value: 'contatti', label: 'Numero di contatti' },
    { value: 'clienti_nuovi', label: 'Numero di clienti nuovi' },
    { value: 'visite', label: 'Visite al negozio/ufficio' },
    { value: 'prenotazioni', label: 'Prenotazioni' },
    { value: 'notorieta', label: 'Notorietà del brand' }
  ];

  const budgetOptions = [
    { value: '', label: 'Seleziona...' },
    { value: '500-1000', label: '500€ - 1.000€' },
    { value: '1000-3000', label: '1.000€ - 3.000€' },
    { value: '3000-5000', label: '3.000€ - 5.000€' },
    { value: '5000-10000', label: '5.000€ - 10.000€' },
    { value: '10000+', label: 'Più di 10.000€' },
    { value: 'non_definito', label: 'Non ancora definito' },
    { value: 'preferisco_non_rispondere', label: 'Preferisco non rispondere' }
  ];

  return (
    <fieldset id="obiettivi">
      <legend>3. Obiettivi & priorità (12 mesi)</legend>

      <Field>
        <label className="block">Cosa vorreste ottenere nei prossimi mesi?</label>
        <CheckboxGroup name="obiettivi" options={obiettiviOptions} />
      </Field>

      <Field conditional="obiettivi_includes_altro">
        <label htmlFor="obiettivi_altro">Specifica altri obiettivi</label>
        <textarea 
          id="obiettivi_altro" 
          name="obiettivi_altro" 
          rows={3}
          placeholder="Descrivi cosa vorresti ottenere..."
        />
      </Field>

      <Field>
        <label htmlFor="urgenze_scadenze">Ci sono scadenze urgenti o eventi importanti?</label>
        <textarea 
          id="urgenze_scadenze" 
          name="urgenze_scadenze" 
          rows={3}
          placeholder="Es: lancio prodotto a marzo, stagione estiva, Natale..."
        />
        <Hint>Ci aiuta a capire le priorità temporali</Hint>
      </Field>

      <Field>
        <label htmlFor="metrica_successo">Come misurate il successo?</label>
        <Select 
          id="metrica_successo" 
          name="metrica_successo" 
          options={metricaOptions}
        />
      </Field>

      <Field>
        <label htmlFor="budget_indicativo">Budget indicativo per il marketing (al mese)</label>
        <Select 
          id="budget_indicativo" 
          name="budget_indicativo" 
          options={budgetOptions}
        />
        <Hint>Include pubblicità, strumenti e servizi di marketing</Hint>
      </Field>
    </fieldset>
  );
};

export default ObiettiviSection;
