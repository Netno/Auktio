Steg 1
Täppa till AI-taggluckan för alla aktiva lotter.
Mål:

0 aktiva öppna lotter utan ai_categories
Varför:
det här ger störst direkt effekt på både hybrid- och semantisk sök
idag finns ett stort aktivt glapp, så relevansen är ojämn mellan hus
Steg 2
Automatisera subject enrichment efter ingest.
Mål:

nya lotter ska inte behöva manuell separat körning för att få AI-taggar
Varför:
annars bygger du konstant backlog igen
det gör söken skör i drift
Steg 3
Rensa upp kända felgrupper i regelbaserad kategorisering.
Prioriterade grupper:

Silver, guld och smycken
Alla
Diverse
servis/set/parti-fall
Varför:
det här ger bättre badge, bättre filter, bättre ranking
och minskar beroendet av extern AI-korrigering
Steg 4
Förbättra objekttolkning för auktionstypiska sökningar.
Fokusera på:

servis
bestick
parti
set
cocktailset
plunta
bordssilver
Varför:
det här är exakt den typ av domänförståelse som gör att ni kan slå generiska sökprodukter
Steg 5
Införa en “golden query”-lista för relevans.
Exempel:

silverservis
cocktailset
rörstrand vas
art deco lampa
bord Carl Malmsten
fickur guld
mynt silver
Mål:
kunna jämföra före/efter varje sökändring
Varför:
annars vet man inte om söken faktiskt blir bättre
Steg 6
Synka relevans mellan vanlig sök och RAG.
Mål:

samma query-förståelse och ungefär samma relevanslogik i båda spåren
Varför:
annars får ni inkonsekvent beteende beroende på sökyta
Steg 7
Förbättra AI-taggarna för retrieval, inte bara beskrivning.
Fokus:

objektform
material
användning
stil/epok
bredare sökbryggor
Varför:
bättre taggar ger bättre recall utan att behöva överdriva fuzzy matching
Steg 8
Bygg driftkoll på sökkvalitet.
Mät:

aktiva lotter utan ai_categories
aktiva lotter med generisk kategori
hus med hög andel Alla/Diverse
query-resultat för golden queries
Varför:
då ser ni när kvaliteten börjar glida
Steg 9
Gör export/import-flödet till ett förstaklassigt arbetsflöde.
Mål:

när ett hus kommer in med dålig klassificering ska ni snabbt kunna:
exportera backlog
köra externt
importera tillbaka
Varför:
ni har redan bevisat att det fungerar praktiskt
Steg 10
Finjustera ranking med verkliga felcase.
Mål:

jobba från faktiska missar i UI och sökresultat, inte generiska antaganden
Varför:
de största relevansvinsterna kommer nästan alltid från konkreta felmönster
Min rekommenderade ordning att börja med direkt:

automatisera subjects efter ingest
fixa kända kategoriregler för Silver, guld och smycken, Alla, Diverse
skapa golden-query-listan
därefter justera object-intent/ranking
