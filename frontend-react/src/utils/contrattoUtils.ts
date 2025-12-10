import type { ContrattoData } from '../types/contratto';

// Funzione per convertire numeri in lettere italiane
export const numberToWords = (num: number): string => {
  if (num === 0) return 'zero';
  
  const ones = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
  const teens = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
  const tens = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
  
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    if (one === 0) return tens[ten];
    if (one === 1 || one === 8) return tens[ten].slice(0, -1) + ones[one];
    return tens[ten] + ones[one];
  }
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    let result = hundred === 1 ? 'cento' : ones[hundred] + 'cento';
    if (remainder > 0) {
      result += remainder < 10 ? ones[remainder] : 
                remainder < 20 ? teens[remainder - 10] :
                remainder % 10 === 0 ? tens[Math.floor(remainder / 10)] :
                remainder % 10 === 1 || remainder % 10 === 8 ? 
                  tens[Math.floor(remainder / 10)].slice(0, -1) + ones[remainder % 10] :
                  tens[Math.floor(remainder / 10)] + ones[remainder % 10];
    }
    return result;
  }
  if (num < 1000000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    let result = thousand === 1 ? 'mille' : numberToWords(thousand) + 'mila';
    if (remainder > 0) {
      result += remainder < 100 ? 
        (remainder < 10 ? ones[remainder] : 
         remainder < 20 ? teens[remainder - 10] :
         remainder % 10 === 0 ? tens[Math.floor(remainder / 10)] :
         remainder % 10 === 1 || remainder % 10 === 8 ? 
           tens[Math.floor(remainder / 10)].slice(0, -1) + ones[remainder % 10] :
           tens[Math.floor(remainder / 10)] + ones[remainder % 10]) :
        numberToWords(remainder);
    }
    return result;
  }
  return num.toString(); // Per numeri molto grandi, restituisci il numero
};

// Funzione per formattare le cifre economiche con numeri e lettere
export const formatCurrencyWithWords = (amount: number): string => {
  const formatted = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
  
  const words = numberToWords(amount);
  return `${formatted} (${words}/00)`;
};

// Funzione per formattare le date in formato italiano
export const formatDateItalian = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return 'Data non valida';
  }
  
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${day}/${month}/${year}`;
};

// Funzioni per generare i contenuti degli articoli del contratto
export const generateArticolo2Oggetto = (tipologiaServizio: string): string => {
  switch (tipologiaServizio) {
    case 'sito_marketing_linkbuilding':
      return `L'oggetto del presente contratto è la fornitura, da parte di Evoluzione Imprese, di un pacchetto di servizi volto alla creazione e allo sviluppo di un ecosistema digitale per il Committente.

Tale ecosistema sarà costruito attraverso lo sviluppo di un nuovo e-commerce su base Shopify e l'utilizzo strategico dei canali social, mediante la produzione di contenuti e campagne META finalizzate all'aumento del traffico verso i profili social e il punto vendita online.`;

    case 'sito_marketing':
      return `L'oggetto del presente contratto è la fornitura, da parte di Evoluzione Imprese, di un pacchetto di servizi volto alla creazione e allo sviluppo di un ecosistema digitale per il Committente.

Tale ecosistema sarà costruito attraverso lo sviluppo di un nuovo e-commerce su base Shopify e l'utilizzo strategico dei canali social, mediante la produzione di contenuti e campagne META finalizzate all'aumento del traffico verso i profili social e il punto vendita online.`;

    case 'marketing_content_adv':
      return `L'oggetto del presente contratto è la fornitura, da parte di Evoluzione Imprese, di un pacchetto di servizi volto alla creazione e allo sviluppo di un ecosistema digitale per il Committente.

Tale ecosistema sarà costruito attraverso l'utilizzo strategico dei canali social, mediante la produzione di contenuti e campagne META finalizzate all'aumento del traffico verso i profili social e il punto vendita online.`;

    case 'marketing_adv':
      return `L'oggetto del presente contratto è la fornitura, da parte di Evoluzione Imprese, di un pacchetto di servizi volto alla creazione e allo sviluppo di un ecosistema digitale per il Committente.

Tale ecosistema sarà costruito attraverso l'utilizzo strategico dei canali social, mediante campagne META finalizzate all'aumento del traffico verso i profili social e il punto vendita online.`;

    case 'solo_sito':
      return `L'oggetto del presente contratto è la fornitura, da parte di Evoluzione Imprese, di un servizio professionale volto alla creazione, progettazione e sviluppo di un sito web per il Committente.

Il sito sarà realizzato con l'obiettivo di valorizzare l'immagine aziendale, ottimizzare la user experience e migliorare la presenza digitale del Committente, garantendo una struttura funzionale, coerente con l'identità del brand e conforme agli standard tecnici e di design più aggiornati.

Il presente contratto riguarda esclusivamente la realizzazione del sito web e non include attività di gestione social media, advertising o marketing digitale, che potranno essere oggetto di un separato accordo tra le Parti.`;

    case 'marketing_content':
      return `L'oggetto del presente contratto è la fornitura, da parte di Evoluzione Imprese, di un servizio professionale di creazione, gestione e sviluppo di contenuti organici per i canali social del Committente.

L'attività è finalizzata al potenziamento della presenza digitale del Committente attraverso la produzione strategica e continuativa di contenuti coerenti con la propria identità di brand, volti ad accrescere l'interesse, il coinvolgimento e la fidelizzazione della community online.

Il servizio oggetto del presente contratto non include attività di advertising a pagamento o gestione di campagne META (Facebook, Instagram o altre piattaforme), le quali potranno essere eventualmente concordate in un separato accordo.`;

    default:
      return '';
  }
};

export const generateArticolo2SitoWeb = (tipologiaServizio?: string): string => {
  if (tipologiaServizio === 'solo_sito') {
    return `Evoluzione Imprese si impegna a progettare, sviluppare e consegnare un sito web professionale basato su piattaforma Shopify, WordPress o altra piattaforma concordata, in linea con le esigenze operative e gli obiettivi comunicativi del Committente.

In particolare, saranno realizzate le seguenti attività:
a) Analisi preliminare del brand, del target di riferimento e dei competitor;
b) Progettazione della struttura informativa e definizione dell'alberatura di navigazione;
c) Progettazione UX/UI (User Experience e User Interface) del sito, in linea con l'identità visiva del Committente;
d) Creazione della homepage e delle pagine interne principali (es. Chi siamo, Servizi, Contatti);
e) Creazione di eventuali sezioni aggiuntive quali blog, portfolio, area riservata o integrazioni personalizzate, se previste dal brief iniziale;
f) Ottimizzazione del sito per dispositivi mobili (responsive design);
g) Integrazione dei moduli di contatto, mappe, form, newsletter o altri strumenti concordati;
h) Implementazione delle impostazioni SEO di base (meta title, meta description, URL ottimizzati);
i) Collegamento ai canali social e agli strumenti di monitoraggio (Google Analytics, Search Console, Meta Pixel, ecc.);
j) Test di funzionamento, revisione e consegna finale del progetto.

Qualora ritenuto necessario, Evoluzione Imprese potrà occuparsi anche della realizzazione di contenuti visivi e testuali (fotografie, video, copywriting, grafiche) a supporto del sito web, previo accordo scritto e definizione del relativo compenso aggiuntivo.

Il progetto sarà consegnato entro un periodo stimato di 8 settimane dalla data di approvazione definitiva del brief iniziale e dalla consegna completa di tutto il materiale necessario da parte del Committente.

Sono previste fino a 3 revisioni per ciascuna fase intermedia di consegna (wireframe, design, contenuti). Ulteriori modifiche rispetto a quanto previsto saranno considerate attività extra e oggetto di un preventivo dedicato.

Tutti gli elaborati grafici, testuali e funzionali saranno sottoposti all'approvazione del Committente prima della pubblicazione online.

Evoluzione Imprese garantisce che il sito sarà sviluppato nel rispetto delle best practices della piattaforma scelta e ottimizzato per la fruizione su desktop, tablet e mobile.

Per l'esecuzione delle attività, il Committente si impegna a fornire tempestivamente:
• Tutti i materiali necessari (loghi, testi, immagini, video, cataloghi, credenziali di accesso, ecc.);
• Gli accessi agli eventuali strumenti o piattaforme già in uso (hosting, dominio, CMS, ecc.).

Evoluzione Imprese si impegna a garantire la massima riservatezza e sicurezza nella gestione dei dati di accesso e delle informazioni ricevute.

Le comunicazioni operative tra le Parti avverranno esclusivamente nei seguenti orari:
dal lunedì al venerdì, dalle ore 09:00 alle ore 19:00, attraverso i canali concordati (e-mail, telefono, WhatsApp).`;
  }

  return `Evoluzione Imprese si impegna a progettare, sviluppare e consegnare un sito web e-commerce basato su piattaforma Shopify, coerente con l'identità e gli obiettivi commerciali del Committente.
In particolare, saranno realizzate le seguenti attività:
a) Progettazione UX/UI del sito;
b) Creazione della homepage;
c) Creazione delle pagine collezione;
d) Creazione delle pagine prodotto;
e) Definizione e implementazione dell'alberatura del menù di navigazione;
f) Implementazione del carrello e delle relative funzionalità;
g) Attivazione di funzionalità di up-sell e cross-sell;
h) Integrazione di un sistema chatbot per l'assistenza clienti;
i) Catalogazione dei prodotti;
j) Creazione di flow mail per il recupero dei carrelli abbandonati;
k) Implementazione dei metodi di pagamento (es. Klarna).

Qualora ritenuto necessario, Evoluzione Imprese si occuperà anche della realizzazione di uno shooting fotografico e/o video dei prodotti o ambienti del Committente, a supporto delle pagine web e delle schede prodotto.

Il progetto sarà consegnato entro un periodo stimato di 8 settimane a partire dalla data di approvazione definitiva del brief iniziale e della fornitura completa del materiale necessario da parte del Committente.
Sono previste fino a un massimo di 3 revisioni per ciascuna fase di consegna intermedia. Ulteriori revisioni rispetto a quanto previsto saranno considerate attività extra, da valutare separatamente e oggetto di un nuovo preventivo.
Tutti gli elaborati e le funzionalità saranno sottoposti all'approvazione del Committente prima della messa online.
Evoluzione Imprese garantisce che il sito sarà sviluppato nel rispetto delle best practices della piattaforma Shopify e ottimizzato per la fruizione su dispositivi desktop e mobile.`;
};

export const generateArticolo2Marketing = (tipologiaServizio: string): string => {
  if (tipologiaServizio === 'marketing_adv') {
    return `Le attività di comunicazione saranno sviluppate e distribuite sui seguenti canali di social media:
• Instagram
• Facebook

In particolare, Evoluzione Imprese si impegna a fornire:
a) Lo studio e la definizione di una strategia di comunicazione coerente con gli obiettivi del Committente;
b) La predisposizione di un report mensile sulle attività svolte;
c) La scrittura, la registrazione, il montaggio e pubblicazione di contenuti video e grafiche per le campagne pubblicitarie;
d) Le attività di creazione, gestione e ottimizzazione di campagne pubblicitarie sulla piattaforma META (inclusi, a titolo esemplificativo, Facebook, Instagram e altre proprietà META).

Tali attività includono, in particolare:
• la realizzazione di materiale video e fotografico funzionale allo sviluppo delle creatività pubblicitarie;

Evoluzione Imprese garantirà che le attività siano svolte nel rispetto delle policy vigenti della piattaforma META e secondo le indicazioni fornite dal Committente.
Eventuali servizi aggiuntivi non esplicitamente indicati nel presente contratto saranno considerati extra da concordare con un preventivo dedicato a seguito di un confronto tra Evoluzione Imprese e il Committente.
Tutti i contenuti prodotti e le campagne pianificate dovranno essere approvati preventivamente dal Committente prima della pubblicazione sui canali social.
Ai fini di un'organizzazione efficiente e condivisa, la pianificazione delle campagne verrà condivisa con il committente e nella fase successiva all'approvazione verranno create le campagne pubblicitarie. 
Una volta approvati, i contenuti non potranno essere modificati o ritirati, salvo diversa intesa scritta tra le Parti, al fine di garantire stabilità, coerenza strategica e rispetto delle tempistiche operative.

Per lo svolgimento delle attività, il Committente autorizza Evoluzione Imprese all'utilizzo del proprio nome e marchio e s'impegna a fornire accesso ai seguenti profili:
• META: accesso all'account Instagram e facebook e account pubblicitario

Evoluzione Imprese s'impegna a garantire la massima riservatezza e sicurezza nella gestione dei dati di accesso e delle informazioni ricevute.
Le comunicazioni operative tra le Parti avverranno esclusivamente nei seguenti orari:
dal lunedì al venerdì, dalle ore 09:00 alle ore 19:00, attraverso i canali concordati (e-mail, telefono, WhatsApp).`;
  } else if (tipologiaServizio === 'marketing_content') {
    return `Le attività di comunicazione saranno sviluppate e distribuite sui seguenti canali di social media:
• Instagram
• Facebook
• Tiktok

In particolare, Evoluzione Imprese si impegna a fornire:
a) Lo studio, la pianificazione e la definizione di una strategia editoriale organica, coerente con il posizionamento, i valori e gli obiettivi del Committente;
b) La redazione e la condivisione di un piano editoriale mensile contenente le tematiche, le tipologie di contenuto e la calendarizzazione delle pubblicazioni;
c) La creazione, produzione e pubblicazione di contenuti foto, video e grafici, ottimizzati per i canali social indicati, nel rispetto delle linee guida del brand;
d) La redazione dei copy e delle descrizioni dei post, in linea con il tono di voce e la strategia concordata;
e) L'analisi e il monitoraggio delle performance dei contenuti pubblicati, con la predisposizione di un report periodico sulle attività svolte e sui risultati ottenuti.

Evoluzione Imprese garantirà che le attività siano realizzate nel pieno rispetto delle policy delle piattaforme social e delle indicazioni del Committente.

Eventuali servizi aggiuntivi, non espressamente indicati nel presente contratto (quali, a titolo esemplificativo, la gestione di campagne ADV, shooting esterni aggiuntivi, influencer marketing, o consulenze extra), saranno considerati attività accessorie e potranno essere erogati solo previo accordo scritto tra le Parti e relativa approvazione di un preventivo dedicato.

Tutti i contenuti prodotti dovranno essere approvati preventivamente dal Committente prima della pubblicazione sui canali social. Una volta approvati, i contenuti non potranno essere modificati o ritirati, salvo diversa intesa scritta tra le Parti, al fine di garantire coerenza strategica e rispetto delle tempistiche operative.

Per lo svolgimento delle attività, il Committente autorizza Evoluzione Imprese all'utilizzo del proprio nome, marchio e materiali visivi (loghi, immagini, video, grafiche, testi, ecc.) necessari alla realizzazione dei contenuti, impegnandosi altresì a fornire tempestivamente tutti gli accessi e le risorse richieste per l'esecuzione del servizio.

Evoluzione Imprese si impegna a mantenere la massima riservatezza e sicurezza nella gestione dei dati di accesso e delle informazioni ricevute.

Le comunicazioni operative tra le Parti avverranno esclusivamente nei seguenti orari: dal lunedì al venerdì, dalle ore 09:00 alle ore 19:00, attraverso i canali concordati (e-mail, telefono, WhatsApp).`;
  } else {
    // marketing_content_adv, sito_marketing, sito_marketing_linkbuilding
    return `Le attività di comunicazione saranno sviluppate e distribuite sui seguenti canali di social media:
• TikTok
• Instagram
• Facebook

In particolare, Evoluzione Imprese si impegna a fornire:
a) Lo studio e la definizione di una strategia di comunicazione coerente con gli obiettivi del Committente;
b) La predisposizione di un report mensile sulle attività svolte;
c) La scrittura, la registrazione, il montaggio e pubblicazione di contenuti video sui canali indicati;
d) Le attività di creazione, gestione e ottimizzazione di campagne pubblicitarie sulla piattaforma META (inclusi, a titolo esemplificativo, Facebook, Instagram e altre proprietà META).
${tipologiaServizio === 'sito_marketing_linkbuilding' ? 'e) Attività di link building su Google con la creazione di articoli collegati al sito web.' : ''}

Tali attività includono, in particolare:
• la realizzazione di materiale video e fotografico funzionale allo sviluppo delle creatività pubblicitarie;
• l'attività di editing e post-produzione del suddetto materiale multimediale;
• l'adattamento dei contenuti creativi ai diversi formati e obiettivi previsti dalle campagne su META.

Evoluzione Imprese garantirà che le attività siano svolte nel rispetto delle policy vigenti della piattaforma META e secondo le indicazioni fornite dal Committente.
Eventuali servizi aggiuntivi non esplicitamente indicati nel presente contratto saranno considerati extra da concordare con un preventivo dedicato a seguito di un confronto tra Evoluzione Imprese e il Committente.
Tutti i contenuti prodotti e le campagne pianificate dovranno essere approvati preventivamente dal Committente prima della pubblicazione sui canali social.
Ai fini di un'organizzazione efficiente e condivisa, la pianificazione dei contenuti avverrà una volta al mese, verranno presentate le proposte per il mese successivo. Una volta approvati, i contenuti non potranno essere modificati o ritirati, salvo diversa intesa scritta tra le Parti, al fine di garantire stabilità, coerenza strategica e rispetto delle tempistiche operative.

Per lo svolgimento delle attività, il Committente autorizza Evoluzione Imprese all'utilizzo del proprio nome e marchio e s'impegna a fornire accesso ai seguenti profili:
• TikTok: accesso all'account
• META: accesso all'account Instagram e facebook, account pubblicitario e Business Manager

Evoluzione Imprese s'impegna a garantire la massima riservatezza e sicurezza nella gestione dei dati di accesso e delle informazioni ricevute.
Le comunicazioni operative tra le Parti avverranno esclusivamente nei seguenti orari:
dal lunedì al venerdì, dalle ore 09:00 alle ore 19:00, attraverso i canali concordati (e-mail, telefono, WhatsApp).`;
  }
};

export const generateArticolo2Linkbuilding = (): string => {
  return `Evoluzione Imprese si impegna a sviluppare attività di link building mirate per migliorare l'autorevolezza del sito agli occhi dei motori di ricerca e incrementare il posizionamento organico.

In particolare, saranno realizzate le seguenti attività:
a) Analisi del profilo di backlink esistente;
b) Identificazione di opportunità di link building di qualità;
c) Creazione di contenuti link-worthy (articoli, infografiche, risorse utili);
d) Outreach verso siti web e portali rilevanti per il settore;
e) Gestione di partnership e collaborazioni per la generazione di backlink;
f) Monitoraggio e reporting delle performance SEO;
g) Ottimizzazione continua della strategia di link building.

Le attività saranno svolte con cadenza mensile e saranno finalizzate a:
• Aumentare l'autorevolezza del dominio;
• Migliorare il posizionamento per keyword target;
• Generare traffico qualificato da fonti autorevoli;
• Consolidare la reputazione online del brand.

Evoluzione Imprese garantisce che tutte le attività di link building saranno svolte nel rispetto delle linee guida di Google e delle best practices SEO.`;
};

export const generateArticolo3Modalita = (): string => {
  return `Le prestazioni di cui al presente contratto non determinano un rapporto di lavoro subordinato in quanto Evoluzione Imprese non esegue ordini puntuali e specifici, ma, nell'ambito delle direttive generali e delle indicazioni di massima impartitegli dal Committente, ha piena autonomia di organizzare la propria attività con le modalità che ritiene più opportune, in vista ed in funzione del raggiungimento dei risultati che gli sono stati commissionati.

Evoluzione Imprese svolge la propria attività senza vincolo di orario e con mezzi propri.`;
};

export const generateArticolo4Durata = (
  tipo: string, 
  dataDecorrenza: string = '', 
  dataScadenza: string = '',
  options?: { mesi?: number, rinnovo?: boolean }
): string => {
  const formatDate = (date: string) => {
    if (!date) return '__/__/____';
    const d = new Date(date);
    return d.toLocaleDateString('it-IT');
  };

  const decorrenza = formatDate(dataDecorrenza);
  const scadenza = formatDate(dataScadenza);

  switch (tipo) {
    case 'custom': {
      const mesi = options?.mesi || 0;
      const rinnovo = options?.rinnovo || false;
      const mesiParole = numberToWords(mesi);
      const preavvisoGiorni = mesi >= 6 ? 60 : 30;
      const preavvisoParole = numberToWords(preavvisoGiorni);

      if (rinnovo) {
        return `Il presente contratto ha una durata di ${mesi} (${mesiParole}) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Alla scadenza del termine contrattuale sopra indicato, il presente contratto si intenderà tacitamente rinnovato per un ulteriore periodo di ${mesi} (${mesiParole}) mesi, salvo disdetta da comunicarsi da una delle Parti all'altra, a mezzo di posta elettronica certificata (PEC), con un preavviso minimo di ${preavvisoGiorni} (${preavvisoParole}) giorni rispetto alla data di scadenza.

Resta inteso che, alla naturale scadenza del rapporto contrattuale, in mancanza di tempestiva disdetta, il rinnovo avverrà automaticamente alle medesime condizioni economiche e contrattuali, salvo diverso accordo scritto tra le Parti.`;
      } else {
        return `Il presente contratto ha una durata di ${mesi} (${mesiParole}) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Alla scadenza naturale del termine sopra indicato, il contratto cesserà automaticamente senza necessità di disdetta da parte di alcuna delle Parti e senza che ciò comporti alcun obbligo di rinnovo o prosecuzione del rapporto contrattuale.`;
      }
    }

    case '12_mesi_senza_rinnovo':
      return `Il presente contratto ha una durata di 12 (dodici) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Il Committente avrà la facoltà di recedere dal contratto, per giustificato motivo, entro i primi 90 (novanta) giorni dalla decorrenza, mediante comunicazione da inviarsi a mezzo di posta elettronica certificata (PEC).

Resta inteso che, in caso di recesso esercitato nei primi 90 (novanta) giorni, il Committente sarà tenuto al pagamento dei corrispettivi maturati fino alla data effettiva di cessazione del rapporto contrattuale e non potrà, a nessun titolo, avanzare richieste di rimborso, indennizzo o risarcimento per i periodi di servizio non usufruiti.

Alla scadenza naturale del termine sopra indicato, il contratto cesserà automaticamente senza necessità di disdetta e senza che ciò comporti alcun obbligo di rinnovo o prosecuzione del rapporto tra le Parti.`;
    
    case '12_mesi_con_rinnovo':
      return `Il presente contratto ha una durata di 12 (dodici) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Il Committente avrà la facoltà di recedere dal contratto, per giustificato motivo, entro i primi 90 (novanta) giorni dalla decorrenza, mediante comunicazione da inviarsi a mezzo di posta elettronica certificata (PEC).

Resta inteso che, in caso di recesso esercitato entro i primi 90 (novanta) giorni, il Committente sarà tenuto al pagamento dei corrispettivi maturati fino alla data effettiva di cessazione del rapporto contrattuale e non potrà, a nessun titolo, avanzare richieste di rimborso, indennizzo o risarcimento per i periodi di servizio non usufruiti.

Alla scadenza del termine contrattuale sopra indicato, il presente contratto si intenderà tacitamente rinnovato per un ulteriore periodo di 12 (dodici) mesi, salvo disdetta da comunicarsi da una delle Parti all'altra, a mezzo di posta elettronica certificata (PEC), con un preavviso minimo di 60 (sessanta) giorni rispetto alla data di scadenza.`;
    
    case '6_6_mesi_senza_rinnovo':
      return `Il presente contratto ha una durata di 6 (sei) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Il Committente avrà la facoltà di recedere dal contratto, per giustificato motivo, entro i primi 90 (novanta) giorni dalla decorrenza, mediante comunicazione da inviarsi a mezzo di posta elettronica certificata (PEC).

Resta inteso che, in caso di recesso esercitato entro i primi 90 (novanta) giorni, il Committente sarà tenuto al pagamento dei corrispettivi maturati fino alla data effettiva di cessazione del rapporto contrattuale e non potrà, a nessun titolo, avanzare richieste di rimborso, indennizzo o risarcimento per i periodi di servizio non usufruiti.

Alla scadenza del termine contrattuale sopra indicato, il presente contratto si intenderà tacitamente rinnovato per un ulteriore periodo di 6 (sei) mesi, salvo disdetta da comunicarsi da una delle Parti all'altra, a mezzo di posta elettronica certificata (PEC), con un preavviso minimo di 60 (sessanta) giorni rispetto alla data di scadenza.`;
    
    case '3_mesi_con_rinnovo':
      return `Il presente contratto ha una durata di 3 (tre) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Alla scadenza del termine contrattuale sopra indicato, il presente contratto si intenderà tacitamente rinnovato per un ulteriore periodo di 3 (tre) mesi, salvo disdetta da comunicarsi da una delle Parti all'altra, a mezzo di posta elettronica certificata (PEC), con un preavviso minimo di 30 (trenta) giorni rispetto alla data di scadenza.

Resta inteso che, alla naturale scadenza del rapporto contrattuale, in mancanza di tempestiva disdetta, il rinnovo avverrà automaticamente alle medesime condizioni economiche e contrattuali, salvo diverso accordo scritto tra le Parti.`;
    
    case '3_mesi_senza_rinnovo':
      return `Il presente contratto ha una durata di 3 (tre) mesi, con decorrenza dal ${decorrenza} e scadenza al ${scadenza}.

Alla scadenza naturale del termine sopra indicato, il contratto cesserà automaticamente senza necessità di disdetta da parte di alcuna delle Parti e senza che ciò comporti alcun obbligo di rinnovo o prosecuzione del rapporto contrattuale.`;
    
    case 'spot_una_tantum':
      return `Il presente contratto ha durata limitata all'esecuzione del progetto (indicativamente 8 settimane), con decorrenza dalla data di approvazione del brief e consegna materiali. 
      
Si intenderà concluso con la consegna finale del progetto e il pagamento del saldo dovuto.`;

    default:
      return '';
  }
};

export const generateArticolo5Compenso = (contrattoData: ContrattoData): string => {
  const { compenso, tipologiaServizio } = contrattoData;
  let testo = '';
  
  // Funzione per formattare l'importo con lettere
  const formatAmount = (amount: number): string => {
    const formatted = amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const words = numberToWords(Math.floor(amount));
    return `${formatted} (${words}/00)`;
  };
  
  if (tipologiaServizio === 'sito_marketing_linkbuilding' || tipologiaServizio === 'sito_marketing' || tipologiaServizio === 'solo_sito') {
    // Include compenso sito web
    const sitoWeb = compenso.sitoWeb;
    if (sitoWeb) {
      const importoTotale = formatAmount(sitoWeb.importoTotale);
      const acconto = formatAmount(sitoWeb.acconto);
      const saldo = formatAmount(sitoWeb.saldo);
      
      testo += `Il compenso per le attività descritte al punto 2.2 "Sito Web" del presente contratto è fissato in euro ${importoTotale}, oltre IVA di legge. Il pagamento avverrà secondo le seguenti modalità:
• ${sitoWeb.modalitaPagamento === '50_50' ? '50 (cinquanta)' : '40 (quaranta)'}% pari a euro ${acconto} oltre IVA di legge alla firma del presente contratto, a titolo di acconto;`;
      
      if (sitoWeb.modalitaPagamento === '40_30_30' && sitoWeb.secondaRata) {
        const secondaRata = formatAmount(sitoWeb.secondaRata);
        testo += `
• 30 (trenta)% pari a euro ${secondaRata} oltre IVA di legge entro 30 (trenta) giorni dalla firma del contratto.`;
      }
      
      testo += `
• ${sitoWeb.modalitaPagamento === '50_50' ? '50 (cinquanta)' : '30 (trenta)'}% pari a euro ${saldo} oltre IVA di legge prima della messa online del sito web, a saldo.

`;
    }
  }
  
  if (tipologiaServizio !== 'solo_sito') {
    // Compenso marketing (sempre presente tranne in solo_sito)
    const marketing = compenso.marketing;
    const importoMensile = formatAmount(marketing.importoMensile);
    const giornoPagamento = marketing.giornoPagamento;
    
    if (tipologiaServizio === 'marketing_content_adv' || tipologiaServizio === 'marketing_adv') {
      // Solo marketing
      testo += `Il compenso per le prestazioni previste nel presente contratto al 'punto 2.2 Marketing' è così suddiviso:
  • ${importoMensile} euro mensili, oltre IVA di legge, da corrispondersi in via anticipata il ${giornoPagamento} (${numberToWords(giornoPagamento)}) di ogni mese dalla chiusura dell'attività al 'punto 2.2 Sito Web'.`;
    } else if (tipologiaServizio === 'marketing_content') {
      // Solo marketing content
      testo += `Il compenso per le prestazioni previste nel presente contratto al 'punto 2.2 Marketing' è così suddiviso:
  • ${importoMensile} euro mensili, oltre IVA di legge, da corrispondersi in via anticipata il ${giornoPagamento} (${numberToWords(giornoPagamento)}) di ogni mese dalla chiusura dell'attività al 'punto 2.2 Sito Web'.`;
    } else {
      // Sito web + marketing
      testo += `Il compenso per le prestazioni previste nel presente contratto al 'punto 2.3 Marketing' è così suddiviso:
  • ${importoMensile} euro mensili, oltre IVA di legge, da corrispondersi in via anticipata il ${giornoPagamento} (${numberToWords(giornoPagamento)}) di ogni mese dalla chiusura dell'attività al 'punto 2.2 Sito Web'.`;
    }
  }
  
  // Clausole comuni
  testo += `

La fatturazione dei compensi e degli onorari maturati da Evoluzione Imprese sarà effettuata con periodicità mensile anticipata.

Il puntuale rispetto delle scadenze di pagamento costituisce condizione essenziale per la regolare esecuzione e prosecuzione delle attività oggetto del presente contratto. In caso di ritardo nei pagamenti, Evoluzione Imprese si riserva la facoltà di sospendere le prestazioni sino all'integrale adempimento, fatti salvi eventuali ulteriori rimedi previsti dalla legge o dal presente contratto.`;
  
  return testo;
};

// Funzioni per determinare la visibilità delle sezioni
export const hasSitoWeb = (tipologiaServizio: string): boolean => {
  return tipologiaServizio === 'sito_marketing_linkbuilding' || tipologiaServizio === 'sito_marketing' || tipologiaServizio === 'solo_sito';
};

export const hasMarketing = (tipologiaServizio: string): boolean => {
  return tipologiaServizio !== 'solo_sito'; 
};

export const hasLinkbuilding = (tipologiaServizio: string): boolean => {
  return tipologiaServizio === 'sito_marketing_linkbuilding';
};

// Articolo 6 - Proprietà e riservatezza dei risultati
export const generateArticolo6Proprieta = (): string => {
  return `I contenuti prodotti sono di esclusiva proprietà del Committente. Pertanto Evoluzione Imprese non potrà pubblicarli su altri siti, blog o social network se non dietro espressa preventiva autorizzazione scritta del Committente.
Evoluzione Imprese potrà mostrare i contenuti e i risultati frutto dell'attività prestata in favore del Committente in occasione di presentazioni, corsi formativi, incontri con potenziali clienti propri, previa espressa e preventiva autorizzazione scritta da parte del Committente.
Resta inteso che tutti i dati e le informazioni di carattere tecnico-amministrativo di cui Evoluzione Imprese entrerà in possesso nello svolgimento dell'incarico professionale di cui trattasi dovranno considerarsi riservati.`;
};

// Articolo 7 - Responsabilità
export const generateArticolo7Responsabilita = (): string => {
  return `Il Committente esonera Evoluzione Imprese da ogni responsabilità per danni indiretti o conseguenti derivanti dall'utilizzo dei contenuti pubblicati, salvo il caso di dolo o colpa grave.`;
};

// Articolo 8 - Norme di rinvio
export const generateArticolo8NormeRinvio = (): string => {
  return `Per tutto quanto non espressamente disciplinato nel presente contratto, le Parti fanno riferimento alle disposizioni del Codice Civile in materia di contratto d'opera professionale e, in particolare, agli articoli 2222 e seguenti.
In caso di inadempimento di una delle Parti, si applicano le norme generali sulla risoluzione dei contratti previste dal Codice Civile, fatto salvo il diritto al risarcimento del danno eventualmente subito.`;
};

// Articolo 9 - Foro competente
export const generateArticolo9ForoCompetente = (): string => {
  return `Per le controversie che dovessero insorgere nell'interpretazione, esecuzione e validità del presente, sarà competente in via esclusiva il Foro di Brescia.`;
};
