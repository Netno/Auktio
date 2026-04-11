# Auktio - För dig: grund, målbild och genomförandeplan

## Syfte

Det här dokumentet beskriver grunden för Auktios personliga rekommendationssystem "För dig", vad lösningen ska åstadkomma, vilka produkt- och teknikprinciper som gäller, samt i vilken ordning arbetet ska genomföras.

Målet är att kunna bygga och lansera funktionen stegvis, med små säkra commits och deployer, utan att exponera halvfärdig funktionalitet för vanliga användare.

## Vad vi ska åstadkomma

Vi ska bygga ett personligt system som:

- förstår vad en användare är intresserad av utifrån bevakningar och sökningar
- fungerar både för anonyma och inloggade användare
- migrerar anonym aktivitet till användarkontot när användaren loggar in eller registrerar sig
- använder befintliga embeddings för lots och query-embeddings för sökningar
- visar relevanta objekt i en separat yta, "För dig", ovanför vanliga browse-resultat
- ger användaren transparens och kontroll över lagrad personlig data
- kan drivas på gratisnivå utan att vara beroende av flera Vercel-cronjobb

## Produktprinciper

Följande principer gäller genom hela implementationen:

1. "För dig" är en separat rekommendationsyta, inte en dold modifiering av vanlig sök.
2. Vanlig sökrelevans och personlig rekommendation ska hållas isär tills vi medvetet väljer att låta dem påverka varandra.
3. Systemet ska fungera även när användaren inte är inloggad, men bara samla personaliseringsdata om samtycke finns.
4. Vi ska börja enkelt och begripligt, inte med en tung eller akademisk rekommendationsmodell.
5. Alla förändringar ska kunna deployas successivt bakom feature gate.
6. Vi ska optimera för verklig produktnytta och driftbarhet, inte för maximal algoritmisk komplexitet i första versionen.

## Nuläge i kodbasen

Nuvarande grund som vi bygger vidare på:

- Next.js-app med App Router
- NextAuth för autentisering, i dag primärt Google-login
- egen användartabell i databasen för appanvändare
- Supabase som server-side datalager
- befintliga lot-embeddings för semantisk sök
- befintlig query-embedding-funktion som kan återanvändas
- favoriter finns redan, men anonym och inloggad favoritlogik behöver göras mer konsekvent
- viss schemaläggning finns redan via Vercel, men gratisnivån räcker inte för flera eller tyngre cron-flöden

## Teknisk målbild

Den färdiga lösningen består av fem huvuddelar:

### 1. Datainsamling

Vi samlar bara in meningsfulla signaler:

- skickade sökningar
- val av autocomplete-förslag
- klick på kategorier eller relevanta filter
- klick på objekt från sökresultat
- favoriter och bevakningar

Vi samlar inte in keystrokes eller brusdata.

### 2. Identitet och migrering

Anonyma användare får ett persistent `session_id` i cookie. När de senare loggar in eller skapar konto flyttas relevanta signaler över till deras riktiga användaridentitet.

### 3. Intresseprofil

Vi bygger en första version av användarens profil från:

- avslutade favoriter med högst vikt
- aktiva favoriter med hög vikt
- sökningar med medelhög vikt och tidsavtagande effekt

Första versionen ska inte börja med avancerad klustring i stor skala. Vi börjar med en enkel viktad profil eller högst 1 till 3 centroidgrupper per användare.

### 4. Matchning

Aktiva objekt jämförs mot användarens profil. Relevanta träffar sparas i en egen matchtabell. Matchningen ska kunna uppdateras:

- inkrementellt när användaren gör nya handlingar
- lazy när användaren faktiskt öppnar "För dig"
- nattligt som catch-up och cleanup via GitHub Actions

### 5. Presentation och kontroll

Rekommendationerna visas i en tydlig sektion "För dig". Användaren ska också kunna se, exportera och radera den data som används för att bygga rekommendationerna.

## Driftstrategi

### Varför vi inte ska bygga detta runt Vercel-cron

Vercels gratisnivå är för begränsad för ett system som både ska köra ingest, sold-price-uppdateringar, profilrecompute och cleanup på ett robust sätt. Dessutom riskerar serverless-funktionernas tidsgränser att göra tyngre batchjobb sköra.

### Vald lösning

Vi använder:

- appen för realtids- och requestdriven logik
- GitHub Actions för nattlig batch, catch-up och cleanup

Det betyder att:

- nya signaler loggas direkt i appen
- profiler markeras som dirty när något viktigt händer
- vissa profiler kan räknas om on-demand när användaren öppnar "För dig"
- GitHub Actions tar hand om det som inte måste ske direkt

### Vad GitHub Actions ska användas till

Ett nattligt workflow ska hantera:

- processing av dirty users som inte hunnit uppdateras
- cleanup av matchningar för avslutade objekt
- retention och rensning av gamla anonyma data
- retention eller aggregering av gamla sökloggar
- eventuell samordning med andra nattliga maintenance-flöden

### Vad GitHub Actions inte ska användas till i första versionen

- tung global omräkning av alla användare varje natt
- fullständig algoritmomträning eller komplex batchklustring
- realtidsberoende funktionalitet

## Feature gate-strategi

Funktionen ska inte öppnas för alla direkt.

### Fas 1: endast admin och owner

I första steget ska bara admin och owner kunna se "För dig" och relaterade ytor. Det gör att vi kan deploya successivt utan att vanliga användare ser halvfärdig funktionalitet.

### Fas 2: beta-allowlist

När systemet fungerar tillräckligt bra ska åtkomsten styras av en separat beta-flagga eller allowlist, inte genom att ge fler adminrättigheter.

### Fas 3: bredare utrullning

Först när kvalitet, logging, kontrollfunktioner och drift sitter öppnar vi för fler användare.

### Viktig princip

Vi ska inte skapa en ny permanent global roll bara för "För dig". Roller beskriver ansvar. Produktåtkomst ska styras via feature flag eller separat capability.

## Datamodell som behöver införas

Följande tabeller eller motsvarande strukturer ska införas med Auktios namngivningskonvention:

### `auc_user_search_log`

Sparar meningsfulla sökhändelser:

- `id`
- `user_id`
- `session_id`
- `query_text`
- `query_embedding`
- `selected_categories`
- `filters_applied`
- `result_count`
- `results_clicked`
- `first_click_position`
- `source`
- `created_at`

### `auc_search_click_log`

Sparar klick från sökresultat:

- `id`
- `search_id`
- `lot_id`
- `position_in_results`
- `created_at`

Notering: vi ska inte försöka mäta exakt `time_on_item` i MVP eftersom objekten öppnas externt hos auktionshusen.

### `auc_anonymous_favorites`

Sparar anonyma favoriter per `session_id`.

### `auc_user_interest_profiles`

Sparar användarens första rekommendationsprofil eller centroidgrupper:

- embedding
- source breakdown
- top categories
- prisintervall
- dirty-status
- tidsstämplar

### `auc_user_matches`

Sparar genererade rekommendationer:

- `user_id`
- `lot_id`
- `score`
- `match_source`
- `source_lot_id` eller annan förklaringsreferens
- `created_at`

### `auc_user_preference_settings`

Sparar användarinställningar för exempelvis:

- om sökhistorik får sparas
- om personalisering är aktivt på användarnivå

### Auth-relaterade tabeller

För e-postflöden behövs även tabeller eller motsvarande lagring för:

- verifieringslänkar
- lösenordsåterställning
- rate limiting av känsliga auth-flöden

## Samtycke och integritet

Personaliseringssystemet får inte byggas ovanpå en för grov samtyckesmodell.

Vi behöver därför separera:

- analytics
- personalisering

### Koppling till befintlig cookie-consent

Det här ska inte lösas som en helt separat samtyckesmekanism. Det ska byggas vidare på den befintliga cookie-bannern och utökas från dagens enkla analytics-val till tydligare kategorier.

I praktiken betyder det:

- den befintliga bannern ska utökas med en ny kategori för personalisering
- användaren ska kunna godkänna analytics utan att samtidigt godkänna personalisering
- användaren ska kunna neka personalisering utan att vanlig sök eller favoriter slutar fungera

Det här blir alltså både en uppdatering av den publika bannern och ett nytt underliggande consent-state i appen.

### In-app-toggle efter registrering

Utöver bannern ska det också finnas en tydlig in-app-toggle i konto- eller "Min data"-ytan där användaren kan slå av eller på personalisering i efterhand.

Det är viktigt av två skäl:

- användaren ska inte vara låst till sitt första val i bannern
- rekommendationssystemet behöver en tydlig produktinställning även för inloggade användare

Den rekommenderade modellen är därför:

- banner för första samtycket
- in-app-toggle för senare kontroll och ändring

### Beteende när personalisering är avstängt

Om användaren nekar eller senare stänger av personalisering:

- ingen ny personaliserad sökloggning ska sparas
- ingen anonym `session_id` för rekommendationsändamål ska användas
- inga nya interest profiles eller matches ska byggas från användarens beteende
- "För dig" ska döljas
- vanlig sök, filtrering, bevakningar och inloggning ska fortsätta fungera

Vi ska fortfarande låta vanlig sök fungera normalt.

## Autentisering och e-postinfrastruktur

E-postauth är en central del av helheten eftersom rekommendationerna blir betydligt mer värdefulla när användare kan bära med sig sin historik och sina bevakningar mellan besök och enheter.

### Målbild för auth

Vi ska stödja två inloggningssätt inom samma användarmodell:

- fortsätt med Google
- registrera eller logga in med e-post och lösenord

Det här ska inte bli två separata kontosystem. Båda vägarna ska mappa till samma appanvändare.

### E-postinfrastruktur

All transaktionsmail för auth-flöden ska skickas via Google Workspace SMTP relay för Auktio-domänen.

Det inkluderar:

- verifieringsmail
- lösenordsåterställning
- framtida auth-relaterade notifieringar

Praktiskt innebär det att lösningen ska innehålla:

- en dedikerad avsändare, till exempel `noreply@auktio.se`
- TLS-säkrad SMTP-konfiguration mot Google Workspace relay
- en gemensam mailutilitet i appen, så att all auth-mail går samma väg
- enkla HTML-mallar med tydliga CTA-länkar

### Registreringsflöde med e-post

Vid registrering med e-post ska användaren kunna ange:

- e-postadress
- lösenord
- eventuellt visningsnamn

På submit ska systemet:

1. skapa kontot i pending-läge
2. hasha lösenordet säkert
3. skapa en verifieringstoken med begränsad giltighetstid
4. skicka verifieringsmail via Google Workspace SMTP relay

När användaren klickar på verifieringslänken ska kontot aktiveras och användaren kunna få en giltig inloggad session.

### Login och lösenordsåterställning

Login-vyn ska stödja:

- Google-login
- e-post och lösenord
- glömt lösenord-flöde

Lösenordsåterställning ska använda single-use-token med begränsad giltighetstid och skickas via samma mailinfrastruktur.

### Account linking

Account linking måste vara en uttrycklig del av planen, inte något som lämnas till senare.

Om en användare:

- först registrerar sig med e-post och senare försöker logga in med Google med samma e-postadress
- eller först använder Google och senare försöker skapa e-postlogin med samma e-postadress

ska systemet länka identiteterna till samma appanvändare i stället för att skapa dubbla konton.

Det här är avgörande för att:

- favoriter inte ska splittras mellan två konton
- sökhistorik inte ska fragmenteras
- recommendations-profilen ska fortsätta vara sammanhängande

### Rate limiting och missbruksskydd

E-postauth måste kompletteras med tydliga begränsningar mot missbruk.

Minimikrav:

- rate limiting av loginförsök
- rate limiting av verifieringsmail och resend-flöden
- single-use-tokens för verifiering och reset
- tidsbegränsade länkar

Vi ska särskilt begränsa:

- upprepade misslyckade loginförsök
- upprepade utskick av verifieringsmail
- upprepade password reset-förfrågningar

Det här behövs både av säkerhetsskäl och för att inte missbruka SMTP relay-kvoten.

### Koppling till resten av rekommendationssystemet

E-postauth är inte ett fristående spår. Det är en förutsättning för att kunna:

- migrera anonym data till konto
- bära med sig rekommendationsprofilen mellan enheter
- ge användaren tillgång till "Min data"
- göra feature-gating och betaåtkomst på användarnivå

## Rekommendationsmodell v1

### Ingångssignaler

Vi använder tre typer av signaler:

1. avslutade favoriter, högsta vikt
2. aktiva favoriter, hög vikt
3. sökningar, medelvikt och tidseffekt

### Första modellens enkelhet

Vi börjar med en enkel viktad modell eftersom det är snabbare att förstå, testa och justera. Målet är inte att bygga en perfekt akademisk modell, utan att få relevanta rekommendationer snabbt och säkert.

### Matchning

Varje aktiv lot jämförs mot användarens profil. Resultatet justeras med enkla boostar för:

- kategoriöverlapp
- rimligt prisintervall
- signalernas färskhet

### Exkluderingar

Vi ska inte rekommendera objekt som användaren redan aktivt bevakar.

## UI-målbild

### För dig-raden

På browse-sidan ska inloggade användare som har tillräckligt bra signaler se:

- rubriken `För dig`
- en kort förklaring om att innehållet bygger på bevakningar och sökningar
- en rad med objektkort
- en `Visa alla`-länk

### Förklarande etiketter

Varje kort ska kunna visa en enkel och begriplig orsak, till exempel:

- `Liknar: [objekt]`
- `Liknande sökning`

### Tomt tillstånd

Vi visar inte tomma eller konstiga platshållare när signaler eller träffar saknas. Ytan döljs helt tills den är meningsfull.

## Min data

Användaren ska kunna förstå och kontrollera sin data.

Första versionen av "Min data" ska minst innehålla:

- sökhistorik
- möjlighet att radera enskilda eller alla sökningar
- information om varför datan används

Senare versioner ska även omfatta:

- export av data som JSON
- rensa personlig rekommendationsdata
- kontoradering med tydlig bekräftelse

## Genomförandestrategi

Vi jobbar inte i sprintar. Vi jobbar i små successiva commits och pushar där varje leverans:

- är begriplig
- är testbar
- är säker att deploya
- inte exponerar halvfärdiga flöden för vanliga användare

## Exakt implementationsordning

### 1. Feature gate för admin/owner

Först bygger vi en central feature gate för rekommendationer. Inget annat ska kunna bli synligt innan denna gate finns.

### 2. Samtycke för personalisering

Separera personalisering från analytics i samtyckesmodellen.

### 3. Persistent anonym identitet

Inför `session_id` för gäster när personalisering är tillåten.

### 4. Databasschema för beteende, profiler och matchningar

Lägg till alla tabeller och index som krävs.

### 5. API för sökloggning

Skapa backend för att logga meningsfulla sökhändelser.

### 6. Klientkoppling för sökloggning

Koppla sök-UI:t till loggningen utan att logga keystrokes.

### 7. Klickloggning från sökresultat

Lägg till tracking av outbound clicks och positioner.

### 8. Konsekvent favoritmodell

Räta ut anonym och autentiserad favoritlagring så att senare migrering blir enkel.

### 9. E-postauth-grund

Lägg till email/password, verifiering, lösenordsåterställning och mailinfrastruktur.

### 10. Migrering från anonym till inloggad användare

När användaren loggar in eller registrerar sig ska anonym data flyttas över till kontot.

### 11. Intresseprofil v1

Bygg första versionen av profilberäkningen med enkel viktad modell.

### 12. Dirty flow och matchgenerering

När användaren söker eller favoritmarkerar ska profilen kunna markeras som dirty och uppdateras.

### 13. GitHub Actions för nightly maintenance

Inför nattlig catch-up, cleanup och retention.

### 14. Lazy recompute on request

När en användare öppnar "För dig" ska systemet kunna räkna om just den användarens matcher om datan är stale eller dirty.

### 15. För dig-UI bakom gate

Bygg själva rekommendationsytan men håll den begränsad till admin/owner.

### 16. Min data, grundversion

Inför en första användarvy för sökhistorik och datakontroll.

### 17. Export och rensning av personlig data

Bygg ut användarens kontroll med export och rensning.

### 18. Beta-allowlist

Lägg till riktig produktåtkomst för utvalda testanvändare utan att ge dem adminroll.

### 19. Bredare rollout

Först därefter öppnas funktionen för fler användare.

## Vad varje commit ska respektera

Varje commit i serien ska följa dessa regler:

1. En commit ska i första hand ändra ett lager i taget.
2. Auth, schema och UI ska inte blandas i samma commit om det går att undvika.
3. Ingen commit får kräva att resten av serien redan är färdig för att kunna deployas.
4. Rekommendationsytor ska vara stängda för vanliga användare tills vi aktivt öppnar dem.
5. Vi ska prioritera enkelhet i första versionen framför avancerad modellering.

## Vad som inte är MVP

Följande ska inte vara krav för första användbara versionen:

- avancerad k-means med 5 till 10 profiler per användare
- mätning av exakt tid på externa lotsidor
- bred publik lansering direkt
- komplex visualisering av vektorer eller intern ML-infrastruktur

## MVP-definition

Den första versionen räknas som lyckad när vi har:

- personaliseringssamtycke
- anonym `session_id`
- meningsfull sökloggning
- klickloggning från sökresultat
- konsekvent favoritmodell
- migrering till konto vid login
- enkel intresseprofil
- lagrade rekommendationer
- nightly maintenance via GitHub Actions
- en "För dig"-yta som bara admin/owner ser initialt

## Sammanfattning

Det här arbetet ska byggas som en kontrollerad serie små leveranser, inte som en stor engångsrelease. Vi börjar med datagrund, samtycke, identitet och feature gating. Därefter bygger vi logging, auth-utökning, profilering och matchning. UI:t kommer först när datan och driften är tillräckligt stabila.

Den tekniska huvudidén är enkel:

- samla meningsfulla signaler
- bygg en enkel första profil
- uppdatera den inkrementellt
- använd GitHub Actions för nattlig catch-up och cleanup
- exponera funktionen först internt bakom gate

Det ger en väg till en verkligt användbar "För dig"-funktion utan att överinvestera för tidigt eller låsa oss till en skör cronmodell i Vercel.
