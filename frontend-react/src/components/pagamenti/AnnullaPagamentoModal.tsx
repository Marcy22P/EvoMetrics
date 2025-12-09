import React from 'react';
import './MarcaPagatoModal.css'; // Riutilizziamo lo stesso stile

interface AnnullaPagamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pagamento: {
    id: string;
    descrizione?: string;
    importo: number;
    data_pagamento?: string;
    metodo_pagamento?: string;
  };
}

const AnnullaPagamentoModal: React.FC<AnnullaPagamentoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  pagamento
}) => {
  // Formattazione valuta
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  // Formattazione data
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('it-IT');
  };

  if (!isOpen) return null;

  return (
    <div className="marca-pagato-modal-overlay">
      <div className="marca-pagato-modal">
        <div className="marca-pagato-modal-header">
          <h2>Annulla Pagamento</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="marca-pagato-modal-content">
          <div className="pagamento-info" style={{ borderColor: 'rgba(220, 53, 69, 0.3)' }}>
            <h3>{pagamento.descrizione}</h3>
            <p><strong>Importo:</strong> {formatCurrency(pagamento.importo)}</p>
            <p><strong>Data pagamento:</strong> {formatDate(pagamento.data_pagamento)}</p>
            {pagamento.metodo_pagamento && (
              <p><strong>Metodo:</strong> {pagamento.metodo_pagamento}</p>
            )}
          </div>
          
          <div style={{ 
            padding: '1rem', 
            borderRadius: '8px', 
            background: 'rgba(220, 53, 69, 0.1)',
            border: '1px solid rgba(220, 53, 69, 0.3)',
            marginTop: '1rem'
          }}>
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              <strong>⚠️ Attenzione:</strong> Questa azione ripristinerà lo stato del pagamento a "da pagare" e rimuoverà la data di pagamento e il metodo registrati.
            </p>
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
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              background: 'rgba(220, 53, 69, 0.2)',
              border: '1px solid rgba(220, 53, 69, 0.3)',
              color: '#dc3545',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(220, 53, 69, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)';
            }}
            onClick={onConfirm}
          >
            Conferma Annullamento
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnullaPagamentoModal;
