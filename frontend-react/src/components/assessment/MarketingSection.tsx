import React from 'react';
import { Field, Hint, CheckboxGroup, Select } from './FormComponents';

const MarketingSection: React.FC = () => {
  const canaliOptions = [
    { value: 'passaparola', label: 'Passaparola' },
    { value: 'social_organici', label: 'Post sui social (gratis)' },
    { value: 'pubblicita_social', label: 'Pubblicità sui social' },
    { value: 'google_ads', label: 'Pubblicità su Google' },
    { value: 'volantini', label: 'Volantini / Stampa' },
    { value: 'fiere_eventi', label: 'Fiere / Eventi' },
    { value: 'email', label: 'Email ai clienti' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'altro', label: 'Altro' },
    { value: 'niente', label: 'Non facciamo nulla' }
  ];

  const chiFaCosaOptions = [
    { value: '', label: 'Seleziona...' },
    { value: 'interno', label: 'Lo facciamo internamente' },
    { value: 'agenzia', label: 'Abbiamo un\'agenzia' },
    { value: 'freelancer', label: 'Abbiamo un freelancer' },
    { value: 'misto', label: 'Un po\' noi, un po\' esterni' },
    { value: 'nessuno', label: 'Nessuno se ne occupa' }
  ];

  const creativitaOptions = [
    { value: 'foto_prodotti', label: 'Foto dei prodotti' },
    { value: 'video', label: 'Video' },
    { value: 'contenuti_clienti', label: 'Contenuti dei clienti (recensioni, foto)' },
    { value: 'niente', label: 'Non creiamo contenuti' }
  ];

  const funnelOptions = [
    { value: '', label: 'Seleziona...' },
    { value: 'diretto', label: 'I clienti ci contattano direttamente' },
    { value: 'online_offline', label: 'Prima ci conoscono online, poi vengono da noi' },
    { value: 'consulenza', label: 'Prima c\'è una consulenza, poi la vendita' },
    { value: 'ecommerce', label: 'Vendita diretta online' },
    { value: 'lungo', label: 'È un processo lungo (settimane/mesi)' }
  ];

  return (
    <fieldset id="marketing">
      <legend>4. Marketing attuale (semplificato)</legend>

      <Field>
        <label className="block">Cosa fate attualmente per farvi conoscere?</label>
        <CheckboxGroup name="canali_attivi" options={canaliOptions} />
      </Field>

      <Field>
        <label htmlFor="chi_fa_cosa">Chi si occupa del marketing?</label>
        <Select 
          id="chi_fa_cosa" 
          name="chi_fa_cosa" 
          options={chiFaCosaOptions}
        />
      </Field>

      <Field>
        <label className="block">Che tipo di contenuti create?</label>
        <CheckboxGroup name="creativita" options={creativitaOptions} />
      </Field>

      <Field>
        <label htmlFor="funnel_semplice">Come avviene il vostro processo di vendita?</label>
        <Select 
          id="funnel_semplice" 
          name="funnel_semplice" 
          options={funnelOptions}
        />
        <Hint>Come passate dal farvi conoscere alla vendita finale</Hint>
      </Field>
    </fieldset>
  );
};

export default MarketingSection;
