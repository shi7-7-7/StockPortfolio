from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    
    portfolios = relationship("Portfolio", back_populates="owner")

class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    is_public = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="portfolios")
    transactions = relationship("Transaction", back_populates="portfolio")

class Deposit(Base):
    __tablename__ = "deposits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True)
    amount = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, index=True)
    transaction_type = Column(String)
    quantity = Column(Float)
    price = Column(Float, nullable=True)
    transaction_date = Column(DateTime, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"))
    
    portfolio = relationship("Portfolio", back_populates="transactions")