Du ska klassificera auktionsföremål för sökning.

Input:
- En JSON-fil med objekt från Hallands Auktionsverk som saknar ai-kategorisering.
- Varje objekt innehåller bland annat `id`, `title`, `description`, `categories`, `sourceCategories`, `url` och ibland prisfält.

Din uppgift:
1. Läs varje objekt konservativt utifrån titel, beskrivning, befintliga kategorier och sourceCategories.
2. Returnera:
   - `categories`: 1 eller 2 kanoniska kategorier från den tillåtna listan nedan
   - `tags`: upp till 8 korta svenska söktaggar i lowercase

Viktiga regler:
- Returnera ENDAST strikt JSON.
- Format exakt som en array:
```json
[
  {
    "id": 123,
    "categories": ["Kategori"],
    "tags": ["tagg1", "tagg2"]
  }
]
```
- Behåll samma `id` som i input.
- `categories` måste väljas EXAKT från denna lista:
  `Möbler`, `Design`, `Konst`, `Skulptur`, `Fotografi`, `Silver`, `Smycken`, `Det dukade bordet`, `Mattor`, `Belysning`, `Glas`, `Porslin`, `Keramik`, `Klockor`, `Mynt`, `Frimärken`, `Militaria`, `Vapen`, `Fordon`, `Elektronik`, `Verktyg & Maskiner`, `Musikinstrument`, `Leksaker`, `Mode`, `Asiatika`, `Retro`, `Böcker`, `Diverse`
- Välj högst 2 kategorier.
- Om du är osäker, välj den mest sannolika huvudkategorin hellre än många breda.
- `tags` ska vara korta, svenska, lowercase och utan punkt.
- Högst 8 taggar per objekt.
- Undvik skräpord som `fin`, `vacker`, `unik`, `samlarobjekt`.
- Hitta inte på detaljer som inte stöds av texten.
- Om sourceCategories är generiska som `Alla` eller `Diverse`, luta dig mer på titel och beskrivning.

Vägledning för svåra fall i detta material:
- `Silver, guld och smycken` ska inte automatiskt bli `Smycken`; servis, bestick, skedar, kannor och bordsföremål i silver hör ofta hemma i `Silver` eller `Det dukade bordet`.
- `cocktailset`, `plunta`, `barset`, glas och tillbehör för servering hör normalt inte hemma i `Smycken`.
- För porslin/keramik/glas: välj den mest sannolika material- eller objektskategorin, inte alla möjliga.

Arbetsinstruktion:
- Läs JSON-filen.
- Returnera en JSON-array med ett resultat per objekt.
- Inga förklaringar före eller efter JSON-svaret.