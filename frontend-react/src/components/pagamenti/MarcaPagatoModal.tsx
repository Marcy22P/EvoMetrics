import React, { useState } from 'react';
import './MarcaPagatoModal.css';

interface MarcaPagatoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    data_pagamento: string;
    metodo_pagamento: string;
    note: string;
  }) => void;
  pagamento: {
    id: string;
    descrizione?: string;
    importo: number;
    data_scadenza: string;
  };
}

const MarcaPagatoModal: React.FC<MarcaPagatoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  pagamento
}) => {
  const [data_pagamento, setDataPagamento] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [metodo_pagamento, setMetodoPagamento] = useState<string>('bonifico');
  const [note, setNote] = useState<string>('');

  // Formattazione valuta
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  // Formattazione data
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT');
  };

  if (!isOpen) return null;

  return (
    <div className="marca-pagato-modal-overlay">
      <div className="marca-pagato-modal">
        <div className="marca-pagato-modal-header">
          <h2>Marca Pagato</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="marca-pagato-modal-content">
          <div className="pagamento-info">
            <h3>{pagamento.descrizione}</h3>
            <p><strong>Importo:</strong> {formatCurrency(pagamento.importo)}</p>
            <p><strong>Scadenza:</strong> {formatDate(pagamento.data_scadenza)}</p>
          </div>
          
          <div className="form-group">
            <label htmlFor="data_pagamento">Data di pagamento</label>
            <input
              type="date"
              id="data_pagamento"
              value={data_pagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="metodo_pagamento">Metodo di pagamento</label>
            <select
              id="metodo_pagamento"
              value={metodo_pagamento}
              onChange={(e) => setMetodoPagamento(e.target.value)}
              required
            >
              <option value="bonifico">Bonifico</option>
              <option value="carta">Carta</option>
              <option value="contanti">Contanti</option>
              <option value="rid">RID</option>
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="note">Note (opzionale)</label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Inserisci eventuali note sul pagamento"
            />
          </div>
        </div>
        
        <div className="marca-pagato-modal-footer">
          <button 
            className="cancel-button"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="confirm-button"
            onClick={() => onConfirm({
              data_pagamento: data_pagamento ? `${data_pagamento}T12:00:00.000Z` : new Date().toISOString(),
              metodo_pagamento,
              note
            })}
          >
            Conferma Pagamento
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarcaPagatoModal;
