import React from 'react';
import { Field, Hint, Select } from './FormComponents';

const AnagraficaSection: React.FC = () => {
  const settoreOptions = [
    { value: '', label: 'Seleziona il settore...' },
    { value: 'tecnologia', label: 'Tecnologia / Software' },
    { value: 'ecommerce', label: 'E-commerce / Retail' },
    { value: 'servizi', label: 'Servizi professionali' },
    { value: 'manifatturiero', label: 'Manifatturiero' },
    { value: 'ristorazione', label: 'Ristorazione / Food' },
    { value: 'turismo', label: 'Turismo / Hospitality' },
    { value: 'salute', label: 'Salute / Benessere' },
    { value: 'formazione', label: 'Formazione / Educazione' },
    { value: 'immobiliare', label: 'Immobiliare' },
    { value: 'automotive', label: 'Automotive' },
    { value: 'altro', label: 'Altro' }
  ];

  const dimensioneOptions = [
    { value: '', label: 'Seleziona...' },
    { value: '1-5', label: '1-5 persone' },
    { value: '6-15', label: '6-15 persone' },
    { value: '16-50', label: '16-50 persone' },
    { value: '51-100', label: '51-100 persone' },
    { value: '100+', label: 'Più di 100 persone' }
  ];

  return (
    <fieldset id="anagrafica">
      <legend>1. Anagrafica azienda</legend>

      <Field>
        <label htmlFor="ragione_sociale">Nome dell'azienda</label>
        <input 
          type="text" 
          id="ragione_sociale" 
          name="ragione_sociale"
          placeholder="Es: Mario Rossi SRL"
        />
        <Hint>Il nome ufficiale della vostra azienda</Hint>
      </Field>

      <Field>
        <label htmlFor="settore_attivita">In che settore operate?</label>
        <Select 
          id="settore_attivita" 
          name="settore_attivita" 
          options={settoreOptions}
        />
      </Field>

      <Field conditional="settore_attivita==altro">
        <label htmlFor="settore_altro">Specifica il settore</label>
        <input 
          type="text" 
          id="settore_altro" 
          name="settore_altro"
          placeholder="Descrivi brevemente il vostro settore"
        />
      </Field>

      <Field>
        <label htmlFor="dimensione_team">Quante persone lavorano in azienda?</label>
        <Select 
          id="dimensione_team" 
          name="dimensione_team" 
          options={dimensioneOptions}
        />
      </Field>

      <Field>
        <label htmlFor="referente_nome">Il tuo nome</label>
        <input 
          type="text" 
          id="referente_nome" 
          name="referente_nome"
          placeholder="Es: Mario Rossi"
        />
      </Field>

      <Field>
        <label htmlFor="referente_email">La tua email</label>
        <input 
          type="email" 
          id="referente_email" 
          name="referente_email"
          placeholder="mario@azienda.it"
        />
      </Field>

      <Field>
        <label htmlFor="referente_telefono">Il tuo telefono</label>
        <input 
          type="tel" 
          id="referente_telefono" 
          name="referente_telefono"
          placeholder="+39 123 456 7890"
        />
      </Field>

      <Field>
        <label htmlFor="decisori_coinvolti">Chi prende le decisioni su marketing e budget?</label>
        <textarea 
          id="decisori_coinvolti" 
          name="decisori_coinvolti" 
          rows={3}
          placeholder="Es: Io e il mio socio, oppure Solo io, oppure Devo consultare il consiglio..."
        />
        <Hint>Ci aiuta a capire chi dovrebbe essere coinvolto nelle decisioni</Hint>
      </Field>
    </fieldset>
  );
};

export default AnagraficaSection;
