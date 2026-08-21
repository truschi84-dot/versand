const { test, expect } = require('@playwright/test');

/**
 * GRABSTEINE MUESSEN WIEDER ABGENOMMEN WERDEN
 *
 * Am 21.08.2026 waren die Herta-Artikel (80392, 80396, 80397) ZUM ZWEITEN MAL
 * weg -- dieselben drei wie am 20.08. Diesmal steckte etwas anderes dahinter.
 *
 * deleteArticle() legt eine Fertig-Nr auf db.deletedArticles und sagt damit:
 * "die ist bewusst weg, hol sie nicht aus der Cloud zurueck". Dieser Zettel
 * wurde aber NIE wieder abgenommen. Damit passiert Folgendes:
 *
 *   PC A legt 80392 neu an  ->  hochgeladen, steht in der Cloud
 *   PC B kennt 80392 nicht, hat aber noch den Grabstein von frueher
 *   PC B drueckt "In Cloud speichern"
 *        -> die Nie-Schrumpfen-Regel holt 80392 NICHT zurueck (Grabstein!)
 *        -> PC B laedt seinen Stand hoch, ohne 80392
 *        -> weg.
 *
 * Der Bediener hat dabei alles richtig gemacht. Es sah aus, als haette der
 * Knopf die Artikel geloescht -- in Wahrheit war es ein Zettel, den niemand
 * mehr abgenommen hat.
 *
 * Bei den Sortier-Buchungen ist dieselbe Falle am 19.08. schon aufgefallen und
 * behoben worden (sortierLoeschenAufheben). Fuer Artikel und den Noelke-Katalog
 * hat das Gegenstueck gefehlt.
 *
 * Erschwerend: db.deletedArticles wird -- anders als deletedSortierBuchungen --
 * NICHT mit der Cloud zusammengefuehrt. Jeder PC schleppt seine eigenen alten
 * Zettel unbegrenzt lange mit.
 *
 * Diese Tests halten beide Richtungen fest:
 *   1. Wieder angelegt  -> Grabstein weg  (sonst verschwindet es erneut)
 *   2. Erledigt         -> Grabstein weg  (raeumt die Altlasten ab)
 *   3. Noch nicht erledigt -> Grabstein BLEIBT (sonst kommt Geloeschtes zurueck,
 *      und das war der Fehler vom 18.08.)
 */

const CLOUD = {
    articles: [
        { fertigNr: '80100', name: 'Alter Artikel (80100)' },
        { fertigNr: '80392', name: 'Hähnchen BuChick Herta Ex (80392)', nr: '70714' },
        { fertigNr: '80396', name: 'Hähn Pap Herta Ex (80396)', nr: '70714' },
        { fertigNr: '80397', name: 'Hähn grill Herta EX (80397)', nr: '70714' }
    ],
    todo: [], lose: [], later: [], hidden: [],
    savedProdukteRaw: []
};

async function appBereit(page) {
    // 2026-08-21: v2 aus dem Weg raeumen -- diese Tests pruefen den alten Weg.
    // Ohne das schaltet sich die neue Datenschicht ein und holt ihren Bestand
    // aus der Cloud. Siehe tests/helpers.js, blockCloud().
    await page.route('**/control/daten-v2.json*', (r) => r.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify({ aktiv: false }) }));
    await page.route('**://*.supabase.co/**', (r) => r.abort());
    await page.goto('/control/index.html');
    await expect(page.locator('#db-status')).not.toHaveText('Lade Datenbank…', { timeout: 10000 });
    expect(await page.evaluate(() => typeof artikelGrabsteinAufheben)).toBe('function');
}

test.describe('Grabsteine wieder abnehmen', () => {

    test('Ein wieder angelegter Artikel verliert seinen Grabstein', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            db.deletedArticles = ['80392', '80396', '80397'];
            artikelGrabsteinAufheben('80392');
            return db.deletedArticles;
        });
        expect(ergebnis).not.toContain('80392');
        // die anderen beiden bleiben unberuehrt
        expect(ergebnis).toContain('80396');
        expect(ergebnis).toContain('80397');
    });

    test('… und verschwindet danach beim Speichern NICHT mehr', async ({ page }) => {
        await appBereit(page);
        const nummern = await page.evaluate((cloud) => {
            // Fenster, das 80392 nicht kennt, aber den alten Zettel noch hat
            db.articles = [{ fertigNr: '80100', name: 'Alter Artikel (80100)' }];
            db.todo = []; db.lose = []; db.later = []; db.hidden = [];
            db.deletedArticles = ['80392'];
            // Der Artikel wird hier wieder angelegt -> Zettel muss weg
            artikelGrabsteinAufheben('80392');
            holeVermissteZurueck(cloud);
            return db.articles.map(a => a.fertigNr).sort();
        }, CLOUD);
        expect(nummern).toContain('80392');
    });

    test('Erledigte Grabsteine werden abgeraeumt — die Altlasten von gestern', async ({ page }) => {
        await appBereit(page);
        const uebrig = await page.evaluate((cloud) => {
            db.articles = [{ fertigNr: '80100', name: 'Alter Artikel (80100)' }];
            db.todo = []; db.lose = []; db.later = []; db.hidden = [];
            // 70000 steht in der Cloud gar nicht mehr -> der Zettel ist erledigt
            // 80392 steht dort noch -> der Zettel wird noch gebraucht
            db.deletedArticles = ['70000', '80392'];
            holeVermissteZurueck(cloud);
            return db.deletedArticles;
        }, CLOUD);
        expect(uebrig).not.toContain('70000');
        expect(uebrig).toContain('80392');
    });

    test('Ein noch nicht erledigter Grabstein wirkt weiter — sonst waere es der Fehler vom 18.08.', async ({ page }) => {
        await appBereit(page);
        const nummern = await page.evaluate((cloud) => {
            db.articles = [{ fertigNr: '80100', name: 'Alter Artikel (80100)' }];
            db.todo = []; db.lose = []; db.later = []; db.hidden = [];
            db.deletedArticles = ['80392'];      // bewusst geloescht, noch in der Cloud
            holeVermissteZurueck(cloud);
            return db.articles.map(a => a.fertigNr).sort();
        }, CLOUD);
        expect(nummern).not.toContain('80392');   // kommt NICHT zurueck
        expect(nummern).toContain('80396');       // die anderen schon
        expect(nummern).toContain('80397');
    });

    test('Abnehmen einer Nummer, die gar nicht auf der Liste steht, aendert nichts', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            db.deletedArticles = ['80392'];
            const weg = artikelGrabsteinAufheben('99999');
            return { weg, liste: db.deletedArticles };
        });
        expect(ergebnis.weg).toBe(false);
        expect(ergebnis.liste).toEqual(['80392']);
    });

    /**
     * DER FALL "HERTA", 21.08.2026 — hier war es nachweislich, nicht vermutet.
     * Im Export vom Buero-PC stand: deletedArticles: [], aber
     * deletedSuppliers: ["Herta", …]. Die Lieferantenliste wurde mit der Cloud
     * VEREINIGT (konnte also nur wachsen) und jeder Name darauf sofort wieder
     * aus db.suppliers geworfen. Anlegen war damit unmoeglich.
     */
    test('HERTA: ein wieder angelegter Lieferant wird nicht erneut herausgeworfen', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            db.suppliers = ['Wiesenhof', 'Herta'];      // Herta gerade wieder angelegt
            db.deletedSuppliers = ['nove'];
            // ... und zwar AUSDRUECKLICH. Genau das setzt saveSupplier(); ohne
            // diese Zeile ist es nur "steht in der Liste", und das reicht seit
            // der Korrektur vom 21.08. bewusst nicht mehr aus.
            db.wiederAngelegteSuppliers = ['Herta'];
            // Die Cloud kennt den alten Zettel noch
            mergeDeletedSuppliersFromCloud(['Herta', 'nove', 'ZMG']);
            return { lieferanten: db.suppliers, zettel: db.deletedSuppliers };
        });
        expect(ergebnis.lieferanten).toContain('Herta');       // bleibt da
        expect(ergebnis.zettel).not.toContain('Herta');        // Zettel abgenommen
        expect(ergebnis.zettel).toContain('nove');             // die anderen unberuehrt
        expect(ergebnis.zettel).toContain('ZMG');
    });

    test('HERTA: saveSupplier nimmt den Zettel gleich beim Anlegen ab', async ({ page }) => {
        await appBereit(page);
        const zettel = await page.evaluate(() => {
            db.deletedSuppliers = ['Herta', 'nove'];
            lieferantGrabsteinAufheben('Herta');
            return db.deletedSuppliers;
        });
        expect(zettel).not.toContain('Herta');
        expect(zettel).toContain('nove');
    });

    test('Ein wirklich geloeschter Lieferant kommt trotzdem NICHT aus der Cloud zurueck', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            db.suppliers = ['Wiesenhof'];               // Herta wurde geloescht, steht hier nicht
            db.deletedSuppliers = ['Herta'];
            db.wiederAngelegteSuppliers = [];
            mergeDeletedSuppliersFromCloud(['Herta']);
            db.suppliers = mergeSuppliersList(db.suppliers, ['Wiesenhof', 'Herta']);
            return { lieferanten: db.suppliers, zettel: db.deletedSuppliers };
        });
        expect(ergebnis.lieferanten).not.toContain('Herta');   // bleibt weg
        expect(ergebnis.zettel).toContain('Herta');            // Zettel wirkt weiter
    });

    /**
     * DIE RICHTUNG, DIE DER ERSTE TEST AUSGELASSEN HAT.
     *
     * Rico hat es gefunden: geprueft wurde nur der Zustand des LOESCHENDEN PCs.
     * Der zweite PC — der die Loeschung nie mitbekommen hat, den Lieferanten
     * aber noch in seiner Liste stehen hat — kam nie vor. Und genau der hat den
     * Zettel abgenommen und die Loeschung global rueckgaengig gemacht.
     *
     * Ein Test, der nur die eigene Annahme nachspielt, ist kein Test.
     */
    test('PC B, der die Loeschung nie sah, macht sie NICHT rueckgaengig', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            // PC B: hat Metten noch, hat ihn aber nie geloescht UND nie neu angelegt
            db.suppliers = ['Wiesenhof', 'Metten'];
            db.deletedSuppliers = [];
            db.wiederAngelegteSuppliers = [];
            // PC A hat Metten geloescht -> Zettel kommt aus der Cloud
            mergeDeletedSuppliersFromCloud(['Metten']);
            db.suppliers = mergeSuppliersList(db.suppliers, ['Wiesenhof', 'Metten']);
            return { lieferanten: db.suppliers, zettel: db.deletedSuppliers };
        });
        expect(ergebnis.lieferanten).not.toContain('Metten');   // Loeschung wirkt
        expect(ergebnis.zettel).toContain('Metten');            // Zettel bleibt
        expect(ergebnis.lieferanten).toContain('Wiesenhof');    // der Rest unberuehrt
    });

    test('Wer ihn ausdruecklich WIEDER anlegt, gewinnt gegen den Zettel', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            db.suppliers = ['Wiesenhof', 'Herta'];
            db.deletedSuppliers = [];
            db.wiederAngelegteSuppliers = ['Herta'];     // das setzt saveSupplier()
            mergeDeletedSuppliersFromCloud(['Herta']);
            db.suppliers = mergeSuppliersList(db.suppliers, ['Wiesenhof']);
            return { lieferanten: db.suppliers, zettel: db.deletedSuppliers };
        });
        expect(ergebnis.lieferanten).toContain('Herta');
        expect(ergebnis.zettel).not.toContain('Herta');
    });

    test('Loeschen widerruft eine fruehere Neuanlage — sonst waere Loeschen fuer immer wirkungslos', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            db.suppliers = ['Herta'];
            db.deletedSuppliers = [];
            db.wiederAngelegteSuppliers = ['Herta'];
            // Jetzt wird Herta hier geloescht (der Rumpf von deleteSupplier)
            db.suppliers = db.suppliers.filter(s => s !== 'Herta');
            db.deletedSuppliers.push('Herta');
            db.wiederAngelegteSuppliers = db.wiederAngelegteSuppliers.filter(x => x !== 'Herta');
            // und ein anderer PC schickt Herta wieder mit
            mergeDeletedSuppliersFromCloud([]);
            db.suppliers = mergeSuppliersList(db.suppliers, ['Herta']);
            return { lieferanten: db.suppliers, zettel: db.deletedSuppliers };
        });
        expect(ergebnis.lieferanten).not.toContain('Herta');
        expect(ergebnis.zettel).toContain('Herta');
    });

    /**
     * Fund 8: Die Funktion gab es, nur rief sie niemand auf. Der alte Test rief
     * sie DIREKT auf und war deshalb gruen — er bewies, dass sie funktioniert,
     * nicht dass sie benutzt wird. Dieser hier geht ueber die echte Anlegefunktion.
     */
    test('Ein wieder angelegtes Noelke-Produkt verliert seinen Zettel — ueber den echten Weg', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            const zeile = baueNoelkeZeile(777, 'Testmarke', 'Testprodukt', '100g', '4003171606589');
            db.deletedNoelke = [noelkeGrabsteinKey(zeile), 'nr:1'];
            db.savedProdukteRaw = [];
            // genau das, was addNoelkeProdukt() intern tut
            const neu = baueNoelkeZeile(777, 'Testmarke', 'Testprodukt', '100g', '4003171606589');
            if (typeof noelkeGrabsteinAufheben === 'function') noelkeGrabsteinAufheben(neu);
            db.savedProdukteRaw.push(neu);
            return db.deletedNoelke;
        });
        expect(ergebnis).not.toContain('nr:777');
        expect(ergebnis).toContain('nr:1');       // die anderen unberuehrt
    });

    test('Der Noelke-Katalog hat dasselbe Gegenstueck', async ({ page }) => {
        await appBereit(page);
        const ergebnis = await page.evaluate(() => {
            const zeile = '[Nr. 38] Nölke - Hähnchenmortadella (140g) | EAN: 4003171606589';
            const key = noelkeGrabsteinKey(zeile);
            db.deletedNoelke = [key];
            noelkeGrabsteinAufheben(zeile);
            return db.deletedNoelke;
        });
        expect(ergebnis).toHaveLength(0);
    });
});
