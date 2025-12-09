"""
Email Sender - Gestione invio email con Resend
"""

import os
from typing import List, Optional
import resend
from pathlib import Path

# Carica variabili d'ambiente
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

# Configurazione Resend
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL")
if not RESEND_FROM_EMAIL:
    raise ValueError("RESEND_FROM_EMAIL environment variable is required")

RESEND_FROM_NAME = os.environ.get("RESEND_FROM_NAME")
if not RESEND_FROM_NAME:
    raise ValueError("RESEND_FROM_NAME environment variable is required")

if not RESEND_API_KEY:
    print("⚠️ WARNING: RESEND_API_KEY not set. Email sending will fail.")
else:
    # Configura Resend API key
    resend.api_key = RESEND_API_KEY


def generate_pending_approval_email_html(user_email: str, nome_completo: str, is_google_user: bool = False) -> str:
    """Genera HTML per email di attesa approvazione"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Registrazione Completata</h1>
            </div>
            <div class="content">
                <p>Ciao <strong>{nome_completo}</strong>,</p>
                <p>La tua richiesta di registrazione è stata ricevuta con successo.</p>
                <p>Il tuo account è attualmente in attesa di approvazione da parte di un amministratore.</p>
                <p>Riceverai un'email non appena il tuo account sarà stato approvato e potrai accedere alla piattaforma.</p>
                <p>Grazie per la tua pazienza.</p>
                <p>Saluti,<br>Il Team di Evoluzione Imprese</p>
            </div>
            <div class="footer">
                <p>Evoluzione Imprese - Sistema di Gestione Preventivi</p>
            </div>
        </div>
    </body>
    </html>
    """


def generate_approval_email_html(user_email: str, user_name: str, login_url: Optional[str] = None) -> str:
    """Genera HTML per email di approvazione account"""
    if not login_url:
        # Usa FRONTEND_URL dall'env invece di URL hardcoded
        frontend_url = os.environ.get("FRONTEND_URL")
        if not frontend_url:
            raise ValueError("FRONTEND_URL environment variable is required")
        login_url = f"{frontend_url}/login"
    login_button = f'<p><a href="{login_url}" class="button">Accedi alla Piattaforma</a></p>'
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
            .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            .button {{ display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Account Approvato!</h1>
            </div>
            <div class="content">
                <p>Ciao <strong>{user_name}</strong>,</p>
                <p>Ottime notizie! Il tuo account è stato approvato e ora puoi accedere alla piattaforma.</p>
                {login_button}
                <p>Se hai domande o hai bisogno di assistenza, non esitare a contattarci.</p>
                <p>Benvenuto in Evoluzione Imprese!</p>
                <p>Saluti,<br>Il Team di Evoluzione Imprese</p>
            </div>
            <div class="footer">
                <p>Evoluzione Imprese - Sistema di Gestione Preventivi</p>
            </div>
        </div>
    </body>
    </html>
    """


async def send_email(
    to: str | List[str],
    subject: str,
    html: str,
    text: Optional[str] = None,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
    reply_to: Optional[str] = None,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
) -> dict:
    """
    Invia email tramite Resend
    
    Returns:
        dict: Risposta da Resend con status e email_id
    """
    if not RESEND_API_KEY:
        raise ValueError("RESEND_API_KEY not configured")
    
    # Normalizza destinatari
    if isinstance(to, str):
        to = [to]
    
    # Usa valori di default se non specificati
    from_email = from_email or RESEND_FROM_EMAIL
    from_name = from_name or RESEND_FROM_NAME
    
    # Prepara parametri
    params = {
        "from": f"{from_name} <{from_email}>",
        "to": to,
        "subject": subject,
        "html": html,
    }
    
    if text:
        params["text"] = text
    
    if reply_to:
        params["reply_to"] = reply_to
    
    if cc:
        params["cc"] = cc
    
    if bcc:
        params["bcc"] = bcc
    
    try:
        email = resend.emails.send(params)
        return {
            "status": "success",
            "email_id": email.get("id"),
            "message": "Email inviata con successo"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Errore invio email: {str(e)}"
        }


async def send_pending_approval_email(user_email: str, user_name: str, is_google_user: bool = False) -> dict:
    """Invia email di attesa approvazione"""
    html = generate_pending_approval_email_html(user_email, user_name, is_google_user)
    return await send_email(
        to=user_email,
        subject="Registrazione Completata - Attesa Approvazione",
        html=html
    )


async def send_approval_email(user_email: str, user_name: str, login_url: Optional[str] = None) -> dict:
    """Invia email di approvazione account"""
    html = generate_approval_email_html(user_email, user_name, login_url)
    return await send_email(
        to=user_email,
        subject="Account Approvato - Benvenuto in Evoluzione Imprese",
        html=html
    )

