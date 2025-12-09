export interface PagamentoData {
  contratto_id: string;
  contratto_numero: string;
  cliente: string;
  tipo: 'sito_acconto' | 'sito_rata2' | 'sito_saldo' | 'marketing_mensile';
  descrizione?: string;
  importo: number;
  data_scadenza: string;
  status: 'da_pagare' | 'pagato' | 'scaduto';
  metodo_pagamento?: string;
  note?: string;
}

export interface PagamentoSalvato extends PagamentoData {
  id: string;
  data_pagamento?: string;
  created_at: string;
  updated_at: string;
  contratto_status?: string;  // Stato del contratto
}

export interface MarcaPagatoRequest {
  data_pagamento?: string;
  metodo_pagamento?: string;
  note?: string;
}

export interface ContrattoConPagamenti {
  contratto_id: string;
  contratto_numero: string;
  cliente: string;
  pagamenti: PagamentoSalvato[];
  totale_contratto: number;
  totale_incassato: number;
  totale_da_incassare: number;
  isExpanded?: boolean;
  stato_contratto?: 'bozza' | 'inviato' | 'firmato' | 'estinto' | 'rescisso';
}

export interface KPIFinanziarie {
  totale_incassato: number;
  totale_da_incassare: number;
  totale_scaduti: number;
  totale_rescissi: number;  // Totale perso dai contratti rescissi
  totale_estinti: number;  // Totale incassato dai contratti estinti
  numero_pagamenti_totali: number;
  numero_pagamenti_pagati: number;
  numero_pagamenti_da_pagare: number;
  numero_pagamenti_scaduti: number;
  numero_contratti_rescissi: number;  // Numero di contratti rescissi
  numero_contratti_estinti: number;  // Numero di contratti estinti
}

export type FiltroVisibilita = 'tutti' | 'attivi' | 'scaduti' | 'rescissi' | 'estinti';

