from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class TransactionBase(BaseModel):
    ticker: str
    transaction_type: str
    quantity: float
    price: Optional[float] = None
    transaction_date: Optional[datetime] = None

class TransactionCreate(TransactionBase):
    portfolio_id: int
    transaction_date: datetime

class TransactionResponse(TransactionBase):
    id: int
    timestamp: Optional[datetime] = None
    portfolio_id: int

    model_config = ConfigDict(from_attributes=True)

class TransactionEnriched(BaseModel):
    id: int
    ticker: str
    stock_name: str
    transaction_type: str
    quantity: float
    price: Optional[float] = None
    transaction_date: Optional[datetime] = None
    current_price: Optional[float] = None
    profit: Optional[float] = None
    currency: Optional[str] = None

class PortfolioSummary(BaseModel):
    transactions: List[TransactionEnriched]
    cost_basis_pln: float
    current_value_pln: float
    unrealized_profit_pln: float
    realized_profit_pln: float
    total_profit_pln: float

class PortfolioBase(BaseModel):
    name: str
    is_public: bool = False

class PortfolioCreate(PortfolioBase):
    pass

class PortfolioCreationResponse(BaseModel):
    id: int
    name: str
    is_public: bool
    owner_id: int

    model_config = ConfigDict(from_attributes=True)

class PortfolioListResponse(BaseModel):
    id: int
    name: str
    is_public: bool
    owner_id: int

    model_config = ConfigDict(from_attributes=True)

class UserCreate(BaseModel):
    username: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class UserCreationResponse(BaseModel):
    id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class UserListResponse(BaseModel):
    id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class HistoryPoint(BaseModel):
    time: str
    value: float

class PortfolioSeries(BaseModel):
    portfolio_id: int
    name: str
    data: List[HistoryPoint]
