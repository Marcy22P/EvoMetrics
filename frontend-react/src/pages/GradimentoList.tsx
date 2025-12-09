import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { CheckmarkIcon } from '../components/Icons/AssessmentIcons';
import './PageStyles.css';

const GradimentoList: React.FC = () => {
    const { hasPermission } = useAuth();
    const [gradimenti, setGradimenti] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchGradimenti = async () => {
            try {
                const token = localStorage.getItem('auth_token');
                const API_GATEWAY_URL = window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin;
                const GRADIMENTO_SERVICE_URL = import.meta.env.VITE_GRADIMENTO_SERVICE_URL || API_GATEWAY_URL;

                const response = await fetch(`${GRADIMENTO_SERVICE_URL}/api/gradimento`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setGradimenti(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchGradimenti();
    }, []);

    if (!hasPermission('gradimento:read')) return <div className="page-container">Accesso Negato</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-left">
                    <div className="page-icon"><CheckmarkIcon /></div>
                    <h1 className="page-title">Risposte Form Gradimento Team</h1>
                </div>
            </div>
            
            {isLoading ? <div className="loading">Caricamento...</div> : (
                <div className="cards-grid">
                    {gradimenti.map((g) => (
                        <div key={g.id} className="card">
                            <div className="card-header">
                                <div className="card-title-large">{g.risposte.nome} {g.risposte.cognome}</div>
                                <span className="date-badge">{new Date(g.data_compilazione).toLocaleDateString()}</span>
                            </div>
                            <div className="card-body">
                                <div className="detail-row">
                                    <strong>Qualità Lavoro:</strong> <span>{g.risposte.soddisfazione_qualita}/5</span>
                                </div>
                                <div className="detail-row">
                                    <strong>Produttività:</strong> <span>{g.risposte.organizzazione_produttivita}/5</span>
                                </div>
                                <div className="detail-row">
                                    <strong>Cose principali fatte:</strong>
                                    <p style={{marginTop: '4px'}}>{g.risposte.cose_principali}</p>
                                </div>
                                {g.risposte.ostacoli_interni && (
                                    <div className="detail-row">
                                        <strong>Ostacoli:</strong>
                                        <p>{g.risposte.ostacoli_interni}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GradimentoList;
