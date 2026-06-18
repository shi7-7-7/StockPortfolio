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
    total_invested: float
    current_value: float
    total_profit: float

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

class PortfolioResponse(PortfolioBase):
    id: int
    owner_id: int
    transactions: List[TransactionResponse] = []

    model_config = ConfigDict(from_attributes=True)

class UserCreate(BaseModel):
    username: str
    password: str

class UserCreationResponse(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)

class UserListResponse(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)

class UserResponse(BaseModel):
    id: int
    username: str
    portfolios: List[PortfolioResponse] = []

    model_config = ConfigDict(from_attributes=True)
