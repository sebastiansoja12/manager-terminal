# Manager Terminal

Aplikacja mobilna (Expo / React Native) działająca jak terminal kuriera lub pracownika magazynu.
Skanuje kody paczek (aparatem lub skanerem sprzętowym w trybie klawiatury) i wysyła je do managera
przez endpoint SOAP `LogisticsOrchestrator` (`/ws`).

## Tryby skanowania

| Tryb      | Request SOAP                       | Kod                    |
|-----------|------------------------------------|------------------------|
| Odbiór    | `CollectRequest`                   | numer śledzenia        |
| Paleta    | `PalletScanRequest`                | numer palety (1 szt.)  |
| Zwrot     | `TerminalRequest` / `RETURN`       | numer śledzenia + token zwrotu |
| Odmowa    | `TerminalRequest` / `REJECT`       | numer śledzenia + powód |
| Nieobecny | `TerminalRequest` / `MISS`         | numer śledzenia |
| Doręczenie | `HandoverRequest`                 | numer śledzenia + imię i nazwisko odbiorcy, podpis na ekranie (SVG) |

W zwrocie, odmowie i nieobecnym terminal wysyła `TrackingNumber`, a manager sam ustala `ShipmentID`
(`LogisticsDispatchAdapter` → `ShipmentIdentificationPort`). Nieznany numer kończy się faultem SOAP dla całej wysyłki.

Doręczenie zamyka dostawę przesyłki. Podpis jest obowiązkowy, gdy kurier ma włączone „Wymagaj podpisu odbiorcy” w ustawieniach; po podpisie wymagane jest też imię i nazwisko odbiorcy.

Schemat: `managerv2/LogisticsOrchestrator/LogisticsOrchestratorApi/src/main/resources/xsd/terminal-request.xsd`.

## Przepływ

1. **Parowanie (raz)** – użytkownik w panelu managera otwiera „Moje urządzenie” → „Sparuj telefon”
   (`POST /devices/current-user/pairing-codes`) i skanuje jednorazowy kod QR (adres serwera + kod). Aplikacja wysyła
   `POST /internal/device-activations` z kodem, identyfikatorem instalacji (Android ID / identyfikator dostawcy iOS)
   i danymi telefonu. Jeśli operator nie ma jeszcze urządzenia z tym identyfikatorem, manager tworzy osobiste
   urządzenie MOBILE użytkownika; jeśli ma – paruje je (urządzenie osobiste przechodzi na skanującego użytkownika).
   Kody dla urządzeń wspólnych dalej generuje administrator w „Aktywacji terminali”. Zwrócony `PairKey` (domyślnie ważny 180 dni)
   jest trzymany w `expo-secure-store`. Przy starcie i powrocie do aplikacji idzie heartbeat
   `POST /internal/device-pairing-verifications/heartbeats` z wersją aplikacji, producentem, modelem i systemem
   telefonu (`expo-device`, `expo-application`); odpowiedź 401 oznacza
   wyrejestrowanie urządzenia i powrót do aktywacji.
2. **Logowanie operatora (na zmianę)** – `GET /auth/csrf`, `POST /auth/login` (cookies + nagłówek `X-XSRF-TOKEN`),
   `GET /auth/me`, a potem `POST /devices/current-user/sessions` z nagłówkiem `X-DEVICE-PAIR-KEY`.
   Urządzenie osobiste przyjmuje tylko swojego właściciela, wspólne – każdego użytkownika z oddziału urządzenia.
   Wylogowanie (`DELETE /devices/current-user/sessions`) kończy tylko sesję operatora; urządzenie zostaje aktywne.
3. **Skanowanie** – kody trafiają do lokalnej kolejki (przetrwa restart aplikacji), duplikaty są odrzucane.
4. **Wysyłka** – `POST /ws` z kopertą SOAP. Wyniki per paczka są pokazywane na ekranie i zapisywane w historii.
   Przy błędzie sieci/serwera kody zostają w kolejce; przy błędnym `PairKey` aplikacja wraca do aktywacji,
   a gdy manager zgłosi brak zalogowanego operatora – do logowania.

## Ekran startowy

Po zalogowaniu aplikacja otwiera ekran z kafelkami: **Skanowanie** (menu trybów: odbiór, paleta, zwrot,
odmowa, nieobecny oraz historia wysyłek), **Ustawienia** i **Urządzenie**, a pod nimi przycisk **Wyloguj**.
Kafelek **Urządzenie** pokazuje dane aktywowanego urządzenia i sesji oraz pozwala je wyrejestrować.

Kafelek **Sprawdź przesyłkę** wyszukuje przesyłkę po numerze śledzenia (wpisanym, ze skanera sprzętowego
lub z aparatu) przez `GET /shipments/tracking-numbers/{numer}/control-center` i pokazuje status, odbiorcę,
nadawcę, dane paczki oraz historię zdarzeń.

## Praca bez sieci

Gdy wysyłka nie dojdzie do managera z powodu braku połączenia lub timeoutu, kody nie wracają na listę,
tylko trafiają do **kolejki offline** (`terminal.outbox`) razem z kopią opcji (powód odmowy, token zwrotu, podpis).
Aplikacja ponawia kolejkę automatycznie co 30 s, po powrocie do aplikacji i po udanym heartbeacie. Jeśli manager
odrzuci wysyłkę (fault SOAP, wygasła sesja), wpis jest oznaczany jako „Wymaga uwagi” i czeka na decyzję:
**Ponów**, **Na listę** (przywraca kody do skanera) albo **Usuń**. Kolejkę widać w **Historii** (filtr „Kolejka”).

## Szybkie akcje

Ekran **Sprawdź przesyłkę** ma na dole przyciski **Doręcz** (dodaje numer śledzenia do trybu Doręczenie) oraz
**Nieobecny** / **Odmowa** (dodają numer śledzenia do odpowiednich trybów). Z Historii przycisk **Sprawdź** przy odrzuconym kodzie otwiera wyszukiwanie tej przesyłki.

## Moje ustawienia

Ekran `Ustawienia` (kafelek na ekranie startowym) pozwala kurierowi samodzielnie zmieniać konfigurację
(`GET/PUT /suppliers/me/configuration`, `POST /suppliers/me/configuration/reset`, historia w `/history`).
Ustawienia wymuszone przez politykę firmy są widoczne, ale zablokowane. Zapis wysyła `version` —
przy konflikcie (409) aplikacja prosi o ponowne wczytanie danych. Konfiguracja jest buforowana lokalnie;
gdy wymagane jest skanowanie przy odbiorze lub zwrocie, ręczne dodawanie kodów przyciskiem jest wyłączone.

## Uruchomienie

```bash
npm install
npx expo start
```

Adres serwera trafia do aplikacji z kodu QR aktywacji. Przy ręcznej aktywacji podaj go razem z context path,
np. `http://192.168.1.10:8080/v1/api` (telefon i serwer w tej samej sieci; `localhost` nie zadziała z telefonu).

Aplikacja używa natywnych modułów (aparat, secure store), więc najlepiej uruchamiać ją
w development buildzie: `npx expo run:android` / `npx expo run:ios` albo `npx eas-cli@latest build --profile development`.

## Sprawdzanie

```bash
npm run typecheck
npx eslint src
npm test
```
