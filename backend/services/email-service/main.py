"""
Email Service - Microservizio dedicato per gestione email
Usa Resend per l'invio email
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import os
from pathlib import Path
from jose import JWTError, jwt
from contextlib import asynccontextmanager

from models import (
    SendEmailRequest,
    SendEmailResponse,
    PendingApprovalEmailRequest,
    ApprovalEmailRequest
)
from email_sender import (
    send_email,
    send_pending_approval_email,
    send_approval_email
)

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

# JWT Configuration (per autenticazione chiamate da altri servizi)
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"

# Verifica Resend API Key
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
if not RESEND_API_KEY:
    print("⚠️ WARNING: RESEND_API_KEY not set. Email service will not work.")

app = FastAPI(title="Email Service", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione specificare domini
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_service_token(request: Request) -> Dict[str, Any]:
    """
    Verifica che la richiesta provenga da un servizio autorizzato
    Accetta token JWT o header X-Service-Token (per chiamate interne)
    """
    # Permetti chiamate interne da altri servizi Render (stessa rete privata)
    service_token = request.headers.get("X-Service-Token")
    expected_token = os.environ.get("SERVICE_TOKEN")
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SERVICE_TOKEN not configured"
        )
    if service_token == expected_token:
        return {"service": "internal"}
    
    # Altrimenti verifica JWT standard
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )
    
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events"""
    print("🚀 Email Service starting...")
    if not RESEND_API_KEY:
        print("⚠️ WARNING: RESEND_API_KEY not configured. Email sending will fail.")
    else:
        print("✅ Resend API Key configured")
    yield
    print("🛑 Email Service shutting down...")


app.router.lifespan_context = lifespan


# =========================
# HEALTH CHECK
# =========================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "email-service",
        "resend_configured": bool(RESEND_API_KEY)
    }


# =========================
# EMAIL ENDPOINTS
# =========================

@app.post("/api/email/send", response_model=SendEmailResponse)
async def send_email_endpoint(
    request: SendEmailRequest,
    _: Dict[str, Any] = Depends(verify_service_token)
):
    """
    Endpoint generico per invio email
    Richiede autenticazione (token JWT o X-Service-Token)
    """
    try:
        result = await send_email(
            to=request.to,
            subject=request.subject,
            html=request.html,
            text=request.text,
            from_email=request.from_email,
            from_name=request.from_name,
            reply_to=request.reply_to,
            cc=request.cc,
            bcc=request.bcc
        )
        
        if result["status"] == "success":
            return SendEmailResponse(
                status="success",
                message=result["message"],
                email_id=result.get("email_id")
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result["message"]
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore invio email: {str(e)}"
        )


@app.post("/api/email/pending-approval", response_model=SendEmailResponse)
async def send_pending_approval_email_endpoint(
    request: PendingApprovalEmailRequest,
    _: Dict[str, Any] = Depends(verify_service_token)
):
    """
    Invia email di attesa approvazione account
    Richiede autenticazione (token JWT o X-Service-Token)
    """
    try:
        result = await send_pending_approval_email(
            user_email=request.user_email,
            user_name=request.user_name,
            is_google_user=request.is_google_user
        )
        
        if result["status"] == "success":
            return SendEmailResponse(
                status="success",
                message=result["message"],
                email_id=result.get("email_id")
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result["message"]
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore invio email: {str(e)}"
        )


@app.post("/api/email/approval", response_model=SendEmailResponse)
async def send_approval_email_endpoint(
    request: ApprovalEmailRequest,
    _: Dict[str, Any] = Depends(verify_service_token)
):
    """
    Invia email di approvazione account
    Richiede autenticazione (token JWT o X-Service-Token)
    """
    try:
        result = await send_approval_email(
            user_email=request.user_email,
            user_name=request.user_name,
            login_url=request.login_url
        )
        
        if result["status"] == "success":
            return SendEmailResponse(
                status="success",
                message=result["message"],
                email_id=result.get("email_id")
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result["message"]
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore invio email: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=port)

