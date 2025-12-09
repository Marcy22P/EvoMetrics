/**
 * API service per gestire i preventivi lato server con autenticazione
 */

import type { PreventivoData as LocalPreventivoData } from '../types/preventivo';
import { SERVIZI_DATA } from '../types/preventivo';

// Funzione per ottenere il token di autenticazione
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

// Funzione per creare headers con autenticazione
function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

// Funzione per gestire errori di autenticazione
function handleAuthError(response: Response) {
  if (response.status === 401) {
    // Token scaduto o non valido
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
    throw new Error('Sessione scaduta, rieffettua il login');
  }
}

export interface ServizioItem {
  descrizione: string;
  quantita: number;
  prezzo: number;
}

// Interfaccia per il formato vecchio con struttura categoria/sottoservizi
export interface ServizioVecchioFormato {
  id: string;
  nome: string;
  descrizione_categoria?: string;
  sottoservizi?: Array<{
    id: string;
    nome: string;
    descrizione?: string;
    prezzo?: number;
  }>;
}

// Union type per gestire entrambi i formati
export type ServizioGenerico = ServizioItem | ServizioVecchioFormato;

export interface PreventivoData {
  id?: string;
  numero?: string;
  cliente: string;
  oggetto: string;
  servizi: ServizioGenerico[];
  totale: number;
  note?: string;
  data?: string;
  validita?: string;
  tipologiaIntervento?: string;
  tipologiaInterventoEcommerce?: string;
  tipologiaInterventoMarketing?: string;
  tipologiaInterventoVideoPost?: string;
  tipologiaInterventoMetaAds?: string;
  tipologiaInterventoGoogleAds?: string;
  tipologiaInterventoSeo?: string;
  tipologiaInterventoEmailMarketing?: string;
  terminiPagamento?: string;
  terminiCondizioni?: string;
}

export interface PreventivoSalvato extends PreventivoData {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: string;
}

// Funzioni di conversione tra i formati
function convertToServerFormat(localData: LocalPreventivoData): PreventivoData {
  console.log('🔄 convertToServerFormat - Input:', localData);
  const servizi: ServizioGenerico[] = [];
  
  // Converti i servizi selezionati in array di ServizioItem (nuovo formato)
  Object.entries(localData.servizi).forEach(([categoriaKey, items]) => {
    console.log(`🔄 Processing category ${categoriaKey}:`, items);
    if (Array.isArray(items)) {
      items.forEach(item => {
        const prezzo = localData.prezzi[item] || 0;
        console.log(`🔄 Processing item ${item} with price:`, prezzo);
        // Trova la descrizione corretta dal SERVIZI_DATA
        const categoriaData = SERVIZI_DATA.find(cat => cat.id === categoriaKey);
        const sottoservizio = categoriaData?.sottoservizi.find(s => s.id === item);
        const descrizione = sottoservizio?.descrizione || item;
        
        const servizioItem = {
          descrizione: descrizione,
          quantita: 1,
          prezzo: typeof prezzo === 'string' ? parseFloat(prezzo) || 0 : prezzo
        } as ServizioItem;
        
        console.log(`🔄 Created servizio item:`, servizioItem);
        servizi.push(servizioItem);
      });
    }
  });

  // Calcola totali corretti
  const subtotale = Object.values(localData.prezzi).reduce((acc: number, prezzo) => {
    const val = typeof prezzo === 'string' ? parseFloat(prezzo) || 0 : prezzo;
    return acc + val;
  }, 0);
  const iva = subtotale * 0.22;
  const totale = subtotale + iva;

  console.log(`🔄 Calculated totals - Subtotale: ${subtotale}, IVA: ${iva}, Totale: ${totale}`);

  const result = {
    id: localData.id || undefined, // Non inviare ID vuoto al server
    numero: localData.numero,
    cliente: localData.cliente,
    oggetto: localData.oggetto,
    servizi,
    totale,
    subtotale,
    iva,
    note: localData.note,
    data: localData.data,
    validita: localData.validita,
    tipologiaIntervento: localData.tipologiaIntervento,
    tipologiaInterventoEcommerce: localData.tipologiaInterventoEcommerce,
    tipologiaInterventoMarketing: localData.tipologiaInterventoMarketing,
    tipologiaInterventoVideoPost: localData.tipologiaInterventoVideoPost,
    tipologiaInterventoMetaAds: localData.tipologiaInterventoMetaAds,
    tipologiaInterventoGoogleAds: localData.tipologiaInterventoGoogleAds,
    tipologiaInterventoSeo: localData.tipologiaInterventoSeo,
    tipologiaInterventoEmailMarketing: localData.tipologiaInterventoEmailMarketing,
    terminiPagamento: localData.terminiPagamento,
    terminiCondizioni: localData.terminiCondizioni
  };

  console.log('🔄 convertToServerFormat - Output:', result);
  return result;
}

// Type guards per distinguere i formati
function isServizioItem(servizio: ServizioGenerico): servizio is ServizioItem {
  return 'descrizione' in servizio && 'prezzo' in servizio;
}

function isServizioVecchioFormato(servizio: ServizioGenerico): servizio is ServizioVecchioFormato {
  return 'id' in servizio && 'nome' in servizio;
}

function convertFromServerFormat(serverData: PreventivoSalvato): LocalPreventivoData {
  const servizi = {
    ecommerce: [] as string[],
    emailMarketing: [] as string[],
    videoPost: [] as string[],
    metaAds: [] as string[],
    googleAds: [] as string[],
    seo: [] as string[]
  };
  const prezzi: Record<string, number> = {};

  // Converti servizi da formato server a formato locale
  // Controlla se i servizi sono nel nuovo formato (oggetto con categorie)
  if (serverData.servizi && typeof serverData.servizi === 'object' && !Array.isArray(serverData.servizi)) {
    // Nuovo formato: servizi come oggetto con categorie
    Object.entries(serverData.servizi).forEach(([categoriaKey, serviziIds]) => {
      if (Array.isArray(serviziIds)) {
        (servizi as any)[categoriaKey] = [...serviziIds];
      }
    });
    
    // Copia i prezzi se disponibili
    if ((serverData as any).prezzi && typeof (serverData as any).prezzi === 'object') {
      Object.assign(prezzi, (serverData as any).prezzi);
    }
  } else if (Array.isArray(serverData.servizi)) {
    serverData.servizi.forEach(servizio => {
      // Controlla se è il nuovo formato (con descrizione, quantita, prezzo)
      if (isServizioItem(servizio)) {
        // Nuovo formato: servizi con descrizione e prezzo
        // Trova la categoria corretta cercando la descrizione nei SERVIZI_DATA
        let categoriaTrovata = '';
        let servizioId = '';
        
        // Mappatura diretta per descrizione - usa servizi specifici invece di "strategico"
        const directMapping = {
          'Sviluppo sito web e-commerce responsive': { categoria: 'ecommerce', id: 'ux_ui' },
          'Configurazione sistema di pagamenti online': { categoria: 'ecommerce', id: 'pagamenti' },
          'Integrazione gestione ordini e magazzino': { categoria: 'ecommerce', id: 'import_prodotti' },
          'Catalogo prodotti con gestione avanzata': { categoria: 'ecommerce', id: 'catalogazione' },
          'Creazione e invio campagne email marketing': { categoria: 'emailMarketing', id: 'campagne' },
          'Setup automazione email marketing': { categoria: 'emailMarketing', id: 'flussi_automatici' },
          'Gestione newsletter e iscrizioni': { categoria: 'emailMarketing', id: 'strategico' },
          'Gestione campagne Google Ads': { categoria: 'googleAds', id: 'campagne_google' },
          'Setup Google Analytics e Search Console': { categoria: 'googleAds', id: 'ga4' },
          'Setup tracking conversioni': { categoria: 'googleAds', id: 'tracking_google' },
          'Ottimizzazione SEO on-page': { categoria: 'ecommerce', id: 'onsite' },
          'Link building e SEO off-page': { categoria: 'ecommerce', id: 'linkbuilding' },
          'Analisi competitor e keyword research': { categoria: 'seo', id: 'keywords' },
          'Gestione campagne Facebook Ads': { categoria: 'metaAds', id: 'campagne_google' }, // Usa un servizio generico per le campagne
          'Gestione campagne Instagram Ads': { categoria: 'metaAds', id: 'campagne_google' },
          'Setup Facebook Pixel': { categoria: 'metaAds', id: 'pixel' },
          'Creazione video promozionali': { categoria: 'videoPost', id: 'storyboard' },
          'Creazione post per social media': { categoria: 'videoPost', id: 'grafiche' },
          'Design grafico personalizzato': { categoria: 'videoPost', id: 'grafiche' },
          'Produzione video promozionale (30 sec)': { categoria: 'videoPost', id: 'editing' },
          'Editing e ottimizzazione video per web': { categoria: 'videoPost', id: 'editing' },
          'Gestione community online': { categoria: 'videoPost', id: 'strategico' },
          'Consulenza strategica mensile (2 ore)': { categoria: 'ecommerce', id: 'formazione' },
          'Reportistica avanzata e analisi performance': { categoria: 'ecommerce', id: 'strategico' },
          'Supporto tecnico prioritario (6 mesi)': { categoria: 'ecommerce', id: 'formazione' }
        };

        // Controlla prima la mappatura diretta
        const mappedData = directMapping[servizio.descrizione as keyof typeof directMapping];
        if (mappedData) {
          categoriaTrovata = mappedData.categoria;
          servizioId = mappedData.id;
          console.log(`✅ Mappatura diretta: "${servizio.descrizione}" -> ${categoriaTrovata}.${servizioId}`);
        } else {
          // Fallback: cerca nei SERVIZI_DATA per match parziali
          for (const categoria of SERVIZI_DATA) {
            const sottoservizio = categoria.sottoservizi.find(s => {
              // Match esatto
              if (s.descrizione === servizio.descrizione) return true;
              
              // Match per parole chiave comuni
              const descrizioneLower = servizio.descrizione.toLowerCase();
              const nomeLower = s.nome.toLowerCase();
              
              // Controlla se il nome del servizio è contenuto nella descrizione
              if (descrizioneLower.includes(nomeLower)) return true;
              
              return false;
            });
            
            if (sottoservizio) {
              categoriaTrovata = categoria.id;
              servizioId = sottoservizio.id;
              console.log(`✅ Match parziale: "${servizio.descrizione}" -> ${categoriaTrovata}.${sottoservizio.nome}`);
              break;
            }
          }
        }
        
        if (categoriaTrovata && servizioId) {
          // Evita duplicati nella stessa categoria
          if (!(servizi as any)[categoriaTrovata].includes(servizioId)) {
            (servizi as any)[categoriaTrovata].push(servizioId);
            prezzi[servizioId] = servizio.prezzo;
            console.log(`✅ Mappato: "${servizio.descrizione}" -> ${categoriaTrovata}.${servizioId}`);
          } else {
            console.log(`⚠️ Duplicato evitato: "${servizio.descrizione}" -> ${categoriaTrovata}.${servizioId}`);
            // Aggiorna il prezzo se diverso
            if (prezzi[servizioId] !== servizio.prezzo) {
              prezzi[servizioId] = servizio.prezzo;
              console.log(`💰 Prezzo aggiornato per ${servizioId}: €${servizio.prezzo}`);
            }
          }
        } else {
          // Fallback migliorato: cerca il servizio più simile
          console.warn(`⚠️ Servizio non mappato: "${servizio.descrizione}"`);
          
          // Prova a mappare a un servizio generico basato su parole chiave
          const descrizioneLower = servizio.descrizione.toLowerCase();
          let fallbackCategoria = 'ecommerce';
          let fallbackId = 'strategico'; // Servizio generico
          
          if (descrizioneLower.includes('email') || descrizioneLower.includes('newsletter')) {
            fallbackCategoria = 'emailMarketing';
            fallbackId = 'strategico';
          } else if (descrizioneLower.includes('google') || descrizioneLower.includes('ads') || descrizioneLower.includes('analytics')) {
            fallbackCategoria = 'googleAds';
            fallbackId = 'strategico';
          } else if (descrizioneLower.includes('facebook') || descrizioneLower.includes('instagram') || descrizioneLower.includes('meta')) {
            fallbackCategoria = 'metaAds';
            fallbackId = 'strategico';
          } else if (descrizioneLower.includes('seo') || descrizioneLower.includes('ottimizzazione')) {
            fallbackCategoria = 'ecommerce';
            fallbackId = 'strategico';
          } else if (descrizioneLower.includes('video') || descrizioneLower.includes('post') || descrizioneLower.includes('grafica')) {
            fallbackCategoria = 'videoPost';
            fallbackId = 'strategico';
          }
          
          (servizi as any)[fallbackCategoria].push(fallbackId);
          prezzi[fallbackId] = servizio.prezzo;
          
          console.log(`🔄 Mappato fallback: "${servizio.descrizione}" -> ${fallbackCategoria}.${fallbackId}`);
        }
      } 
      // Controlla se è il vecchio formato (con id, nome, sottoservizi)
      else if (isServizioVecchioFormato(servizio)) {
        // Vecchio formato: gestisci sottoservizi
        if (Array.isArray(servizio.sottoservizi)) {
          servizio.sottoservizi.forEach((sotto) => {
            if (sotto.id && sotto.nome) {
              const categoria = servizio.id;
              if (categoria in servizi) {
                (servizi as any)[categoria].push(sotto.id);
                prezzi[sotto.id] = sotto.prezzo || 0;
              }
            }
          });
        }
      }
    });
  }

  // I totali vengono calcolati dinamicamente nel componente

  // Debug: verifica i dati del server
  console.log('🔄 convertFromServerFormat - Server data:', {
    id: serverData.id,
    numero: serverData.numero,
    hasId: !!serverData.id,
    hasNumero: !!serverData.numero,
    servizi: serverData.servizi,
    serviziType: typeof serverData.servizi,
    serviziIsArray: Array.isArray(serverData.servizi)
  });

  const convertedId = serverData.id || '';
  const convertedNumero = serverData.numero || '';
  
  console.log('🔄 convertFromServerFormat - Converted IDs:', {
    id: convertedId,
    numero: convertedNumero
  });

  const result = {
    id: convertedId,
    numero: convertedNumero,
    data: (serverData as any).data || (serverData.createdAt ? new Date(serverData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
    validita: (serverData as any).validita || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    cliente: serverData.cliente || '',
    oggetto: serverData.oggetto || '',
    tipologiaIntervento: (serverData as any).tipologiaIntervento || '',
    tipologiaInterventoEcommerce: (serverData as any).tipologiaInterventoEcommerce || '',
    tipologiaInterventoMarketing: (serverData as any).tipologiaInterventoMarketing || '',
    tipologiaInterventoVideoPost: (serverData as any).tipologiaInterventoVideoPost || '',
    tipologiaInterventoMetaAds: (serverData as any).tipologiaInterventoMetaAds || '',
    tipologiaInterventoGoogleAds: (serverData as any).tipologiaInterventoGoogleAds || '',
    tipologiaInterventoSeo: (serverData as any).tipologiaInterventoSeo || '',
    tipologiaInterventoEmailMarketing: (serverData as any).tipologiaInterventoEmailMarketing || '',
    servizi,
    prezzi,
    note: serverData.note || '',
    terminiPagamento: (serverData as any).terminiPagamento || '',
    terminiCondizioni: (serverData as any).terminiCondizioni || '',
    subtotale: (serverData as any).subtotale,
    iva: (serverData as any).iva,
    totale: (serverData as any).totale
  };
  
  console.log('🔄 convertFromServerFormat - Final result:', {
    id: result.id,
    numero: result.numero,
    cliente: result.cliente,
    totale: result.totale,
    serviziKeys: Object.keys(result.servizi),
    serviziLength: Object.values(result.servizi).flat().length
  });
  
  return result;
}

export class PreventiviApiService {
  // URL Preventivi Service - Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
  private baseUrl = (import.meta.env.VITE_PREVENTIVI_SERVICE_URL ||
    (window.location.hostname === 'localhost'
      ? 'http://localhost:10000'
      : window.location.origin)) + '/api/preventivi';

  async getAllPreventivi(): Promise<LocalPreventivoData[]> {
    try {
      console.log('🔍 preventiviApi: Inizio caricamento preventivi...');
      console.log('🔍 preventiviApi: URL:', this.baseUrl);
      console.log('🔍 preventiviApi: Headers:', getAuthHeaders());
      
      const response = await fetch(this.baseUrl, {
        headers: getAuthHeaders()
      });
      
      console.log('🔍 preventiviApi: Response status:', response.status);
      console.log('🔍 preventiviApi: Response ok:', response.ok);
      
      handleAuthError(response);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('🔍 preventiviApi: Raw data ricevuta:', data);
      
      const serverPreventivi: PreventivoSalvato[] = data.preventivi || [];
      console.log('🔍 preventiviApi: Server preventivi:', serverPreventivi.length);
      
      const convertedPreventivi = serverPreventivi.map(convertFromServerFormat);
      console.log('🔍 preventiviApi: Preventivi convertiti:', convertedPreventivi.length);
      
      return convertedPreventivi;
    } catch (error) {
      console.error('❌ preventiviApi: Errore nel caricamento preventivi:', error);
      throw error;
    }
  }

  async createPreventivo(preventivo: LocalPreventivoData): Promise<LocalPreventivoData> {
    try {
      console.log('🔧 createPreventivo - Input data:', preventivo);
      const serverData = convertToServerFormat(preventivo);
      console.log('🔧 createPreventivo - Converted server data:', serverData);
      
      const headers = getAuthHeaders();
      console.log('🔧 createPreventivo - Headers:', headers);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(serverData),
      });

      console.log('🔧 createPreventivo - Response status:', response.status);
      console.log('🔧 createPreventivo - Response headers:', response.headers);

      handleAuthError(response);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔧 createPreventivo - Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('🔧 createPreventivo - Response data:', data);
      return convertFromServerFormat(data.preventivo);
    } catch (error) {
      console.error('Errore nella creazione preventivo:', error);
      throw error;
    }
  }

  async updatePreventivo(id: string, preventivo: LocalPreventivoData): Promise<LocalPreventivoData> {
    try {
      console.log('🔧 updatePreventivo - ID:', id);
      const serverData = convertToServerFormat(preventivo);
      console.log('🔧 updatePreventivo - Server data:', serverData);
      
      const response = await fetch(`${this.baseUrl}/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(serverData),
      });

      console.log('🔧 updatePreventivo - Response status:', response.status);

      handleAuthError(response);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔧 updatePreventivo - Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('🔧 updatePreventivo - Response data:', data);
      return convertFromServerFormat(data.preventivo);
    } catch (error) {
      console.error('Errore nell\'aggiornamento preventivo:', error);
      throw error;
    }
  }

  async deletePreventivo(id: string): Promise<void> {
    try {
      console.log('🗑️ deletePreventivo - ID:', id);
      
      const headers = getAuthHeaders();
      console.log('🗑️ deletePreventivo - Headers:', headers);
      console.log('🗑️ deletePreventivo - Token presente:', !!(headers as any)['Authorization']);
      
      const response = await fetch(`${this.baseUrl}/${id}`, {
        method: 'DELETE',
        headers: headers,
      });

      console.log('🗑️ deletePreventivo - Response status:', response.status);
      console.log('🗑️ deletePreventivo - Response headers:', response.headers);

      handleAuthError(response);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🗑️ deletePreventivo - Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      console.log('✅ deletePreventivo - Eliminazione completata con successo');
    } catch (error) {
      console.error('❌ Errore nell\'eliminazione preventivo:', error);
      throw error;
    }
  }
}

export const preventiviApi = new PreventiviApiService();
