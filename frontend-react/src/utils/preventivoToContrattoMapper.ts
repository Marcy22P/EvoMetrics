import type { PreventivoData } from '../types/preventivo';
import type { ContrattoData, ServizioContratto } from '../types/contratto';
import { 
  generateArticolo2Oggetto, 
  generateArticolo4Durata, 
  generateArticolo5Compenso,
  generateArticolo6Proprieta,
  generateArticolo7Responsabilita,
  generateArticolo8NormeRinvio,
  generateArticolo9ForoCompetente
} from './contrattoUtils';

// Mappatura servizi preventivo -> servizi contratto
const PREVENTIVO_TO_CONTRATTO_MAPPING = {
  ecommerce: {
    'sito-web-base': { nome: 'Sito Web', descrizione: 'Sviluppo sito web responsive' },
    'ecommerce-completo': { nome: 'E-commerce', descrizione: 'Piattaforma e-commerce completa' },
    'catalogo-prodotti': { nome: 'Catalogo Prodotti', descrizione: 'Gestione catalogo prodotti' },
    'carrello-checkout': { nome: 'Carrello e Checkout', descrizione: 'Sistema carrello e checkout' },
    'pagamenti': { nome: 'Pagamenti', descrizione: 'Integrazione sistemi di pagamento' },
    'ordini': { nome: 'Gestione Ordini', descrizione: 'Sistema gestione ordini' },
    'inventario': { nome: 'Inventario', descrizione: 'Gestione inventario prodotti' },
    'linkbuilding': { nome: 'Link Building', descrizione: 'Strategia link building' }
  },
  emailMarketing: {
    'newsletter': { nome: 'Newsletter', descrizione: 'Gestione newsletter' },
    'automazione': { nome: 'Automazione Email', descrizione: 'Campagne email automatizzate' },
    'segmentazione': { nome: 'Segmentazione', descrizione: 'Segmentazione database clienti' }
  },
  videoPost: {
    'video-promozionali': { nome: 'Video Promozionali', descrizione: 'Creazione video promozionali' },
    'social-content': { nome: 'Contenuti Social', descrizione: 'Creazione contenuti per social' },
    'storytelling': { nome: 'Storytelling', descrizione: 'Strategia storytelling aziendale' }
  },
  metaAds: {
    'facebook-ads': { nome: 'Facebook Ads', descrizione: 'Gestione campagne Facebook Ads' },
    'instagram-ads': { nome: 'Instagram Ads', descrizione: 'Gestione campagne Instagram Ads' },
    'targeting': { nome: 'Targeting Avanzato', descrizione: 'Strategie di targeting avanzato' }
  },
  googleAds: {
    'search-campaigns': { nome: 'Campagne Search', descrizione: 'Gestione campagne Google Search' },
    'display-campaigns': { nome: 'Campagne Display', descrizione: 'Gestione campagne Google Display' },
    'shopping-campaigns': { nome: 'Shopping Campaigns', descrizione: 'Gestione Google Shopping' }
  },
  seo: {
    'seo-base': { nome: 'SEO Base', descrizione: 'Ottimizzazione SEO di base' },
    'seo-avanzato': { nome: 'SEO Avanzato', descrizione: 'Strategia SEO avanzata' },
    'keyword-research': { nome: 'Keyword Research', descrizione: 'Ricerca e analisi keywords' },
    'content-seo': { nome: 'Content SEO', descrizione: 'Ottimizzazione contenuti per SEO' }
  }
};

// Funzione per mappare un servizio specifico
export function mapServizioPreventivoToContratto(servizioId: string, categoriaId: string): ServizioContratto | null {
  const mapping = PREVENTIVO_TO_CONTRATTO_MAPPING[categoriaId as keyof typeof PREVENTIVO_TO_CONTRATTO_MAPPING];
  
  if (mapping && servizioId in mapping) {
    const servizioMapping = mapping[servizioId as keyof typeof mapping] as { nome: string; descrizione: string };
    return {
      id: servizioId,
      nome: servizioMapping.nome,
      descrizione: servizioMapping.descrizione,
      attivato: true
    };
  }
  
  return null;
}

// Funzione per determinare la tipologia di servizio del contratto
export function determineContrattoTipologia(servizi: any): 'sito_marketing_linkbuilding' | 'sito_marketing' | 'marketing_content_adv' | 'marketing_adv' {
  const hasSitoWeb = Object.keys(servizi).some(categoria => 
    categoria === 'ecommerce' && servizi[categoria] && servizi[categoria].length > 0
  );
  
  const hasMarketing = Object.keys(servizi).some(categoria => 
    ['emailMarketing', 'videoPost', 'metaAds', 'googleAds', 'seo'].includes(categoria) && 
    servizi[categoria] && servizi[categoria].length > 0
  );
  
  const hasLinkbuilding = servizi.ecommerce?.includes('linkbuilding') || false;
  
  if (hasSitoWeb && hasMarketing && hasLinkbuilding) {
    return 'sito_marketing_linkbuilding';
  } else if (hasSitoWeb && hasMarketing) {
    return 'sito_marketing';
  } else if (hasMarketing) {
    return 'marketing_content_adv';
  } else {
    return 'marketing_adv';
  }
}

// Funzione per convertire i servizi del preventivo in servizi del contratto
export function convertServiziPreventivoToContratto(preventivo: PreventivoData): ServizioContratto[] {
  const serviziContratto: ServizioContratto[] = [];
  const serviziUnici = new Map<string, ServizioContratto>();
  
  // Itera attraverso tutte le categorie del preventivo
  Object.keys(preventivo.servizi).forEach(categoriaKey => {
    const serviziCategoria = preventivo.servizi[categoriaKey as keyof typeof preventivo.servizi];
    
    if (serviziCategoria && Array.isArray(serviziCategoria)) {
      serviziCategoria.forEach(servizioId => {
        const mapping = PREVENTIVO_TO_CONTRATTO_MAPPING[categoriaKey as keyof typeof PREVENTIVO_TO_CONTRATTO_MAPPING];
        
        if (mapping && servizioId in mapping) {
          const servizioMapping = mapping[servizioId as keyof typeof mapping] as { nome: string; descrizione: string };
          const nomeServizio = servizioMapping.nome;
          
          // Se il servizio esiste già, aggiungi la descrizione
          if (serviziUnici.has(nomeServizio)) {
            const servizioEsistente = serviziUnici.get(nomeServizio)!;
            servizioEsistente.descrizione += `, ${servizioMapping.descrizione}`;
          } else {
            // Crea nuovo servizio
            serviziUnici.set(nomeServizio, {
              id: nomeServizio.toLowerCase().replace(/\s+/g, '_'),
              nome: nomeServizio,
              descrizione: servizioMapping.descrizione,
              attivato: true
            });
          }
        }
      });
    }
  });
  
  // Aggiungi tutti i servizi unici alla lista finale
  serviziUnici.forEach(servizio => {
    serviziContratto.push(servizio);
  });
  
  return serviziContratto;
}

// Funzione per calcolare i compensi del contratto dal preventivo
export function calculateContrattoCompenso(preventivo: PreventivoData): any {
  const hasSitoWeb = preventivo.servizi.ecommerce && preventivo.servizi.ecommerce.length > 0;
  
  const hasMarketing = ['emailMarketing', 'videoPost', 'metaAds', 'googleAds', 'seo'].some(categoria => 
    preventivo.servizi[categoria as keyof typeof preventivo.servizi] && 
    preventivo.servizi[categoria as keyof typeof preventivo.servizi].length > 0
  );
  
  const compenso: any = {
    marketing: {
      importoMensile: 0,
      giornoPagamento: 1
    }
  };
  
  // Calcola compenso sito web se presente
  if (hasSitoWeb) {
    let importoTotaleSitoWeb = 0;
    
    // Somma i prezzi dei servizi e-commerce
    preventivo.servizi.ecommerce.forEach(servizioId => {
      const prezzo = preventivo.prezzi[servizioId];
      if (prezzo && !isNaN(parseFloat(prezzo.toString()))) {
        importoTotaleSitoWeb += parseFloat(prezzo.toString());
      }
    });
    
    if (importoTotaleSitoWeb > 0) {
      compenso.sitoWeb = {
        importoTotale: importoTotaleSitoWeb,
        modalitaPagamento: '50_50',
        acconto: importoTotaleSitoWeb * 0.5,
        saldo: importoTotaleSitoWeb * 0.5
      };
    }
  }
  
  // Calcola compenso marketing se presente
  if (hasMarketing) {
    let importoMensileMarketing = 0;
    
    // Somma i prezzi dei servizi marketing
    ['emailMarketing', 'videoPost', 'metaAds', 'googleAds', 'seo'].forEach(categoriaKey => {
      const serviziCategoria = preventivo.servizi[categoriaKey as keyof typeof preventivo.servizi];
      if (serviziCategoria && Array.isArray(serviziCategoria)) {
        serviziCategoria.forEach(servizioId => {
          const prezzo = preventivo.prezzi[servizioId];
          if (prezzo && !isNaN(parseFloat(prezzo.toString()))) {
            importoMensileMarketing += parseFloat(prezzo.toString());
          }
        });
      }
    });
    
    // Il totale marketing è già l'importo mensile
    compenso.marketing.importoMensile = importoMensileMarketing;
  }
  
  return compenso;
}

// Funzione principale per convertire preventivo in contratto
export function convertPreventivoToContratto(preventivo: PreventivoData): Partial<ContrattoData> {
  const serviziContratto = convertServiziPreventivoToContratto(preventivo);
  const tipologiaServizio = determineContrattoTipologia(preventivo.servizi);
  const compenso = calculateContrattoCompenso(preventivo);
  
  // Genera gli articoli del contratto
  const articolo2Oggetto = generateArticolo2Oggetto(tipologiaServizio);
  const articolo4Durata = generateArticolo4Durata('12_mesi_con_rinnovo', new Date().toISOString().split('T')[0], new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  
  // Crea un oggetto temporaneo per generare l'articolo 5
  const tempContrattoData = {
    tipologiaServizio,
    compenso
  } as any;
  const articolo5Compenso = generateArticolo5Compenso(tempContrattoData);
  
  const articolo6Proprieta = generateArticolo6Proprieta();
  const articolo7Responsabilita = generateArticolo7Responsabilita();
  const articolo8NormeRinvio = generateArticolo8NormeRinvio();
  const articolo9ForoCompetente = generateArticolo9ForoCompetente();
  
  return {
    datiCommittente: {
      ragioneSociale: preventivo.cliente || '',
      email: '',
      citta: '',
      via: '',
      numero: '',
      cap: '',
      pec: '',
      cfPiva: '',
      legaleRappresentante: ''
    },
    tipologiaServizio,
    servizi: serviziContratto,
    durata: {
      tipo: '12_mesi_con_rinnovo',
      dataDecorrenza: new Date().toISOString().split('T')[0],
      dataScadenza: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    compenso,
    note: `Contratto generato automaticamente da preventivo ${preventivo.numero}`,
    // Articoli del contratto
    articolo2Oggetto,
    articolo4Durata,
    articolo5Compenso,
    articolo6Proprieta,
    articolo7Responsabilita,
    articolo8NormeRinvio,
    articolo9ForoCompetente
  };
}