import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { clientiApi, type Cliente } from '../services/clientiApi';
import { ImportClienteModal } from '../components/clienti/ImportClienteModal';
import './Clienti.css';

const ShopifyIntegration: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newCliente, setNewCliente] = useState({
    nome_azienda: '',
    contatti: { email: '', telefono: '' },
    note: ''
  });

  const loadClienti = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientiApi.getClienti();
      setClienti(data);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento dei clienti');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClienti();
  }, [loadClienti]);

  // Ricarica la lista quando si naviga alla pagina con flag refresh (utile dopo eliminazione)
  useEffect(() => {
    // Se c'è un flag refresh nella location state, ricarica
    if (location.state && (location.state as any).refresh) {
      loadClienti();
      // Rimuovi il flag per evitare reload infiniti
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state, loadClienti, location.pathname]);

  // Ricarica anche quando la pagina riceve il focus (utile dopo eliminazione)
  useEffect(() => {
    const handleFocus = () => {
      loadClienti();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadClienti]);

  const handleCreateCliente = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await clientiApi.createCliente({
        nome_azienda: newCliente.nome_azienda,
        contatti: newCliente.contatti,
        note: newCliente.note,
        source: 'manual'
      });
      // Ottimistic update: aggiungi subito il cliente alla lista
      const tempCliente: Cliente = {
        id: result.id,
        nome_azienda: newCliente.nome_azienda,
        contatti: newCliente.contatti,
        servizi_attivi: [],
        integrazioni: {},
        note: newCliente.note,
        source: 'manual',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setClienti(prev => [tempCliente, ...prev]);
      setShowCreateModal(false);
      setNewCliente({ nome_azienda: '', contatti: { email: '', telefono: '' }, note: '' });
      // Naviga subito, ricarica in background
      navigate(`/shopify_integrations/${result.id}`);
      // Ricarica in background per sincronizzare
      loadClienti().catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Errore nella creazione del cliente');
      // Ricarica per sincronizzare
      loadClienti();
    }
  }, [newCliente, navigate, loadClienti]);

  const handleClienteImported = useCallback(() => {
    // Ricarica solo se necessario
    loadClienti();
    setShowImportModal(false);
  }, [loadClienti]);

  if (loading) {
    return (
      <div className="clienti-container">
        <div className="loading">Caricamento clienti...</div>
      </div>
    );
  }

  return (
    <div className="clienti-container">
      {/* Header */}
      <div className="clienti-header">
        {/* Logo al centro */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <img 
            src="/assets/logo-evoluzione-white.png" 
            alt="Evoluzione Imprese" 
            style={{
              height: '50px',
              width: 'auto',
              objectFit: 'contain',
              marginBottom: '0.2rem'
            }}
          />
        </div>
        
        {/* Titolo con effetto al centro sotto al logo */}
        <h1>
          <svg className="section-svg-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16,6V4C16,2.89 15.11,2 14,2H10C8.89,2 8,2.89 8,4V6H5C3.89,6 3,6.89 3,8V19C3,20.11 3.89,21 5,21H19C20.11,21 21,20.11 21,19V8C21,6.89 20.11,6 19,6H16M10,4H14V6H10V4M19,19H5V8H8V10H10V8H14V10H16V8H19V19Z" />
          </svg>
          Integrazioni Shopify
        </h1>
        
        {/* Subtitle */}
        <p className="subtitle">Gestione completa delle integrazioni Shopify dei tuoi clienti</p>
      </div>

      {/* Content */}
      <div className="clienti-content">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="clienti-actions">
          <button 
            className="btn-primary"
            onClick={() => setShowImportModal(true)}
          >
            Importa Cliente
          </button>
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Nuovo Cliente
          </button>
        </div>

        {clienti.length === 0 ? (
          <div className="empty-state">
            <p>Nessun cliente trovato</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className="btn-primary"
                onClick={() => setShowImportModal(true)}
              >
                Importa Cliente
              </button>
              <button 
                className="btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                Crea il primo cliente
              </button>
            </div>
          </div>
        ) : (
          <div className="clienti-grid">
            {clienti.map((cliente) => (
              <Link 
                key={cliente.id} 
                to={`/shopify_integrations/${cliente.id}`}
                className="cliente-card"
              >
                <h3>{cliente.nome_azienda}</h3>
                {cliente.contatti?.email && (
                  <p className="cliente-email">
                    {cliente.contatti.email}
                  </p>
                )}
                {cliente.contatti?.telefono && (
                  <p className="cliente-email">
                    {cliente.contatti.telefono}
                  </p>
                )}
                {cliente.servizi_attivi && cliente.servizi_attivi.length > 0 && (
                  <div className="servizi-badge">
                    {cliente.servizi_attivi.map(servizio => (
                      <span key={servizio} className="badge">{servizio}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Nuovo Cliente</h2>
            <form onSubmit={handleCreateCliente}>
              <div className="form-group">
                <label>Nome Azienda *</label>
                <input
                  type="text"
                  value={newCliente.nome_azienda}
                  onChange={(e) => setNewCliente({ ...newCliente, nome_azienda: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newCliente.contatti.email}
                  onChange={(e) => setNewCliente({
                    ...newCliente,
                    contatti: { ...newCliente.contatti, email: e.target.value }
                  })}
                />
              </div>
              <div className="form-group">
                <label>Telefono</label>
                <input
                  type="tel"
                  value={newCliente.contatti.telefono}
                  onChange={(e) => setNewCliente({
                    ...newCliente,
                    contatti: { ...newCliente.contatti, telefono: e.target.value }
                  })}
                />
              </div>
              <div className="form-group">
                <label>Note</label>
                <textarea
                  value={newCliente.note}
                  onChange={(e) => setNewCliente({ ...newCliente, note: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  Annulla
                </button>
                <button type="submit" className="btn-primary">
                  Crea Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ImportClienteModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onClienteImported={handleClienteImported}
      />
    </div>
  );
});

ShopifyIntegration.displayName = 'ShopifyIntegration';

export default ShopifyIntegration;
