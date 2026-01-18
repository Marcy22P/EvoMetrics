"""
API Gateway Unificato - Tutti i microservizi in un unico webservice
Serve il frontend React e include tutte le route dei microservizi
"""

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pathlib import Path
import os
import sys
from contextlib import asynccontextmanager, AsyncExitStack
from databases import Database # Added
from jose import JWTError, jwt # Added for basic auth check

# Aggiungi i percorsi dei microservizi al PYTHONPATH
services_path = Path(__file__).parent.parent / "services"
sys.path.insert(0, str(services_path))

# Carica variabili d'ambiente
try:
    from dotenv import load_dotenv
    root_dir = Path(__file__).parent.parent.parent
    env_path = root_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

# Database Configuration per Dashboard Summary
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Connection pool size configurabile - ridotto per evitare saturazione in produzione
# In unified mode con molti servizi, ogni servizio deve usare poche connessioni
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "0"))  # 0 = nessuna connessione iniziale
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "1"))  # 1 = massimo 1 connessione per servizio

database = Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE) if DATABASE_URL else None

SECRET_KEY = os.environ.get("SECRET_KEY")
ALGORITHM = "HS256"

async def verify_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = auth_header.split(" ")[1]
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ... (Import functions remain the same) ...

# Importa tutte le app dei microservizi usando importlib per gestire i trattini nei nomi
import importlib.util

def load_service_app(service_name):
    """Carica l'app di un microservizio con namespace isolato"""
    import os as os_module
    
    service_dir = services_path / service_name
    service_main_file = service_dir / "main.py"
    service_dir_str = str(service_dir)
    
    # Salva la working directory corrente
    original_cwd = os_module.getcwd()
    
    # Rimuovi eventuali moduli locali già caricati da altri servizi
    # (moduli comuni come 'models', 'database', 'auth', etc.)
    common_module_names = ['models', 'database', 'auth', 'schemas', 'utils', 'config', 'crud']
    modules_to_remove = []
    for mod_name in common_module_names:
        if mod_name in sys.modules:
            mod = sys.modules[mod_name]
            # Rimuovi solo se è stato caricato da un altro servizio
            if mod and hasattr(mod, '__file__') and mod.__file__:
                mod_file = str(mod.__file__)
                # Se il modulo non è da questo servizio, segnalo per rimozione
                if service_dir_str not in mod_file:
                    modules_to_remove.append(mod_name)
    
    # Rimuovi anche moduli con nomi completi che potrebbero causare conflitti
    # (es. 'services.preventivi-service.database', 'services.sales-service.database')
    for mod_name in list(sys.modules.keys()):
        if any(common_name in mod_name for common_name in common_module_names):
            mod = sys.modules[mod_name]
            if mod and hasattr(mod, '__file__') and mod.__file__:
                mod_file = str(mod.__file__)
                if service_dir_str not in mod_file:
                    modules_to_remove.append(mod_name)
    
    # Rimuovi i moduli in un secondo momento per evitare problemi durante l'iterazione
    for mod_name in set(modules_to_remove):  # set() per rimuovere duplicati
        if mod_name in sys.modules:
            try:
                del sys.modules[mod_name]
            except KeyError:
                pass  # Già rimosso
    
    try:
        # Cambia temporaneamente la working directory alla directory del servizio
        os_module.chdir(service_dir_str)
        
        # Rimuovi altre directory di servizi dal sys.path per evitare conflitti
        # e aggiungi SOLO la directory del servizio corrente
        other_service_dirs = [str(services_path / s) for s in ['auth-service', 'user-service', 'preventivi-service', 
                                                               'gradimento-service', 'contratti-service', 'pagamenti-service',
                                                               'assessments-service', 'clienti-service', 'shopify-service', 
                                                               'email-service', 'mcp-service', 'sibill-service', 'productivity-service',
                                                               'calendar-service', 'sales-service'] if s != service_name]
        for other_dir in other_service_dirs:
            if other_dir in sys.path:
                sys.path.remove(other_dir)
        
        # Aggiungi la directory del servizio corrente al PYTHONPATH
        if service_dir_str not in sys.path:
            sys.path.insert(0, service_dir_str)
        
        # Usa un nome unico per il modulo per evitare conflitti
        module_name = f"service_{service_name.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(module_name, service_main_file)
        module = importlib.util.module_from_spec(spec)
        
        # Imposta __file__ e __name__ per permettere import relativi corretti
        module.__file__ = str(service_main_file)
        module.__name__ = module_name
        
        # Esegui il modulo
        spec.loader.exec_module(module)
        
        return module.app
    finally:
        # Ripristina la working directory originale
        os_module.chdir(original_cwd)

# Importa tutte le app
auth_app = load_service_app("auth-service")
user_app = load_service_app("user-service")
preventivi_app = load_service_app("preventivi-service")
gradimento_app = load_service_app("gradimento-service")
contratti_app = load_service_app("contratti-service")
pagamenti_app = load_service_app("pagamenti-service")
assessments_app = load_service_app("assessments-service")
clienti_app = load_service_app("clienti-service")
shopify_app = load_service_app("shopify-service")
email_app = load_service_app("email-service")
mcp_app = load_service_app("mcp-service")
sibill_app = load_service_app("sibill-service")
productivity_app = load_service_app("productivity-service")
sales_app = load_service_app("sales-service")

# Path frontend build
FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend-react" / "dist"
FRONTEND_INDEX = FRONTEND_DIR / "index.html"

@asynccontextmanager
async def unified_lifespan(app: FastAPI):
    """
    Gestisce il ciclo di vita unificato per tutti i microservizi.
    Esegue sia i vecchi handler 'on_event' che i nuovi context manager 'lifespan'.
    """
    # Lista delle app dei servizi
    service_apps = [
        auth_app, user_app, preventivi_app, gradimento_app, 
        contratti_app, pagamenti_app, assessments_app, 
        clienti_app, shopify_app, email_app, mcp_app, sibill_app,
        productivity_app, sales_app
    ]
    
    # 1. Esegui startup legacy (on_event("startup"))
    for service in service_apps:
        # Accedi agli handler di startup privati del router
        # Nota: in versioni recenti di FastAPI on_startup è deprecato ma ancora usato dai servizi legacy
        if hasattr(service.router, 'on_startup'):
            for handler in service.router.on_startup:
                if callable(handler):
                    await handler()
    
    # 2. Gestisci lifespan managers (nuovo stile)
    async with AsyncExitStack() as stack:
        # Connetti al DB condiviso per il gateway
        if database:
            await database.connect()
        
        for service in service_apps:
            # Verifica se l'app ha un lifespan definito
            # Nota: router.lifespan_context è il modo interno di FastAPI per gestire il lifespan
            if hasattr(service.router, 'lifespan_context'):
                await stack.enter_async_context(service.router.lifespan_context(service))
        
        yield
        
        # Disconnetti DB gateway
        if database:
            await database.disconnect()
        
        # 3. Esegui shutdown legacy (on_event("shutdown"))
        for service in service_apps:
            if hasattr(service.router, 'on_shutdown'):
                for handler in service.router.on_shutdown:
                    if callable(handler):
                        await handler()

# App principale con lifespan unificato
app = FastAPI(
    title="Evoluzione Imprese - API Gateway Unificato",
    lifespan=unified_lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Includi i router dei microservizi
# Poiché i microservizi definiscono già i path completi (es. /api/auth/login),
# usiamo include_router senza prefissi aggiuntivi per evitare duplicazioni (es. /api/auth/api/auth/login)
app.include_router(auth_app.router)
app.include_router(user_app.router)
app.include_router(preventivi_app.router)
app.include_router(gradimento_app.router)
app.include_router(contratti_app.router)
app.include_router(pagamenti_app.router)
app.include_router(assessments_app.router)
app.include_router(clienti_app.router)
app.include_router(shopify_app.router)
app.include_router(email_app.router)
app.include_router(mcp_app.router)
app.include_router(sibill_app.router)
app.include_router(productivity_app.router)
app.include_router(sales_app.router)

# Endpoint Ottimizzato Dashboard
@app.get("/api/dashboard/summary")
async def get_dashboard_summary(request: Request, _: str = Depends(verify_token)):
    """
    Restituisce conteggi rapidi per la dashboard interrogando direttamente il DB.
    Ottimizzato per evitare N+1 chiamate ai microservizi.
    """
    if not database:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    try:
        # Esegue query COUNT(*) parallele (il DB engine le gestisce efficientemente)
        assessments_count = await database.fetch_val("SELECT COUNT(*) FROM assessments")
        preventivi_count = await database.fetch_val("SELECT COUNT(*) FROM preventivi")
        contratti_count = await database.fetch_val("SELECT COUNT(*) FROM contratti")
        pagamenti_count = await database.fetch_val("SELECT COUNT(*) FROM pagamenti")
        gradimento_count = await database.fetch_val("SELECT COUNT(*) FROM gradimento_settimanale")
        
        return {
            "assessments": assessments_count or 0,
            "preventivi": preventivi_count or 0,
            "contratti": contratti_count or 0,
            "pagamenti": pagamenti_count or 0,
            "gradimento": gradimento_count or 0
        }
    except Exception as e:
        print(f"Dashboard summary error: {e}")
        raise HTTPException(status_code=500, detail="Error fetching dashboard stats")

# Monta static files se esistono
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "gateway": "running",
        "services": "unified"
    }

# Serve frontend React (deve essere l'ultimo route per catturare tutto il resto)
@app.get("/{path:path}")
async def serve_frontend(path: str, request: Request):
    """Serve il frontend React per tutte le route non-API"""
    # Se è una richiesta API e non è stata catturata dai router sopra, è un 404 API
    if path.startswith("api/") or path == "webhook":
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    # Se è una richiesta per un file statico, prova a servirlo
    if path.startswith("assets/") or "." in path.split("/")[-1]:
        static_file = FRONTEND_DIR / path
        if static_file.exists() and static_file.is_file():
            return FileResponse(static_file)
    
    # Altrimenti serve index.html per routing client-side
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    else:
        raise HTTPException(status_code=404, detail="Frontend not built")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "10000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
