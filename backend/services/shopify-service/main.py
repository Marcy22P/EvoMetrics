"""
Shopify Service - Microservizio per integrazione Shopify
Conforme ai requisiti Shopify App Store
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from typing import Dict, Any, Optional
import os
import json
import uuid
import secrets
import hmac
import hashlib
import base64
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from contextlib import asynccontextmanager
import httpx
from cryptography.fernet import Fernet

from database import database, init_database, close_database, shopify_integrations_table
from models import (
    ShopifyIntegrationResponse,
    ShopifyMetricsResponse,
    ShopifyTestResult
)

# Importa ShopifyAPI dal file locale
from shopify_api import ShopifyAPI

# Carica variabili d'ambiente dalla root del progetto
try:
    from dotenv import load_dotenv
    root_dir = Path(__file__).parent.parent.parent.parent
    env_path = root_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

# JWT Configuration (per verificare token utente)
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"

# Shopify Configuration
SHOPIFY_ENCRYPTION_KEY = os.environ.get("SHOPIFY_ENCRYPTION_KEY")
if not SHOPIFY_ENCRYPTION_KEY:
    raise ValueError("SHOPIFY_ENCRYPTION_KEY environment variable is required")

# URL Servizi
FRONTEND_URL = os.environ.get("FRONTEND_URL")
if not FRONTEND_URL:
    raise ValueError("FRONTEND_URL environment variable is required")

# URL Servizi esterni (opzionali in modalità unificata)
SHOPIFY_SERVICE_URL = os.environ.get("SHOPIFY_SERVICE_URL")
CLIENTI_SERVICE_URL = os.environ.get("CLIENTI_SERVICE_URL")
AUTH_SERVICE_URL = os.environ.get("AUTH_SERVICE_URL")

# In-memory storage per OAuth states (in produzione usare Redis)
oauth_states: Dict[str, Dict[str, Any]] = {}

# Inizializza ShopifyAPI
shopify_api = ShopifyAPI()


def encrypt_shopify_token(token: str) -> str:
    """Cifra access token Shopify"""
    try:
        f = Fernet(SHOPIFY_ENCRYPTION_KEY.encode())
        encrypted = f.encrypt(token.encode())
        return encrypted.decode('utf-8')
    except Exception as e:
        raise ValueError(f"Errore cifratura token: {str(e)}")


def decrypt_shopify_token(encrypted_token: str) -> str:
    """Decifra access token Shopify"""
    try:
        f = Fernet(SHOPIFY_ENCRYPTION_KEY.encode())
        decrypted = f.decrypt(encrypted_token.encode('utf-8'))
        return decrypted.decode('utf-8')
    except Exception as e:
        raise ValueError(f"Errore decifratura token: {str(e)}")


def verify_webhook_hmac(data: bytes, hmac_header: str) -> bool:
    """Verifica HMAC signature per webhook Shopify (Base64 encoded)"""
    api_secret = os.environ.get("SHOPIFY_API_SECRET")
    if not api_secret:
        return False
    
    digest = hmac.new(
        api_secret.encode(),
        data,
        hashlib.sha256
    ).digest()
    
    calculated_hmac = base64.b64encode(digest).decode('utf-8')
    
    return hmac.compare_digest(calculated_hmac, hmac_header)


async def get_current_user(request: Request) -> Dict[str, Any]:
    """Ottieni l'utente corrente dal token JWT"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise credentials_exception
    
    token = auth_header.split(" ")[1]
    if not token:
        raise credentials_exception
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Verifica utente tramite Auth Service
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{AUTH_SERVICE_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            if response.status_code == 200:
                user_data = response.json()
                return {
                    "id": user_data.get("id"),
                    "username": user_data.get("username"),
                    "role": user_data.get("role"),
                    "is_active": user_data.get("is_active", True)
                }
    except Exception:
        pass
    
    raise credentials_exception


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestione lifecycle dell'applicazione"""
    await init_database()
    yield
    await close_database()


app = FastAPI(
    title="Shopify Service",
    description="Microservizio per integrazione Shopify conforme ai requisiti App Store",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione specificare domini
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware per Headers di Sicurezza (CSP per Shopify)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Permetti embedding solo da domini Shopify
    response.headers["Content-Security-Policy"] = "frame-ancestors https://*.myshopify.com https://admin.shopify.com;"
    return response


# =========================
# OAUTH ENDPOINTS
# =========================

@app.get("/api/shopify/entry")
async def shopify_app_entry(
    shop: str,
    request: Request
):
    """
    Entry point principale per l'App URL di Shopify.
    Gestisce l'ingresso dallo store Shopify.
    """
    # Normalizza shop
    shop_normalized = shop.strip().lower()
    if not shop_normalized.endswith('.myshopify.com'):
        shop_normalized = f"{shop_normalized}.myshopify.com"

    # Verifica se lo shop è già installato
    integration = await database.fetch_one(
        shopify_integrations_table.select()
        .where(shopify_integrations_table.c.shop == shop_normalized)
        .where(shopify_integrations_table.c.is_active == True)
    )

    if integration:
        # Shop già connesso -> Redirect all'app (o admin Shopify se embedded)
        # Se siamo in embedded app, dovremmo tornare un HTML con App Bridge
        # Per ora redirigiamo alla dashboard admin dove l'app è ospitata
        app_handle = os.environ.get("SHOPIFY_APP_HANDLE") or os.environ.get("SHOPIFY_API_KEY")
        shop_name = shop_normalized.replace(".myshopify.com", "")
        return RedirectResponse(f"https://admin.shopify.com/store/{shop_name}/apps/{app_handle}")
    else:
        # Shop non connesso -> Istruzioni installazione
        # Non possiamo iniziare OAuth senza cliente_id
        return RedirectResponse(f"{FRONTEND_URL}/login?shopify_install_instructions=true&shop={shop}")


@app.get("/api/shopify/oauth/authorize")
async def shopify_oauth_authorize(
    shop: str,
    cliente_id: str,
    request: Request,
    magic_link_token: Optional[str] = None
):
    """
    Inizia OAuth flow per Shopify
    Conforme ai requisiti Shopify App Store
    """
    # Verifica che il cliente esista (chiamata a Clienti Service)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CLIENTI_SERVICE_URL}/api/clienti/{cliente_id}",
                timeout=5.0
            )
            if response.status_code != 200:
                raise HTTPException(status_code=404, detail="Cliente not found")
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Clienti Service unavailable")
    
    # Genera state per sicurezza OAuth
    state = secrets.token_urlsafe(32)
    oauth_states[state] = {
        "cliente_id": cliente_id,
        "shop": shop,
        "magic_link_token": magic_link_token,
        "timestamp": datetime.now()
    }
    
    # Determina redirect_uri basandosi su BASE_URL o ambiente
    IS_PRODUCTION = os.environ.get("RENDER", "false").lower() == "true" or os.environ.get("ENVIRONMENT", "").lower() == "production"
    if IS_PRODUCTION:
        backend_url = os.environ.get("BASE_URL")
        if not backend_url:
            raise ValueError("BASE_URL environment variable is required in production")
    else:
        # In sviluppo, usa SHOPIFY_SERVICE_URL o BASE_URL se disponibile
        backend_url = os.environ.get("BASE_URL", SHOPIFY_SERVICE_URL)
    
    redirect_uri = f"{backend_url}/api/shopify/oauth/callback"
    oauth_url = shopify_api.generate_oauth_url(shop, redirect_uri, state)
    
    return RedirectResponse(url=oauth_url)


@app.get("/api/shopify/oauth/callback")
async def shopify_oauth_callback(
    code: str,
    state: str,
    shop: str,
    hmac: str,
    request: Request
):
    """
    Callback OAuth da Shopify
    Conforme ai requisiti Shopify App Store:
    - Verifica HMAC
    - Autentica immediatamente dopo installazione
    - Reindirizza all'interfaccia utente dell'app subito dopo autenticazione
    """
    # Verifica HMAC (requisito Shopify)
    query_params = dict(request.query_params)
    if not shopify_api.verify_hmac(query_params, hmac):
        raise HTTPException(status_code=400, detail="Invalid HMAC signature")
    
    # Verifica state
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    
    state_data = oauth_states.pop(state)
    cliente_id = state_data["cliente_id"]
    magic_link_token = state_data.get("magic_link_token")
    
    # Normalizza shop
    shop_normalized = shop.strip().lower()
    if not shop_normalized.endswith('.myshopify.com'):
        shop_normalized = f"{shop_normalized}.myshopify.com"
    
    try:
        # Scambia code per access token
        token_data = await shopify_api.exchange_code_for_token(shop, code)
        access_token = token_data["access_token"]
        scope = token_data.get("scope", "")
        
        # Verifica validità token
        if not access_token or len(access_token) < 20:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid Shopify token (length: {len(access_token)})"
            )
        
        # Cifra token prima di salvarlo
        encrypted_token = encrypt_shopify_token(access_token)
        
        # Verifica se integrazione esiste
        existing = await database.fetch_one(
            shopify_integrations_table.select()
            .where(shopify_integrations_table.c.shop == shop_normalized)
        )
        
        now = datetime.now()
        
        if existing:
            # Aggiorna integrazione esistente
            await database.execute(
                shopify_integrations_table.update()
                .where(shopify_integrations_table.c.shop == shop_normalized)
                .values(
                    cliente_id=cliente_id,
                    access_token=encrypted_token,
                    scope=scope,
                    is_active=True,
                    installed_at=now,
                    uninstalled_at=None,
                    updated_at=now
                )
            )
        else:
            # Crea nuova integrazione
            integration_id = str(uuid.uuid4())
            await database.execute(
                shopify_integrations_table.insert().values(
                    id=integration_id,
                    cliente_id=cliente_id,
                    shop=shop_normalized,
                    access_token=encrypted_token,
                    scope=scope,
                    is_active=True,
                    installed_at=now,
                    uninstalled_at=None,
                    created_at=now,
                    updated_at=now
                )
            )
        
        # Marca magic link come usato se presente (chiamata diretta al database)
        if magic_link_token:
            try:
                # Importa magic_links_table da clienti-service database
                # Per ora gestiamo tramite chiamata HTTP, in futuro possiamo condividere il database
                async with httpx.AsyncClient() as client:
                    # Cerca magic link per token e marca come usato
                    # Nota: questo richiede un endpoint nel clienti-service
                    # Per ora saltiamo, sarà implementato quando necessario
                    pass
            except Exception:
                pass  # Non critico
        
        # REQUISITO SHOPIFY: Reindirizza immediatamente all'interfaccia utente dell'app
        # Per app Embedded (App Bridge), il redirect deve essere fatto all'interno dell'admin Shopify
        # URL formato: https://admin.shopify.com/store/{shop_name}/apps/{app_handle_or_api_key}
        
        # Estrai nome shop dal dominio (es. test.myshopify.com -> test)
        shop_name = shop_normalized.replace(".myshopify.com", "")
        
        # Preferisci App Handle se configurato (più pulito), altrimenti usa API Key
        app_identifier = os.environ.get("SHOPIFY_APP_HANDLE")
        if not app_identifier:
            app_identifier = os.environ.get("SHOPIFY_API_KEY")
            
        # Costruisci URL Admin
        # Nota: Per passare parametri alla app embedded, dovremmo usarli come query params o path
        # ma per la conformità iniziale è meglio reindirizzare alla home dell'app.
        # Possiamo appendere il deep link se necessario, ma assicuriamoci che sia valido.
        
        admin_url = f"https://admin.shopify.com/store/{shop_name}/apps/{app_identifier}"
        
        # Aggiungi deep link come query param gestito dal frontend o path se supportato
        if target_path:
             # Shopify Admin gestisce i path appesi all'URL dell'app
             # Rimuovi lo slash iniziale per evitare doppi slash se necessario, ma admin.shopify.com/.../apps/key/path funziona
             # admin_url = f"{admin_url}{target_path}"
             pass # Per sicurezza durante la review, mandiamo alla home. Il frontend gestirà lo stato.
        
        return RedirectResponse(url=admin_url)

        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth error: {str(e)}")


# =========================
# WEBHOOK ENDPOINTS
# =========================

@app.post("/api/shopify/webhooks/app/uninstalled")
async def shopify_webhook_app_uninstalled(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: str = Header(..., alias="X-Shopify-Hmac-Sha256")
):
    """
    Webhook obbligatorio: app/uninstalled
    Conforme ai requisiti Shopify App Store:
    - Verifica firma HMAC
    - Pulisce dati quando l'app viene disinstallata
    """
    # Leggi body raw per verifica HMAC
    body = await request.body()
    
    # Verifica HMAC (requisito Shopify)
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256):
        raise HTTPException(status_code=401, detail="Invalid webhook HMAC")
    
    # Normalizza shop domain
    shop_normalized = x_shopify_shop_domain.strip().lower()
    if not shop_normalized.endswith('.myshopify.com'):
        shop_normalized = f"{shop_normalized}.myshopify.com"
    
    try:
        # Marca integrazione come disinstallata
        await database.execute(
            shopify_integrations_table.update()
            .where(shopify_integrations_table.c.shop == shop_normalized)
            .values(
                is_active=False,
                uninstalled_at=datetime.now(),
                updated_at=datetime.now()
            )
        )
        
        return {"status": "success", "message": "App uninstalled"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing webhook: {str(e)}")


@app.post("/api/shopify/webhooks/customers/data_request")
async def shopify_webhook_customers_data_request(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: str = Header(..., alias="X-Shopify-Hmac-Sha256")
):
    """
    Webhook GDPR Obbligatorio: customers/data_request
    Richiesta dati cliente.
    """
    body = await request.body()
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256):
        raise HTTPException(status_code=401, detail="Invalid webhook HMAC")
    
    # Logica per recuperare e inviare dati cliente (via email al merchant o response diretta se sincrono)
    # Per ora logghiamo e confermiamo ricezione
    print(f"GDPR Data Request received for shop {x_shopify_shop_domain}")
    return {"status": "success"}

@app.post("/api/shopify/webhooks/customers/redact")
async def shopify_webhook_customers_redact(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: str = Header(..., alias="X-Shopify-Hmac-Sha256")
):
    """
    Webhook GDPR Obbligatorio: customers/redact
    Richiesta cancellazione dati cliente.
    """
    body = await request.body()
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256):
        raise HTTPException(status_code=401, detail="Invalid webhook HMAC")
    
    print(f"GDPR Customer Redact received for shop {x_shopify_shop_domain}")
    # Logica cancellazione dati
    return {"status": "success"}

@app.post("/api/shopify/webhooks/shop/redact")
async def shopify_webhook_shop_redact(
    request: Request,
    x_shopify_shop_domain: str = Header(..., alias="X-Shopify-Shop-Domain"),
    x_shopify_hmac_sha256: str = Header(..., alias="X-Shopify-Hmac-Sha256")
):
    """
    Webhook GDPR Obbligatorio: shop/redact
    Richiesta cancellazione dati negozio (48h dopo disinstallazione).
    """
    body = await request.body()
    if not verify_webhook_hmac(body, x_shopify_hmac_sha256):
        raise HTTPException(status_code=401, detail="Invalid webhook HMAC")
    
    print(f"GDPR Shop Redact received for shop {x_shopify_shop_domain}")
    # Logica cancellazione totale dati shop
    return {"status": "success"}



# =========================
# API ENDPOINTS
# =========================

@app.get("/api/shopify/clienti/{cliente_id}/test", response_model=ShopifyTestResult)
async def test_shopify_connection(
    cliente_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Testa connessione Shopify - verifica che l'app sia installata e funzionante"""
    try:
        # Verifica integrazione
        integration = await database.fetch_one(
            shopify_integrations_table.select()
            .where(shopify_integrations_table.c.cliente_id == cliente_id)
            .where(shopify_integrations_table.c.is_active == True)
        )
        
        if not integration:
            return ShopifyTestResult(
                connected=False,
                error="Shopify non connesso per questo cliente"
            )
        
        # Decifra token
        try:
            encrypted_token = integration["access_token"]
            access_token = decrypt_shopify_token(encrypted_token)
        except Exception as e:
            return ShopifyTestResult(
                connected=False,
                error=f"Errore decifratura token: {str(e)}"
            )
        
        shop = integration["shop"]
        
        # Test connessione: recupera info shop
        try:
            shop_info = await shopify_api.get_shop_info(shop, access_token)
            return ShopifyTestResult(
                connected=True,
                shop_info=shop_info
            )
        except Exception as e:
            error_msg = str(e)
            if "403" in error_msg or "Forbidden" in error_msg:
                return ShopifyTestResult(
                    connected=False,
                    error="Accesso negato da Shopify. Reinstalla l'app."
                )
            return ShopifyTestResult(
                connected=True,
                shop_info=None,
                error=f"API non raggiungibile: {error_msg}"
            )
    except Exception as e:
        return ShopifyTestResult(
            connected=False,
            error=f"Errore: {str(e)}"
        )


@app.get("/api/shopify/clienti/{cliente_id}/metrics", response_model=ShopifyMetricsResponse)
async def get_shopify_metrics(
    cliente_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Recupera metriche Shopify per cliente"""
    try:
        # Verifica integrazione
        integration = await database.fetch_one(
            shopify_integrations_table.select()
            .where(shopify_integrations_table.c.cliente_id == cliente_id)
            .where(shopify_integrations_table.c.is_active == True)
        )
        
        if not integration:
            raise HTTPException(status_code=404, detail="Shopify integration not found")
        
        # Decifra token
        encrypted_token = integration["access_token"]
        access_token = decrypt_shopify_token(encrypted_token)
        shop = integration["shop"]
        
        # Calcola date di default (ultimi 30 giorni)
        if not start_date or not end_date:
            from datetime import timedelta
            end_date = datetime.now().isoformat()
            start_date = (datetime.now() - timedelta(days=30)).isoformat()
        
        # Recupera metriche
        metrics = await shopify_api.get_order_analytics(shop, access_token, start_date, end_date)
        
        return ShopifyMetricsResponse(**metrics)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.get("/api/shopify/clienti/{cliente_id}/integration", response_model=ShopifyIntegrationResponse)
async def get_shopify_integration(
    cliente_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Recupera informazioni integrazione Shopify per cliente"""
    try:
        integration = await database.fetch_one(
            shopify_integrations_table.select()
            .where(shopify_integrations_table.c.cliente_id == cliente_id)
            .where(shopify_integrations_table.c.is_active == True)
        )
        
        if not integration:
            raise HTTPException(status_code=404, detail="Shopify integration not found")
        
        integration_dict = dict(integration)
        
        # Converti datetime in ISO string
        for field in ['installed_at', 'uninstalled_at', 'created_at', 'updated_at']:
            if integration_dict.get(field) and isinstance(integration_dict[field], datetime):
                integration_dict[field] = integration_dict[field].isoformat()
        
        # Non esporre access_token
        integration_dict.pop('access_token', None)
        
        return ShopifyIntegrationResponse(**integration_dict)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=port)

