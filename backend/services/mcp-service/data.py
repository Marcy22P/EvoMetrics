import json

# Catalogo servizi duplicato da frontend-react/src/types/preventivo.ts
# In un sistema ideale, questo verrebbe generato o condiviso, ma per ora lo teniamo sincronizzato qui.

SERVIZI_CATALOG = [
  {
    "id": "ecommerce",
    "nome": "E-COMMERCE",
    "descrizione": "Realizzazione completa di un sito e-commerce professionale...",
    "sottoservizi": [
      { "id": "ux_ui", "nome": "Sviluppo UX&UI", "descrizione": "Progettazione dell'esperienza utente...", "prezzo_base": 1500 },
      { "id": "alberatura", "nome": "Alberatura menù navigazione", "descrizione": "Creazione della struttura logica...", "prezzo_base": 300 },
      { "id": "pagine", "nome": "Creazione pagine", "descrizione": "Realizzazione delle principali pagine...", "prezzo_base": 800 },
      { "id": "copy", "nome": "Sviluppo del copy", "descrizione": "Scrittura dei testi...", "prezzo_base": 600 },
      { "id": "media", "nome": "Sviluppo fotografie/video", "descrizione": "Produzione contenuti visivi...", "prezzo_base": 1200 },
      { "id": "carrello", "nome": "Creazione carrello", "descrizione": "Impostazione carrello...", "prezzo_base": 400 },
      { "id": "upsell", "nome": "Creazione up-sell/cross-sell", "descrizione": "Suggerimenti d'acquisto...", "prezzo_base": 300 },
      { "id": "filtri", "nome": "Creazione filtri", "descrizione": "Configurazione filtri...", "prezzo_base": 300 },
      { "id": "import_prodotti", "nome": "Import dei prodotti", "descrizione": "Caricamento prodotti...", "prezzo_base": 500 },
      { "id": "catalogazione", "nome": "Catalogazione dei prodotti", "descrizione": "Organizzazione categorie...", "prezzo_base": 400 },
      { "id": "automation_mail", "nome": "Automation mail", "descrizione": "Email automatiche...", "prezzo_base": 600 },
      { "id": "chatbot", "nome": "Chat bot assistenza", "descrizione": "Sistema messaggistica...", "prezzo_base": 400 },
      { "id": "legal", "nome": "Creazione pagine legal", "descrizione": "Privacy policy, termini...", "prezzo_base": 200 },
      { "id": "accessibilita", "nome": "Accessibilità", "descrizione": "Adattamento disabilità...", "prezzo_base": 500 },
      { "id": "pagamenti", "nome": "Implementazione pagamenti", "descrizione": "Sistemi di pagamento...", "prezzo_base": 300 },
      { "id": "gamification", "nome": "Gamification on-site", "descrizione": "Elementi interattivi...", "prezzo_base": 800 },
      { "id": "formazione", "nome": "Formazione team", "descrizione": "Guide e sessioni...", "prezzo_base": 400 },
      { "id": "storelocator", "nome": "Storelocator", "descrizione": "Mappa punti vendita...", "prezzo_base": 300 },
      { "id": "import_clienti", "nome": "Import clienti", "descrizione": "Caricamento DB clienti...", "prezzo_base": 300 },
      { "id": "onsite", "nome": "Ottimizzazione on-site", "descrizione": "SEO tecnica interna...", "prezzo_base": 800 },
      { "id": "linkbuilding", "nome": "Linkbuilding", "descrizione": "Strategie link esterni...", "prezzo_base": 1000 }
    ]
  },
  {
    "id": "emailMarketing",
    "nome": "EMAIL MARKETING",
    "descrizione": "Gestione completa delle email aziendali...",
    "sottoservizi": [
      { "id": "strategico", "nome": "Sviluppo strategico", "descrizione": "Definizione strategia...", "prezzo_base": 500 },
      { "id": "flussi_automatici", "nome": "Flussi automatici", "descrizione": "Email automatizzate...", "prezzo_base": 800 },
      { "id": "copy_email", "nome": "Scrittura copy", "descrizione": "Testi persuasivi...", "prezzo_base": 400 },
      { "id": "grafica_email", "nome": "Grafica", "descrizione": "Layout visivi...", "prezzo_base": 400 },
      { "id": "campagne", "nome": "Impostazione campagne", "descrizione": "Invii periodici...", "prezzo_base": 300 }
    ]
  },
  {
    "id": "videoPost",
    "nome": "VIDEO E POST",
    "descrizione": "Produzione contenuti visivi per social...",
    "sottoservizi": [
      { "id": "storyboard", "nome": "Storyboard", "descrizione": "Concept visivo...", "prezzo_base": 400 },
      { "id": "scene", "nome": "Sviluppo scene", "descrizione": "Riprese video...", "prezzo_base": 1000 },
      { "id": "fotografie", "nome": "Sviluppo fotografie", "descrizione": "Shooting...", "prezzo_base": 800 },
      { "id": "editing", "nome": "Editing video", "descrizione": "Montaggio...", "prezzo_base": 600 },
      { "id": "grafiche", "nome": "Creazione grafiche", "descrizione": "Elementi statici...", "prezzo_base": 300 },
      { "id": "copy_video", "nome": "Creazione copy", "descrizione": "Testi per social...", "prezzo_base": 200 }
    ]
  },
  {
    "id": "metaAds",
    "nome": "META ADS",
    "descrizione": "Campagne pubblicitarie Facebook/Instagram...",
    "sottoservizi": [
      { "id": "business_manager", "nome": "Setup Business Manager", "descrizione": "Configurazione account...", "prezzo_base": 300 },
      { "id": "pixel", "nome": "Creazione pixel", "descrizione": "Installazione tracciamento...", "prezzo_base": 200 },
      { "id": "assistenza", "nome": "Assistenza", "descrizione": "Supporto tecnico...", "prezzo_base": 200 },
      { "id": "funnel", "nome": "Organizzazione funnel", "descrizione": "Percorso utente...", "prezzo_base": 600 },
      { "id": "budgeting", "nome": "Budgeting", "descrizione": "Gestione budget...", "prezzo_base": 300 },
      { "id": "creative", "nome": "Creazione creative", "descrizione": "Produzione video/grafiche...", "prezzo_base": 500 },
      { "id": "test_creative", "nome": "Test creative", "descrizione": "Sperimentazione...", "prezzo_base": 400 },
      { "id": "scaling", "nome": "Scaling", "descrizione": "Ottimizzazione budget...", "prezzo_base": 400 },
      { "id": "cambio_creative", "nome": "Cambio creative", "descrizione": "Rotazione contenuti...", "prezzo_base": 300 }
    ]
  },
  {
    "id": "googleAds",
    "nome": "GOOGLE ADS",
    "descrizione": "Campagne pubblicitarie Google...",
    "sottoservizi": [
      { "id": "account_ads", "nome": "Configurazione account", "descrizione": "Settaggio Google Ads...", "prezzo_base": 300 },
      { "id": "ga4", "nome": "Configurazione GA4", "descrizione": "Google Analytics 4...", "prezzo_base": 400 },
      { "id": "merchant_center", "nome": "Merchant Center", "descrizione": "Per campagne Shopping...", "prezzo_base": 400 },
      { "id": "tracking_google", "nome": "Tracking", "descrizione": "Tracciamento conversioni...", "prezzo_base": 300 },
      { "id": "campagne_google", "nome": "Creazione campagne", "descrizione": "Search, YouTube, Display...", "prezzo_base": 600 },
      { "id": "ottimizzazione_google", "nome": "Ottimizzazione", "descrizione": "Miglioramento performance...", "prezzo_base": 500 }
    ]
  },
  {
    "id": "seo",
    "nome": "SEO",
    "descrizione": "Ottimizzazione posizionamento motori ricerca...",
    "sottoservizi": [
      { "id": "keywords", "nome": "Analisi Keywords", "descrizione": "Ricerca parole chiave...", "prezzo_base": 600 },
      { "id": "strategica", "nome": "Ottimizzazione strategica", "descrizione": "Monitoraggio e aggiornamento...", "prezzo_base": 800 }
    ]
  }
]

PREVENTIVO_SCHEMA = {
  "type": "object",
  "properties": {
    "cliente": {"type": "string", "description": "Nome del cliente o azienda"},
    "oggetto": {"type": "string", "description": "Oggetto del preventivo"},
    "data": {"type": "string", "description": "Data in formato YYYY-MM-DD"},
    "validita": {"type": "string", "description": "Data validità in formato YYYY-MM-DD"},
    "tipologiaIntervento": {"type": "string", "description": "Descrizione generale dell'intervento"},
    "servizi": {
      "type": "object",
      "description": "Oggetto con chiavi uguali agli ID delle categorie (ecommerce, metaAds, ecc.) e valori array di ID sottoservizi",
      "properties": {
        "ecommerce": {"type": "array", "items": {"type": "string"}},
        "emailMarketing": {"type": "array", "items": {"type": "string"}},
        "videoPost": {"type": "array", "items": {"type": "string"}},
        "metaAds": {"type": "array", "items": {"type": "string"}},
        "googleAds": {"type": "array", "items": {"type": "string"}},
        "seo": {"type": "array", "items": {"type": "string"}}
      }
    },
    "prezzi": {
      "type": "object",
      "description": "Mappa ID sottoservizio -> Prezzo (float)",
      "additionalProperties": {"type": "number"}
    },
    "note": {"type": "string"},
    "terminiPagamento": {"type": "string"},
    "terminiCondizioni": {"type": "string"}
  },
  "required": ["cliente", "oggetto", "servizi", "prezzi"]
}

# Categorie di spese per categorizzazione fiscale
EXPENSE_CATEGORIES = [
    {
        "key": "beni_strumentali",
        "label": "Spese per beni strumentali",
        "deductibility": "100% o ammortamento annuale",
        "type": "Deducibilità",
        "description": "Beni durevoli, ad esempio computer, mobili e macchinari, dedotti tramite ammortamento secondo le aliquote fiscali previste."
    },
    {
        "key": "canoni_locazione",
        "label": "Canoni di locazione",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Affitti per locali commerciali e uffici utilizzati dalla società."
    },
    {
        "key": "utenze",
        "label": "Utenze (luce, gas, telefono, internet)",
        "deductibility": "100% o percentuale per uso promiscuo",
        "type": "Deducibilità",
        "description": "Se utilizzate solo per attività aziendale sono deducibili al 100%. Se vi è uso promiscuo, ad esempio casa e ufficio, la deduzione è solo parziale."
    },
    {
        "key": "spese_rappresentanza",
        "label": "Spese di rappresentanza",
        "deductibility": "Massimo 1,5% dei ricavi",
        "type": "Deducibilità",
        "description": "Spese per omaggi, cene con clienti ed eventi, deducibili nei limiti stabiliti dall'articolo 108 del TUIR."
    },
    {
        "key": "pubblicita_marketing",
        "label": "Costi per pubblicità e marketing",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Inserzioni pubblicitarie, advertising online e produzione di contenuti promozionali legati all'attività."
    },
    {
        "key": "compensi_amministratori",
        "label": "Compensi amministratori",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Retribuzioni agli amministratori della società, purché deliberate correttamente e effettivamente pagate."
    },
    {
        "key": "stipendi_contributi",
        "label": "Stipendi e contributi dipendenti",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Tutti i costi legati al personale, compresi contributi INPS, TFR e IRAP calcolata sul costo del lavoro."
    },
    {
        "key": "formazione_personale",
        "label": "Formazione del personale",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Spese per corsi, aggiornamenti, master e formazione se inerenti all'attività aziendale."
    },
    {
        "key": "consulenza",
        "label": "Spese di consulenza",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Onorari di commercialisti, avvocati, consulenti marketing, IT e altri professionisti che supportano l'azienda."
    },
    {
        "key": "autoveicoli_aziendali",
        "label": "Spese per autoveicoli aziendali",
        "deductibility": "Dal 20% al 70%",
        "type": "Deducibilità",
        "description": "La percentuale deducibile varia in base all'utilizzo. In genere il 20% se l'auto è a uso promiscuo, fino al 70% se l'utilizzo è esclusivamente aziendale e adeguatamente documentato."
    },
    {
        "key": "carburante_manutenzione",
        "label": "Carburante e manutenzione auto",
        "deductibility": "Dal 20% al 70%",
        "type": "Deducibilità",
        "description": "Spese per carburante, manutenzione e gestione dei veicoli, con le stesse percentuali e regole previste per gli autoveicoli aziendali."
    },
    {
        "key": "alberghiere_ristorazione",
        "label": "Spese alberghiere e ristorazione",
        "deductibility": "75%",
        "type": "Deducibilità",
        "description": "Spese per hotel e ristoranti deducibili al 75%, solo se documentate e collegate a viaggi o attività di lavoro."
    },
    {
        "key": "telefoniche_cellulari",
        "label": "Spese telefoniche (cellulari)",
        "deductibility": "80%",
        "type": "Deducibilità",
        "description": "Spese per telefoni cellulari intestati alla società e utilizzati per finalità lavorative, deducibili in misura percentuale."
    },
    {
        "key": "software_licenze",
        "label": "Software e licenze",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Costi per software gestionali, servizi SaaS e licenze d'uso come Office, Adobe e strumenti simili utilizzati in azienda."
    },
    {
        "key": "bancarie_assicurative",
        "label": "Spese bancarie e assicurative",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Canoni bancari, interessi passivi su conti e finanziamenti aziendali, nonché premi per polizze assicurative aziendali."
    },
    {
        "key": "imposte_tasse",
        "label": "Imposte e tasse",
        "deductibility": "Variabile",
        "type": "Deducibilità",
        "description": "L'IMU non è deducibile. L'IRAP è solo parzialmente deducibile. Imposta di bollo e diritti camerali risultano invece deducibili."
    },
    {
        "key": "omaggi_clienti",
        "label": "Omaggi a clienti",
        "deductibility": "Fino a 50 euro per unità, deducibili al 100%",
        "type": "Deducibilità",
        "description": "Omaggi di modico valore fino a 50 euro per singola unità sono interamente deducibili. Per importi superiori si applicano i limiti e le regole delle spese di rappresentanza."
    },
    {
        "key": "fiere_eventi",
        "label": "Spese per fiere ed eventi",
        "deductibility": "100%",
        "type": "Deducibilità",
        "description": "Costi per partecipare a fiere, esposizioni ed eventi, purché collegati all'attività e al settore in cui opera l'azienda."
    },
    {
        "key": "ammortamenti_immateriali",
        "label": "Ammortamenti immateriali",
        "deductibility": "Secondo aliquota",
        "type": "Deducibilità",
        "description": "Costi relativi a beni immateriali, come brevetti, marchi, know how e avviamento, dedotti tramite rate di ammortamento secondo le aliquote fiscali."
    },
    {
        "key": "ricerca_sviluppo",
        "label": "Spese di ricerca e sviluppo",
        "deductibility": "100% più eventuali crediti d'imposta",
        "type": "Deducibilità",
        "description": "Spese per attività di ricerca e sviluppo interne o esterne, che possono beneficiare anche di incentivi fiscali aggiuntivi, ad esempio quelli collegati a programmi come Transizione 5.0."
    },
    {
        "key": "altro",
        "label": "Altro",
        "deductibility": "Da verificare",
        "type": "Deducibilità",
        "description": "Categoria generica per spese non categorizzate"
    }
]

