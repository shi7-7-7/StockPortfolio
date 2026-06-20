# Dokumentacja techniczna: StockPortfolio

Dokument opisuje architekturę rozwiązania, strukturę bazy danych oraz najważniejsze
zaimplementowane funkcjonalności. Instrukcja uruchomienia znajduje się w pliku `README.md`.

## Spis treści

* [Architektura](#architektura)
* [Struktura bazy danych](#struktura-bazy-danych)
* [Struktury liczone w locie](#struktury-liczone-w-locie)
* [Najważniejsze funkcjonalności](#najważniejsze-funkcjonalności)
* [Logika wyceny w PLN](#logika-wyceny-w-pln)
* [Endpointy API](#endpointy-api)
* [Bezpieczeństwo](#bezpieczeństwo)

## Architektura

Aplikacja składa się z trzech części uruchamianych razem przez Docker Compose.

```mermaid
flowchart TD
    subgraph Klient
        FE["Frontend SPA<br/>index.html + script.js + style.css<br/>Lightweight Charts, Chart.js"]
    end

    subgraph Serwer["Kontener web: FastAPI (uvicorn)"]
        API["main.py<br/>endpointy, walidacja"]
        CRUD["crud.py<br/>operacje na bazie"]
        ORM["models.py<br/>modele ORM"]
        SCH["schemas.py<br/>modele Pydantic"]
        AUTH["auth.py + security.py<br/>JWT, bcrypt"]
    end

    DB[("Kontener db<br/>PostgreSQL 15")]
    YF["Yahoo Finance<br/>(yfinance)"]

    FE -- "HTTP / JSON + JWT" --> API
    API --> CRUD --> ORM --> DB
    API --> SCH
    API --> AUTH
    API -- "asyncio.to_thread" --> YF
```

Backend jest podzielony na warstwy:

* `main.py` definicje endpointów (routing, walidacja, logika wyceny `compute_summary`).
* `crud.py` operacje na bazie (zapytania SQLAlchemy).
* `models.py` modele ORM odpowiadające tabelom.
* `schemas.py` modele Pydantic (walidacja wejścia, kształt odpowiedzi).
* `auth.py` tworzenie i weryfikacja tokenów JWT, zależność `get_current_user`.
* `security.py` hashowanie i weryfikacja haseł (bcrypt).
* `database.py` asynchroniczny silnik bazy i sesje.

Baza obsługiwana jest przez `asyncpg` i `SQLAlchemy AsyncSession`.

Frontend to aplikacja (SPA) w czystym JavaScript. Wszystkie widoki istnieją
w jednym pliku `index.html` jako sekcje przełączane klasą `.hidden`, bez przeładowania strony.
Aplikacja i API działają pod tym samym adresem.

Tabele tworzone są automatycznie przy starcie aplikacji w funkcji `lifespan`.

## Struktura bazy danych

W bazie PostgreSQL trzymamy tylko dane należące do użytkownika: konta, portfele i transakcje.
Ceny i historia notowań liczone są w locie z yfinance.

```mermaid
erDiagram
    USERS ||--o{ PORTFOLIOS : "posiada"
    PORTFOLIOS ||--o{ TRANSACTIONS : "zawiera"

    USERS {
        int id PK
        string username "unikalny"
        string hashed_password "hash bcrypt"
        string first_name "nullable"
        string last_name "nullable"
    }

    PORTFOLIOS {
        int id PK
        string name
        bool is_public
        int owner_id FK "users.id"
    }

    TRANSACTIONS {
        int id PK
        string ticker
        string transaction_type "buy / sell"
        float quantity
        float price "nullable"
        datetime transaction_date
        datetime timestamp
        int portfolio_id FK "portfolios.id"
    }
```

Relacje:

* Jeden użytkownik ma wiele portfeli (`users.id` to `portfolios.owner_id`).
* Jeden portfel ma wiele transakcji (`portfolios.id` to `transactions.portfolio_id`).

## Inne dane

Obiekty Pydantic budowane w pamięci na podstawie transakcji
z bazy oraz danych z yfinance, zwracane jako JSON.

```mermaid
classDiagram
    class TransactionEnriched {
        +int id
        +string ticker
        +string stock_name
        +string transaction_type
        +float quantity
        +float price
        +datetime transaction_date
        +float current_price
        +float profit
        +string currency
    }

    class PortfolioSummary {
        +float cost_basis_pln
        +float current_value_pln
        +float unrealized_profit_pln
        +float realized_profit_pln
        +float total_profit_pln
        +List~TransactionEnriched~ transactions
    }

    class HistoryPoint {
        +string time
        +float value
    }

    class PortfolioSeries {
        +int portfolio_id
        +string name
        +List~HistoryPoint~ data
    }

    PortfolioSummary o-- TransactionEnriched : zawiera
    PortfolioSeries o-- HistoryPoint : zawiera
```

* `TransactionEnriched` transakcja z bieżącą ceną/zyskiem i do tego waluta.
* `PortfolioSummary` podsumowanie portfela w PLN.
* `HistoryPoint` Pierwotna wartość/punkt odniesienia portfela w PLN.

## Endpointy API

Oznaczenie (auth) znaczy, że endpoint wymaga nagłówka `Authorization: Bearer <token>`.

## Bezpieczeństwo

* Hasła nigdy nie są przechowywane jawnie, tylko jako hash bcrypt.
* Dostęp do chronionych endpointów wymaga ważnego tokenu JWT (HS256, ważny 30 minut).
* Operacje na zasobach sprawdzają właściciela (np. nie można usunąć cudzego portfela).
* Publiczne portfele są dostępne do podglądu, prywatne tylko dla właściciela.
