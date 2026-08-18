// Regressionswache fuer den Leerlisten-Riegel im Cloud-PATCH (supabase_sync.js, 2026-08-18).
//
// Hintergrund: SupabaseSync.patch() schreibt die Sammelzeile "main" fort. Ein Handy, das
// gerade frisch installiert wurde (leerer Browser-Speicher, abgebrochener Download), schickt
// dabei LEERE Stammdatenlisten mit — und loeschte damit den gefuellten Cloud-Bestand fuer
// alle anderen Geraete gleich mit. entferneLeereListenGegenCloud() nimmt solche Schluessel
// aus dem Paket, bevor geschrieben wird.
//
// Zwei Dinge duerfen dabei nicht kippen und stehen deshalb hier unter Wache:
//   - Der Riegel darf nicht zu SCHARF sein: eine rechtmaessig leere Cloud (Erstbefuellung)
//     und die Loeschmerker-Listen muessen weiter durchgehen.
//   - Ein fehlgeschlagenes Cloud-LESEN darf niemals als "Cloud ist leer" durchrutschen —
//     sonst schreibt der Riegel gar nichts mehr weg, sondern winkt alles durch.
//
// Dazu die zweite Baustelle desselben Zuges: silentPushTeamDayBriefToCloud() (js/script.js).
// Ein Haken an einer Tagesaufgabe darf ausschliesslich teamDayBrief anfassen, keine Stammdaten.
const { test, expect } = require('@playwright/test');
const { blockCloud } = require('./helpers');

const HEUTE = '2026-08-18';

/** Cloud-Stand, in dem alles Geschuetzte gefuellt ist — der Fall, den der Riegel schuetzen soll. */
function gefuellteCloud() {
  return {
    suppliers: ['Nölke', 'Herta'],
    supplierLines: { 'Nölke': ['Linie 1'] },
    workers: ['Robert', 'Dominik'],
    teamSortierBuchungen: [{ key: 'b1', menge: 10 }],
    deletedSortierBuchungen: ['b0']
  };
}

/**
 * Faengt alle Cloud-Aufrufe ab (Stil wie cloud-put-schutz.spec.js): Schreibzugriffe werden
 * mitgeschnitten und bestaetigt, Lesezugriffe bekommen den uebergebenen Stand. Wird NACH
 * blockCloud() registriert und greift deshalb zuerst — blockCloud bleibt das Sicherheitsnetz,
 * damit unter keinen Umstaenden ein Aufruf an die echte Firmen-Cloud geht.
 */
async function cloudNachbau(page, leseAntwort) {
  const schreibzugriffe = [];
  await page.route('**://*.supabase.co/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (_) { /* egal */ }
      schreibzugriffe.push(body);
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    }
    return leseAntwort(route);
  });
  return schreibzugriffe;
}

/** Lesezugriff beantworten, wie PostgREST es tut: Liste mit einer Zeile bzw. leere Liste. */
function liestZeile(stand) {
  return (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(stand === null ? [] : [{ data: stand }])
  });
}

/**
 * Rechner-App laden, ohne sie anzumelden. Alle stillen Uploads (silentPush...) pruefen
 * isAppAuthenticated() — ohne Anmeldung feuert beim Seitenstart also nichts dazwischen und
 * die gezaehlten Schreibzugriffe stammen sicher aus dem Testaufruf.
 */
async function ladeRechner(page) {
  await page.goto('/index.html');
  await page.waitForFunction(
    () => typeof SupabaseSync !== 'undefined' && typeof entferneLeereListenGegenCloud === 'function',
    null,
    { timeout: 10000 }
  );
}

/** Protokollzeilen der Rechner-App (addAppCloudLog schreibt nach logistik_cloud_logs). */
function protokoll(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('logistik_cloud_logs') || '[]').map((l) => l.action).join(' | ')
  );
}

test.describe('Leerlisten-Riegel - reine Rechnung (entferneLeereListenGegenCloud)', () => {
  test.beforeEach(async ({ page }) => {
    await blockCloud(page);
    await ladeRechner(page);
  });

  /** entferneLeereListenGegenCloud ist bewusst ohne Netzzugriff gebaut und damit direkt pruefbar. */
  async function riegel(page, partial, cloud) {
    return page.evaluate(([p, c]) => entferneLeereListenGegenCloud(p, c), [partial, cloud]);
  }

  test('Gefuellte Liste gegen gefuellte Cloud: geht unveraendert durch', async ({ page }) => {
    const erg = await riegel(page, { suppliers: ['Nur Nölke'] }, gefuellteCloud());
    expect(erg.entfernt).toEqual([]);
    expect(erg.daten).toEqual({ suppliers: ['Nur Nölke'] });
  });

  test('Leere Liste gegen LEERE Cloud (Erstbefuellung): geht durch, nichts wird entfernt', async ({ page }) => {
    // Der Riegel darf die allererste Befuellung einer neuen Cloud-Zeile nicht blockieren.
    const erg = await riegel(page, { suppliers: [], workers: [] }, {});
    expect(erg.entfernt).toEqual([]);
    expect(erg.daten).toEqual({ suppliers: [], workers: [] });
  });

  test('Leeres Objekt {} bei supplierLines gegen gefuelltes Cloud-Objekt: wird entfernt', async ({ page }) => {
    // supplierLines ist ein Objekt, keine Liste — "leer" heisst hier: kein einziger Schluessel.
    const erg = await riegel(page, { supplierLines: {}, entries: [{ x: 1 }] }, gefuellteCloud());
    expect(erg.entfernt).toEqual(['supplierLines']);
    expect(erg.daten).toEqual({ entries: [{ x: 1 }] });
  });

  test('deletedSortierBuchungen leer gegen gefuellte Cloud: geht DURCH (kein Schutz)', async ({ page }) => {
    // Absichtlich ungeschuetzt: das ist eine Loeschmerker-Liste. Wuerde sie festgehalten,
    // blieben im Control Center geloeschte Sortier-Buchungen dauerhaft in der Auswertung
    // stehen — das Loeschen liesse sich nie mehr in die Cloud melden.
    const erg = await riegel(page, { deletedSortierBuchungen: [] }, gefuellteCloud());
    expect(erg.entfernt).toEqual([]);
    expect(erg.daten).toEqual({ deletedSortierBuchungen: [] });
  });

  test('teamSortierBuchungen leer gegen gefuellte Cloud: geht DURCH (kein Schutz)', async ({ page }) => {
    // Ebenfalls absichtlich ungeschuetzt. Die Tagesbuchungen werden an anderer Stelle
    // zusammengefuehrt (mergeTeamSortierBuchungen); ein Riegel hier wuerde das Loeschen
    // einer Buchung genauso festhalten wie bei deletedSortierBuchungen.
    const erg = await riegel(page, { teamSortierBuchungen: [] }, gefuellteCloud());
    expect(erg.entfernt).toEqual([]);
    expect(erg.daten).toEqual({ teamSortierBuchungen: [] });
  });

  test('null bei einem geschuetzten Schluessel gegen gefuellte Cloud: wird entfernt', async ({ page }) => {
    // null zaehlt wie "leer" — sonst wuerde ein Payload-Bauer mit "|| null" (so steht
    // teamDayBrief schon im Code) den gefuellten Cloud-Wert ueberschreiben.
    const erg = await riegel(page, { suppliers: null, entries: [{ x: 1 }] }, gefuellteCloud());
    expect(erg.entfernt).toEqual(['suppliers']);
    expect(erg.daten).toEqual({ entries: [{ x: 1 }] });
  });

  test('undefined zaehlt NICHT als leer: ein gesetzter Leerwert ist etwas anderes als ein fehlender Schluessel', async ({ page }) => {
    // Gegenprobe zum Test darueber: ein fehlender Schluessel faellt schon ueber hasOwnProperty
    // heraus. Wer undefined ausdruecklich hinschreibt, meint nicht "leere Liste".
    const erg = await page.evaluate(() =>
      entferneLeereListenGegenCloud({ suppliers: undefined }, { suppliers: ['Nölke'] })
    );
    expect(erg.entfernt).toEqual([]);
  });
});

test.describe('Leerlisten-Riegel - am echten PATCH (SupabaseSync.patch)', () => {
  test('Leere Liste gegen gefuellte Cloud: Schluessel wird entfernt und der Abbruch steht im Protokoll', async ({ page }) => {
    await blockCloud(page);
    const schreibzugriffe = await cloudNachbau(page, liestZeile(gefuellteCloud()));
    await ladeRechner(page);

    schreibzugriffe.length = 0;
    await page.evaluate(() => localStorage.removeItem('logistik_cloud_logs'));
    await page.evaluate(() => SupabaseSync.patch('main', { suppliers: [], entries: [{ nr: 1 }] }));

    // Geschrieben wird — aber ohne suppliers. Der Cloud-Bestand bleibt stehen.
    expect(schreibzugriffe.length).toBe(1);
    expect(schreibzugriffe[0].data.suppliers).toEqual(['Nölke', 'Herta']);
    expect(schreibzugriffe[0].data.entries).toEqual([{ nr: 1 }]);
    // Ohne Protokoll waere der Schutz unsichtbar und niemand merkte, wenn er zu streng ist.
    expect(await protokoll(page)).toContain('ABBRUCH: leere Liste nicht hochgeladen (suppliers)');
  });

  test('Nach dem Riegel bleibt nichts uebrig: es wird gar nicht geschrieben, aber kein falsches [OK]', async ({ page }) => {
    await blockCloud(page);
    const schreibzugriffe = await cloudNachbau(page, liestZeile(gefuellteCloud()));
    await ladeRechner(page);

    schreibzugriffe.length = 0;
    await page.evaluate(() => localStorage.removeItem('logistik_cloud_logs'));
    const res = await page.evaluate(async () => {
      const r = await SupabaseSync.patch('main', { suppliers: [], workers: [] });
      return { ok: r.ok, uebersprungen: r.uebersprungen };
    });

    expect(schreibzugriffe).toEqual([]);
    // Die Antwort sieht wie ein Erfolg aus (es ist ja nichts schiefgegangen), traegt aber den
    // Merker — nur daran erkennt der Aufrufer, dass er kein "[OK]" protokollieren darf.
    expect(res).toEqual({ ok: true, uebersprungen: true });
    expect(await protokoll(page)).toContain('ABBRUCH: leere Liste nicht hochgeladen (suppliers, workers)');
  });

  test('Merker uebersprungen kommt durch supabaseCloudFetch beim Aufrufer an', async ({ page }) => {
    // Der App-Code ruft nie SupabaseSync.patch direkt, sondern cloudFetch(...PATCH...).
    // Ginge der Merker auf dem Weg verloren, protokollierte silentPushRechnerStammdatenToCloud()
    // den Abbruch als erfolgreichen Upload.
    await blockCloud(page);
    await cloudNachbau(page, liestZeile(gefuellteCloud()));
    await ladeRechner(page);

    const res = await page.evaluate(async () => {
      const r = await cloudFetch(APP_CONFIG.CLOUD_URL + '.json', {
        method: 'PATCH',
        body: JSON.stringify({ suppliers: [] }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { ok: r.ok, uebersprungen: r.uebersprungen };
    });
    expect(res).toEqual({ ok: true, uebersprungen: true });
  });

  for (const status of [401, 500]) {
    test(`Cloud-Lesen scheitert (HTTP ${status}): es geht KEIN Schreibzugriff raus`, async ({ page }) => {
      // Der wichtigste Test der Datei: ein Lesefehler darf nicht als "Cloud ist leer"
      // durchgehen. Sonst faende der Riegel nichts zu schuetzen und winkte genau in der Lage
      // alles durch, fuer die er gebaut wurde (401 = Schluesselwechsel beim Serverumzug).
      await blockCloud(page);
      const schreibzugriffe = await cloudNachbau(page, (route) =>
        route.fulfill({ status, contentType: 'application/json', body: '{"message":"Fehler"}' })
      );
      await ladeRechner(page);

      schreibzugriffe.length = 0;
      const fehler = await page.evaluate(async () => {
        try {
          await SupabaseSync.patch('main', { suppliers: [], entries: [{ nr: 1 }] });
          return null;
        } catch (e) { return (e && e.message) || 'Fehler ohne Text'; }
      });

      expect(schreibzugriffe).toEqual([]);
      // Der Abbruch ist ein Fehler, kein stilles Nichts — der Aufrufer muss ihn melden koennen.
      expect(fehler).not.toBeNull();
    });
  }
});

test.describe('Tagesaufgaben-Haken hochladen (silentPushTeamDayBriefToCloud)', () => {
  /**
   * Meldet die App an und schneidet mit, was an SupabaseSync.patch uebergeben wird. Erst
   * dadurch ist pruefbar, WELCHE Schluessel im Paket stecken — die spaeter geschriebene
   * Zeile enthaelt immer den ganzen zusammengefuehrten Stand und verraet das nicht mehr.
   * Der Mitschnitt reicht durch, das Verhalten aendert sich nicht.
   */
  async function ruestePatchMitschnitt(page) {
    await page.evaluate(() => {
      localStorage.setItem('app_authenticated', 'true');
      window.__patchPakete = [];
      const echt = SupabaseSync.patch.bind(SupabaseSync);
      SupabaseSync.patch = (key, partial) => {
        window.__patchPakete.push({ key, partial });
        return echt(key, partial);
      };
    });
  }

  async function setzeLokalesBriefing(page, brief) {
    await page.evaluate((b) => {
      const lDb = AppStorage.get('kombi_logistik_db', {});
      lDb.teamDayBrief = b;
      AppStorage.set('kombi_logistik_db', lDb);
    }, brief);
  }

  function patchPakete(page) {
    return page.evaluate(() => window.__patchPakete);
  }

  test('Datum stimmt ueberein: das Paket enthaelt ausschliesslich teamDayBrief', async ({ page }) => {
    // Vorher lief das ueber triggerAutoSync('logistik') und damit ueber das volle
    // Logistik-Payload — ein Haken an einer Tagesaufgabe schrieb 25 Felder Stammdaten mit.
    await blockCloud(page);
    const cloudStand = {
      ...gefuellteCloud(),
      teamDayBrief: { date: HEUTE, tasks: [{ id: 't1', text: 'Rampe fegen', done: false }] }
    };
    const schreibzugriffe = await cloudNachbau(page, liestZeile(cloudStand));
    await ladeRechner(page);
    await ruestePatchMitschnitt(page);
    await setzeLokalesBriefing(page, { date: HEUTE, tasks: [{ id: 't1', text: 'Rampe fegen', done: true }] });

    schreibzugriffe.length = 0;
    await page.evaluate(() => silentPushTeamDayBriefToCloud());

    const pakete = await patchPakete(page);
    expect(pakete.length).toBe(1);
    expect(Object.keys(pakete[0].partial)).toEqual(['teamDayBrief']);
    // Gegenprobe an der geschriebenen Zeile: die Stammdaten stehen unveraendert da.
    expect(schreibzugriffe.length).toBe(1);
    expect(schreibzugriffe[0].data.suppliers).toEqual(['Nölke', 'Herta']);
    expect(schreibzugriffe[0].data.workers).toEqual(['Robert', 'Dominik']);
  });

  test('Aufgaben-Texte kommen aus der Cloud, nur der Haken vom Handy', async ({ page }) => {
    // Das Buero schreibt die Aufgaben. Ein Handy mit veraltetem Text darf ihn nicht
    // zurueckschreiben — uebernommen wird je Aufgabe (Zuordnung ueber id) nur done.
    await blockCloud(page);
    const cloudStand = {
      teamDayBrief: {
        date: HEUTE,
        tasks: [
          { id: 't1', text: 'Rampe fegen (neu formuliert)', done: false },
          { id: 't2', text: 'Kisten zaehlen', done: false }
        ]
      }
    };
    await cloudNachbau(page, liestZeile(cloudStand));
    await ladeRechner(page);
    await ruestePatchMitschnitt(page);
    await setzeLokalesBriefing(page, {
      date: HEUTE,
      tasks: [{ id: 't1', text: 'Rampe fegen (alter Wortlaut vom Handy)', done: true }]
    });

    await page.evaluate(() => silentPushTeamDayBriefToCloud());

    const pakete = await patchPakete(page);
    expect(pakete.length).toBe(1);
    expect(pakete[0].partial.teamDayBrief.tasks).toEqual([
      { id: 't1', text: 'Rampe fegen (neu formuliert)', done: true },
      { id: 't2', text: 'Kisten zaehlen', done: false }
    ]);
  });

  test('Anderes Datum in der Cloud: gar kein Upload', async ({ page }) => {
    // Das Buero hat laengst ein neues Briefing gesetzt — unsere Haken gehoeren zu einer
    // anderen Liste und wuerden fremde Aufgaben abhaken.
    await blockCloud(page);
    const schreibzugriffe = await cloudNachbau(page, liestZeile({
      teamDayBrief: { date: '2026-08-19', tasks: [{ id: 't1', text: 'Neuer Tag', done: false }] }
    }));
    await ladeRechner(page);
    await ruestePatchMitschnitt(page);
    await setzeLokalesBriefing(page, { date: HEUTE, tasks: [{ id: 't1', text: 'Alter Tag', done: true }] });

    schreibzugriffe.length = 0;
    await page.evaluate(() => silentPushTeamDayBriefToCloud());

    expect(await patchPakete(page)).toEqual([]);
    expect(schreibzugriffe).toEqual([]);
    expect(await protokoll(page)).toContain('anderes Datum in der Cloud');
  });

  test('teamDayBrief fehlt in der Cloud oder ist null: gar kein Upload', async ({ page }) => {
    await blockCloud(page);
    const schreibzugriffe = await cloudNachbau(page, liestZeile({ suppliers: ['Nölke'], teamDayBrief: null }));
    await ladeRechner(page);
    await ruestePatchMitschnitt(page);
    await setzeLokalesBriefing(page, { date: HEUTE, tasks: [{ id: 't1', text: 'Rampe fegen', done: true }] });

    schreibzugriffe.length = 0;
    await page.evaluate(() => silentPushTeamDayBriefToCloud());

    expect(await patchPakete(page)).toEqual([]);
    expect(schreibzugriffe).toEqual([]);
  });
});
