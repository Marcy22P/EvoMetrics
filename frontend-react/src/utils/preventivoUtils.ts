/**
 * Utility per la gestione dei dati dei preventivi
 */

import { SERVIZI_DATA } from '../types/preventivo';
import type { PreventivoData, ServiziSelezionati, PrezziServizi } from '../types/preventivo';

// Interfaccia per i servizi nel formato array (per preview/export)
export interface ServizioItem {
  nome: string;
  descrizione: string;
  quantita: number;
  prezzo: number;
  categoria?: string;
}

/**
 * Converte i servizi dal formato frontend (categorie + prezzi) al formato array per preview/export
 */
export function convertServiziToArray(preventivo: PreventivoData): ServizioItem[] {
  const serviziArray: ServizioItem[] = [];
  
  console.log('🔄 Converting servizi to array:', preventivo.servizi, preventivo.prezzi);
  
  Object.entries(preventivo.servizi).forEach(([categoriaKey, serviziIds]) => {
    if (Array.isArray(serviziIds)) {
      serviziIds.forEach(servizioId => {
        const prezzo = preventivo.prezzi[servizioId] || 0;
        
        // Trova il nome e la descrizione corretti dal SERVIZI_DATA
        const categoriaData = SERVIZI_DATA.find(cat => cat.id === categoriaKey);
        const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
        const nome = sottoservizio?.nome || servizioId;
        const descrizione = sottoservizio?.descrizione || servizioId;
        
        serviziArray.push({
          nome,
          descrizione,
          quantita: 1,
          prezzo: typeof prezzo === 'string' ? parseFloat(prezzo) || 0 : prezzo,
          categoria: categoriaData?.nome || categoriaKey
        });
      });
    }
  });
  
  console.log('✅ Converted servizi array:', serviziArray);
  return serviziArray;
}

/**
 * Calcola i totali per un preventivo
 */
export function calculateTotals(preventivo: PreventivoData): { subtotale: number; iva: number; totale: number } {
  const subtotale = Object.values(preventivo.prezzi).reduce((acc: number, prezzo) => {
    const valore = typeof prezzo === 'string' ? parseFloat(prezzo) || 0 : prezzo;
    return acc + valore;
  }, 0);
  
  const iva = subtotale * 0.22;
  const totale = subtotale + iva;
  
  return { subtotale, iva, totale };
}

/**
 * Formatta una valuta in euro
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Formatta una data in formato italiano DD/MM/AAAA
 */
export function formatDateItalian(dateString: string | Date): string {
  if (!dateString) return 'Data non disponibile';
  
  try {
    let date: Date;
    
    // Se è già un oggetto Date
    if (dateString instanceof Date) {
      date = dateString;
    } else {
      // Prova a parsare la data direttamente
      date = new Date(dateString);
      
      // Se la data non è valida, prova altri formati
      if (isNaN(date.getTime())) {
        // Prova formato ISO con timezone (aggiungi Z se manca)
        let isoString = dateString;
        if (!isoString.includes('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
          isoString += 'Z';
        }
        date = new Date(isoString);
        
        // Se ancora non è valida, prova formato con T
        if (isNaN(date.getTime())) {
          date = new Date(dateString.replace(' ', 'T'));
        }
        
        // Se ancora non è valida, prova formato ISO con millisecondi
        if (isNaN(date.getTime())) {
          // Rimuovi i millisecondi se presenti
          const cleanString = dateString.replace(/\.\d{6}/, '');
          date = new Date(cleanString);
        }
      }
    }
    
    // Se ancora non è valida, restituisci la stringa originale
    if (isNaN(date.getTime())) {
      console.warn('Data non valida:', dateString);
      return String(dateString);
    }
    
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Errore nel parsing della data:', dateString, error);
    return String(dateString);
  }
}

/**
 * Raggruppa i servizi per categoria per una migliore visualizzazione
 */
export function groupServiziByCategoria(servizi: ServizioItem[]): { [categoria: string]: ServizioItem[] } {
  const grouped: { [categoria: string]: ServizioItem[] } = {};
  
  servizi.forEach(servizio => {
    const categoria = servizio.categoria || 'Altri';
    if (!grouped[categoria]) {
      grouped[categoria] = [];
    }
    grouped[categoria].push(servizio);
  });
  
  return grouped;
}

/**
 * Raggruppa i servizi in 2 tabelle: E-commerce e Marketing
 * E-commerce: solo servizi della categoria E-commerce
 * Marketing: tutti gli altri servizi (Email Marketing, Video/Post, Meta Ads, Google Ads, SEO)
 */
export function groupServiziByTable(servizi: ServizioItem[]): { [tabella: string]: ServizioItem[] } {
  const ecommerce: ServizioItem[] = [];
  const marketing: ServizioItem[] = [];
  
  servizi.forEach(servizio => {
    const categoria = servizio.categoria || '';
    
    // Solo i servizi della categoria E-commerce vanno nella tabella E-commerce
    if (categoria === 'E-COMMERCE') {
      ecommerce.push(servizio);
    } else {
      // Tutti gli altri servizi vanno nella tabella Marketing
      marketing.push(servizio);
    }
  });
  
  const result: { [tabella: string]: ServizioItem[] } = {};
  
  if (ecommerce.length > 0) {
    result['E-COMMERCE'] = ecommerce;
  }
  
  if (marketing.length > 0) {
    result['MARKETING'] = marketing;
  }
  
  return result;
}

/**
 * Calcola i totali per ogni tabella (E-commerce e Marketing)
 */
export function calculateTableTotals(serviziGrouped: { [tabella: string]: ServizioItem[] }): { [tabella: string]: { subtotale: number; iva: number; totale: number } } {
  const totals: { [tabella: string]: { subtotale: number; iva: number; totale: number } } = {};
  
  Object.entries(serviziGrouped).forEach(([tabella, servizi]) => {
    const subtotale = servizi.reduce((acc, servizio) => acc + servizio.prezzo, 0);
    const iva = subtotale * 0.22;
    const totale = subtotale + iva;
    
    totals[tabella] = { subtotale, iva, totale };
  });
  
  return totals;
}

/**
 * Genera la descrizione della tipologia di intervento per E-commerce
 */
export function generateEcommerceDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const ecommerceServizi = servizi.ecommerce || [];
  
  if (ecommerceServizi.length === 0) {
    return '';
  }
  
  // Descrizione base per E-commerce
  let descrizione = `La piattaforma e-commerce verrà completamente ricostruita su base Shopify, con una struttura ottimizzata per garantire performance elevate e massimizzare le conversioni. Il nuovo sito sarà progettato per offrire un'esperienza d'acquisto semplice, intuitiva e coinvolgente, curando ogni dettaglio del percorso utente: dalla homepage alle schede prodotto, fino al processo di checkout. Verranno integrate sezioni dedicate alla trasmissione di fiducia (testimonianze, valori aziendali, badge di qualità) e alle informazioni essenziali per il cliente (spedizioni, resi, guide pratiche). Il design sarà mobile-first, veloce e coerente con l'identità visiva del brand, con l'obiettivo di trasformare il sito in un vero strumento di vendita e valorizzazione del marchio.

Cosa comprende:`;

  // Aggiungi i servizi selezionati
  const serviziSelezionati = ecommerceServizi.map((servizioId: string) => {
    const categoriaData = SERVIZI_DATA.find(cat => cat.id === 'ecommerce');
    const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
    return sottoservizio?.nome || servizioId;
  });

  if (serviziSelezionati.length > 0) {
    descrizione += '\n\n• ' + serviziSelezionati.join('\n• ');
  }

  return descrizione;
}

/**
 * Genera la descrizione della tipologia di intervento per Marketing
 */
export function generateMarketingDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const marketingServizi = [
    ...(servizi.emailMarketing || []),
    ...(servizi.videoPost || []),
    ...(servizi.metaAds || []),
    ...(servizi.googleAds || []),
    ...(servizi.seo || [])
  ];
  
  if (marketingServizi.length === 0) {
    return '';
  }
  
  // Per ora restituiamo una descrizione base per Marketing
  // Sarà implementata nei prossimi step
  return `MARKETING

Strategie di marketing digitale
Implementazione di strategie di marketing digitale complete per aumentare la visibilità online e generare lead qualificati.

Cosa comprende:

• Servizi di marketing selezionati`;
}

/**
 * Genera la descrizione della tipologia di intervento per Video e Post
 * con 3 varianti condizionali in base ai servizi selezionati
 */
export function generateVideoPostDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const videoPostServizi = servizi.videoPost || [];
  
  if (videoPostServizi.length === 0) {
    return '';
  }
  
  // Determina la variante in base ai servizi selezionati
  const hasEditing = videoPostServizi.includes('editing');
  const hasProduction = videoPostServizi.some(id => ['storyboard', 'scene', 'fotografie'].includes(id));
  const hasCreative = videoPostServizi.some(id => ['grafiche', 'copy_video'].includes(id));
  
  let variante = 2; // Default: Con editing
  
  // Variante 1: Più di 3 elementi con obbligatoriamente creative ed editing
  if (videoPostServizi.length > 3 && hasCreative && hasEditing) {
    variante = 1;
  } else if (hasEditing && (hasProduction || hasCreative)) {
    // Con editing + produzione/creativi
    variante = 2;
  } else if (!hasEditing && (hasProduction || hasCreative)) {
    // Senza editing ma con produzione/creativi
    variante = 3;
  }
  
  let descrizione = '';
  
  // Aggiungi la descrizione in base alla variante
  switch (variante) {
    case 1:
      descrizione += `Lo sviluppo dei contenuti seguirà un processo strutturato che parte dalla definizione dei format e delle linee narrative, fino ad arrivare alla realizzazione dei contenuti video e alla loro pubblicazione. Il nostro team si occuperà di ogni fase: dalla creazione dei copy e delle idee creative, alla registrazione e produzione dei contenuti, passando per l'editing professionale e l'ottimizzazione per i diversi canali. L'obiettivo è garantire contenuti di qualità, coerenti con l'identità del brand, in grado di coinvolgere il pubblico e supportare le strategie di marketing e vendita.`;
      break;
    case 2:
      descrizione += `Non produrremo direttamente i contenuti, ma vi accompagneremo nella creazione di una linea editoriale strutturata ed efficace. Forniremo format visivi e testuali pronti all'uso (reel, caroselli, video brevi), con indicazioni su struttura, tono di voce e storytelling, così da facilitare la produzione autonoma e garantire coerenza con la strategia. Questo approccio permette di mantenere autenticità nei contenuti, preservando lo stile e la voce del brand, mentre il nostro team si occuperà dell'editing professionale e dell'ottimizzazione finale per la pubblicazione.`;
      break;
    case 3:
      descrizione += `Non produrremo direttamente i contenuti, ma guideremo il team interno nella definizione e nello sviluppo di una linea editoriale efficace. Forniremo format visivi e testuali pronti all'uso (reel, caroselli, video brevi), con suggerimenti chiari su struttura, tono di voce e storytelling. In questo modo il brand potrà realizzare in autonomia contenuti autentici e coerenti, mantenendo uno stile professionale e in linea con la strategia di comunicazione.`;
      break;
  }
  
  // Aggiungi "Cosa comprende" con i servizi selezionati
  descrizione += `

Cosa comprende:`;
  
  const serviziSelezionati = videoPostServizi.map((servizioId: string) => {
    const categoriaData = SERVIZI_DATA.find(cat => cat.id === 'videoPost');
    const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
    return sottoservizio?.nome || servizioId;
  });
  
  if (serviziSelezionati.length > 0) {
    descrizione += '\n\n• ' + serviziSelezionati.join('\n• ');
  }
  
  return descrizione;
}

// Genera descrizione automatica per Meta Ads
export function generateMetaAdsDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const metaAdsServizi = servizi.metaAds || [];
  if (metaAdsServizi.length === 0) { return ''; }

  const hasCreative = metaAdsServizi.some(id => ['creative', 'test_creative'].includes(id));

  let descrizione = '';

  if (hasCreative) {
    // Variante 1: Con creative
    descrizione += `La gestione delle campagne Meta sarà sviluppata in modo strategico, con l'obiettivo di massimizzare i risultati e ottimizzare il ritorno sull'investimento. Le campagne verranno costantemente monitorate e ottimizzate attraverso test, analisi dei dati e aggiustamenti mirati, così da garantire performance crescenti nel tempo. La produzione delle creative sarà gestita dal nostro team, assicurando contenuti coerenti con l'identità del brand e progettati per valorizzare al meglio le potenzialità della piattaforma.`;
  } else {
    // Variante 2: Solo grafiche
    descrizione += `La gestione delle campagne Meta sarà sviluppata con un approccio strategico, mirato a generare il massimo ritorno sull'investimento. Ci occuperemo di tutte le fasi operative: dalla definizione del piano media e del pubblico target, fino alla creazione di inserzioni grafiche ottimizzate per catturare l'attenzione e stimolare la conversione. Le campagne verranno monitorate e ottimizzate costantemente tramite test e analisi dei dati, così da migliorare progressivamente le performance. Le grafiche saranno realizzate dal nostro team, in linea con l'identità del brand e con le best practice della piattaforma.`;
  }

  descrizione += `\n\nCosa comprende:`;

  // Aggiungi i servizi selezionati
  const serviziSelezionati = metaAdsServizi.map((servizioId: string) => {
    const categoriaData = SERVIZI_DATA.find(cat => cat.id === 'metaAds');
    const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
    return sottoservizio?.nome || servizioId;
  });
  
  if (serviziSelezionati.length > 0) {
    descrizione += '\n\n• ' + serviziSelezionati.join('\n• ');
  }

  return descrizione;
}

// Genera descrizione automatica per Google Ads
export function generateGoogleAdsDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const googleAdsServizi = servizi.googleAds || [];
  if (googleAdsServizi.length === 0) { return ''; }

  let descrizione = `La gestione delle campagne Google Ads sarà strutturata per intercettare al meglio la domanda degli utenti e trasformarla in risultati concreti. Ci occuperemo della definizione della strategia, della ricerca e selezione delle keyword più rilevanti, della creazione degli annunci e dell'ottimizzazione continua delle campagne. L'attività sarà focalizzata su massimizzare la visibilità del brand, aumentare le conversioni e ottimizzare il ritorno sull'investimento. Ogni campagna verrà costantemente monitorata e aggiornata sulla base dei dati raccolti, con un approccio orientato alla crescita e alla performance.`;

  descrizione += `\n\nCosa comprende:`;

  // Aggiungi i servizi selezionati
  const serviziSelezionati = googleAdsServizi.map((servizioId: string) => {
    const categoriaData = SERVIZI_DATA.find(cat => cat.id === 'googleAds');
    const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
    return sottoservizio?.nome || servizioId;
  });
  
  if (serviziSelezionati.length > 0) {
    descrizione += '\n\n• ' + serviziSelezionati.join('\n• ');
  }

  return descrizione;
}

// Genera descrizione automatica per SEO
export function generateSeoDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const seoServizi = servizi.seo || [];
  if (seoServizi.length === 0) { return ''; }

  let descrizione = `L'ottimizzazione SEO off-site verrà sviluppata attraverso attività di link building mirate, con l'obiettivo di aumentare l'autorevolezza del sito agli occhi dei motori di ricerca e migliorarne il posizionamento organico. Verranno selezionate opportunità di pubblicazione su siti e portali rilevanti, così da generare backlink di qualità e consolidare la reputazione online del brand. Questo approccio permette di incrementare la visibilità, attrarre traffico qualificato e sostenere la crescita nel medio-lungo periodo.`;

  descrizione += `\n\nCosa comprende:`;

  // Aggiungi i servizi selezionati
  const serviziSelezionati = seoServizi.map((servizioId: string) => {
    const categoriaData = SERVIZI_DATA.find(cat => cat.id === 'seo');
    const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
    return sottoservizio?.nome || servizioId;
  });
  
  if (serviziSelezionati.length > 0) {
    descrizione += '\n\n• ' + serviziSelezionati.join('\n• ');
  }

  return descrizione;
}

// Genera descrizione automatica per Email Marketing
export function generateEmailMarketingDescription(servizi: ServiziSelezionati, _prezzi: PrezziServizi): string {
  const emailMarketingServizi = servizi.emailMarketing || [];
  if (emailMarketingServizi.length === 0) { return ''; }

  let descrizione = `L'email marketing sarà gestito attraverso Klaviyo, piattaforma di cui siamo partner certificati, per sviluppare strategie di comunicazione dirette, personalizzate e orientate alla conversione. Ci occuperemo della creazione di flussi automatizzati (welcome series, carrelli abbandonati, post-acquisto) e di campagne dedicate, con segmentazioni avanzate basate sul comportamento degli utenti. L'obiettivo è rafforzare la relazione con i clienti, aumentare il tasso di fidelizzazione e massimizzare il valore medio per cliente. Ogni invio sarà ottimizzato in termini di copy, design e deliverability, garantendo performance misurabili e in costante crescita.`;

  descrizione += `\n\nCosa comprende:`;

  // Aggiungi i servizi selezionati
  const serviziSelezionati = emailMarketingServizi.map((servizioId: string) => {
    const categoriaData = SERVIZI_DATA.find(cat => cat.id === 'emailMarketing');
    const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === servizioId);
    return sottoservizio?.nome || servizioId;
  });
  
  if (serviziSelezionati.length > 0) {
    descrizione += '\n\n• ' + serviziSelezionati.join('\n• ');
  }

  return descrizione;
}

/**
 * Calcola la data di validità (14 giorni dalla data preventivo)
 */
export function calculateValiditaDate(dataPreventivo: string): string {
  const data = new Date(dataPreventivo);
  data.setDate(data.getDate() + 14); // Aggiunge 14 giorni
  return data.toISOString().split('T')[0]; // Formato YYYY-MM-DD
}

/**
 * Genera i termini e condizioni predefiniti con variabili calcolate
 */
export function generateDefaultTerminiCondizioni(dataPreventivo: string): string {
  const dataValidita = calculateValiditaDate(dataPreventivo);
  const dataValiditaFormatted = formatDateItalian(dataValidita);
  
  return `1. Il presente preventivo è valido fino al ${dataValiditaFormatted}
2. I pagamenti dovranno essere effettuati entro 30 giorni dalla data di fatturazione.
3. In caso di ritardo nei pagamenti, verranno applicati gli interessi di mora secondo la normativa vigente.
4. La prestazione sarà eseguita secondo le specifiche tecniche indicate.
5. Eventuali modifiche al progetto dovranno essere concordate preventivamente e potranno comportare variazioni di prezzo.`;
}
