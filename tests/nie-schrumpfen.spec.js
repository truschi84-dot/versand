const { test, expect } = require('@playwright/test');

/**
 * NIE-SCHRUMPFEN-REGEL
 *
 * Am 20.08.2026 waren drei am Vormittag angelegte Artikel (80392, 80396, 80397)
 * nachmittags weg. Niemand hatte sie geloescht -- ein anderes Fenster hat sein
 * aelteres Gesamtpaket in die Cloud geschrieben, und darin kamen sie nicht vor.
 *
 * Roberts Regel dazu: "Es ist Bloedsinn zu sagen, meine Version hat weniger als
 * deine, deswegen schmeiss ich die raus."
 *
 * Die Gegenprobe dazu ist genauso wichtig: am 18.08. wurde das Anhaengen aus der
 * Cloud abgeschafft, weil jeder geloeschte Noelke-Eintrag zurueckkam. Beides
 * zusammen geht nur ueber Grabsteine -- und genau das pruefen diese Tests.
 */

const CLOUD = {
    articles: [
        { fertigNr: '80100', name: 'Alter Artikel (80100)' },
        { fertigNr: '80392', name: 'Hähnchen BuChick Herta Ex (80392)', nr: '70714' },
        { fertigNr: '80396', name: 'Hähn Pap Herta Ex (80396)', nr: '70714' },
        { fertigNr: '80397', name: 'Hähn grill Herta EX (80397)', nr: '70714' }
    ],
    todo: [], lose: [], later: [], hidden: [],
    savedProdukteRaw: [
        '[Nr. 1] aro - Paprikalyoner (200g) | EAN: 4018905502358',
        '[Nr. 38] Nölke - Hähnchenmortadella (140g) | EAN: 4003171606589'
    ]
};

/** Setzt den lokalen Stand eines Fensters, das den neuen Kram NICHT kennt. */
async function alterStand(page, extra) {
    await page.evaluate((zusatz) => {
        db.articles = [{ fertigNr: '80100', name: 'Alter Artikel (80100)' }];
        db.todo = []; db.lose = []; db.later = []; db.hidden = [];
        db.savedProdukteRaw = ['[Nr. 1] aro - Paprikalyoner (200g) | EAN: 4018905502358'];
        db.deletedArticles = zusatz.deletedArticles || [];
        db.deletedNoelke = zusatz.deletedNoelke || [];
    }, extra || {});
}

async function appBereit(page) {
    await page.goto('/control/index.html');
    await expect(page.locator('#db-status')).not.toHaveText('Lade Datenbank…', { timeout: 10000 });
    expect(await page.evaluate(() => typeof holeVermissteZurueck)).toBe('function');
}

test.describe('Nie-Schrumpfen-Regel', () => {

    test('Ein Fenster mit altem Stand loescht keine Artikel, die es nur nicht kennt', async ({ page }) => {
        await appBereit(page);
        await alterStand(page);

        const nummern = await page.evaluate((cloud) => {
            holeVermissteZurueck(cloud);
            return db.articles.map(a => a.fertigNr).sort();
        }, CLOUD);

        // Genau der Fall vom 20.08.2026
        expect(nummern).toContain('80392');
        expect(nummern).toContain('80396');
        expect(nummern).toContain('80397');
    });

    test('Auch der Noelke-Katalog schrumpft nicht', async ({ page }) => {
        await appBereit(page);
        await alterStand(page);
        const zeilen = await page.evaluate((cloud) => {
            holeVermissteZurueck(cloud);
            return db.savedProdukteRaw;
        }, CLOUD);
        expect(zeilen.some(z => z.includes('4003171606589'))).toBe(true);
    });

    test('Bewusst Geloeschtes kommt NICHT zurueck — sonst waere es der Fehler vom 18.08.', async ({ page }) => {
        await appBereit(page);
        const grab = await page.evaluate(() =>
            noelkeGrabsteinKey('[Nr. 38] Nölke - Hähnchenmortadella (140g) | EAN: 4003171606589'));
        await alterStand(page, { deletedArticles: ['80392'], deletedNoelke: [grab] });

        const ergebnis = await page.evaluate((cloud) => {
            holeVermissteZurueck(cloud);
            return {
                artikel: db.articles.map(a => a.fertigNr).sort(),
                noelke: db.savedProdukteRaw
            };
        }, CLOUD);

        expect(ergebnis.artikel).not.toContain('80392');
        expect(ergebnis.noelke.some(z => z.includes('4003171606589'))).toBe(false);
        // die anderen beiden sind davon unberuehrt
        expect(ergebnis.artikel).toContain('80396');
        expect(ergebnis.artikel).toContain('80397');
    });

    test('Eine hier korrigierte Noelke-Zeile liegt danach nicht doppelt da', async ({ page }) => {
        await appBereit(page);
        const zeilen = await page.evaluate(() => {
            db.savedProdukteRaw = ['[Nr. 38] Nölke - Hähnchenmortadella (140g) | EAN: 9999999999999'];
            db.deletedNoelke = [];
            holeVermissteZurueck({ savedProdukteRaw: ['[Nr. 38] Nölke - Hähnchenmortadella (140g) | EAN: 4003171606589'] });
            return db.savedProdukteRaw;
        });
        expect(zeilen).toHaveLength(1);
        expect(zeilen[0]).toContain('9999999999999');
    });

    test('Ein Artikel im Aufgaben-Pool gilt als bekannt und kommt nicht zusaetzlich dazu', async ({ page }) => {
        await appBereit(page);
        const anzahl = await page.evaluate((cloud) => {
            db.articles = [];
            db.todo = [{ fertigNr: '80392', name: 'Hähnchen BuChick Herta Ex (80392)' }];
            db.lose = []; db.later = []; db.hidden = [];
            db.deletedArticles = []; db.deletedNoelke = [];
            holeVermissteZurueck(cloud);
            return ['articles', 'todo', 'lose', 'later', 'hidden']
                .reduce((s, k) => s + (db[k] || []).filter(a => a.fertigNr === '80392').length, 0);
        }, CLOUD);
        expect(anzahl).toBe(1);
    });

    test('Loeschen setzt einen Grabstein — sonst greift die Regel gegen den Bediener', async ({ page }) => {
        await appBereit(page);
        page.on('dialog', (d) => d.accept().catch(() => {}));
        const grabsteine = await page.evaluate(() => {
            db.lose = [{ fertigNr: '80392', name: 'Hähnchen BuChick Herta Ex (80392)' }];
            db.deletedArticles = [];
            deleteArticle('80392', 'lose');
            return db.deletedArticles;
        });
        expect(grabsteine).toContain('80392');
    });
});
