from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid

# --- SQLAlchemy Models ---

class ChatSession(Base):
    __tablename__ = "mcp_chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=True) # Opzionale se user non loggato
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "mcp_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("mcp_chat_sessions.id"))
    role = Column(String) # 'user', 'assistant', 'system'
    content = Column(Text)
    is_preventivo = Column(Boolean, default=False)
    preventivo_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")

class AgentConversation(Base):
    """Storico conversazioni con EvoAgent (per memoria persistente tra sessioni)."""
    __tablename__ = "agent_conversations"

    id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(50), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    channel = Column(String(20), default="evometrics")  # 'evometrics' | 'slack'
    messages = Column(JSON, default=list)  # [{"role": "user"|"assistant", "content": "..."}]
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Assessment(Base):
    __tablename__ = "assessment"

    id = Column(String, primary_key=True)
    data = Column(JSON) # O Text se salvato come stringa JSON, ma SQLAlchemy gestisce JSON
    status = Column(String)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))
    source = Column(String)
    client_info = Column(JSON) # Idem
    notes = Column(Text)


# --- Pydantic Models ---

class ChatSessionCreate(BaseModel):
    user_id: Optional[int] = None
    title: Optional[str] = "Nuova Chat"

class ChatMessageCreate(BaseModel):
    role: str
    content: str
    is_preventivo: bool = False
    preventivo_data: Optional[Dict[str, Any]] = None



