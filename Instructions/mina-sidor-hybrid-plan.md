# Auktio - Mina Sidor, hybrida rekommendationer och notifieringar

## Syfte

Det här dokumentet beskriver nästa produktfas efter första versionen av `För dig`.

Målet är att gå från en i huvudsak passiv rekommendationsyta till ett verkligt användarstyrt system där:

- användaren själv kan definiera vad som ska bevakas och notifieras
- AI-profilering och beteendesignaler fortfarande används för relevans och prioritering
- rekommendationer och notifieringar blir begripliga, kontrollerbara och förklarbara
- `Mina Sidor` blir den naturliga ytan för styrning, uppföljning och kontroll

Det här är inte en ersättare till första `För dig`-planen i [Instructions/for-dig-masterplan.md](Instructions/for-dig-masterplan.md), utan en fortsättning på den.

## Produktprinciper

Följande principer gäller för den här fasen:

1. Användaren äger `vad` som är tillåtet och viktigt.
2. AI:n hjälper med `vad som är mest relevant just nu` inom användarens ramar.
3. Explicita användarregler ska kunna fungera som hårda constraints, inte bara som svaga signaler.
4. `För dig` på startsidan ska vara lätt och discovery-orienterad.
5. `Mina Sidor` ska vara ytan för långsiktig styrning, regelhantering och notifieringskontroll.
6. Notifieringar måste vara mer precisa och mer konservativa än hemsidans rekommendationer.
7. Varje rekommendation eller notis ska kunna förklaras med enkel mänsklig text.
8. Vi ska inte fejka avancerade funktioner som kräver data vi ännu inte lagrar, till exempel verifierad historik om användarens egna bud på objektnivå.

## Produktmål

Den här fasen ska göra det möjligt för en användare att:

- följa sökord och fraser
- välja kategorier att prioritera eller exkludera
- följa specifika auktionshus
- följa märken, makers eller andra återkommande objektintentioner
- styra min- och maxpris
- välja vilka typer av händelser som ska generera notifieringar
- välja hur ofta notifieringar ska skickas
- förstå varför ett objekt eller en notis visas
- låta AI-profilen förbättra ordning, breddning och liknande-träffar utan att tappa kontrollen

## Övergripande produktmodell

Vi delar produkten i tre tydliga ytor:

### 1. För dig

`För dig` förblir en snabb personlig yta på startsidan.

Den ska:

- visa färska relevanta objekt
- ge korta orsaksförklaringar
- länka vidare till `Mina Sidor` för finjustering

Den ska inte vara huvudytan för att skapa eller underhålla regler.

### 2. Mina Sidor

`Mina Sidor` blir användarens kontrollcenter.

Den ska innehålla:

- översikt
- bevakningar
- aviseringar
- din profil
- aktivitet och integritet

Den nuvarande `Min data`-ytan ska på sikt leva vidare som en sektion under `Mina Sidor`, inte som hela lösningen.

### 3. Notifieringsmotor

Notifieringar ska bygga på explicita regler plus stöd från AI-profilen.

De ska vara:

- deduplicerade
- förklarbara
- styrda av användarens valda frekvens och kanal
- stramare än startsidans rekommendationer

## Informationsarkitektur för Mina Sidor

### Översikt

Syfte:

- visa vad som är nytt för användaren just nu
- ge snabb åtkomst till viktigaste regler och notifieringar

Innehåll:

- nya träffar sedan senaste besöket
- objekt som snart går ut och matchar användarens regler
- kort summering av aktiva bevakningar
- kort summering av AI-profilen

### Bevakningar

Syfte:

- låta användaren skapa, pausa, redigera och ta bort explicita regler

Första versionen ska stödja:

- sökord och fraser
- kategorier
- auktionshus
- märken/makers
- min/max-pris
- strict eller blended-läge

### Aviseringar

Syfte:

- styra kanal och frekvens
- välja vilka händelser som ska trigga notifiering

Första versionen ska stödja:

- e-post av/på
- direkt eller daglig sammanfattning
- pausläge
- händelsetyper för nya matchande objekt, nya objekt från följt auktionshus och liknande sparade objekt

### Din profil

Syfte:

- visa vad systemet har lärt sig om användaren
- låta användaren justera AI:s riktning utan att skriva formella regler

Innehåll:

- toppkategorier
- prisprofil
- husaffinitet
- återkommande objektintentioner
- handlingar som `Mer`, `Mindre`, `Dölj` och `Gör till bevakning`

### Aktivitet och integritet

Syfte:

- ge fortsatt kontroll över lagrad data
- visa aktivitetshistorik som är relevant för rekommendationer och notifieringar

Innehåll:

- sökhistorik
- export av data
- rensa rekommendationsdata
- stäng av personalisering

## Hybridmodell för relevans

Vi använder en tvåfilig modell:

### Lane A: explicita regler

Det här är användarens egna krav.

Exempel:

- inkluderade kategorier
- exkluderade kategorier
- sökord eller fraser
- märken eller makers
- auktionshus
- prisintervall
- notifieringstyp

De här reglerna ska kunna användas som hårda constraints.

### Lane B: implicita signaler

Det här är systemets egna affinitetssignaler.

Exempel:

- favoriter
- meningsfulla sökningar
- klick från sökresultat
- återkommande engagemang
- framtida budhistorik
- liknande objekt via semantisk matchning

De här signalerna ska påverka ranking, breddning och prioritering, inte upphäva användarens uttryckliga val.

## Hårda constraints vs mjuka boosts

### Hårda constraints

Följande ska kunna stoppa ett objekt helt:

- fel kategori
- exkluderad kategori
- fel auktionshus
- utanför prisintervall
- fel notifieringstyp
- objekt som redan setts, avvisats eller redan notifierats inom cooldown

### Mjuka boosts

Följande ska kunna höja eller sänka rangordningen:

- semantisk likhet med sparade objekt
- kategoriöverlapp
- maker- eller brandöverlapp
- prisnärhet till användarens vanliga spann
- färskhet
- likhet med tidigare engagemang
- husaffinitet

## Skillnad mellan rekommendationer och notifieringar

### För dig på startsidan

Ska vara:

- bredare
- mer varierad
- mer discovery-orienterad
- mindre strikt än notifieringar

### Notifieringar

Ska vara:

- händelsedrivna
- tröskelhögre
- deduplicerade
- förklarbara
- precisionstunga snarare än recall-tunga

Vi ska därför generera separata outputs för:

- `home`
- `notification`

Även om de delar mycket av samma kandidat- och rankingpipeline.

## Förklarbarhet

Varje rekommenderat objekt eller notifiering ska kunna visa en primär förklaring.

Exempel:

- `Matchar din bevakning: Rolex under 30 000 kr`
- `Från auktionshus du följer`
- `Liknar objekt du favoritmarkerat`
- `Passar din vanliga prisnivå`
- `Tillbaka efter att tidigare inte ha sålts`

Vi ska undvika interna eller tekniska ord som centroid, embedding eller AI-score i UI.

## Datamodell - nästa steg

Nuvarande `auc_user_preference_settings` räcker inte för den här produkten.

Vi behöver nya tabeller.

### 1. auc_user_notification_settings

Per användare:

- `email_enabled`
- `digest_frequency`
- `instant_enabled`
- `quiet_hours_start`
- `quiet_hours_end`
- `max_notifications_per_day`
- `updated_at`

### 2. auc_user_recommendation_rules

En rad per uttrycklig bevakningsregel.

Fält:

- `user_id`
- `surface` (`home`, `notification`, `both`)
- `enabled`
- `strictness` (`strict`, `blended`)
- `query_text`
- `categories`
- `excluded_categories`
- `brands_or_makers`
- `house_ids`
- `min_price`
- `max_price`
- `notification_types`
- `cooldown_hours`
- `priority`
- `created_at`
- `updated_at`

### 3. auc_user_behavior_events

För att separera rå användaraktivitet från slutlig profil.

Fält:

- `user_id`
- `lot_id`
- `search_id`
- `event_type`
- `weight`
- `metadata`
- `occurred_at`

Första relevanta typer:

- `favorite_add`
- `search_click`
- `search_repeat`
- `lot_view`
- `dismiss`
- `hide`

`bid_placed` ska planeras men inte användas förrän vi verkligen har korrekt datakälla.

### 4. auc_user_alert_matches

Lagrar träffar mellan regler och objekt.

Fält:

- `user_id`
- `rule_id`
- `lot_id`
- `match_kind`
- `reason_codes`
- `score`
- `score_breakdown`
- `delivery_state`
- `first_seen_at`
- `last_seen_at`
- `notified_at`

### 5. object recurrence / object grouping

För att kunna stödja `kommer upp igen` på ett robust sätt behöver vi senare:

- `object_group_id` på lotnivå eller
- en separat länkningstabell mellan relaterade lots

Det här ska inte fejkas i MVP om datakvaliteten inte räcker.

## Repo-mappad implementering

### Befintliga delar som ska byggas vidare på

- [src/lib/user-interest-profile.ts](src/lib/user-interest-profile.ts)
- [src/lib/user-recommendation-matches.ts](src/lib/user-recommendation-matches.ts)
- [src/lib/recommendations-feed.ts](src/lib/recommendations-feed.ts)
- [src/app/api/recommendations/route.ts](src/app/api/recommendations/route.ts)
- [src/lib/search-log.ts](src/lib/search-log.ts)
- [src/lib/search-click-log.ts](src/lib/search-click-log.ts)
- [src/components/RecommendationsSection.tsx](src/components/RecommendationsSection.tsx)
- [src/components/MinDataPageClient.tsx](src/components/MinDataPageClient.tsx)
- [src/lib/user-preference-settings.ts](src/lib/user-preference-settings.ts)

### Nya backendområden

1. nytt schema och migrationer för regler och notifieringsinställningar
2. ny route för CRUD av regler
3. utökad route för notifieringsinställningar
4. match-cache för `alert matches`
5. separat generator för notification-candidates

## Konkreta API-kontrakt för MVP

Följande API-ytor ska vara första kontraktsnivån för implementationen.

### 1. GET /api/me/mina-sidor

Syfte:

- ladda hela Mina Sidor-grunden i ett anrop

Svar ska minst innehålla:

- `preferences`
- `notificationSettings`
- `overview`
- `recommendationRules`
- `profile`
- `recentSearches`

### 2. GET /api/me/notification-settings

Syfte:

- ladda notifieringsinställningar separat vid behov

### 3. PUT /api/me/notification-settings

Syfte:

- uppdatera e-post, digest, instant, quiet hours och max per dag

### 4. GET /api/me/recommendation-rules

Syfte:

- lista användarens explicita bevakningsregler

### 5. POST /api/me/recommendation-rules

Syfte:

- skapa ny regel

MVP-input ska stödja:

- `label`
- `surface`
- `strictness`
- `queryText`
- `categories`
- `excludedCategories`
- `brandsOrMakers`
- `houseIds`
- `minPrice`
- `maxPrice`
- `notificationTypes`
- `cooldownHours`
- `priority`
- `enabled`

### 6. PUT /api/me/recommendation-rules/:ruleId

Syfte:

- uppdatera regel eller pausa/återaktivera den

### 7. DELETE /api/me/recommendation-rules/:ruleId

Syfte:

- ta bort regel

## Konkret UI-spec för MVP

### Route

- `/mina-sidor`

### Tabyta

Första versionen ska ha fem tabbar:

- `Översikt`
- `Bevakningar`
- `Aviseringar`
- `Din profil`
- `Integritet`

### Översikt - innehåll

- antal aktiva regler
- antal notifieringsregler
- antal sparade sökningar
- antal favoriter
- antal nuvarande `För dig`-matchningar
- kort sammanfattning av senaste profiluppdatering

### Bevakningar - innehåll

- lista av regler som kort
- enkel skapad-form i första versionen
- stöd för att pausa/aktivera
- stöd för att ta bort

### Aviseringar - innehåll

- e-post på/av
- direktnotiser på/av
- digest-frekvens
- quiet hours
- max antal notifieringar per dag

### Din profil - innehåll

- toppkategorier
- prisprofil
- senaste uppdatering
- enkel text om att AI-profilen används för ranking inom dina regler

### Integritet - innehåll

- länk till befintlig `Min data`
- sammanfattning av lagrade sökningar, favoriter och matchningar
- tydlig relation mellan `Mina Sidor` och `Min data`

### Nya frontendområden

1. riktig `Mina Sidor`-sida eller ombyggd användaryta
2. sektionen `Mina bevakningar`
3. sektionen `Aviseringar`
4. sektionen `Din profil`
5. fortsatt `Aktivitet och integritet`

## Rekommenderad MVP

MVP ska inte försöka lösa hela problemet.

### Ska ingå

1. `Mina Sidor` som tydlig destinationsyta
2. bevakningsregler för:
   - sökord
   - kategorier
   - auktionshus
   - märken/makers
   - min/max-pris
3. strict vs blended-läge per regel eller per användare
4. notifieringsinställningar för:
   - e-post av/på
   - direkt eller daglig sammanfattning
5. `För dig` som respekterar reglerna och visar förklaringar
6. notifieringstyper för:
   - nytt matchande objekt
   - nytt från följt auktionshus
   - liknande sparat objekt

### Ska inte vara krav i MVP

1. full återpubliceringslogik för tidigare bud utan robust datamodell
2. pushnotiser i flera kanaler
3. avancerad multi-cluster-profil per användare
4. kompletta regler med boolesk logik och nästlade villkor
5. globalt utskickssystem med hög volym och komplex rate limiting

## Exakt genomförandeordning

### Fas A - struktur och datamodell

1. skapa nytt planerat schema för regler och notifieringsinställningar
2. lägga till migration för nya tabeller och index
3. definiera nya typer i appen

### Fas B - användarstyrning i Mina Sidor

1. skapa eller bygga om `Mina Sidor`
2. flytta `Min data` till undersektion
3. bygga `Mina bevakningar` med lista, skapa, redigera, pausa och ta bort
4. bygga `Aviseringar`

### Fas C - hybridrelevans

1. läsa explicita regler tillsammans med befintlig profil
2. hårdfiltrera mot användarens constraints
3. ranka inom det utrymmet med profil- och semantiska signaler
4. skriva tydliga reason-codes till matcher

### Fas D - första notifieringsflödet

1. skapa notification-candidates från regler och match-cache
2. deduplicera per användare, regel och objekt
3. exponera träfflista i UI
4. lägga till första utskickslogik för e-post eller digest

### Fas E - senare steg

1. budhändelser på användarnivå
2. recurrence-linking för återkommande objekt
3. fler notifieringstyper som `ending soon`, `price drop` och `returned unsold`
4. starkare diversifiering och suppression learning

## Viktiga risker att undvika

1. att låta en enda AI-profil köra över explicita användarregler
2. att blanda ihop favoriter, sökfilter, bevakningar och rekommendationer i UI
3. att bygga notiser utan dedupe och cooldown
4. att försöka stödja `tidigare budade objekt kommer igen` utan korrekt datagrund
5. att göra startsidans `För dig` lika tung och styrningsfokuserad som `Mina Sidor`
6. att visa för vaga orsaksförklaringar som `baserat på din aktivitet`

## Definition av lyckad första release

Den första lyckade versionen av den här fasen är nådd när:

- `Mina Sidor` finns som aktiv kontrollcentral
- användaren kan skapa och ändra bevakningsregler
- användaren kan styra notifieringsfrekvens och kanal
- startsidans `För dig` respekterar explicita regler
- rekommenderade objekt visar tydliga orsaksförklaringar
- notifieringar bara skickas för tydliga, högprecisionsträffar

## Sammanfattning

Nästa fas ska inte göra `För dig` mer mystiskt. Den ska göra systemet mer användarstyrt.

Rätt modell för Auktio är:

- explicita regler för användarens vilja
- AI-profilering för rangordning, breddning och liknande-träffar
- `Mina Sidor` som kontrollcenter
- `För dig` som snabb och förklarbar discovery-yta

Det ger en produkt som känns intelligent utan att kännas okontrollerbar.
