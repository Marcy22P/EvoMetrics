import React from 'react';
import { Field, Hint } from './FormComponents';

const NoteFinaliSection: React.FC = () => {
  return (
    <fieldset id="note">
      <legend>7. Note finali</legend>

      <Field>
        <label htmlFor="descrizione_business">Descrivi brevemente la tua azienda e cosa fate</label>
        <textarea 
          id="descrizione_business" 
          name="descrizione_business" 
          rows={3}
          placeholder="Es: Offriamo soluzioni software B2B per PMI del settore manifatturiero..."
        />
        <Hint>La tua proposta di valore unica, il mercato di riferimento e il target di clienti</Hint>
      </Field>

      <Field>
        <label htmlFor="prodotti_driver">Quali prodotti o servizi generano più fatturato?</label>
        <textarea 
          id="prodotti_driver" 
          name="prodotti_driver" 
          rows={3}
          placeholder="Es: Software gestionale, servizi di consulenza, abbonamenti SaaS..."
        />
        <Hint>Elenca i prodotti/servizi che sono i principali driver di ricavi</Hint>
      </Field>

      <Field>
        <label htmlFor="note_finali">C'è altro che vorreste dirci?</label>
        <textarea 
          id="note_finali" 
          name="note_finali" 
          rows={4}
          placeholder="Domande, dubbi, aspettative, o qualsiasi altra cosa che ritenete importante..."
        />
        <Hint>Tutto quello che non abbiamo chiesto ma che ritenete utile</Hint>
      </Field>

    </fieldset>
  );
};

export default NoteFinaliSection;
