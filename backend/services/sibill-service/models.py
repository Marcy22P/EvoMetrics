from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Pydantic Models (API Request/Response) ---

class SyncRequest(BaseModel):
    force: bool = False

class SibillAccountData(BaseModel):
    sibill_id: str
    name: str
    iban: Optional[str] = None
    balance: float
    currency: str = "EUR"
    last_sync: datetime

class SibillTransactionData(BaseModel):
    sibill_id: str
    account_id: str # Reference to our DB Account ID (or Sibill ID if easier)
    date: datetime
    amount: float
    description: str
    category: Optional[str] = None
    direction: str # "in" or "out"

class SibillInvoiceData(BaseModel):
    sibill_id: str
    number: str
    date: datetime
    due_date: Optional[datetime] = None
    amount_net: float
    amount_vat: float
    amount_gross: float
    type: str # "active" (sales) or "passive" (purchases)
    status: str # "paid", "unpaid", "overdue"
    customer_name: Optional[str] = None

class ContoSummaryResponse(BaseModel):
    total_balance: float
    monthly_in: float
    monthly_out: float
    iva_credit: float
    iva_debit: float
    last_sync: Optional[datetime] = None

class SibillTransactionResponse(BaseModel):
    id: str
    account_id: str
    date: str  # ISO format string
    amount: float
    description: Optional[str] = None
    category: Optional[str] = None
    direction: str  # "in" or "out"
    account_name: Optional[str] = None

class MatchDetail(BaseModel):
    id: str
    cliente: str
    importo: float
    data_scadenza: Optional[str]
    status: str
    confidence: str  # "high", "medium", "low"

class ReconciliationItem(BaseModel):
    transaction: SibillTransactionResponse
    match_status: str  # "matched", "potential", "unmatched"
    match_detail: Optional[MatchDetail] = None

class ExpenseCategory(BaseModel):
    key: str
    label: str
    deductibility: str
    type: str
    description: str

class ExpenseItem(BaseModel):
    transaction: SibillTransactionResponse
    category: ExpenseCategory
    is_ai_categorized: bool = False
    ai_confidence: float = 0.0
    ai_reasoning: Optional[str] = None
