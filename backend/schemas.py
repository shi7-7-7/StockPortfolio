from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class TransactionBase(BaseModel):
    ticker: str
    transaction_type: str
    quantity: float
    price: float
    transaction_date: datetime

class TransactionCreate(TransactionBase):
    portfolio_id: int

class TransactionResponse(TransactionBase):
    id: int
    timestamp: datetime
    portfolio_id: int

    model_config = ConfigDict(from_attributes=True)

class PortfolioBase(BaseModel):
    name: str
    is_public: bool = False

class PortfolioCreate(PortfolioBase):
    pass

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
class UserResponse(BaseModel):
    id: int
    username: str
    portfolios: List[PortfolioResponse] = []

    model_config = ConfigDict(from_attributes=True)

