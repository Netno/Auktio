# Sprint 1 Search Eval

Syftet med Sprint 1-utvärderingen är att mäta om query understanding faktiskt förbättrar breda användarfrågor utan att försämra exakta objektsökningar.

## Bedömningsmall

För varje fråga i `src/lib/search-evalset.ts`, bedöm topp 10-resultaten med följande enkla mall:

| Fält         | Skala    | Tolkning                                                             |
| ------------ | -------- | -------------------------------------------------------------------- |
| Precision@3  | 0-3      | Hur många av topp 3 känns klart relevanta                            |
| Precision@10 | 0-10     | Hur många av topp 10 är rimliga                                      |
| Feltyp       | fri text | T.ex. `för bred`, `för smal`, `fel objektfamilj`, `irrelevant dekor` |
| Saknas       | fri text | Viktiga objekt som borde ha funnits men saknas                       |
| Kommentar    | fri text | Kort not om vad som känns fel eller bättre                           |

## Frågegrupper

Kör frågorna i följande ordning:

1. `broad-intent`
2. `concrete-object`
3. `modifier-intent`
4. `regression-check`
5. `rag-alignment`

Det ger snabbast signal om Sprint 1 verkligen flyttade de breda frågorna först, utan att skapa regressioner.

## Vad vi vill se

- Breda frågor ska ge rätt objektfamilj tidigt i listan.
- Exakta objektfrågor ska fortfarande vara tydligt lexikala och precisa.
- Modifierare som material, stil och rum ska inte tappas bort.
- RAG och vanliga sök-API:t ska visa samma relevansidé för samma fråga.

## Viktigaste felmönstren att logga

- Väggfrågor som fortfarande drar in smycken eller bärbara hängen.
- Förvaringsfrågor som glider över i allmänna möbler utan förvaringsfunktion.
- Dukningsfrågor som blandar in dekor snarare än brukssaker.
- Breda trädgårdsfrågor som bara hittar enskilda ord istället för användningsområde.
- RAG-svar där källobjekten inte liknar toppresultaten från standard-söken.

## Jämförelse mellan sökvägar

För `rag-alignment`-frågorna, jämför:

1. Resultat från `src/app/api/search/route.ts`
2. Källor från retrieval i `src/lib/rag.ts`

Om de två vägarna börjar ge olika objektfamiljer för samma fråga, ska det ses som ett blockerande relevansproblem.

## Rekommenderad arbetsgång

1. Kör alla frågor i `broad-intent` och notera Precision@3.
2. Gå vidare till `concrete-object` och säkerställ att inga exakta sökningar tappat precision.
3. Kör `modifier-intent` och kontrollera att både objekt och modifierare syns i toppen.
4. Kör `regression-check` för att se att vi inte brutit smycken, armbandsur, målningar eller enkla möbelsökningar.
5. Kör `rag-alignment` sist och jämför standard-sök mot RAG.

## Enkel resultatmall

```text
Fråga:
Bucket:
Precision@3:
Precision@10:
Feltyp:
Saknas:
Kommentar:
```
