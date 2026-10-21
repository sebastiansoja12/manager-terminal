# Manager Terminal

Aplikacja mobilna (Expo / React Native) działająca jak terminal kuriera lub pracownika magazynu.
Skanuje kody paczek (aparatem lub skanerem sprzętowym w trybie klawiatury) i wysyła je do managera
przez endpoint SOAP `LogisticsOrchestrator` (`/ws`).

## Tryby skanowania

| Tryb      | Request SOAP                       | Kod                    |
|-----------|------------------------------------|------------------------|
| Odbiór    | `CollectRequest`                   | numer śledzenia        |
| Paleta    | `PalletScanRequest`                | numer palety (1 szt.)  |
| Zwrot     | `TerminalRequest` / `RETURN`       | numeryczne ID przesyłki + token zwrotu |
| Odmowa    | `TerminalRequest` / `REJECT`       | numeryczne ID przesyłki + powód |
| Nieobecny | `TerminalRequest` / `MISS`         | numeryczne ID przesyłki |

Schemat: `managerv2/LogisticsOrchestrator/LogisticsOrchestratorApi/src/main/resources/xsd/terminal-request.xsd`.

## Przepływ

1. **Logowanie** – `GET /auth/csrf`, `POST /auth/login` (cookies + nagłówek `X-XSRF-TOKEN`), `GET /auth/me`.
2. **Parowanie** – `GET /devices/current-user`, następnie `POST /devices/current-user/pairings`
   z `externalSystemId` urządzenia (można zeskanować z etykiety). Zwrócony `PairKey` (ważny 48 h)
   jest trzymany w `expo-secure-store`. Można też wkleić istniejący klucz ręcznie.
3. **Skanowanie** – kody trafiają do lokalnej kolejki (przetrwa restart aplikacji), duplikaty są odrzucane.
4. **Wysyłka** – `POST /ws` z kopertą SOAP. Wyniki per paczka są pokazywane na ekranie i zapisywane w historii.
   Przy błędzie sieci/serwera kody zostają w kolejce; przy błędnym `PairKey` aplikacja wraca do parowania.

## Uruchomienie

```bash
npm install
npx expo start
```

Adres serwera w aplikacji podaj razem z context path, np. `http://192.168.1.10:8080/v1/api`
(telefon i serwer w tej samej sieci; `localhost` nie zadziała z telefonu).

Aplikacja używa natywnych modułów (aparat, secure store), więc najlepiej uruchamiać ją
w development buildzie: `npx expo run:android` / `npx expo run:ios` albo `npx eas-cli@latest build --profile development`.

## Sprawdzanie

```bash
npm run typecheck
npx eslint src
npm test
```
