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
import asyncio


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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Użytkownik już istnieje")
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

@app.get("/me", response_model=schemas.UserCreationResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/create-portfolio", response_model=schemas.PortfolioCreationResponse)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfel o tym ID nie istnieje")
    if db_portfolio.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie masz uprawnień do tego portfela")
    return await crud.add_transaction(db, transaction)

@app.get("/portfolios", response_model=list[schemas.PortfolioListResponse])
async def get_portfolios(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_portfolios_by_user(db, current_user.id)

@app.get("/transactions", response_model=list[schemas.TransactionResponse])
async def get_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_transactions_by_user(db, current_user.id)

@app.get("/users", response_model=list[schemas.UserListResponse])
async def get_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_all_users(db)

@app.get("/portfolios/{portfolio_id}/summary", response_model=schemas.PortfolioSummary)
async def get_portfolio_summary(
    portfolio_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    db_portfolio = await crud.get_portfolio_by_id(db, portfolio_id=portfolio_id)
    if db_portfolio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfel nie istnieje")
    if db_portfolio.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie masz uprawnień do tego portfela")

    transactions = await crud.get_transactions_by_portfolio(db, portfolio_id)

    tickers = list(set(t.ticker for t in transactions))
    prices = {}
    names = {}

    def fetch_ticker_data(ticker):
        try:
            t = yf.Ticker(ticker)
            fast = t.fast_info
            price = fast.last_price
            currency = fast.currency
            name = t.info.get("shortName", ticker)
            return ticker, price, name, currency
        except Exception:
            return ticker, None, ticker, None

    results = await asyncio.gather(*[
        asyncio.to_thread(fetch_ticker_data, t) for t in tickers
    ])
    currencies = {}
    for ticker, price, name, currency in results:
        prices[ticker] = price
        names[ticker] = name
        currencies[ticker] = currency

    enriched = []
    total_invested = 0.0
    current_value = 0.0

    for t in transactions:
        current_price = prices.get(t.ticker)
        invested = (t.price or 0) * t.quantity if t.transaction_type == "buy" else 0
        value = (current_price or 0) * t.quantity if t.transaction_type == "buy" else 0
        profit = (value - invested) if t.transaction_type == "buy" and t.price else None

        total_invested += invested
        current_value += value

        enriched.append(schemas.TransactionEnriched(
            id=t.id,
            ticker=t.ticker,
            stock_name=names.get(t.ticker, t.ticker),
            transaction_type=t.transaction_type,
            quantity=t.quantity,
            price=t.price,
            transaction_date=t.transaction_date,
            current_price=current_price,
            profit=round(profit, 2) if profit is not None else None,
            currency=currencies.get(t.ticker)
        ))

    return schemas.PortfolioSummary(
        transactions=enriched,
        total_invested=round(total_invested, 2),
        current_value=round(current_value, 2),
        total_profit=round(current_value - total_invested, 2)
    )

@app.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    transaction = await crud.get_transaction_by_id(db, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transakcja nie istnieje")
    db_portfolio = await crud.get_portfolio_by_id(db, transaction.portfolio_id)
    if db_portfolio.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie masz uprawnień")
    await crud.delete_transaction(db, transaction_id)
    return {"detail": "Transakcja usunięta"}

@app.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(
    portfolio_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    db_portfolio = await crud.get_portfolio_by_id(db, portfolio_id=portfolio_id)
    if db_portfolio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfel nie istnieje")
    if db_portfolio.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie masz uprawnień do tego portfela")
    await crud.delete_portfolio(db, portfolio_id)
    return {"detail": "Portfel usunięty"}

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

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
