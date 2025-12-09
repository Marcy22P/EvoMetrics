export interface ServiziSelezionati {
  ecommerce: string[];
  emailMarketing: string[];
  videoPost: string[];
  metaAds: string[];
  googleAds: string[];
  seo: string[];
}

export interface PrezziServizi {
  [key: string]: number | string;
}

export interface PreventivoData {
  id?: string;
  numero: string;
  data: string;
  validita: string;
  cliente: string;
  oggetto: string;
  tipologiaIntervento: string;
  tipologiaInterventoEcommerce?: string; // Descrizione personalizzata per E-commerce
  tipologiaInterventoMarketing?: string; // Descrizione personalizzata per Marketing
  tipologiaInterventoVideoPost?: string; // Descrizione personalizzata per Video e Post
  tipologiaInterventoMetaAds?: string; // Descrizione personalizzata per Meta Ads
  tipologiaInterventoGoogleAds?: string; // Descrizione personalizzata per Google Ads
  tipologiaInterventoSeo?: string; // Descrizione personalizzata per SEO
  tipologiaInterventoEmailMarketing?: string; // Descrizione personalizzata per Email Marketing
  servizi: ServiziSelezionati;
  prezzi: PrezziServizi;
  note: string;
  terminiPagamento: string;
  terminiCondizioni: string;
  subtotale?: number;
  iva?: number;
  totale?: number;
}

export interface Totali {
  subtotale: number;
  iva: number;
  totale: number;
}

export interface Categoria {
  id: keyof ServiziSelezionati;
  nome: string;
  descrizione: string;
  sottoservizi: Sottoservizio[];
}

export interface Sottoservizio {
  id: string;
  nome: string;
  descrizione: string;
}

// Dati dei servizi strutturati
export const SERVIZI_DATA: Categoria[] = [
  {
    id: 'ecommerce',
    nome: 'E-COMMERCE',
    descrizione: 'Realizzazione completa di un sito e-commerce professionale, ottimizzato per vendere online in modo efficace. Ogni progetto è pensato per guidare l\'utente all\'acquisto attraverso un\'esperienza fluida, coinvolgente e sicura.',
    sottoservizi: [
      { id: 'ux_ui', nome: 'Sviluppo UX&UI', descrizione: 'Progettazione dell\'esperienza utente (UX) e dell\'interfaccia grafica (UI) per rendere il sito intuitivo, bello da vedere e facile da navigare.' },
      { id: 'alberatura', nome: 'Alberatura menù navigazione', descrizione: 'Creazione della struttura logica del menù per aiutare gli utenti a trovare facilmente ciò che cercano.' },
      { id: 'pagine', nome: 'Creazione pagine', descrizione: 'Realizzazione delle principali pagine del sito: homepage, categorie, pagine prodotto, pagine informative, ecc.' },
      { id: 'copy', nome: 'Sviluppo del copy', descrizione: 'Scrittura dei testi del sito con un linguaggio coerente al tono di voce del brand e ottimizzato per la vendita.' },
      { id: 'media', nome: 'Sviluppo fotografie/video', descrizione: 'Produzione o selezione di immagini e video di alta qualità per valorizzare i prodotti e l\'identità del brand.' },
      { id: 'carrello', nome: 'Creazione carrello', descrizione: 'Impostazione del carrello per facilitare il processo d\'acquisto, ridurre l\'abbandono e aumentare le conversioni.' },
      { id: 'upsell', nome: 'Creazione up-sell/cross-sell', descrizione: 'Inserimento di suggerimenti d\'acquisto per aumentare il valore medio del carrello (es. "potrebbe interessarti anche").' },
      { id: 'filtri', nome: 'Creazione filtri', descrizione: 'Configurazione di filtri di ricerca per migliorare la navigazione (es. per taglia, colore, prezzo, collezione).' },
      { id: 'import_prodotti', nome: 'Import dei prodotti', descrizione: 'Caricamento dei prodotti all\'interno dello shop, con immagini, descrizioni, varianti e prezzi.' },
      { id: 'catalogazione', nome: 'Catalogazione dei prodotti', descrizione: 'Organizzazione dei prodotti in categorie logiche per facilitare la navigazione e la gestione interna.' },
      { id: 'automation_mail', nome: 'Automation mail', descrizione: 'Configurazione di email automatiche (es. carrello abbandonato, post-acquisto, conferme d\'ordine) per fidelizzare i clienti.' },
      { id: 'chatbot', nome: 'Chat bot assistenza', descrizione: 'Attivazione di un sistema di messaggistica automatica per assistere l\'utente in tempo reale.' },
      { id: 'legal', nome: 'Creazione pagine legal', descrizione: 'Creazione delle pagine obbligatorie per legge (privacy policy, termini e condizioni, resi, ecc.).' },
      { id: 'accessibilita', nome: 'Accessibilità secondo standard europei', descrizione: 'Adattamento del sito per renderlo utilizzabile da persone con disabilità, secondo le normative vigenti.' },
      { id: 'pagamenti', nome: 'Implementazione dei metodi di pagamento', descrizione: 'Attivazione di sistemi di pagamento sicuri (es. carta, Klarna, PayPal, bonifico, ecc.).' },
      { id: 'gamification', nome: 'Gamification on-site', descrizione: 'Inserimento di elementi interattivi per aumentare il coinvolgimento (es. ruote della fortuna, premi, badge, quiz).' },
      { id: 'formazione', nome: 'Formazione al team e materiale informativo', descrizione: 'Sessioni formative e guide pratiche per permettere al team interno di gestire il sito in autonomia.' },
      { id: 'storelocator', nome: 'Implementazione di storelocator', descrizione: 'Aggiunta di una mappa interattiva per localizzare facilmente i punti vendita fisici.' },
      { id: 'import_clienti', nome: 'Import lista clienti', descrizione: 'Caricamento del database clienti all\'interno del sistema (utile per email marketing o CRM).' },
      { id: 'onsite', nome: 'Ottimizzazione on-site', descrizione: 'Interventi tecnici e contenutistici all\'interno del sito per renderlo SEO friendly.' },
      { id: 'linkbuilding', nome: 'Linkbuilding', descrizione: 'Strategie per ottenere link da altri siti autorevoli e migliorare la reputazione online.' }
    ]
  },
  {
    id: 'emailMarketing',
    nome: 'EMAIL MARKETING',
    descrizione: 'Gestione completa delle email aziendali con l\'obiettivo di fidelizzare i clienti, recuperare vendite perse e aumentare il fatturato con comunicazioni automatizzate e campagne personalizzate.',
    sottoservizi: [
      { id: 'strategico', nome: 'Sviluppo strategico', descrizione: 'Definizione della strategia di email marketing: target, obiettivi, tipologie di comunicazione.' },
      { id: 'flussi_automatici', nome: 'Creazione di flussi automatici', descrizione: 'Impostazione di email automatizzate (es. benvenuto, carrello abbandonato, compleanni) per seguire il cliente in ogni fase.' },
      { id: 'copy_email', nome: 'Scrittura dei copy', descrizione: 'Testi pensati per catturare l\'attenzione e spingere all\'azione, coerenti con il tono del brand.' },
      { id: 'grafica_email', nome: 'Organizzazione grafica', descrizione: 'Creazione di layout visivamente efficaci e in linea con l\'identità visiva aziendale.' },
      { id: 'campagne', nome: 'Impostazione campagne', descrizione: 'Creazione e programmazione di invii periodici su promozioni, lanci, eventi o novità.' }
    ]
  },
  {
    id: 'videoPost',
    nome: 'VIDEO E POST',
    descrizione: 'Produzione e post-produzione di contenuti visivi (video e grafiche) adatti ai social media e alle campagne pubblicitarie, in grado di comunicare il messaggio del brand in modo coinvolgente.',
    sottoservizi: [
      { id: 'storyboard', nome: 'Storyboard (direzione creativa)', descrizione: 'Ideazione del concept visivo e della struttura del video prima delle riprese.' },
      { id: 'scene', nome: 'Sviluppo delle scene', descrizione: 'Organizzazione e realizzazione delle riprese video con attenzione ai dettagli e alla narrazione.' },
      { id: 'fotografie', nome: 'Sviluppo fotografie', descrizione: 'Shooting fotografico per creare contenuti di alta qualità per social e sito.' },
      { id: 'editing', nome: 'Editing video', descrizione: 'Montaggio professionale dei video con sottotitoli, musica, tagli dinamici e ottimizzazione per i social.' },
      { id: 'grafiche', nome: 'Creazione di grafiche', descrizione: 'Progettazione di elementi visivi statici per post, caroselli o contenuti ADV.' },
      { id: 'copy_video', nome: 'Creazione dei copy', descrizione: 'Testi brevi ma incisivi per accompagnare contenuti visivi su Reels, TikTok, post, ecc.' }
    ]
  },
  {
    id: 'metaAds',
    nome: 'META ADS (Facebook/Instagram)',
    descrizione: 'Creazione e gestione di campagne pubblicitarie su Facebook e Instagram per generare vendite, lead o notorietà. Tutto viene monitorato e ottimizzato per massimizzare il ritorno sull\'investimento.',
    sottoservizi: [
      { id: 'business_manager', nome: 'Creazione/impostazione Business Manager', descrizione: 'Apertura e configurazione corretta della piattaforma pubblicitaria Meta.' },
      { id: 'pixel', nome: 'Creazione pixel', descrizione: 'Installazione del codice che traccia le azioni degli utenti sul sito.' },
      { id: 'assistenza', nome: 'Assistenza per eventuali problematiche', descrizione: 'Supporto in caso di blocchi, disapprovazioni, problemi tecnici con Meta.' },
      { id: 'funnel', nome: 'Organizzazione del funnel', descrizione: 'Strutturazione del percorso pubblicitario (es. scoperta, coinvolgimento, conversione).' },
      { id: 'budgeting', nome: 'Budgeting', descrizione: 'Definizione e gestione dei budget pubblicitari in base agli obiettivi.' },
      { id: 'creative', nome: 'Creazione delle creative (video + grafiche)', descrizione: 'Produzione dei contenuti visivi da utilizzare nelle campagne.' },
      { id: 'test_creative', nome: 'Test nuove creatività', descrizione: 'Sperimentazione di varianti per capire quali funzionano meglio.' },
      { id: 'scaling', nome: 'Scaling/ottimizzazione del budget', descrizione: 'Gestione del budget in base alle performance, per aumentare i risultati.' },
      { id: 'cambio_creative', nome: 'Cambio creative', descrizione: 'Sostituzione periodica dei contenuti pubblicitari per evitare stanchezza visiva.' }
    ]
  },
  {
    id: 'googleAds',
    nome: 'GOOGLE ADS',
    descrizione: 'Configurazione e gestione delle campagne pubblicitarie su Google: motore di ricerca, YouTube, Shopping e Display. Perfette per intercettare clienti con intenzione d\'acquisto.',
    sottoservizi: [
      { id: 'account_ads', nome: 'Configurazione account Ads', descrizione: 'Settaggio dell\'account pubblicitario Google Ads.' },
      { id: 'ga4', nome: 'Configurazione account GA4', descrizione: 'Attivazione e configurazione di Google Analytics 4 per analizzare il comportamento degli utenti.' },
      { id: 'merchant_center', nome: 'Configurazione merchant center', descrizione: 'Preparazione della piattaforma necessaria per le campagne Shopping.' },
      { id: 'tracking_google', nome: 'Tracking', descrizione: 'Impostazione del tracciamento conversioni per misurare i risultati reali delle campagne.' },
      { id: 'campagne_google', nome: 'Creazione campagne Google Ads', descrizione: 'Attivazione delle campagne pubblicitarie su ricerca, YouTube o display.' },
      { id: 'ottimizzazione_google', nome: 'Ottimizzazione campagne Google Ads', descrizione: 'Revisione e miglioramento costante delle campagne per aumentare le conversioni.' }
    ]
  },
  {
    id: 'seo',
    nome: 'SEO (Search Engine Optimization)',
    descrizione: 'Ottimizzazione del sito per migliorare il posizionamento nei motori di ricerca e aumentare il traffico organico da utenti realmente interessati.',
    sottoservizi: [
      { id: 'keywords', nome: 'Analisi Keywords del settore di riferimento', descrizione: 'Ricerca e selezione delle parole chiave migliori per attrarre clienti.' },
      { id: 'strategica', nome: 'Ottimizzazione strategica durante la collaborazione', descrizione: 'Monitoraggio e aggiornamento costante della strategia SEO in base ai risultati ottenuti.' }
    ]
  }
];
