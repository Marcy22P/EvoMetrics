export interface DatiCommittente {
  ragioneSociale: string;
  citta: string;
  via: string;
  numero: string;
  cap: string;
  email: string;
  pec: string;
  cfPiva: string;
  legaleRappresentante: string;
}

export interface ServizioContratto {
  id: string;
  nome: string;
  descrizione: string;
  attivato: boolean;
}

export interface DurataContratto {
  tipo: '12_mesi_senza_rinnovo' | '12_mesi_con_rinnovo' | '6_6_mesi_senza_rinnovo' | '3_mesi_con_rinnovo' | '3_mesi_senza_rinnovo';
  dataDecorrenza: string;
  dataScadenza: string;
}

export interface CompensoSitoWeb {
  importoTotale: number;
  modalitaPagamento: '50_50' | '40_30_30';
  acconto: number;
  secondaRata?: number;
  saldo: number;
}

export interface CompensoMarketing {
  importoMensile: number;
  giornoPagamento: number;
}

export interface CompensoContratto {
  sitoWeb?: CompensoSitoWeb;
  marketing: CompensoMarketing;
}

export interface ContrattoData {
  id: string;
  numero: string;
  datiCommittente: DatiCommittente;
  tipologiaServizio: 'sito_marketing_linkbuilding' | 'sito_marketing' | 'marketing_content_adv' | 'marketing_adv';
  servizi: ServizioContratto[];
  durata: DurataContratto;
  compenso: CompensoContratto;
  note: string;
  // Articoli del contratto (modificabili)
  articolo2Oggetto?: string;
  articolo2SitoWeb?: string;
  articolo2Marketing?: string;
  articolo2Linkbuilding?: string;
  articolo3Modalita?: string;
  articolo4Durata?: string;
  articolo5Compenso?: string;
  articolo6Proprieta?: string;
  articolo7Responsabilita?: string;
  articolo8NormeRinvio?: string;
  articolo9ForoCompetente?: string;
  status: 'bozza' | 'inviato' | 'firmato' | 'estinto' | 'rescisso';
  created_at: string;
  updated_at: string;
}

export interface ServiziDisponibili {
  sitoWeb: ServizioContratto;
  marketing: ServizioContratto;
  linkbuilding: ServizioContratto;
}
