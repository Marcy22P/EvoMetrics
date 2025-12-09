import React from 'react';
import { Field, Hint, RadioGroup } from './FormComponents';

const OstacoliSection: React.FC = () => {
  const siNoOptions = [
    { value: 'si', label: 'Sì' },
    { value: 'no', label: 'No' }
  ];


  return (
    <fieldset id="ostacoli">
      <legend>6. Ostacoli & risorse</legend>

      <Field>
        <label htmlFor="cosa_ha_frenato">Cosa vi ha frenato nel marketing finora?</label>
        <textarea 
          id="cosa_ha_frenato" 
          name="cosa_ha_frenato" 
          rows={3}
          placeholder="Es: Mancanza di tempo, non sapevamo da dove iniziare, budget limitato..."
        />
        <Hint>I principali ostacoli che avete incontrato</Hint>
      </Field>

      <Field>
        <label htmlFor="limiti_tecnici_creativi">Ci sono limiti tecnici o creativi di cui dovremmo essere a conoscenza?</label>
        <textarea 
          id="limiti_tecnici_creativi" 
          name="limiti_tecnici_creativi" 
          rows={3}
          placeholder="Es: Il sito è vecchio, non abbiamo foto professionali, problemi con il sistema di pagamento..."
        />
      </Field>

      <Field>
        <label className="block">Avete già materiali pubblicitari?</label>
        <RadioGroup 
          name="asset_pubblicitari" 
          options={siNoOptions}
          ariaLabel="Asset pubblicitari"
        />
        <Hint>Foto, video, loghi, brochure, ecc.</Hint>
      </Field>

      <Field conditional="asset_pubblicitari==si">
        <label htmlFor="descrivi_asset">Descrivi che materiali avete</label>
        <textarea 
          id="descrivi_asset" 
          name="descrivi_asset" 
          rows={3}
          placeholder="Es: Logo in vari formati, foto prodotti, video aziendale..."
        />
      </Field>

    </fieldset>
  );
};

export default OstacoliSection;
