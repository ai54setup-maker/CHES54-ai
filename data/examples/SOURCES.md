# Fonti della libreria di partite

File generato da `scripts/build-examples.mjs` (non modificarlo a mano: modifica `catalog.json` e rilancia
`npm run build:examples`).

Ogni partita è presa da **PGN Mentor** (fonte principale, archivi per giocatore) ed è confrontata mossa per mossa con
**chessgames.com** (seconda fonte). Viene inclusa solo se:
- tutte le mosse sono legali (parser PGN del progetto + chess.js);
- le due fonti hanno **le stesse mosse e lo stesso risultato** (unica eccezione accettata: una fonte si ferma prima
  e riporta le mosse mancanti, identiche, nel commento finale, come nei matti annunciati dell'Ottocento);
- il risultato è compatibile con la posizione finale (es. chi dà matto vince) e con l'intestazione `Result`;
- le mosse citate nella descrizione ("perché è famosa") compaiono davvero nella partita.

Limite: due fonti concordi riducono il rischio di errori di trascrizione, ma non lo azzerano (le banche dati
possono derivare da una stessa trascrizione storica).

## Partite incluse (21)

| Partita | Semimosse | Risultato | Fonte principale (scaricata il, SHA-256 dell'archivio) | Seconda fonte (scaricata il) |
|---|---|---|---|---|
| `anderssen-kieseritzky-1851` Adolf Anderssen – Lionel Kieseritzky, 1851 | 45 | 1-0 | [Anderssen.zip](https://www.pgnmentor.com/players/Anderssen.zip) (2026-10-18, `a7b44e18652e0605…`) | [chessgames gid 1018910](https://www.chessgames.com/perl/chessgame?gid=1018910) (2026-10-18) |
| `anderssen-dufresne-1852` Adolf Anderssen – Jean Dufresne, 1852 | 47 | 1-0 | [Anderssen.zip](https://www.pgnmentor.com/players/Anderssen.zip) (2026-10-18, `a7b44e18652e0605…`) | [chessgames gid 1018961](https://www.chessgames.com/perl/chessgame?gid=1018961) (2026-10-18). Nota: una fonte si ferma alla semimossa 40 e riporta le ultime 7 nel commento (Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#) |
| `morphy-opera-1858` Paul Morphy – Duca di Brunswick e Conte Isouard, 1858 | 33 | 1-0 | [Morphy.zip](https://www.pgnmentor.com/players/Morphy.zip) (2026-10-18, `0fbc42563014f646…`) | [chessgames gid 1233404](https://www.chessgames.com/perl/chessgame?gid=1233404) (2026-10-18) |
| `steinitz-bardeleben-1895` Wilhelm Steinitz – Curt von Bardeleben, 1895 | 49 | 1-0 | [Steinitz.zip](https://www.pgnmentor.com/players/Steinitz.zip) (2026-10-18, `b402eb57e0f64ad1…`) | [chessgames gid 1132699](https://www.chessgames.com/perl/chessgame?gid=1132699) (2026-10-18) |
| `rotlewi-rubinstein-1907` Georg Rotlewi – Akiba Rubinstein, 1907 | 50 | 0-1 | [Rubinstein.zip](https://www.pgnmentor.com/players/Rubinstein.zip) (2026-10-18, `63b48a0f65ad783c…`) | [chessgames gid 1119679](https://www.chessgames.com/perl/chessgame?gid=1119679) (2026-10-18) |
| `reti-tartakower-1910` Richard Réti – Savielly Tartakower, 1910 | 21 | 1-0 | [Reti.zip](https://www.pgnmentor.com/players/Reti.zip) (2026-10-18, `3d94ef9ea4fd599c…`) | [chessgames gid 1250654](https://www.chessgames.com/perl/chessgame?gid=1250654) (2026-10-18) |
| `capablanca-marshall-1918` José Raúl Capablanca – Frank Marshall, 1918 | 71 | 1-0 | [Capablanca.zip](https://www.pgnmentor.com/players/Capablanca.zip) (2026-10-18, `feed0a7fd1c9101b…`) | [chessgames gid 1095025](https://www.chessgames.com/perl/chessgame?gid=1095025) (2026-10-18) |
| `botvinnik-capablanca-1938` Mikhail Botvinnik – José Raúl Capablanca, 1938 | 81 | 1-0 | [Botvinnik.zip](https://www.pgnmentor.com/players/Botvinnik.zip) (2026-10-18, `54f80c0ecab341ad…`) | [chessgames gid 1031957](https://www.chessgames.com/perl/chessgame?gid=1031957) (2026-10-18) |
| `byrne-fischer-1956` Donald Byrne – Bobby Fischer, 1956 | 82 | 0-1 | [Fischer.zip](https://www.pgnmentor.com/players/Fischer.zip) (2026-10-18, `c07174dd3a66116c…`) | [chessgames gid 1008361](https://www.chessgames.com/perl/chessgame?gid=1008361) (2026-10-18) |
| `fischer-spassky-1972-6` Bobby Fischer – Boris Spassky, 1972 | 81 | 1-0 | [Fischer.zip](https://www.pgnmentor.com/players/Fischer.zip) (2026-10-18, `c07174dd3a66116c…`) | [chessgames gid 1044366](https://www.chessgames.com/perl/chessgame?gid=1044366) (2026-10-18) |
| `karpov-kasparov-1985-16` Anatoly Karpov – Garry Kasparov, 1985 | 80 | 0-1 | [Kasparov.zip](https://www.pgnmentor.com/players/Kasparov.zip) (2026-10-18, `c5acd2fa3175af0a…`) | [chessgames gid 1067175](https://www.chessgames.com/perl/chessgame?gid=1067175) (2026-10-18) |
| `deepblue-kasparov-1997-6` Deep Blue (computer) – Garry Kasparov, 1997 | 37 | 1-0 | [Kasparov.zip](https://www.pgnmentor.com/players/Kasparov.zip) (2026-10-18, `c5acd2fa3175af0a…`) | [chessgames gid 1070917](https://www.chessgames.com/perl/chessgame?gid=1070917) (2026-10-18) |
| `kasparov-topalov-1999` Garry Kasparov – Veselin Topalov, 1999 | 87 | 1-0 | [Kasparov.zip](https://www.pgnmentor.com/players/Kasparov.zip) (2026-10-18, `c5acd2fa3175af0a…`) | [chessgames gid 1011478](https://www.chessgames.com/perl/chessgame?gid=1011478) (2026-10-18) |
| `polgar-kasparov-2002` Judit Polgár – Garry Kasparov, 2002 | 84 | 1-0 | [PolgarJ.zip](https://www.pgnmentor.com/players/PolgarJ.zip) (2026-10-18, `93d9ea786c536d71…`) | [chessgames gid 1254283](https://www.chessgames.com/perl/chessgame?gid=1254283) (2026-10-18) |
| `carlsen-ernst-2004` Magnus Carlsen – Sipke Ernst, 2004 | 57 | 1-0 | [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip) (2026-10-18, `29347942a512b260…`) | [chessgames gid 1272702](https://www.chessgames.com/perl/chessgame?gid=1272702) (2026-10-18) |
| `aronian-anand-2013` Levon Aronian – Viswanathan Anand, 2013 | 46 | 0-1 | [Anand.zip](https://www.pgnmentor.com/players/Anand.zip) (2026-10-18, `9f7227690c26ed05…`) | [chessgames gid 1704763](https://www.chessgames.com/perl/chessgame?gid=1704763) (2026-10-18) |
| `carlsen-anand-2013-5` Magnus Carlsen – Viswanathan Anand, 2013 | 115 | 1-0 | [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip) (2026-10-18, `29347942a512b260…`) | [chessgames gid 1737319](https://www.chessgames.com/perl/chessgame?gid=1737319) (2026-10-18) |
| `anand-carlsen-2013-9` Viswanathan Anand – Magnus Carlsen, 2013 | 56 | 0-1 | [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip) (2026-10-18, `29347942a512b260…`) | [chessgames gid 1737896](https://www.chessgames.com/perl/chessgame?gid=1737896) (2026-10-18) |
| `carlsen-karjakin-2016-10` Magnus Carlsen – Sergey Karjakin, 2016 | 149 | 1-0 | [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip) (2026-10-18, `29347942a512b260…`) | [chessgames gid 1848571](https://www.chessgames.com/perl/chessgame?gid=1848571) (2026-10-18) |
| `carlsen-karjakin-2016-rapid4` Magnus Carlsen – Sergey Karjakin, 2016 | 99 | 1-0 | [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip) (2026-10-18, `29347942a512b260…`) | [chessgames gid 1848607](https://www.chessgames.com/perl/chessgame?gid=1848607) (2026-10-18) |
| `carlsen-nepomniachtchi-2021-6` Magnus Carlsen – Ian Nepomniachtchi, 2021 | 271 | 1-0 | [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip) (2026-10-18, `29347942a512b260…`) | [chessgames gid 2127373](https://www.chessgames.com/perl/chessgame?gid=2127373) (2026-10-18) |

## Partite escluse (5)

- **Edward Lasker – George Alan Thomas, Londra 1912**: non verificabile: non è negli archivi di PGN Mentor e le versioni pubblicate non concordano (ordine delle mosse d'apertura; matto finale 18.Rd2 o 18.O-O-O, vedi la pagina chessgames gid 1259009 e gli articoli di Edward Winter)
- **Légal – Saint Brie, Parigi 1750**: non verificabile: unica fonte (chessgames.com) e circolano versioni diverse (matto alla 7ª o alla 10ª mossa); più che una partita documentata è l'illustrazione di uno schema
- **Emanuel Lasker – Johann Bauer, 1889**: PGN Mentor e chessgames.com non coincidono: prima differenza alla mossa 6. (Nf3 / Nc3); semimosse 75 / 75
- **Stepan Levitsky – Frank Marshall, 1912**: PGN Mentor e chessgames.com non coincidono: prima differenza alla mossa 1. (e4 / d4); semimosse 46 / 46
- **Mikhail Botvinnik – Mikhail Tal, 1960**: PGN Mentor e chessgames.com non coincidono: prima differenza alla mossa 47. (fine / Rd7+); semimosse 92 / 93
