"""
Pydantic models per User Service
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    pending_approval: bool = False
    rejection_reason: Optional[str] = None
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    google_email: Optional[str] = None
    google_id: Optional[str] = None
    profile_completed: bool = False
    created_at: str
    updated_at: str


class UserPermissions(BaseModel):
    user_id: int
    permissions: Dict[str, bool] = Field(default_factory=dict)
    role: str
    has_all_access: bool = False


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    pending_approval: Optional[bool] = None
    rejection_reason: Optional[str] = None
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    google_email: Optional[str] = None
    google_id: Optional[str] = None
    profile_completed: Optional[bool] = None


class UpdatePermissionsRequest(BaseModel):
    permissions: Dict[str, bool]


class CreateUserRequest(BaseModel):
    username: str
    password: Optional[str] = None  # Opzionale: se None, utente può accedere solo con Google OAuth
    role: str = "user"

