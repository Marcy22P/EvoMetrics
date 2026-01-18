/**
 * Configurazione centralizzata per URL API
 * 
 * In produzione, usa VITE_API_GATEWAY_URL se disponibile, altrimenti window.location.origin
 * In sviluppo, usa VITE_API_GATEWAY_URL se disponibile, altrimenti http://localhost:10000
 */
export const getApiGatewayUrl = (): string => {
  // Priorità 1: Variabile d'ambiente esplicita
  if (import.meta.env.VITE_API_GATEWAY_URL) {
    return import.meta.env.VITE_API_GATEWAY_URL;
  }
  
  // Priorità 2: Fallback intelligente basato su hostname
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:10000';
  }
  
  // Priorità 3: Usa origin corrente (produzione)
  return window.location.origin;
};

/**
 * Ottiene l'URL per un servizio specifico
 * Se VITE_{SERVICE}_SERVICE_URL è definito, lo usa, altrimenti usa API Gateway
 */
export const getServiceUrl = (serviceName: string): string => {
  const envKey = `VITE_${serviceName.toUpperCase()}_SERVICE_URL` as keyof ImportMetaEnv;
  const serviceUrl = import.meta.env[envKey];
  
  if (serviceUrl) {
    return serviceUrl;
  }
  
  return getApiGatewayUrl();
};

// Esporta URL base per compatibilità
export const API_GATEWAY_URL = getApiGatewayUrl();
