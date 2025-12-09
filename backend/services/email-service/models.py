"""
Email Service - Modelli Pydantic
"""

from pydantic import BaseModel, EmailStr
from typing import Optional, List


class SendEmailRequest(BaseModel):
    """Richiesta per invio email generico"""
    to: EmailStr | List[EmailStr]
    subject: str
    html: str
    text: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[EmailStr] = None
    cc: Optional[List[EmailStr]] = None
    bcc: Optional[List[EmailStr]] = None


class SendEmailResponse(BaseModel):
    """Risposta invio email"""
    status: str
    message: str
    email_id: Optional[str] = None


class PendingApprovalEmailRequest(BaseModel):
    """Richiesta per email di attesa approvazione"""
    user_email: EmailStr
    user_name: str
    is_google_user: bool = False


class ApprovalEmailRequest(BaseModel):
    """Richiesta per email di approvazione account"""
    user_email: EmailStr
    user_name: str
    login_url: Optional[str] = None

