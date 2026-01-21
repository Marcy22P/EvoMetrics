"""
Modulo per chiamate interne tra servizi
Quando tutto è nello stesso processo, chiama direttamente le funzioni invece di HTTP
"""

import os
from typing import Optional, Dict, Any, List
import httpx

# Flag per determinare se siamo in modalità unificata
UNIFIED_MODE = os.environ.get("UNIFIED_MODE", "true").lower() == "true"

# Cache delle funzioni importate
_email_functions: Optional[Dict[str, Any]] = None
_preventivi_functions: Optional[Dict[str, Any]] = None
_contratti_functions: Optional[Dict[str, Any]] = None


def _get_email_functions():
    """Importa le funzioni di email in modo lazy"""
    global _email_functions
    if _email_functions is None:
        try:
            import importlib.util
            from pathlib import Path
            
            services_path = Path(__file__).parent.parent / "services"
            email_service_path = services_path / "email-service" / "email_sender.py"
            
            if email_service_path.exists():
                spec = importlib.util.spec_from_file_location("email_sender", email_service_path)
                email_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(email_module)
                
                _email_functions = {
                    "send_pending_approval_email": email_module.send_pending_approval_email,
                    "send_approval_email": email_module.send_approval_email,
                }
            else:
                print(f"⚠️ email_sender.py non trovato in {email_service_path}")
                _email_functions = {}
        except Exception as e:
            print(f"⚠️ Impossibile importare funzioni email: {e}")
            _email_functions = {}
    return _email_functions

def _get_preventivi_functions():
    """Importa le funzioni di preventivi in modo lazy"""
    global _preventivi_functions
    if _preventivi_functions is None:
        try:
            import importlib.util
            import sys
            from pathlib import Path
            
            services_path = Path(__file__).parent.parent / "services"
            service_dir = services_path / "preventivi-service"
            service_path = service_dir / "crud.py"
            
            if service_path.exists():
                # Salva e rimuovi temporaneamente i moduli conflittuali da sys.modules
                saved_modules = {}
                modules_to_remove = ['database', 'serializers']
                for mod_name in modules_to_remove:
                    if mod_name in sys.modules:
                        # Salva solo se proviene da un altro servizio
                        mod = sys.modules[mod_name]
                        mod_file = getattr(mod, '__file__', None)
                        if mod_file and 'preventivi-service' not in mod_file:
                            saved_modules[mod_name] = sys.modules.pop(mod_name)
                
                try:
                    # Aggiungi la directory del servizio al path per permettere import relativi
                    service_dir_str = str(service_dir)
                    if service_dir_str not in sys.path:
                        sys.path.insert(0, service_dir_str)
                    
                    spec = importlib.util.spec_from_file_location("preventivi_crud", service_path)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    _preventivi_functions = {
                        "get_all_preventivi": module.get_all_preventivi
                    }
                finally:
                    # Ripristina i moduli salvati
                    for mod_name, mod in saved_modules.items():
                        sys.modules[mod_name] = mod
            else:
                _preventivi_functions = {}
        except Exception as e:
            print(f"⚠️ Impossibile importare funzioni preventivi: {e}")
            import traceback
            traceback.print_exc()
            _preventivi_functions = {}
    return _preventivi_functions

def _get_contratti_functions():
    """Importa le funzioni di contratti in modo lazy"""
    global _contratti_functions
    if _contratti_functions is None:
        try:
            import importlib.util
            import sys
            from pathlib import Path
            
            services_path = Path(__file__).parent.parent / "services"
            service_dir = services_path / "contratti-service"
            service_path = service_dir / "crud.py"
            
            if service_path.exists():
                # Salva e rimuovi temporaneamente i moduli conflittuali da sys.modules
                saved_modules = {}
                modules_to_remove = ['database']
                for mod_name in modules_to_remove:
                    if mod_name in sys.modules:
                        # Salva solo se proviene da un altro servizio
                        mod = sys.modules[mod_name]
                        mod_file = getattr(mod, '__file__', None)
                        if mod_file and 'contratti-service' not in mod_file:
                            saved_modules[mod_name] = sys.modules.pop(mod_name)
                
                try:
                    # Aggiungi la directory del servizio al path per permettere import relativi
                    service_dir_str = str(service_dir)
                    if service_dir_str not in sys.path:
                        sys.path.insert(0, service_dir_str)
                    
                    spec = importlib.util.spec_from_file_location("contratti_crud", service_path)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    _contratti_functions = {
                        "get_all_contratti": module.get_all_contratti
                    }
                finally:
                    # Ripristina i moduli salvati
                    for mod_name, mod in saved_modules.items():
                        sys.modules[mod_name] = mod
            else:
                _contratti_functions = {}
        except Exception as e:
            print(f"⚠️ Impossibile importare funzioni contratti: {e}")
            import traceback
            traceback.print_exc()
            _contratti_functions = {}
    return _contratti_functions


async def send_pending_approval_email_internal(
    user_email: str, 
    user_name: str, 
    is_google_user: bool = False
) -> bool:
    """Invia email di pending approval"""
    if UNIFIED_MODE:
        try:
            funcs = _get_email_functions()
            if not funcs:
                print(f"⚠️ Email functions non disponibili - controllare email_sender.py")
                return False
            if "send_pending_approval_email" not in funcs:
                print(f"⚠️ send_pending_approval_email non trovata in email_sender.py")
                return False
            result = await funcs["send_pending_approval_email"](
                user_email=user_email,
                user_name=user_name,
                is_google_user=is_google_user
            )
            success = result.get("status") == "success" if isinstance(result, dict) else True
            if not success:
                print(f"⚠️ Email pending approval fallita: {result}")
            return success
        except Exception as e:
            import traceback
            print(f"⚠️ Errore invio email diretto: {e}")
            traceback.print_exc()
            return False
    else:
        email_service_url = os.environ.get("EMAIL_SERVICE_URL")
        service_token = os.environ.get("SERVICE_TOKEN")
        if not email_service_url or not service_token: return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{email_service_url}/api/email/pending-approval",
                    json={"user_email": user_email, "user_name": user_name, "is_google_user": is_google_user},
                    headers={"X-Service-Token": service_token, "Content-Type": "application/json"}
                )
                return response.status_code == 200
        except Exception as e:
            print(f"⚠️ Errore email HTTP: {e}")
            return False

async def send_approval_email_internal(
    user_email: str,
    user_name: str,
    login_url: Optional[str] = None
) -> bool:
    """Invia email di approvazione"""
    if UNIFIED_MODE:
        try:
            funcs = _get_email_functions()
            if not funcs:
                print(f"⚠️ Email functions non disponibili - controllare email_sender.py")
                return False
            if "send_approval_email" not in funcs:
                print(f"⚠️ send_approval_email non trovata in email_sender.py")
                return False
            result = await funcs["send_approval_email"](
                user_email=user_email,
                user_name=user_name,
                login_url=login_url
            )
            success = result.get("status") == "success" if isinstance(result, dict) else True
            if not success:
                print(f"⚠️ Email approvazione fallita: {result}")
            return success
        except Exception as e:
            import traceback
            print(f"⚠️ Errore invio email diretto: {e}")
            traceback.print_exc()
            return False
    else:
        email_service_url = os.environ.get("EMAIL_SERVICE_URL")
        service_token = os.environ.get("SERVICE_TOKEN")
        if not email_service_url or not service_token: return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{email_service_url}/api/email/approval",
                    json={"user_email": user_email, "user_name": user_name},
                    headers={"X-Service-Token": service_token, "Content-Type": "application/json"}
                )
                return response.status_code == 200
        except Exception as e:
            print(f"⚠️ Errore email HTTP: {e}")
            return False

async def get_preventivi_internal(token: Optional[str] = None) -> List[Dict[str, Any]]:
    """Ottiene tutti i preventivi (internal call o HTTP)"""
    if UNIFIED_MODE:
        try:
            funcs = _get_preventivi_functions()
            if "get_all_preventivi" in funcs:
                return await funcs["get_all_preventivi"]()
        except Exception as e:
            print(f"⚠️ Errore get_preventivi diretto: {e}")
            return []
    
    # Fallback HTTP
    # In unified mode questo non dovrebbe mai essere usato, ma manteniamo per compatibilità
    url = os.environ.get("PREVENTIVI_SERVICE_URL") or os.environ.get("BASE_URL") or os.environ.get("GATEWAY_URL")
    if not url:
        raise ValueError("PREVENTIVI_SERVICE_URL, BASE_URL o GATEWAY_URL deve essere configurato per chiamate HTTP")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{url}/api/preventivi", headers=headers)
            if response.status_code == 200:
                data = response.json()
                return data.get("preventivi", []) if isinstance(data, dict) else data
    except Exception as e:
        print(f"⚠️ Errore get_preventivi HTTP: {e}")
    return []

async def get_contratti_internal(token: Optional[str] = None) -> List[Dict[str, Any]]:
    """Ottiene tutti i contratti (internal call o HTTP)"""
    if UNIFIED_MODE:
        try:
            funcs = _get_contratti_functions()
            if "get_all_contratti" in funcs:
                return await funcs["get_all_contratti"]()
        except Exception as e:
            print(f"⚠️ Errore get_contratti diretto: {e}")
            return []
    
    # Fallback HTTP
    # In unified mode questo non dovrebbe mai essere usato, ma manteniamo per compatibilità
    url = os.environ.get("CONTRATTI_SERVICE_URL") or os.environ.get("BASE_URL") or os.environ.get("GATEWAY_URL")
    if not url:
        raise ValueError("CONTRATTI_SERVICE_URL, BASE_URL o GATEWAY_URL deve essere configurato per chiamate HTTP")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{url}/api/contratti", headers=headers)
            if response.status_code == 200:
                data = response.json()
                return data.get("contratti", []) if isinstance(data, dict) else data
    except Exception as e:
        print(f"⚠️ Errore get_contratti HTTP: {e}")
    return []
