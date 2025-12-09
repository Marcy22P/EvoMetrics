"""
Pydantic models per Shopify Service
"""

from pydantic import BaseModel
from typing import Optional, Dict, Any, List


class ShopifyIntegrationResponse(BaseModel):
    """Modello per risposta API integrazione Shopify"""
    id: str
    cliente_id: str
    shop: str
    scope: Optional[str] = None
    is_active: bool
    installed_at: Optional[str] = None
    uninstalled_at: Optional[str] = None
    created_at: str
    updated_at: str


class ShopifyMetricsResponse(BaseModel):
    """Modello per risposta API metriche Shopify"""
    total_orders: int
    total_revenue: float
    average_order_value: float
    orders_by_status: Dict[str, int]
    period: Dict[str, str]


class ShopifyTestResult(BaseModel):
    """Modello per risultato test connessione Shopify"""
    connected: bool
    shop_info: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ShopifyWebhookPayload(BaseModel):
    """Modello base per webhook Shopify"""
    pass

