import React from 'react';
import './DeleteContrattoModal.css';

interface DeleteContrattoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  contratto: {
    numero: string;
    cliente: string;
    importo_totale: number;
    status: string;
  };
}

const DeleteContrattoModal: React.FC<DeleteContrattoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  contratto
}) => {
  // Formattazione valuta
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  // Formattazione status
  const formatStatus = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'bozza': 'Bozza',
      'inviato': 'Inviato',
      'firmato': 'Firmato',
      'estinto': 'Estinto',
      'rescisso': 'Rescisso'
    };
    return statusMap[status] || status;
  };

  if (!isOpen) return null;

  return (
    <div className="delete-contratto-modal-overlay">
      <div className="delete-contratto-modal">
        <div className="delete-contratto-modal-header">
          <h2>
            <svg viewBox="0 0 24 24" fill="currentColor" className="warning-icon">
              <path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" />
            </svg>
            Conferma Eliminazione
          </h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="delete-contratto-modal-content">
          <div className="warning-message">
            <div className="warning-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" />
              </svg>
            </div>
            <p>Sei sicuro di voler eliminare questo contratto?</p>
            <p className="warning-subtitle">Questa azione non può essere annullata.</p>
          </div>
          
          <div className="contratto-info">
            <h3>Dettagli Contratto</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Numero:</span>
                <span className="info-value">{contratto.numero}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Cliente:</span>
                <span className="info-value">{contratto.cliente}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Importo:</span>
                <span className="info-value">{formatCurrency(contratto.importo_totale)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status:</span>
                <span className={`info-value status-${contratto.status}`}>
                  {formatStatus(contratto.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="consequences-warning">
            <h4>
              <svg viewBox="0 0 24 24" fill="currentColor" className="warning-icon">
                <path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" />
              </svg>
              Conseguenze dell'eliminazione:
            </h4>
            <ul>
              <li>Tutti i pagamenti associati verranno eliminati</li>
              <li>I dati del contratto non potranno essere recuperati</li>
              <li>Questa azione influenzerà le statistiche della dashboard</li>
            </ul>
          </div>
        </div>
        
        <div className="delete-contratto-modal-footer">
          <button 
            className="cancel-button"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="delete-button"
            onClick={onConfirm}
          >
            Elimina Contratto
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteContrattoModal;
