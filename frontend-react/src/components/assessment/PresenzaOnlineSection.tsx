import React from 'react';
import { Field, Hint, RadioGroup, CheckboxGroup, Select } from './FormComponents';

const PresenzaOnlineSection: React.FC = () => {
  const siNoOptions = [
    { value: 'si', label: 'Sì' },
    { value: 'no', label: 'No' }
  ];

  const socialOptions = [
    { value: 'facebook', label: 'Facebook' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'whatsapp', label: 'WhatsApp Business' },
    { value: 'altro', label: 'Altro' }
  ];

  const ecommerceOptions = [
    { value: '', label: 'Seleziona...' },
    { value: 'shopify', label: 'Shopify' },
    { value: 'woocommerce', label: 'WooCommerce' },
    { value: 'magento', label: 'Magento' },
    { value: 'prestashop', label: 'PrestaShop' },
    { value: 'amazon', label: 'Amazon' },
    { value: 'ebay', label: 'eBay' },
    { value: 'altro', label: 'Altro' }
  ];

  return (
    <fieldset id="presenza-online">
      <legend>2. Presenza online</legend>

      <Field>
        <label className="block">Avete un sito web?</label>
        <RadioGroup 
          name="sito_web_presente" 
          options={siNoOptions}
          ariaLabel="Sito web presente"
        />
      </Field>

      <Field conditional="sito_web_presente==si">
        <label htmlFor="sito_web_url">URL del sito</label>
        <input 
          id="sito_web_url" 
          name="sito_web_url" 
          type="url"
          placeholder="https://esempio.it"
        />
        <Hint>Incolla l'URL completo (es. https://miosito.it). Se non sei sicuro, lascia vuoto.</Hint>
      </Field>

      <Field>
        <label className="block">Su quali social siete presenti?</label>
        <CheckboxGroup name="social_attivi" options={socialOptions} />
      </Field>

      <Field conditional="social_attivi_includes_altro">
        <label htmlFor="social_altro">Specifica altri social</label>
        <input 
          type="text" 
          id="social_altro" 
          name="social_altro"
          placeholder="Es: Twitter, Pinterest..."
        />
      </Field>

      <Field>
        <label className="block">Vendete online?</label>
        <RadioGroup 
          name="ecommerce_presente" 
          options={siNoOptions}
          ariaLabel="E-commerce presente"
        />
      </Field>

      <Field conditional="ecommerce_presente==si">
        <label htmlFor="piattaforma_ecommerce">Che piattaforma usate?</label>
        <Select 
          id="piattaforma_ecommerce" 
          name="piattaforma_ecommerce" 
          options={ecommerceOptions}
        />
      </Field>

      <Field conditional="piattaforma_ecommerce==altro">
        <label htmlFor="piattaforma_altro">Specifica la piattaforma</label>
        <input 
          type="text" 
          id="piattaforma_altro" 
          name="piattaforma_altro"
          placeholder="Nome della piattaforma che usate"
        />
      </Field>
    </fieldset>
  );
};

export default PresenzaOnlineSection;
