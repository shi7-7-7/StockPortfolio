from fastapi import FastAPI
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from datetime import timedelta
from backend.auth import verify_password, create_access_token
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager
from backend.database import Base, engine, get_db
from backend import schemas
from backend.models import User, Portfolio, Transaction
from backend.auth import get_current_user
import backend.crud as crud
import yfinance as yf




@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

@app.post("/create-user", response_model=schemas.UserCreationResponse)
async def create_user(
    user: schemas.UserCreate,
    db: AsyncSession = Depends(get_db)
):
    db_user = await crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Użytkownik już istnieje")
    
    return await crud.create_user(db=db, user=user)

@app.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    user = await crud.get_user_by_username(db, username=form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowe dane logowania")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}
    
@app.post("/create-portfolio", response_model=schemas.PortfolioResponse)
async def create_portfolio(
    portfolio: schemas.PortfolioCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.create_portfolio(db, portfolio, current_user.id)

@app.post("/add-transaction", response_model=schemas.TransactionResponse)
async def add_transaction(
    transaction: schemas.TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    db_portfolio = await crud.get_portfolio_by_id(db, portfolio_id=transaction.portfolio_id)
    if db_portfolio is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfel o tym ID nie istnieje"
        )
    
    else:
        if db_portfolio.owner_id == current_user.id:
            return await crud.add_transaction(db, transaction)
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Nie masz uprawnień do tego portfela"
            )
        
@app.get("/search")
async def search_ticker(q: str):
    if not q or len(q) < 1:
        return []
    results = yf.Search(q, max_results=5).quotes
    return [
        {
            "symbol": r.get("symbol", ""),
            "name": r.get("shortname") or r.get("longname", ""),
        }
        for r in results
    ]

app.mount("/", StaticFiles(directory="frontend", html=True), name = "frontend")