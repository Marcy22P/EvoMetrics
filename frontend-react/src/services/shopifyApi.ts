/**
 * Shopify API Service
 * Comunica con il microservizio Shopify Service
 */

// URL Shopify Service - Usa API Gateway unificato
import { getServiceUrl } from '../utils/apiConfig';

const SHOPIFY_SERVICE_URL = getServiceUrl('shopify');

export interface ShopifyMetrics {
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  orders_by_status: Record<string, number>;
  period: {
    start: string;
    end: string;
  };
}

export interface ShopifyTestResult {
  connected: boolean;
  shop_info?: {
    name?: string;
    domain?: string;
    email?: string;
    plan_name?: string;
    currency?: string;
    timezone?: string;
  } | null;
  error?: string;
  warning?: string;
  integration?: {
    id?: string;
    installed_at?: string;
    scope?: string;
    is_active?: boolean;
  } | null;
}

export interface ShopifyIntegration {
  id: string;
  cliente_id: string;
  shop: string;
  scope?: string;
  is_active: boolean;
  installed_at?: string;
  uninstalled_at?: string;
  created_at: string;
  updated_at: string;
}

class ShopifyApiService {
  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Token di autenticazione non trovato');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Avvia OAuth flow per Shopify
   */
  async connectShopify(clienteId: string, shop: string, magicLinkToken?: string): Promise<void> {
    const params = new URLSearchParams({
      shop: shop,
      cliente_id: clienteId,
    });
    
    if (magicLinkToken) {
      params.append('magic_link_token', magicLinkToken);
    }
    
    const oauthUrl = `${SHOPIFY_SERVICE_URL}/api/shopify/oauth/authorize?${params.toString()}`;
    window.location.href = oauthUrl;
  }

  /**
   * Testa connessione Shopify
   */
  async testShopifyConnection(clienteId: string): Promise<ShopifyTestResult> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${SHOPIFY_SERVICE_URL}/api/shopify/clienti/${clienteId}/test`, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
      throw new Error(error.error || `Errore nel test della connessione: ${response.status}`);
    }
    
    return await response.json();
  }

  /**
   * Recupera metriche Shopify
   */
  async getShopifyMetrics(
    clienteId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ShopifyMetrics> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const url = `${SHOPIFY_SERVICE_URL}/api/shopify/clienti/${clienteId}/metrics${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
      throw new Error(error.error || `Errore nel caricamento delle metriche: ${response.status}`);
    }
    
    return await response.json();
  }

  /**
   * Recupera informazioni integrazione Shopify
   */
  async getShopifyIntegration(clienteId: string): Promise<ShopifyIntegration> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${SHOPIFY_SERVICE_URL}/api/shopify/clienti/${clienteId}/integration`, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
      throw new Error(error.error || `Errore nel caricamento dell'integrazione: ${response.status}`);
    }
    
    return await response.json();
  }
}

export const shopifyApi = new ShopifyApiService();

