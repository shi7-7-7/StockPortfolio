from fastapi import FastAPI
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from datetime import timedelta, datetime, date
from backend.auth import verify_password, create_access_token
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager
from backend.database import Base, engine, get_db
from backend import schemas
from backend.models import User
from backend.auth import get_current_user
import backend.crud as crud
import yfinance as yf
import asyncio
from collections import defaultdict


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)


async def compute_summary(transactions) -> schemas.PortfolioSummary:
    if not transactions:
        return schemas.PortfolioSummary(
            transactions=[],
            cost_basis_pln=0, current_value_pln=0,
            unrealized_profit_pln=0, realized_profit_pln=0, total_profit_pln=0
        )

    tickers = list(set(t.ticker for t in transactions))
    prices = {}
    names = {}
    currencies = {}

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
    for ticker, price, name, currency in results:
        prices[ticker] = price
        names[ticker] = name
        currencies[ticker] = currency

    # Current PLN rates for all non-PLN currencies
    unique_currencies = set(c for c in currencies.values() if c and c != "PLN")

    def fetch_current_pln_rate(currency):
        try:
            rate = yf.Ticker(f"{currency}PLN=X").fast_info.last_price
            return currency, rate
        except Exception:
            return currency, None

    fx_results = await asyncio.gather(*[
        asyncio.to_thread(fetch_current_pln_rate, c) for c in unique_currencies
    ])
    current_pln_rates = {c: r for c, r in fx_results if r is not None}
    current_pln_rates["PLN"] = 1.0

    def to_pln_current(amount, currency):
        if not amount or not currency:
            return 0.0
        return amount * current_pln_rates.get(currency, 0.0)

    # Historical PLN rates per (currency, date) for each transaction
    hist_fx_needed = set()
    for t in transactions:
        currency = currencies.get(t.ticker)
        if currency and currency != "PLN" and t.transaction_date:
            hist_fx_needed.add((currency, t.transaction_date.strftime("%Y-%m-%d")))

    def fetch_hist_pln_rate(currency, date_str):
        try:
            start = datetime.strptime(date_str, "%Y-%m-%d")
            end = start + timedelta(days=7)
            hist = yf.Ticker(f"{currency}PLN=X").history(
                start=date_str, end=end.strftime("%Y-%m-%d")
            )
            if not hist.empty:
                return (currency, date_str), float(hist["Close"].iloc[0])
            return (currency, date_str), None
        except Exception:
            return (currency, date_str), None

    hist_fx_results = await asyncio.gather(*[
        asyncio.to_thread(fetch_hist_pln_rate, c, d) for c, d in hist_fx_needed
    ])
    hist_pln_rates = {k: v for k, v in hist_fx_results if v is not None}

    def to_pln_historical(amount, currency, date):
        if not amount or not currency:
            return 0.0
        if currency == "PLN":
            return amount
        if date:
            rate = hist_pln_rates.get((currency, date.strftime("%Y-%m-%d")))
            if rate:
                return amount * rate
        return to_pln_current(amount, currency)

    # Avg buy price per ticker
    buy_cost = defaultdict(float)
    buy_qty = defaultdict(float)
    for t in transactions:
        if t.transaction_type == "buy":
            buy_cost[t.ticker] += (t.price or 0) * t.quantity
            buy_qty[t.ticker] += t.quantity
    avg_buy = {
        ticker: buy_cost[ticker] / buy_qty[ticker]
        for ticker in buy_cost if buy_qty[ticker] > 0
    }

    net_qty: dict[str, float] = defaultdict(float)
    for t in transactions:
        if t.transaction_type == "buy":
            net_qty[t.ticker] += t.quantity
        else:
            net_qty[t.ticker] -= t.quantity

    enriched = []
    money_in = 0.0
    money_out = 0.0
    money_in_pln = 0.0
    money_out_pln = 0.0

    for t in transactions:
        current_price = prices.get(t.ticker)
        currency = currencies.get(t.ticker)

        if t.transaction_type == "buy":
            invested = (t.price or 0) * t.quantity
            value = (current_price or 0) * t.quantity
            profit = round(value - invested, 2) if t.price and current_price else None
            money_in += invested
            money_in_pln += to_pln_historical(invested, currency, t.transaction_date)
        else:
            sell_revenue = (t.price or 0) * t.quantity
            avg = avg_buy.get(t.ticker, 0)
            profit = round(((t.price or 0) - avg) * t.quantity, 2)
            money_out += sell_revenue
            money_out_pln += to_pln_historical(sell_revenue, currency, t.transaction_date)

        enriched.append(schemas.TransactionEnriched(
            id=t.id,
            ticker=t.ticker,
            stock_name=names.get(t.ticker, t.ticker),
            transaction_type=t.transaction_type,
            quantity=t.quantity,
            price=t.price,
            transaction_date=t.transaction_date,
            current_price=current_price if t.transaction_type == "buy" else None,
            profit=profit,
            currency=currency
        ))

    current_value = sum(
        (prices.get(ticker) or 0) * qty
        for ticker, qty in net_qty.items() if qty > 0
    )
    current_value_pln = sum(
        to_pln_current((prices.get(ticker) or 0) * qty, currencies.get(ticker))
        for ticker, qty in net_qty.items() if qty > 0
    )

    # PLN cost per ticker for cost_basis and realized profit
    buy_pln_per_ticker = defaultdict(float)
    for t in transactions:
        if t.transaction_type == "buy":
            pln = to_pln_historical((t.price or 0) * t.quantity, currencies.get(t.ticker), t.transaction_date)
            buy_pln_per_ticker[t.ticker] += pln

    avg_buy_pln = {
        ticker: buy_pln_per_ticker[ticker] / buy_qty[ticker]
        for ticker in buy_qty if buy_qty[ticker] > 0
    }

    cost_basis_pln = sum(
        avg_buy_pln.get(ticker, 0) * qty
        for ticker, qty in net_qty.items() if qty > 0
    )

    unrealized_profit_pln = current_value_pln - cost_basis_pln

    realized_profit_pln = sum(
        to_pln_historical((t.price or 0) * t.quantity, currencies.get(t.ticker), t.transaction_date)
        - avg_buy_pln.get(t.ticker, 0) * t.quantity
        for t in transactions if t.transaction_type == "sell"
    )

    total_profit_pln = unrealized_profit_pln + realized_profit_pln

    return schemas.PortfolioSummary(
        transactions=enriched,
        cost_basis_pln=round(cost_basis_pln, 2),
        current_value_pln=round(current_value_pln, 2),
        unrealized_profit_pln=round(unrealized_profit_pln, 2),
        realized_profit_pln=round(realized_profit_pln, 2),
        total_profit_pln=round(total_profit_pln, 2)
    )


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

    if transaction.price is None:
        date_str = transaction.transaction_date.strftime("%Y-%m-%d")
        end_str = (transaction.transaction_date + timedelta(days=5)).strftime("%Y-%m-%d")
        def fetch_hist_price():
            try:
                hist = yf.Ticker(transaction.ticker).history(
                    start=date_str, end=end_str, auto_adjust=True
                )
                if not hist.empty:
                    return float(hist["Close"].iloc[0])
                return None
            except Exception:
                return None
        auto_price = await asyncio.to_thread(fetch_hist_price)
        if auto_price is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail="Nie udało się pobrać ceny dla tej daty, podaj cenę ręcznie")
        transaction = transaction.model_copy(update={"price": round(auto_price, 4)})

    return await crud.add_transaction(db, transaction)

@app.get("/portfolios", response_model=list[schemas.PortfolioListResponse])
async def get_portfolios(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_portfolios_by_user(db, current_user.id)

@app.get("/users", response_model=list[schemas.UserListResponse])
async def get_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_all_users(db)

@app.get("/users/{user_id}/portfolios", response_model=list[schemas.PortfolioListResponse])
async def get_user_public_portfolios(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await crud.get_public_portfolios_by_user(db, user_id)

@app.get("/portfolios/{portfolio_id}/summary", response_model=schemas.PortfolioSummary)
async def get_portfolio_summary(
    portfolio_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    db_portfolio = await crud.get_portfolio_by_id(db, portfolio_id=portfolio_id)
    if db_portfolio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfel nie istnieje")
    if db_portfolio.owner_id != current_user.id and not db_portfolio.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie masz uprawnień do tego portfela")
    transactions = await crud.get_transactions_by_portfolio(db, portfolio_id)
    return await compute_summary(transactions)

@app.get("/summary", response_model=schemas.PortfolioSummary)
async def get_all_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    transactions = await crud.get_transactions_by_user(db, current_user.id)
    return await compute_summary(transactions)

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

@app.get("/portfolios-comparison", response_model=list[schemas.PortfolioSeries])
async def get_portfolios_comparison(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    portfolios = await crud.get_portfolios_by_user(db, current_user.id)
    transactions = await crud.get_transactions_by_user(db, current_user.id)
    transactions = [t for t in transactions if t.transaction_date]

    if not portfolios or not transactions:
        return []

    start_date = date.today() - timedelta(days=365)
    end_fetch = date.today() + timedelta(days=1)

    tickers = list(set(t.ticker for t in transactions))

    def fetch_ticker_history(ticker):
        try:
            obj = yf.Ticker(ticker)
            hist = obj.history(start=str(start_date), end=str(end_fetch), auto_adjust=True)
            currency = obj.fast_info.currency
            prices = {idx.date(): float(row["Close"]) for idx, row in hist.iterrows()}
            return ticker, prices, currency
        except Exception:
            return ticker, {}, None

    ticker_results = await asyncio.gather(*[
        asyncio.to_thread(fetch_ticker_history, t) for t in tickers
    ])

    ticker_prices = {}
    currencies = {}
    for ticker, prices, currency in ticker_results:
        ticker_prices[ticker] = prices
        currencies[ticker] = currency

    unique_currencies = set(c for c in currencies.values() if c and c != "PLN")

    def fetch_fx_history(currency):
        try:
            hist = yf.Ticker(f"{currency}PLN=X").history(start=str(start_date), end=str(end_fetch))
            return currency, {idx.date(): float(row["Close"]) for idx, row in hist.iterrows()}
        except Exception:
            return currency, {}

    fx_results = await asyncio.gather(*[
        asyncio.to_thread(fetch_fx_history, c) for c in unique_currencies
    ])
    fx_rates = {c: rates for c, rates in fx_results}

    def get_fx(currency, d):
        if not currency or currency == "PLN":
            return 1.0
        rate_map = fx_rates.get(currency, {})
        prev = [dd for dd in sorted(rate_map.keys()) if dd <= d]
        return rate_map[prev[-1]] if prev else 1.0

    def get_price(ticker, d):
        price_map = ticker_prices.get(ticker, {})
        if d in price_map:
            return price_map[d]
        prev = [dd for dd in sorted(price_map.keys()) if dd <= d]
        return price_map[prev[-1]] if prev else None

    all_dates = sorted(set(
        d for prices in ticker_prices.values() for d in prices.keys()
    ))

    series = []
    for portfolio in portfolios:
        portfolio_txs = sorted(
            [t for t in transactions if t.portfolio_id == portfolio.id],
            key=lambda t: t.transaction_date
        )
        if not portfolio_txs:
            continue

        # zaczynamy serię od pierwszej transakcji, żeby nie było płaskiej
        # linii zerowej (i pionowego skoku) przed pierwszym zakupem
        first_tx_date = portfolio_txs[0].transaction_date.date()

        data = []
        for d in all_dates:
            if d < first_tx_date:
                continue

            holdings = defaultdict(float)
            for t in portfolio_txs:
                if t.transaction_date.date() > d:
                    break
                if t.transaction_type == "buy":
                    holdings[t.ticker] += t.quantity
                else:
                    holdings[t.ticker] -= t.quantity

            total = 0.0
            for ticker, qty in holdings.items():
                if qty <= 0:
                    continue
                price = get_price(ticker, d)
                if price is None:
                    continue
                total += qty * price * get_fx(currencies.get(ticker), d)

            data.append(schemas.HistoryPoint(time=str(d), value=round(total, 2)))

        series.append(schemas.PortfolioSeries(
            portfolio_id=portfolio.id,
            name=portfolio.name,
            data=data
        ))

    return series


@app.get("/ticker-currency")
async def get_ticker_currency(symbol: str):
    def fetch():
        try:
            return yf.Ticker(symbol).fast_info.currency
        except Exception:
            return None
    currency = await asyncio.to_thread(fetch)
    return {"currency": currency}

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
