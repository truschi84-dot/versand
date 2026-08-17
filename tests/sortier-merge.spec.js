// Tests fuer das Zusammenfuehren der Sortier-Buchungen (js/gemeinsam/metriken.js).
//
// Hintergrund (2026-08-05): mergeTeamSortierBuchungen() hat den Schluessel nur aus
// sessionKey|datum gebildet. Wurde derselbe Artikel desselben Lieferanten zweimal am
// selben Tag sortiert, hat der zweite Vorgang den ersten ueberschrieben -- die Menge des
// ersten war aus der Statistik verschwunden (belegt: Ponnath 03.08.2026,
// "Haehnchenroulade frit", 624 kg + 448 kg, in der Cloud standen nur 448 kg).
//
// Die Funktionen aus metriken.js sind globale Funktionen der Rechner-App. Sie werden
// deshalb im Browser-Kontext der geladenen index.html aufgerufen (page.evaluate) --
// derselbe Codepfad wie in der echten App, ohne Nachbau in Node.
//
// WICHTIG: blockCloud() vor dem Laden, damit kein Testlauf echte Firmendaten anfasst.

const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner } = require('./helpers');

const DATUM = '2026-08-03';
const LIEF = 'Ponnath';
const SORTE = '70714 - Haehnchenroulade frit';
const HERKUNFT = 'DE';
const SESSION_KEY = LIEF + '|' + SORTE + '|' + HERKUNFT;

/** Eine Buchung wie sie bucheTeamSortierungBeimDruck() anlegt. */
function buchung(overrides) {
  return {
    id: 'test_' + Math.random().toString(36).slice(2, 8),
    sessionKey: SESSION_KEY,
    datum: DATUM,
    lief: LIEF,
    sorte: SORTE,
    herkunft: HERKUNFT,
    gebuchtKg: 0,
    letztesGewichtKg: 0,
    letzterDruck: '2026-08-03T06:27:00.000Z',
    ...overrides,
  };
}

/** Sortiervorgang A: 06:27 Uhr, 624 kg. */
const VORGANG_A = buchung({
  sitzungId: '1785500325702_gwb8',
  gebuchtKg: 624,
  letztesGewichtKg: 624,
  letzterDruck: '2026-08-03T06:27:00.000Z',
});

/** Sortiervorgang B: 10:41 Uhr, 448 kg -- gleicher Artikel, gleicher Tag, andere Sitzung. */
const VORGANG_B = buchung({
  sitzungId: '1785748521795_s8xr',
  gebuchtKg: 448,
  letztesGewichtKg: 448,
  letzterDruck: '2026-08-03T10:41:00.000Z',
});

/** mergeTeamSortierBuchungen() im Browser-Kontext ausfuehren. */
async function merge(page, lokal, cloud, deletedKeys) {
  return page.evaluate(
    ({ l, c, d }) => window.mergeTeamSortierBuchungen(l, c, d),
    { l: lokal, c: cloud, d: deletedKeys || [] }
  );
}

/** Tages-Summe aus den zusammengefuehrten Buchungen -- das, was in der Statistik landet. */
async function tagesSumme(page, buchungen, deletedKeys) {
  return page.evaluate(
    ({ b, d }) => window.sortierenSummeFuerDatum(b, null, '2026-08-03', d, [], {}).gesamtKg,
    { b: buchungen, d: deletedKeys || [] }
  );
}

test.describe('Sortier-Buchungen zusammenfuehren', () => {
  test.beforeEach(async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);
  });

  test('zwei Sitzungen am selben Tag bleiben beide erhalten (624 + 448 = 1072)', async ({ page }) => {
    // Der eigentliche Fehlerfall: Vorgang A steht lokal, Vorgang B kommt aus der Cloud
    // (bzw. umgekehrt) -- vorher hat B den Eintrag A ueberschrieben.
    const merged = await merge(page, [VORGANG_A], [VORGANG_B]);

    expect(merged).toHaveLength(2);
    const gewichte = merged.map((b) => b.gebuchtKg).sort((a, b) => a - b);
    expect(gewichte).toEqual([448, 624]);
    expect(await tagesSumme(page, merged)).toBe(1072);

    // Richtungsunabhaengig: gleiches Ergebnis, wenn die Seiten getauscht sind.
    const mergedAndersrum = await merge(page, [VORGANG_B], [VORGANG_A]);
    expect(mergedAndersrum).toHaveLength(2);
    expect(await tagesSumme(page, mergedAndersrum)).toBe(1072);
  });

  test('derselbe Vorgang zweimal (gleiche sitzungId) bleibt ein Eintrag -- neuerer Druck gewinnt', async ({ page }) => {
    // Korrektur/Nachdruck innerhalb derselben Sitzung: 500 kg wurden auf 448 kg korrigiert.
    const alt = buchung({
      sitzungId: '1785748521795_s8xr',
      gebuchtKg: 500,
      letztesGewichtKg: 500,
      letzterDruck: '2026-08-03T09:15:00.000Z',
    });
    const neu = buchung({
      sitzungId: '1785748521795_s8xr',
      gebuchtKg: 448,
      letztesGewichtKg: 448,
      letzterDruck: '2026-08-03T10:41:00.000Z',
    });

    const merged = await merge(page, [neu], [alt]);
    expect(merged).toHaveLength(1);
    expect(merged[0].gebuchtKg).toBe(448);
    expect(await tagesSumme(page, merged)).toBe(448);

    // Auch in umgekehrter Lese-Reihenfolge darf die aeltere Fassung nicht gewinnen.
    const mergedAndersrum = await merge(page, [alt], [neu]);
    expect(mergedAndersrum).toHaveLength(1);
    expect(mergedAndersrum[0].gebuchtKg).toBe(448);
  });

  test('Altbestand ohne sitzungId und gleiche Buchung mit sitzungId ergeben einen Eintrag', async ({ page }) => {
    // 166 Cloud-Buchungen stammen aus der Zeit vor Build 115 und haben keine sitzungId.
    // Derselbe Vorgang, einmal alt und einmal neu gespeichert -- darf nicht doppelt zaehlen.
    const altbestand = buchung({ gebuchtKg: 624, letztesGewichtKg: 624 });
    delete altbestand.sitzungId;
    const mitSitzung = buchung({
      sitzungId: '1785500325702_gwb8',
      gebuchtKg: 624,
      letztesGewichtKg: 624,
      letzterDruck: '2026-08-03T06:27:00.000Z',
    });

    const merged = await merge(page, [mitSitzung], [altbestand]);
    expect(merged).toHaveLength(1);
    expect(merged[0].gebuchtKg).toBe(624);
    expect(await tagesSumme(page, merged)).toBe(624);
  });

  test('Altbestand: zwei Buchungen ohne sitzungId verhalten sich wie bisher (ein Eintrag)', async ({ page }) => {
    // Fuer reine Alt-Daten darf sich nichts aendern -- sonst tauchen alte Buchungen
    // ploetzlich doppelt auf.
    const alt1 = buchung({ gebuchtKg: 624, letztesGewichtKg: 624, letzterDruck: '2026-08-03T06:27:00.000Z' });
    const alt2 = buchung({ gebuchtKg: 448, letztesGewichtKg: 448, letzterDruck: '2026-08-03T10:41:00.000Z' });
    delete alt1.sitzungId;
    delete alt2.sitzungId;

    const merged = await merge(page, [alt1], [alt2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].gebuchtKg).toBe(448);
    expect(await tagesSumme(page, merged)).toBe(448);
  });

  test('0 kg ueberschreibt niemals ein echtes Gewicht', async ({ page }) => {
    // Gleiche Sitzung: die 0-kg-Fassung ist neuer, darf die 624 kg trotzdem nicht loeschen.
    const echt = buchung({
      sitzungId: '1785500325702_gwb8',
      gebuchtKg: 624,
      letztesGewichtKg: 624,
      letzterDruck: '2026-08-03T06:27:00.000Z',
    });
    const genullt = buchung({
      sitzungId: '1785500325702_gwb8',
      gebuchtKg: 0,
      letztesGewichtKg: 0,
      letzterDruck: '2026-08-03T11:00:00.000Z',
    });

    const merged = await merge(page, [genullt], [echt]);
    expect(merged).toHaveLength(1);
    expect(merged[0].gebuchtKg).toBe(624);

    const mergedAndersrum = await merge(page, [echt], [genullt]);
    expect(mergedAndersrum).toHaveLength(1);
    expect(mergedAndersrum[0].gebuchtKg).toBe(624);

    // Auch quer ueber Altbestand und Sitzung: 0 kg mit sitzungId darf das echte
    // Gewicht des Altbestands nicht verschlucken.
    const altbestandEcht = buchung({ gebuchtKg: 624, letztesGewichtKg: 624 });
    delete altbestandEcht.sitzungId;
    const gemischt = await merge(page, [genullt], [altbestandEcht]);
    expect(gemischt).toHaveLength(1);
    expect(gemischt[0].gebuchtKg).toBe(624);
    expect(await tagesSumme(page, gemischt)).toBe(624);
  });

  test('Loeschungen im alten Format (sessionKey|datum) greifen weiter', async ({ page }) => {
    // deletedSortierBuchungen enthaelt 84 Eintraege im Format Lieferant|Sorte|Herkunft|Datum.
    // Der Loesch-Schluessel bleibt bewusst ohne sitzungId -- eine Loeschung entfernt wie
    // bisher alle Sitzungen dieses Artikels an diesem Tag.
    const delKey = SESSION_KEY + '|' + DATUM;
    expect(await page.evaluate((b) => window.sortierBuchungMergeKey(b), VORGANG_A)).toBe(delKey);

    const merged = await merge(page, [VORGANG_A], [VORGANG_B], [delKey]);
    expect(merged).toHaveLength(0);
    expect(await tagesSumme(page, [VORGANG_A, VORGANG_B], [delKey])).toBe(0);

    // Ohne Loesch-Eintrag sind beide Vorgaenge wieder da (Gegenprobe).
    const ohneLoeschung = await merge(page, [VORGANG_A], [VORGANG_B], []);
    expect(ohneLoeschung).toHaveLength(2);
  });

  test('keine Doppelzaehlung: derselbe Datenstand mehrfach zusammengefuehrt bleibt stabil', async ({ page }) => {
    // Sync laeuft mehrfach hintereinander (lokal -> Cloud -> lokal). Die Summe darf
    // dabei nicht wachsen.
    const einmal = await merge(page, [VORGANG_A, VORGANG_B], [VORGANG_A, VORGANG_B]);
    const zweimal = await merge(page, einmal, [VORGANG_A, VORGANG_B]);
    const dreimal = await merge(page, zweimal, einmal);

    expect(einmal).toHaveLength(2);
    expect(zweimal).toHaveLength(2);
    expect(dreimal).toHaveLength(2);
    expect(await tagesSumme(page, dreimal)).toBe(1072);
  });

  test('verschiedene Artikel und Tage bleiben getrennt', async ({ page }) => {
    // Absicherung, dass der neue Schluessel die uebrigen Bestandteile nicht verliert.
    const andererArtikel = buchung({
      sessionKey: LIEF + '|70730 - Koch TFB EX|' + HERKUNFT,
      sorte: '70730 - Koch TFB EX',
      sitzungId: '1785500325702_gwb8',
      gebuchtKg: 100,
      letztesGewichtKg: 100,
    });
    const andererTag = buchung({
      datum: '2026-08-04',
      sitzungId: '1785500325702_gwb8',
      gebuchtKg: 50,
      letztesGewichtKg: 50,
    });

    const merged = await merge(page, [VORGANG_A, andererArtikel, andererTag], []);
    expect(merged).toHaveLength(3);
    expect(await tagesSumme(page, merged)).toBe(724); // nur 03.08.: 624 + 100
  });
});
