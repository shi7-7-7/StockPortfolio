# StockPortfolio

Strona pozwala na zbudowanie i śledzienie wartości swoich portfeli akcji/innych aktywów. Umożliwia stworzenie konta, kilku portfeli, pogląd publicznych portfeli i prostą analitykę.

Dane rynkowe pobierane są z `yfinance`. W bazie danych trzymamy tylko to, co należy do użytkownika: konta/portfele/transakcje. 

## Spis treści

* [Funkcjonalności](#funkcjonalności)
* [Architektura](#architektura)
* [Jak działa frontend (SPA)](#frontend-spa)
* [Komunikacja](#komunikacja)
* [Technologie](#technologie)
* [Struktura projektu](#struktura-projektu)
* [Model danych](#model-danych)
* [Endpointy API](#endpointy-api)
* [Kwoty w PLN](#kwoty-w-pln)
* [Jak uruchomić](#jak-uruchomić)

## Funkcjonalności

* Rejestracja (login, hasło, imię, nazwisko), logowanie z tokenem JWT.
* Tworzenie wielu portfeli, prywatnych lub publicznych. 
* Dodawanie transakcji buy, możliwość podania ceny lub pobrania adjusted close z wybranej daty. Późniejsza sprzedaż pozycji.
* Kilka transakcji przy tej samej spółce, kwoty się uśredniają.
* Wyszukiwanie spółek po nazwie lub tickerze i podgląd waluty, w której notowana jest spółka.
* Podsumowanie portfela w PLN: zainwestowane, niezrealizowane, zrealizowane oraz łączny zysk lub strata.
* Wykres liniowy (Lightweight Charts), podsumowania oraz porównanie do kwoty zainwestowanej.
* Lista użytkowników i podgląd publicznych portfeli innych osób.

## Architektura

Aplikacja składa się z trzech części, które uruchamiamy przez Dockera.

```
Frontend
  index.html + style.css + script.js  (SPA, czysty JavaScript)
  Lightweight Charts (z CDN)
  HTTP / JSON  +  JWT (Bearer), wywołania fetch()

Backend: FastAPI (uvicorn)
  main.py      definicje endpointów (routing, walidacja)
  crud.py      operacje na bazie (SQLAlchemy async)
  models.py    modele ORM (tabele)
  schemas.py   modele Pydantic (walidacja wejścia i wyjścia)
  auth.py      JWT (tworzenie i weryfikacja)
  security.py  hashowanie haseł (bcrypt)
  database.py  silnik async i sesje                                
   
asyncpg (async)                                             
 Kontener db: PostgreSQL 15           
  tabele: users, 
          portfolios,           
          transactions                 

yfinance (HTTP) 
Yahoo Finance (dane rynkowe)
ceny, waluty, kursy walut, historia notowań
```

Backend to jeden serwis FastAPI z czytelnym podziałem na warstwy: routing, operacje CRUD, modele ORM. Całość jest asynchroniczna. Baza obsługiwana jest przez `asyncpg` i `SQLAlchemy AsyncSession`, a blokujące wywołania `yfinance` przenosimy do osobnych wątków przez `asyncio.to_thread` i zrównoleglamy przez `asyncio.gather` (dzięki temu ceny wielu spółek pobierają się jednocześnie).

Tabele tworzone są automatycznie przy starcie aplikacji w funkcji `lifespan`.

## Frontend (SPA)

Frontend to aplikacja (SPA) napisana w czystym JavaScript. Cała aplikacja mieści się w jednym pliku `index.html`, w którym wszystkie widoki istnieją jednocześnie jako ukryte sekcje `<div>`. Nawigacja nie przeładowuje strony, JavaScript jedynie przełącza widoki przez dodawanie i usuwanie klasy `.hidden`:

* `hide_all_views()` chowa wszystkie sekcje.
* Przyciski w bocznym menu (Portfele, Transakcje, Analityka, Użytkownicy) wywołują funkcje pobierające dane (`load_portfolios()`, `load_transactions()`, `load_analytics()` i odkrywają sekcje).
* Dane pobieramy przez `fetch()`.
* Token JWT przechowywany jest w `localStorage` i dołączany do każdego żądania w nagłówku `Authorization: Bearer <token>`.

Backend serwuje frontend jako pliki statyczne (`app.mount("/", StaticFiles(...))`), aplikacja i API działają pod tym samym adresem.

## Komunikacja

| Warstwa | Jak się komunikuje |
| --- | --- |
| Klient i serwer | REST / JSON przez `fetch()` |
| Autoryzacja | JWT (HS256) w nagłówku `Authorization: Bearer <token>`, ważny 30 minut |
| Logowanie | `OAuth2PasswordRequestForm` |
| Serwer i baza | `asyncpg` oraz SQLAlchemy |
| Dane rynkowe | `yfinance` (HTTP do Yahoo Finance), w osobnych wątkach |

Jak wygląda logowanie krok po kroku:
1. `POST /login` zwraca `access_token`.
2. Klient zapisuje token w `localStorage`.
3. Każde chronione żądanie dołącza nagłówek `Authorization: Bearer <token>`.
4. Funkcja `get_current_user` dekoduje token i zwraca zalogowanego użytkownika. Brak tokenu lub zły token kończy się odpowiedzią `401`.

## Technologie

Backend (Python 3.11):

| Biblioteka | Do czego służy |
| --- | --- |
| FastAPI | routing, walidacja |
| uvicorn | serwer ASGI uruchamiający aplikację |
| SQLAlchemy (async) | ORM i zapytania do bazy |
| asyncpg | sterownik async do PostgreSQL |
| Pydantic | walidacja i serializacja danych |
| PyJWT | tworzenie i weryfikacja tokenów JWT |
| bcrypt | hashowanie haseł |
| yfinance | dane finansowe |
| pandas | obsługa danych historycznych zwracanych przez yfinance |
| python-dotenv | wczytywanie zmiennych środowiskowych |
| python-multipart | obsługa formularza logowania |

Frontend: HTML5, CSS3, JavaScript (ES6+) oraz Lightweight Charts.

Narzędzia i infrastruktura: Docker, Docker Compose, PostgreSQL 15.

### Zarządzanie zależnościami: uv

Projekt korzysta z menedżera pakietów `uv`. Zależności opisane są w pliku `pyproject.toml`, a ich dokładne wersje zapisane w `uv.lock`, 

Komendy uv:

* `uv sync` instaluje wszystkie zależności z `pyproject.toml` do lokalnego środowiska `.venv`.
* `uv run <komenda>` uruchamia komendę w tym środowisku, np. `uv run uvicorn backend.main:app`.

W obrazie Dockera uv jest już zainstalowane i instaluje zależności podczas `docker compose up --build`.

## Struktura projektu

```
StockPortfolio/
  backend/
    main.py        endpointy FastAPI oraz logika wyceny (compute_summary)
    crud.py        operacje na bazie (SQLAlchemy)
    models.py      modele ORM: User, Portfolio, Transaction
    schemas.py     modele Pydantic (request i response)
    auth.py        JWT oraz get_current_user
    security.py    hash_password / verify_password (bcrypt)
    database.py    silnik async, sesje, get_db
  frontend/
    index.html     SPA ze wszystkimi widokami
    script.js      logika UI, fetch, render, wykres
    style.css      style
  docker-compose.yml   usługi: db (Postgres) oraz web (FastAPI)
  Dockerfile           obraz aplikacji (python:3.11-slim z uv)
  pyproject.toml       lista zależności
  uv.lock              zablokowane wersje zależności
  .env / .env.example
  README.md
```

## Model danych

Trzy tabele, połączone relacjami.

`users`

| Kolumna | Typ | Uwagi |
| --- | --- | --- |
| id | Integer | klucz główny |
| username | String | unikalny |
| hashed_password | String | hash bcrypt |
| first_name | String | opcjonalne |
| last_name | String | opcjonalne |

`portfolios`

| Kolumna | Typ | Uwagi |
| --- | --- | --- |
| id | Integer | klucz główny |
| name | String | nazwa portfela |
| is_public | Boolean | czy portfel jest publiczny |
| owner_id | Integer | klucz obcy (users.id) |

`transactions`

| Kolumna | Typ | Uwagi |
| --- | --- | --- |
| id | Integer | klucz główny |
| ticker | String | symbol spółki |
| transaction_type | String | buy lub sell |
| quantity | Float | ilość |
| price | Float | cena za 1 (opcjonalna, pobierana automatycznie) |
| transaction_date | DateTime | data transakcji (wymagana przy dodawaniu) |
| timestamp | DateTime | czas dodania rekordu |
| portfolio_id | Integer | klucz obcy (portfolios.id) |


## Endpointy API

### Autoryzacja i użytkownicy

| Metoda | Ścieżka | Body | Co zwraca/co robi |
| --- | --- | --- | --- |
| `POST` | `/create-user` | `{username, password, first_name?, last_name?}` | Tworzy konto, hashuje przez bcrypt. Zwraca `{id, username, first_name, last_name}`. Automatycznie loguje. Zwraca `400`, gdy login jest zajęty. |
| `POST` | `/login` | form-data: `username`, `password` | Sprawdza dane i zwraca `{access_token, token_type: "bearer"}`. Zwraca `401` przy złych danych. |
| `GET`  | `/me` | brak | Zwraca dane zalogowanego użytkownika `{id, username, first_name, last_name}`. Wymaga tokenu |
| `GET`  | `/users` | brak | Lista wszystkich użytkowników `[{id, username, first_name, last_name}]`. Wymaga tokenu|
| `GET`  | `/users/{user_id}/portfolios` | brak | Lista publicznych portfeli danego użytkownika `[{id, name, is_public, owner_id}]`. Wymaga tokenu |

### Portfele

| Metoda | Ścieżka | Body | Co zwraca i co robi |
| --- | --- | --- | --- |
| `POST` | `/create-portfolio` | `{name, is_public}` | Tworzy portfel zalogowanego użytkownika. Zwraca `{id, name, is_public, owner_id}`.|
| `GET` | `/portfolios` | brak | Lista portfeli zalogowanego użytkownika. |
| `DELETE` | `/portfolios/{portfolio_id}` | brak | Usuwa portfel razem z jego transakcjami. |
| `GET` | `/portfolios/{portfolio_id}/summary` | brak | Podsumowanie portfela (struktura `PortfolioSummary` opisana niżej). Dostęp ma właściciel albo każdy, jeśli portfel jest publiczny, w przeciwnym razie `403`. |

### Transakcje

| Metoda | Ścieżka | Body | Co zwraca i co robi |
| --- | --- | --- | --- |
| `POST` | `/add-transaction` | `{ticker, transaction_type, quantity, price?, transaction_date, portfolio_id}` | Dodaje transakcję do portfela (tylko właściciel). Jeśli `price` jest puste, pobiera adjusted close z `transaction_date` z yfinance, a gdy się nie uda zwraca `422`. Zwraca utworzoną transakcję. |
| `DELETE` | `/transactions/{transaction_id}` | brak | Usuwa transakcję (tylko z własnego portfela, inaczej `403`). Zwraca `{detail}`. |
| `GET` | `/summary` | brak | Zbiorcze `PortfolioSummary` dla wszystkich transakcji użytkownika ze wszystkich portfeli. |

### Analityka i dane rynkowe

| Metoda | Ścieżka | Parametry | Co zwraca i co robi |
| --- | --- | --- | --- |
| `GET` | `/portfolios-comparison` | brak | Dla każdego portfela liczy dzienną wartość w PLN za ostatni rok. Zwraca `[{portfolio_id, name, data: [{time, value}]}]`. To podstawa wykresu porównującego portfele. |
| `GET` | `/ticker-currency` | `?symbol=AAPL` | Zwraca walutę notowania `{currency}` (np. `"USD"`). |
| `GET` | `/search` | `?q=apple` | Wyszukuje spółki, zwraca do 5 wyników `[{symbol, name}]`. |
| `GET` | `/` oraz pliki statyczne | brak | Serwuje SPA (`index.html`, `script.js`, `style.css`). |


## Kwoty w PLN

Wszystkie kwoty sprowadzamy do złotówek:

* Koszt historyczny przeliczamy po kursie waluty z dnia transakcji (para `{WALUTA}PLN=X` z yfinance, np. `USDPLN=X`). 
* Wartość liczymy jako aktualna cena razy ilość
* Zysk niezrealizowany to wartość bieżąca pomniejszona o koszt otwartych pozycji.
* Zysk zrealizowany liczymy przy każdej sprzedaży jako przychód pomniejszony o średni koszt zakupu razy ilość, w PLN.


## Jak uruchomić 

### Docker 
Wymagany jest Docker Desktop

1. Sklonuj repo i wejdź do katalogu projektu:

   ```bash
   git clone <adres-repozytorium>
   cd StockPortfolio
   ```

2. Utwórz plik `.env` na podstawie `.env.example`, uzupełnij:

   ```env
   POSTGRES_USER=admin
   POSTGRES_PASSWORD=twoje_haslo
   POSTGRES_DB=appdb
   DATABASE_URL=postgresql+asyncpg://admin:twoje_haslo@db:5432/appdb
   SECRET_KEY=dlugi_losowy_sekret
   ALGORITHM=HS256
   ```
3. Uruchom:

   ```bash
   docker compose up --build
   ```

4. Otwórz w przeglądarce:

   * `http://localhost:8000`

### Porty

| Usługa | Port na komputerze | Port w kontenerze |
| --- | --- | --- |
| FastAPI (web) | 8000 | 8000 |
| PostgreSQL (db) | 5450 | 5432 |
