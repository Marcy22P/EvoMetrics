"""
Pydantic models per Auth Service
"""

from pydantic import BaseModel
from typing import Optional

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: str
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    profile_completed: Optional[bool] = False

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
    createdAt: str
    updatedAt: str
    source: str


class PublicUserRegistration(BaseModel):
    """Modello per registrazione pubblica (senza autenticazione)"""
    username: str
    password: str
    email: str
    nome: str
    cognome: str

