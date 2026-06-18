from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend import models, schemas
from backend.security import hash_password

async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(select(models.User).filter(models.User.username == username))
    return result.scalars().first()

async def create_user(db: AsyncSession, user: schemas.UserCreate):
    hashed = hash_password(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def create_portfolio(db: AsyncSession, portfolio: schemas.PortfolioCreate, user_id: int):
    db_portfolio = models.Portfolio(**portfolio.model_dump(), owner_id=user_id)
    db.add(db_portfolio)
    await db.commit()
    await db.refresh(db_portfolio)
    return db_portfolio

async def get_portfolio_by_id(db: AsyncSession, portfolio_id: int):
    result = await db.execute(select(models.Portfolio).filter(models.Portfolio.id == portfolio_id))
    return result.scalars().first()

async def add_transaction(db: AsyncSession, transaction: schemas.TransactionCreate):
    db_transaction = models.Transaction(**transaction.model_dump())
    db.add(db_transaction)
    await db.commit()
    await db.refresh(db_transaction)
    return db_transaction