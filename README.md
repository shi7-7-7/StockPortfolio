# Projekt - StockPortfolio
### Celem projektu jest wykonanie strony internetowej pozwalającej zbudowanie oraz podgląd wartości portfolio akcji oraz innych aktywów na bieżąco
 Strona umożliwia stworzenie konta, logowanie do utworzonego konta.

 Funkcjonalności:
 - Stworzenie kilku różnych portfeli. (np. Agresywny, Bezpieczny itd.)
 - Prawdziwe wyrównywanie ceny na bazie akcji (ilość akcji / cena, ilość akcji / dokładna data zakupu)
 - Dostęp do różnych rynków, wyszukiwanie akcji po nazwie.
 - Analityka portfela, podział na sektory, kraje, wykresy.
 - Dashboard użytkowników (stosunek % wzrost/spadek portfela w danym okresie)
 - Podgląd portfela, jeśli użytkownik udostępnił taką możliwość.

 Wersja języka python: **3.11**
 | Biblioteki | Opis |
 | --- | --- |
 | pandas | Obsługa danych oraz dataframe |
 | dotenv | Obsługa zmiennych środowiskowych |
 | asyncpg | Komunikacja z bazą danych PostgreSQL |
 | sqlalchemy | Obsługa Query, ORM |
 | uvicorn | Uruchomienie FastAPI |
 | FastAPI | Komunikacja z Frontendem |
 | bcrypt | Hashowanie haseł |
 | passlib | Potrzebna w ramach bcrypt |
 | pyjwt | Generowanie i weryfikacja tokenów JWT |
 | yfinance | API do danych finansowych |