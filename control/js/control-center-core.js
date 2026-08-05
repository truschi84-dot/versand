let isAdminUnlocked = true;
let pendingTabId = null;
let pendingTabElement = null;
let assignMode = 'sup';
let assignSelectedTarget = null;
let adminEditingDeliveryId = null;
let qmData = [];
function sanitizeCloudUrl(url) {
    const u = (url || '').trim();
    if (!u || /deine-datenbank/i.test(u) || /supabase-standard/i.test(u)) return '';
    return u;
}
function getEffectiveCloudUrl() {
    return sanitizeCloudUrl(localStorage.getItem('custom_cloud_url') || '');
}
let CLOUD_URL = getEffectiveCloudUrl();

// 2026-08-05: CLOUD_URL ist im Normalfall ein leerer String. Das bisherige
// CLOUD_URL.replace('/backup', '/archive') lief damit ins Leere ('' bleibt ''),
// und supabaseCloudFetch ordnete Archiv, Snapshot und Reklamationen dem
// Hauptdatensatz 'main' zu -> Daten wurden ueberschrieben. Diese Funktion baut
// den Pfad immer selbst, damit die Regex-Kette in supabaseCloudFetch greift.
function cloudTargetUrl(target, subKey) {
    const base = (CLOUD_URL || '').replace(/\/+$/, '');
    const paths = {
        backup: '/backup',              // trifft kein Muster -> Datensatz 'main'
        archive: '/archive',            // trifft /\/archive/i
        snapshot: '/snapshot',          // trifft /\/snapshot/i
        reklamationen: '/reklamationen' // trifft /reklamation/i
    };
    const path = paths[target];
    if (!path) throw new Error("Unbekanntes Cloud-Ziel: " + target);
    return base + path + (subKey ? '/' + subKey : '');
}

/** Fallback nur falls noch keine Settings aus Supabase geladen wurden — echte PIN kommt aus den Cloud-Settings. */
const DEFAULT_ADMIN_PIN = "0000";

const rawData = [
    {id:"20100", name:"Katenschinken ger. Verschn."}, {id:"20101", name:"Kräuterlachsschinken Verschn."}, {id:"20102", name:"Lachsschinken Natur Verschn."}, {id:"20103", name:"Lachsschinken Grav Art Verschn"}, {id:"20104", name:"Serrano Ver mit Interliver"}, {id:"20105", name:"Schwarzwälder Schinken Verschn"}, {id:"20106", name:"Südtiroler Alpenspeck Verschn."}, {id:"20107", name:"Serrano Schinken Kappen"}, {id:"20108", name:"Serrano Schinken Wickelpack90g"}, {id:"20109", name:"Bel. Rohschinken luft Versch"},
    {id:"20110", name:"Ital Rohschinken ca. 300g Vers"}, {id:"20111", name:"Bacon Würfel"}, {id:"20112", name:"Katenschinken luft Verschn."}, {id:"20113", name:"Pariser Lachsschinken Verschn"}, {id:"20114", name:"Bauernschinken Würfel"}, {id:"20115", name:"Bacon geräuchert Verschn."}, {id:"20116", name:"Eierspeck SB Bacon"}, {id:"20117", name:"Serrano Schinken ca.300g"}, {id:"20118", name:"Bel. Rohschinken ger Verschnitt"}, {id:"20119", name:"Edellachsschinken Verschn."},
    {id:"20120", name:"Edellachsschinken Kappen"}, {id:"20121", name:"Putenschinken luft Kappen"}, {id:"20122", name:"Putenschinken luft Verschn."}, {id:"20123", name:"Serrano-Schinken 100 g Atmos"}, {id:"20124", name:"Rohschinken mild geräuchert"}, {id:"20125", name:"Wildschweinschinken Verschnitt"}, {id:"20126", name:"Lachs Graved Pfeffer Verschnit"}, {id:"20127", name:"Bauernschinken ger"}, {id:"20128", name:"Westf. Edel-Rohschinken ger"}, {id:"20129", name:"Puten Lachsfleisch Verschn."},
    {id:"20130", name:"Serrano Schinken 1/2 Blöcke"}, {id:"20131", name:"Westf Edel-Rohschinken luft"}, {id:"20132", name:"Schinken Nuss"}, {id:"20133", name:"Bauernschinken luft"}, {id:"20134", name:"Knochenschinken luft"}, {id:"20135", name:"Knochenschinken geräuchert"}, {id:"20136", name:"Schwarzwälder Schinken ca. 300g"}, {id:"20137", name:"Magerschinken 3% Fett"}, {id:"20138", name:"Ital Rohschinken ungl Scheiben"}, {id:"20139", name:"Lachsschinken Kappen"},
    {id:"20140", name:"Tiroler Bergschinken ung Schei"}, {id:"20141", name:"Bauernschinken ger Kappen"}, {id:"20142", name:"Schwarzwälder Kappen"}, {id:"20143", name:"Putenlachsschinken Kappen"}, {id:"20144", name:"Entenbrust Versch & Kappen"}, {id:"20145", name:"Gänsebrust Versch & Kappen"}, {id:"20146", name:"Spanisches-Sortiment"}, {id:"20147", name:"Italienisches-Sortiment"}, {id:"20148", name:"Gewürzschinken ungl"}, {id:"20149", name:"Bauernschinken End luft"},
    {id:"20501", name:"Fetter Speck mit Kräuter"}, {id:"20502", name:"Fetter Speck geräuchert"}, {id:"20503", name:"Fetter Speck mit Paprika"}, {id:"20504", name:"Fetter Speck mit Knoblauch"}, {id:"20505", name:"Aspik Sortiment Verschn."}, {id:"20506", name:"Aspik Sortiment Kappen"}, {id:"20507", name:"Hausmacher Sülze Stück"}, {id:"20508", name:"Schinkenröllchen Meerrett Vers"}, {id:"20509", name:"Hausmacher Leberwurst 200g"}, {id:"20510", name:"Zwiebelmettwurst gekocht 200g"},
    {id:"20511", name:"Corned Beef Verschnitt"}, {id:"20512", name:"Bauernfrühstück ungl Scheiben"}, {id:"20513", name:"Hausmacher Wurstebrei"}, {id:"20514", name:"Leberwurst zum braten Scheiben"}, {id:"20515", name:"Blutwurst zum braten Scheiben"}, {id:"20516", name:"Zungenwurst ungl Scheiben"}, {id:"20517", name:"Blutwurst ungl Scheiben"}, {id:"20518", name:"Fetter Speck Abschnitte ger B"}, {id:"20519", name:"Corned Turkey ungl Scheiben"}, {id:"20520", name:"Bauernfrühstück Kappen"},
    {id:"20521", name:"Corned Beef End"}, {id:"20522", name:"Zungenwurst End"}, {id:"20523", name:"Blutwurst End"}, {id:"20524", name:"Kräuterlachs Kappen"}, {id:"20525", name:"Schweinezunge Ver"}, {id:"20526", name:"Schweinezunge Kap"}, {id:"20527", name:"Serrano Ver ohne Interliver"}, {id:"30100", name:"Kasseler Verschn."}, {id:"30101", name:"Gewürzbraten Kappen"}, {id:"30102", name:"Kochschinken Kappen"},
    {id:"30103", name:"Kochschinken Verschn."}, {id:"30104", name:"Geflügel Ansch/Kapp sortiert"}, {id:"30105", name:"Schinkenbraten Verschn."}, {id:"30106", name:"Gewürzbraten Natur 100g"}, {id:"30107", name:"Kasseler Kappen"}, {id:"30108", name:"Spanferkelbraten Verschn."}, {id:"30109", name:"Spanferkelbraten Kappen"}, {id:"30110", name:"Schinkenbraten Kappen"}, {id:"30111", name:"Schweinebraten Verschn."}, {id:"30112", name:"Schweinebraten Kappen"},
    {id:"30113", name:"Krustenbraten Verschn."}, {id:"30114", name:"Pastirma Verschn."}, {id:"30115", name:"Krustenbraten Kappen"}, {id:"30116", name:"Gewürzbraten Verschn."}, {id:"30117", name:"Kasseler vom Kotelett Kappen"}, {id:"30118", name:"Katenbauch Verschn."}, {id:"30119", name:"Leberkäse fein Verschn."}, {id:"30120", name:"Bockwurst im Naturdarm"}, {id:"30121", name:"Wiener Würstchen"}, {id:"30122", name:"Leberkåse grob Verschn."},
    {id:"30123", name:"Brühwurst Sch Atmos Verschn"}, {id:"30124", name:"Aufschnitt Sortiment Verschn."}, {id:"30125", name:"Leberkäse fein Kappen"}, {id:"30126", name:"Brühwurst Geflügel Ver Atmos"}, {id:"30127", name:"Nürnberger Rostbratwürstchen"}, {id:"30128", name:"Leberkäse grob Kappen"}, {id:"30129", name:"Wiener Mini Geflügel VAC"}, {id:"30130", name:"Wiener Mini Schwein VAC"}, {id:"30131", name:"Rinder-Saftfleisch Verschn."}, {id:"30132", name:"Rinder-Saftfleisch Kappen"},
    {id:"30133", name:"Putenbrust Kappen"}, {id:"30134", name:"Hähnchenbrust-Stücke gebraten"}, {id:"30135", name:"Hähnchenbrust gegart Verschn."}, {id:"30136", name:"Putenbrust Verschn."}, {id:"30137", name:"Hähnchenbrust Kappen"}, {id:"30138", name:"Hähnchengrillbrust Verschn."}, {id:"30139", name:"Kasseler Nacken, Verschnitt"}, {id:"30140", name:"Kasseler-Nacken Stücke"}, {id:"30141", name:"Kasseler Lachsbraten"}, {id:"30142", name:"Kasseler Minutensteaks"},
    {id:"30143", name:"Wiener Geflügel unsortiert"}, {id:"30144", name:"Kochschinken 200g England"}, {id:"30145", name:"Fleischwurst"}, {id:"30146", name:"Roast Chicken ungl. Scheiben"}, {id:"30147", name:"Roast Turkey ungl. Scheiben"}, {id:"30148", name:"Rinder Pastrami Verschnitte"}, {id:"30149", name:"Rinder Pastrami Endstücke"}, {id:"30150", name:"Spanferkelpastete ung Scheiben"}, {id:"30151", name:"Spanferkelpastete Kappen"}, {id:"30152", name:"Geflügelfilet Roulade"},
    {id:"30153", name:"Pastirma Kappen"}, {id:"30154", name:"Krustenbauch Verschnitt"}, {id:"30155", name:"Kochschinken Sch ungl Vac"}, {id:"30156", name:"Leberkåse Gefl ungl Scheiben"}, {id:"30157", name:"Leberkåse Geflügel End."}, {id:"30158", name:"Brühwurst-Pastete"}, {id:"30159", name:"Frischwurst Ansch/Kap sortiert"}, {id:"30160", name:"Leberrolle ungl Scheiben"}, {id:"30161", name:"Wiener Mini Käåse/Pap ungl"}, {id:"30162", name:"Rindswürstchen ungl"},
    {id:"30163", name:"Katenbauch Kappen"}, {id:"30164", name:"Krustenbauch Kappen"}, {id:"30165", name:"Gänsebrust geback Verschnitt"}, {id:"30166", name:"Entenbrust geback Verschnitt"}, {id:"30167", name:"Backhendl Verschnitt"}, {id:"30168", name:"Entenbrust geb Kappen"}, {id:"30169", name:"Gänsebrust geb Kappen"}, {id:"30170", name:"Mini Wiener Mix Spanien"}, {id:"30171", name:"Kochschinken Sch Ribo"}, {id:"30172", name:"Kochschinken Dienstleistung"},
    {id:"30173", name:"Käse-Krainer"}, {id:"30174", name:"Backhendl End"}, {id:"30175", name:"Kochschinken End Ribo"}, {id:"30176", name:"Putenbrust ungl Sch Spanien"}, {id:"30177", name:"Debreziner"}, {id:"30178", name:"Wiener mit Käse"}, {id:"30179", name:"Roast Chicken Eck"}, {id:"30180", name:"Roast Turky End"}, {id:"30181", name:"Schinkenbraten am Stück"}, {id:"30182", name:"Grill-Bauernschinken"},
    {id:"40100", name:"Bio Salami"}, {id:"50096", name:"Pfefferbeißer Kugeln"}, {id:"50097", name:"Salami Peitschen geraucht"}, {id:"50098", name:"Salami Pur Porc"}, {id:"50099", name:"Salami Kugeln"}, {id:"50100", name:"Pfefferbeiser"}, {id:"50101", name:"Snack Salami 250g"}, {id:"50102", name:"Elbwürmer Pfferbeiser Art"}, {id:"50103", name:"Salami diverse Sorten"}, {id:"50104", name:"Mettwurst Verschn."},
    {id:"50105", name:"Salami Kappen 500g"}, {id:"50106", name:"Salami Verschn."}, {id:"50107", name:"Salami Verschn. Vac"}, {id:"50108", name:"Mettenden geräuchert"}, {id:"50109", name:"Edelsalami Verschn."}, {id:"50110", name:"Salami Sticks"}, {id:"50111", name:"Salchichon Fuet 175g"}, {id:"50112", name:"Rostbratwurst Schwein 5/100g"}, {id:"50113", name:"Rostbratwurst Geflügel 5/100g"}, {id:"50114", name:"Hähnchenfilet Curry"},
    {id:"50115", name:"Hähnchenfilet Paprika"}, {id:"50116", name:"Nackensteaks Paprika"}, {id:"50117", name:"Nackensteaks Kräuter"}, {id:"50118", name:"Rückensteaks Paprika"}, {id:"50119", name:"Rückensteaks Kräuter"}, {id:"50120", name:"Spare Ribs Texas"}, {id:"50121", name:"Bauchscheiben Texas"}, {id:"50122", name:"Grillfackeln"}, {id:"50123", name:"Nackensteaks"}, {id:"50124", name:"Kotelett-Anschnitte"},
    {id:"50125", name:"Bauch Anschnitte"}, {id:"50126", name:"Rostbratwurst divers"}, {id:"50127", name:"Suzcuk 240 g"}, {id:"50128", name:"Mini Kabanossi"}, {id:"50129", name:"Salami Endstücke Verarbeitung"}, {id:"50130", name:"Salami Sortenrein"}, {id:"50131", name:"Salami Gef/Rind Schei/Kap"}, {id:"50132", name:"Edelsalami am Stück"}, {id:"50133", name:"Grillfleisch Rind TK"}, {id:"50134", name:"Grillfleisch Rind"},
    {id:"50135", name:"Fingerfood TK"}, {id:"50136", name:"Weißwurst ungleich"}, {id:"50137", name:"Hähnchenbrust Kräuter"}, {id:"50138", name:"Nackensteaks Holzfäller"}, {id:"50139", name:"Nackensteaks Gyros"}, {id:"50140", name:"Nackensteaks Zagreb"}, {id:"50141", name:"Hähnchenoberkeulensteaks Pap"}, {id:"50142", name:"Hähnchenoberkeulensteaks"}, {id:"50143", name:"Hähnchenoberkeulensteaks"}, {id:"50144", name:"Hähnchen Minifackel rot"},
    {id:"50145", name:"Hähnchen Minifackeln gelb"}, {id:"50146", name:"Puten Minifackeln rot"}, {id:"50147", name:"Puten Minifackeln gelb"}, {id:"50148", name:"Puten Brustspieße"}, {id:"50149", name:"Krakauer Schwein"}, {id:"50150", name:"Krakauer mit Käse Schwein"}, {id:"50151", name:"Weißkraut mit Dill"}, {id:"50152", name:"Farmer Salat"}, {id:"50153", name:"Gurkensalat"}, {id:"50154", name:"Bohnen Salat"},
    {id:"50155", name:"Weißkraut Natur"}, {id:"50156", name:"Kartoffelsalat"}, {id:"50157", name:"Tortelini Mandarinen Salat"}, {id:"50158", name:"Kohlrabi Gurken Salat"}, {id:"50159", name:"Coleshaw Salat"}, {id:"50160", name:"Nudelsalat"}, {id:"50161", name:"Tyrolini"}, {id:"50162", name:"Salami am Stück Z"}, {id:"50163", name:"Chorizo zum Grillen u Braten"}, {id:"50164", name:"Stracke"},
    {id:"50165", name:"Bratwurstschnecken"}, {id:"50166", name:"Pur Porc"}, {id:"50167", name:"Kabanossi ungl"}, {id:"50168", name:"Glas-Ware 200g"}, {id:"50169", name:"Salami am Stück R"}, {id:"50170", name:"Kaminwurzen Rohw. gemischt"}, {id:"50171", name:"Salami Scheiben ungl Sopo"}, {id:"50172", name:"Salami Scheiben Schwein Sopo"}, {id:"50173", name:"Nacken mariniert"}, {id:"50174", name:"Rücken mariniert"},
    {id:"50175", name:"Hüfte mariniert"}, {id:"50176", name:"Bauch mariniert"}, {id:"50500", name:"Puten Oberkeule Hahn SB"}, {id:"50501", name:"Puten Unterkeule Hahn Vac"}, {id:"50502", name:"Puten Flügel Hahn Vac"}, {id:"50503", name:"Puten Hålse Hahn Vac"}, {id:"50504", name:"Puten Herzen Vac"}, {id:"50505", name:"Puten Magen Vac"}, {id:"50506", name:"Puten Leber Vac"}, {id:"50507", name:"Frischfleisch vom Schwein"},
    {id:"50508", name:"Frischfleisch vom Rind"}, {id:"70400", name:"Sonderproduktion kg"}, {id:"70401", name:"Sonderposten Pack groß"}, {id:"70402", name:"Zimbo kurz MHD"}, {id:"70403", name:"Zimbo lang MHD"}, {id:"70404", name:"Discount kurz MHD"}, {id:"70405", name:"Discount lang MHD"}, {id:"70406", name:"Sonderposten ohne MwSt"}, {id:"70407", name:"Sonderposten 19%"}, {id:"70500", name:"Sonderproduktion Stück"},
    {id:"70561", name:"Bacon Endstücke lose"}, {id:"70562", name:"Leberrolle Scheiben lose"}, {id:"70563", name:"Entenbrust gebacken Schei lose"}, {id:"70564", name:"Gänsebrust gebacken Schei lose"}, {id:"70565", name:"Lachsschinken Kappen lose"}, {id:"70566", name:"Kochschinken Dienstl lose"}, {id:"70590", name:"Salami Sticks lose"}, {id:"70602", name:"Wiener Mini Käse/Pap lose"}, {id:"70603", name:"Krustenbauch End lose"}, {id:"70613", name:"Schinkenbraten Scheiben lose"},
    {id:"70620", name:"Rohschinken Bel. luft Sch lose"}, {id:"70642", name:"Leberkäse Mini fein Schei lose"}, {id:"70643", name:"Brühwurst Kappen lose"}, {id:"70700", name:"Salami Scheiben lose"}, {id:"70701", name:"Kasseler Scheiben lose"}, {id:"70702", name:"Kräuterlachsschinken Scheiben"}, {id:"70703", name:"Pfefferbeisser lose"}, {id:"70704", name:"Pastirma Scheiben lose"}, {id:"70705", name:"Katenbauch End lose"}, {id:"70706", name:"Serrano Endkappen lose"},
    {id:"70707", name:"Hähnchenbrust End gebraten los"}, {id:"70708", name:"Schinkenröllchen Scheiben lose"}, {id:"70709", name:"Putenbrust Scheiben lose"}, {id:"70710", name:"Lachsschinken Natur lose"}, {id:"70711", name:"Katenschinken luft Schei lose"}, {id:"70712", name:"Schweinebraten Scheiben lose"}, {id:"70714", name:"Hähnchenbrust Scheiben lose"}, {id:"70715", name:"Gewürzbraten Ecken lose"}, {id:"70716", name:"Gewürzbraten Scheiben lose"}, {id:"70717", name:"Wiener Würstchen lose"},
    {id:"70718", name:"Bratwurst Schwein lose"}, {id:"70719", name:"Katenbauch Sch lose"}, {id:"70721", name:"Serrano mit Interliver lose"}, {id:"70722", name:"Putenbrust Ecken lose"}, {id:"70723", name:"Hähnchenbrust Ecken lose"}, {id:"70724", name:"Schweinebraten Eck lose"}, {id:"70725", name:"Schinkenbraten Ecken lose"}, {id:"70726", name:"Krustenbraten Scheiben lose"}, {id:"70727", name:"Krustenbraten Ecken lose"}, {id:"70728", name:"Brühwurst Gefl lose"},
    {id:"70729", name:"Brühwurst Schwein Schei lose"}, {id:"70730", name:"Kochschinken Scheiben lose"}, {id:"70731", name:"Kochschinken Ecken lose"}, {id:"70732", name:"Leberkåse fein Schei lose"}, {id:"70733", name:"Leberkåse fein Ecken lose"}, {id:"70734", name:"Leberkåse grob Schei lose"}, {id:"70735", name:"Leberkåse grob Ecken lose"}, {id:"70736", name:"Salami Ecken lose"}, {id:"70737", name:"Bacon Scheiben lose"}, {id:"70738", name:"Kasseler Ecken lose"},
    {id:"70739", name:"Wiener Gefl lose"}, {id:"70740", name:"Weißwurst lose"}, {id:"70741", name:"Bratwurst Gefl lose"}, {id:"70743", name:"Leberkåse Mini grob Schei lose"}, {id:"70744", name:"Edellachs scheiben lose"}, {id:"70745", name:"Salami Sticks lose"}, {id:"70746", name:"Kasseler-End Kotelett lose"}, {id:"70747", name:"Emswürmer lose"}, {id:"70748", name:"Mettenden geraucht lose"}, {id:"70749", name:"Nürnberger Rostbratwurst lose"},
    {id:"70750", name:"Wiener Mini Gefl lose"}, {id:"70751", name:"Wiener Mini Schwein lose"}, {id:"70752", name:"Putenlachs End lose"}, {id:"70753", name:"Kochschinken W Sch Export"}, {id:"70754", name:"Bockwurst lose"}, {id:"70755", name:"Spanferkelbraten Scheiben lose"}, {id:"70756", name:"Spanferkelbraten Ecken lose"}, {id:"70757", name:"Hähnchengrillbrust Schei lose"}, {id:"70758", name:"Rindswürstchen lose"}, {id:"70759", name:"Rinder-Saftfleisch Scheib lose"},
    {id:"70760", name:"Rinder-Saftfleisch Ecken lose"}, {id:"70761", name:"Edellachs End lose"}, {id:"70762", name:"Edelsalami Scheiben lose"}, {id:"70763", name:"Rohschinken Bel. ger lose"}, {id:"70764", name:"Kasseler Kotelett lose"}, {id:"70765", name:"Kasseler-Nacken lose"}, {id:"70766", name:"Lachsbraten lose"}, {id:"70767", name:"Kasseler Minutensteaks lose"}, {id:"70768", name:"Schwarzwälder Schinken lose"}, {id:"70769", name:"Wildschweinschinken lose"},
    {id:"70770", name:"Grillfackeln lose"}, {id:"70771", name:"Bauernschinken ger lose"}, {id:"70772", name:"Putenschinken luft lose E2"}, {id:"70773", name:"Puten Lachsfleisch"}, {id:"70774", name:"Mini Kabanossi lose"}, {id:"70775", name:"Fleischwurst im Ring lose"}, {id:"70776", name:"Magerschinken"}, {id:"70777", name:"Roast Chicken Scheiben lose"}, {id:"70778", name:"Roast Turkey Scheiben lose"}, {id:"70779", name:"Rinder-Pastrami Schei lose"},
    {id:"70780", name:"Rinder Pastrami End lose"}, {id:"70781", name:"Bauernschinken luft lose"}, {id:"70782", name:"Schwarzwälder End lose"}, {id:"70783", name:"Corned Beef"}, {id:"70784", name:"Bauch Anschnitte lose"}, {id:"70785", name:"Aspik Scheiben lose"}, {id:"70786", name:"Bauernfrühstück Scheiben lose"}, {id:"70787", name:"Spanferkelpastete Schei lose"}, {id:"70788", name:"Spanferkelpastete Kap lose"}, {id:"70789", name:"Mettwurst lose E2"},
    {id:"70790", name:"Salami Gef/Rind Sch/Kap Bille"}, {id:"70791", name:"Backhendl Scheiben lose"}, {id:"70792", name:"Geflügelfilet Rou Schei lose"}, {id:"70793", name:"Pastirma Kappen lose"}, {id:"70794", name:"Grillfleisch Schwein lose"}, {id:"70795", name:"Grillfleisch Rind lose"}, {id:"70796", name:"Frischfleisch Schwein lose"}, {id:"70797", name:"Frischfleisch Rind lose"}, {id:"70798", name:"Entenbrust geb Kappen lose"}, {id:"70799", name:"Salami Scheiben Export lose"},
    {id:"70800", name:"Brötchen zum aufbacken lose"}, {id:"70801", name:"Gänsebrust geb Kappen lose"}, {id:"70802", name:"Bratwurstschnecke lose"}, {id:"70803", name:"Kochschinken Könecke 3 lose"}, {id:"70804", name:"Kochschinken Könecke 4 lose"}, {id:"70805", name:"Krustenbraten lose Könecke 5"}, {id:"70806", name:"Putenbrust Scheiben Exp lose"}, {id:"70807", name:"Hähnchenbrust Sch Exp lose"}, {id:"70808", name:"Schweinebraten Sch Exp lose"}, {id:"70809", name:"Hähnchenbrust End Exp lose"},
    {id:"70810", name:"Putenbrust End Exp lose"}, {id:"70811", name:"Krustenbauch lose"}, {id:"70812", name:"Geflügelfilet-Roul End"}, {id:"70813", name:"Kochschinken Sch Mett Ex lose"}, {id:"70814", name:"Kochschinken End Mett Exp lose"}, {id:"70815", name:"Kochsch Kräuter Köneke lose Ex"}, {id:"70816", name:"Kochsch Sch Pfeffer Köneke Ex"}, {id:"70817", name:"Blutwurst Scheiben lose"}, {id:"70818", name:"Zungenwurst Scheiben lose"}, {id:"70819", name:"Aspik Kappen"},
    {id:"70820", name:"Hähnchen Kräuter Sch Nölke los"}, {id:"70821", name:"Hähnchen Pap Sch Nölke lose"}, {id:"70822", name:"Roast Turkey End lose"}, {id:"70823", name:"Roast Chicken End lose"}, {id:"70824", name:"Tiroler Bergschinken lose"}, {id:"70825", name:"Rohschinken End/Würfel lose"}, {id:"70826", name:"Leberkåse Gef Sch lose"}, {id:"70827", name:"Leberkåse Gefl End lose"}, {id:"70828", name:"Corned Turkey Scheiben lose"}, {id:"70829", name:"Brühwurst Pastete lose"},
    {id:"70830", name:"Bauernfrühstück Kappen lose"}, {id:"70831", name:"Salami Kugeln lose"}, {id:"70832", name:"Bauernschinken Kappen lose"}, {id:"70833", name:"Backhendl End lose"}, {id:"70834", name:"Pur Porc lose"}, {id:"70835", name:"Blutwurst End lose"}, {id:"70836", name:"Zungenwurst End lose"}, {id:"70837", name:"Corned Beef End lose"}, {id:"70838", name:"Käse End lose"}, {id:"70839", name:"Käse Scheiben lose"},
    {id:"70840", name:"Gewürzschinken lose"}, {id:"70842", name:"Lachsschinken Grav Pf lose"}, {id:"70844", name:"Nuss- Schinken lose"}, {id:"70845", name:"Entenbrust lose"}, {id:"70846", name:"Gänsebrust lose"}, {id:"70848", name:"Debreziner lose"}, {id:"70849", name:"Wiener mit Käse lose"}, {id:"70850", name:"Kräuterlachsschinken Eck lose"}, {id:"70851", name:"Pariser Lachschinken lose"}, {id:"70852", name:"Lachsschinken Graved lose"},
    {id:"70853", name:"Kaminwurzen lose"}, {id:"70854", name:"Schweinezunge Sch lose"}, {id:"70855", name:"Schweinezunge Kap lose"}, {id:"70856", name:"Sonderproduktion lose"}, {id:"70857", name:"Krakauer lose"}, {id:"70858", name:"Kabanossi lose"}, {id:"70859", name:"Serrano ohne Interliver lose"}, {id:"70860", name:"Salami Sch lose Sopo"}, {id:"70861", name:"Salami Sch Schwein lose Sopo"}, {id:"70862", name:"Bauernschinken Kap luft lose"},
    {id:"80075", name:"Kochschinken Sch EX Ribo"}, {id:"80076", name:"Kochschinken End Willms EX"}, {id:"80077", name:"Kochschinken Sch Willms EX"}, {id:"80078", name:"Hinterschinken Sch/EnPon Ex"}, {id:"80079", name:"Prosciutto Cotto Sch/En Pon Ex"}, {id:"80080", name:"Hinterschinken Sch/En Pon Ex"}, {id:"80081", name:"Hähnchenbrust Kräuter Pon Ex"}, {id:"80083", name:"Kochschinken Chi Sch/En Pon Ex"}, {id:"80084", name:"Hähnchenbrust Pap Pon EX"}, {id:"80085", name:"Kochschinken Tom Sch/En Pon Ex"},
    {id:"80086", name:"Hähnchenbrust geraucht Pon Ex"}, {id:"80087", name:"Hähnchenbrust Curry Pon Ex"}, {id:"80088", name:"Kochschinken Krä Sch/En Pon Ex"}, {id:"80089", name:"Kochschinken Med Sch/En Pon Ex"}, {id:"80090", name:"Hähnchenbrust Pap Pon Ex"}, {id:"80091", name:"Hähnchenbrust Pon Ex"}, {id:"80092", name:"Kochschinken ger Sch/En Pon Ex"}, {id:"80093", name:"Hähnchenroulade frit Pon Ex"}, {id:"80094", name:"Hähnchenfiletroulade Pon Ex"}, {id:"80095", name:"Krustenbraten Sch/End Pon Ex"},
    {id:"80096", name:"Putenbrust Sch/End Ponn EX"}, {id:"80097", name:"Putenbrust Pap Sch/End Pon Ex"}, {id:"80098", name:"Putenbrustroulade Pon Ex"}, {id:"80099", name:"Schinkenbraten Sch/End Pon EX"}, {id:"80100", name:"Kochschinken Ex Sch/Eck Vers"}, {id:"80101", name:"Kochschinken Wolf Ex Verschn."}, {id:"80102", name:"Kochschinken Tillmans Ex Vers"}, {id:"80103", name:"Kochschinken Eck W Ex Verschn."}, {id:"80104", name:"Pute Metten Export Scheiben"}, {id:"80105", name:"Salami Scheiben Export"},
    {id:"80106", name:"Kasseler Scheiben ca.5 kg"}, {id:"80107", name:"Kochschinken Sch Gu. Export"}, {id:"80108", name:"Kochschinken Sch Ex Könecke"}, {id:"80109", name:"Salami End Export"}, {id:"80110", name:"Krustenbraten Schei Wolf Exp."}, {id:"80111", name:"Kochschinken Könecke 1"}, {id:"80112", name:"Kochschinken Könecke 2"}, {id:"80113", name:"Kochschinken Könecke 3"}, {id:"80114", name:"Gewürzbraten Sch Könecke 4"}, {id:"80115", name:"Krustenbraten Könecke 5"},
    {id:"80116", name:"Hähnchen Metten Expo Scheiben"}, {id:"80117", name:"Schweinebraten Kupfer Exp Vers"}, {id:"80118", name:"Hähnchen Metten Export Endst."}, {id:"80119", name:"Putenbrust Metten Export Endst"}, {id:"80120", name:"Puten Scheiben Export Könecke"}, {id:"80121", name:"Hähnchen Scheiben Expo Könecke"}, {id:"80122", name:"Hähnchen Endst Export Könecke"}, {id:"80123", name:"Puten Endst Export Könecke"}, {id:"80124", name:"Pute Scheiben Export"}, {id:"80125", name:"Geflügelfilet-Roul Sch Export"},
    {id:"80126", name:"Geflügelfilet-Rou Endst Export"}, {id:"80127", name:"Roast Chicken Sch Export Nölke"}, {id:"80128", name:"Roast Turkey Sch Export"}, {id:"80129", name:"Gewürzbraten End Export WKS"}, {id:"80130", name:"Hähnchenbrust Sch Nölke Exp"}, {id:"80131", name:"Schweinebraten Sch Hein Export"}, {id:"80132", name:"Schweinebraten End Hein Export"}, {id:"80133", name:"Hähnchenbrust Sch Hein Export"}, {id:"80134", name:"Hähnchenbrust End Hein Export"}, {id:"80135", name:"Kochschinken Sch Hein Export"},
    {id:"80136", name:"Kochschinken End Hein Export"}, {id:"80137", name:"Putenbrust Sch Hein Export"}, {id:"80138", name:"Putenbrust End Hein Export"}, {id:"80139", name:"Kochschinken Sch Metten Export"}, {id:"80140", name:"Kochschinken End Metten Export"}, {id:"80141", name:"Kochsch Kräuter Sch Köneke Ex"}, {id:"80142", name:"Kochsch Sch Pfeffer Köneke Ex"}, {id:"80143", name:"Kochsch Sch Pfeffer Hein Ex"}, {id:"80144", name:"Kochsch End Pfeffer Hein Ex"}, {id:"80145", name:"Pute Pap Sch Hein Ex"},
    {id:"80146", name:"Pute Pap End Hein Ex"}, {id:"80147", name:"Hähnchen Sch Kräuter Nölke Ex"}, {id:"80148", name:"Hähnchen Pap Sch Nölke"}, {id:"80149", name:"Schwarzwälder Schinken Export"}, {id:"80150", name:"Bauchspeck Scheiben Export"}, {id:"80151", name:"Roast Turkey End Export Nölke"}, {id:"80152", name:"Roast Chicken End Export Nölke"}, {id:"80153", name:"Kochschinken End Gusto Export"}, {id:"80154", name:"Hähnchen Sch Schw Cranz Export"}, {id:"80155", name:"Pute Sch Schw Cranz Export"},
    {id:"80156", name:"Putenbrust End Exp Schwarz Cr"}, {id:"80157", name:"Hähnchenbrust End Ex Schwarz C"}, {id:"80158", name:"Krustenbraten End Ex Metten"}, {id:"80159", name:"Krustenbraten End Ex Wolf"}, {id:"80160", name:"Schweinebraten Sch Könecke EX"}, {id:"80161", name:"Geflügel Scheib Ex Lutz"}, {id:"80162", name:"Geflügel Paprik Sch Ex Lutz"}, {id:"80163", name:"Putenbrust Sch ger EX Nölke"}, {id:"80164", name:"Putenbrust End ger EX Nölke"}, {id:"80165", name:"Gewürzbraten Sch WKS Export"},
    {id:"80166", name:"Krustenbraten Sch Metten Ex"}, {id:"80167", name:"Pute frittiert End Nölke Ex"}, {id:"80168", name:"Hähnchen Curry Sch Nölke"}, {id:"80169", name:"Hähnchen End Natur Nölke Ex"}, {id:"80170", name:"Hähnchen End Kräut Nölke Ex"}, {id:"80171", name:"Hähnchen End Pap Nölke Ex"}, {id:"80172", name:"Backhendl Sch Nölke Ex"}, {id:"80173", name:"Backhendl End Nölke Ex"}, {id:"80174", name:"Putenbrust Pap Sch Nölke Ex"}, {id:"80175", name:"Putenbrust Pap End Nölke Ex"},
    {id:"80176", name:"Schinkenbr End Könecke Ex"}, {id:"80177", name:"Kasseler End Kõnecke Ex"}, {id:"80178", name:"Hinterschinken Sch Wolf Ex"}, {id:"80179", name:"Puten Sch gegrillt Hein Ex"}, {id:"80180", name:"Puten End gegrillt Hein Ex"}, {id:"80181", name:"Hähnch Man/Curry Sch Nölke"}, {id:"80182", name:"Hähn Man/Cur End Nölke"}, {id:"80183", name:"Kasseler Sch Köneke Ex"}, {id:"80184", name:"Kochschinken Schei Eggel Ex"}, {id:"80185", name:"Putenbrust Schei Eggel EX"},
    {id:"80186", name:"Hähnchen Sch gebacken Köneke"}, {id:"80187", name:"Hähnchen End gebacken Köneke"}, {id:"80188", name:"Puten Sch gebacken Köneke"}, {id:"80189", name:"Puten End gebacken Köneke"}, {id:"80190", name:"Kochschinken Sch geraucht Hein"}, {id:"80191", name:"Kochschinken End geraucht Hein"}, {id:"80192", name:"Kasseler Sch Ex Zimbo"}, {id:"80194", name:"Putenbrust Sch EX Zimbo"}, {id:"80195", name:"Putenbrust End EX Zimbo"}, {id:"80196", name:"Pute Curry Sch Nölke"},
    {id:"80197", name:"Pute Kräuter Sch Nölke"}, {id:"80198", name:"Schinkenbr Kräu End Könecke EX"}, {id:"80199", name:"Schinkenbr Pfef End Könecke Ex"}, {id:"80200", name:"Truthahnbrustfilet ofenge Nr.2"}, {id:"80201", name:"Truthahnbrustfilet ofenge Nr.1"}, {id:"80202", name:"Truthahnbrust mit Paprika"}, {id:"80203", name:"Truthahnbrust geraucht"}, {id:"80204", name:"Geflügelfleischwurst Spanien"}, {id:"80205", name:"Truthahnbrustfilet"}, {id:"80206", name:"Putenbrust Bauerin"},
    {id:"80207", name:"Schnitzel TK"}, {id:"80300", name:"Kochschinken versch Ex CZ"}, {id:"80301", name:"Pute Ecken Curry Nölke"}, {id:"80302", name:"Pute Ecken Kräuter Nölke"}, {id:"80303", name:"Hähnchen Eck Curry Nölke"}, {id:"80304", name:"Schinkenbr Sch Krä Willms EX"}, {id:"80305", name:"Schinkenbr Krå End Willms EX"}, {id:"80306", name:"Schinkenbr Pap Sch Willms EX"}, {id:"80307", name:"Schinkenbr Pap End Willms EX"}, {id:"80308", name:"Schinkenbr Sch Pf Willms EX"},
    {id:"80309", name:"Schinkenbr Pfe End Willms EX"}, {id:"80310", name:"Kustenbra Sch Willms EX"}, {id:"80311", name:"Krustenbra End Willms EX"}, {id:"80312", name:"Kasseler Sch Willms EX"}, {id:"80313", name:"Kochschinken End Könecke EX"}, {id:"80314", name:"Krustenbra End Könecke EX"}, {id:"80315", name:"Kochschinken Sch/End TFB EX"}, {id:"80316", name:"Putenbrust Sch/End TFB EX"}, {id:"80317", name:"Hähnchenbrust Sch/End TFB EX"}, {id:"80318", name:"Schinkenbr End Natur Willms EX"},
    {id:"80319", name:"Pute ger Boui Sch/End Herta EX"}, {id:"80320", name:"Pute Boul Sch/End Herta EX"}, {id:"80321", name:"Pute Boui Honig Sch/End Herta"}, {id:"80322", name:"Kochsch gegrillt Sch/End Herta"}, {id:"80323", name:"Kochschi Pfeffer Sch/End Herta"}, {id:"80324", name:"Koch gegrillt Sch/End Herta"}, {id:"80325", name:"Koch Ahorn Sch/End Herta"}, {id:"80326", name:"Hähnchen Prov. Sch/End TFB EX"}, {id:"80327", name:"Schinkenbr Sch Nat Willms EX"}, {id:"80328", name:"Kasseler Eck Willms EX"},
    {id:"80329", name:"Kass-Zuschn Rümke EX"}, {id:"80330", name:"Hähnch-Zuschnitte Rümke EX"}, {id:"80331", name:"Putenb-Zuschn Rümke EX"}, {id:"80332", name:"Schinkenb-Zuschn Rümke EX"}, {id:"80333", name:"Hähn Boui Sch/End geba Herta"}, {id:"80334", name:"Hähn Sch/End Boui ger Herta EX"}, {id:"80335", name:"Curry Herta Sch/End Boui Hähn"}, {id:"80336", name:"Hähn Sch/End Boui gega Herta"}, {id:"80337", name:"Hähn Sch/End Honih Herta"}, {id:"80338", name:"Pute Sch/End 408 Sauels"},
    {id:"80339", name:"Hähn Sch/End 394 Sauels"}, {id:"80340", name:"Hähn geb Sch Rewe"}, {id:"80341", name:"Hähn Curry Sch Rewe"}, {id:"80342", name:"Hähn geb Sch Rewe"}, {id:"80343", name:"Hähn Pap Sch Rewe"}, {id:"80344", name:"Pute geb Sch Rewe"}, {id:"80345", name:"Pute geb Sch Rewe"}, {id:"80346", name:"Koch ger Sch/End TFB"}, {id:"80347", name:"Hähn gebacken End Rewe"}, {id:"80348", name:"Hähn Curry End Rewe"},
    {id:"80349", name:"Hähn geb End Rewe"}, {id:"80350", name:"Hähn Paprika End Rewe"}, {id:"80351", name:"Puten geb End Rewe"}, {id:"80352", name:"Puten gebacken End Rewe"}, {id:"80353", name:"Rinder-Saft ger Sch Willms"}, {id:"80354", name:"Rinder-Saft ger End Willms"}, {id:"80355", name:"Rinder.Saft Pfeffer Sch Willms"}, {id:"80356", name:"Rinder-Saft Pfeffer End Willms"}, {id:"80357", name:"Kochsch vier Sch Suhl"}, {id:"80358", name:"Kochsch vier End Suhl"},
    {id:"80359", name:"Hähnch Curry Sch/End TFB EX"}, {id:"80360", name:"Hähnch Paprika Sch/End TFB EX"}, {id:"80361", name:"Hähnch Sch/End Chili Herta EX"}, {id:"80362", name:"Krustenbraten Sch Suhl"}, {id:"80363", name:"Krustenbraten End Suhl"}, {id:"80364", name:"Kochschinken Sch Suhl"}, {id:"80365", name:"Kochschinken End Suhl"}, {id:"80366", name:"Schinkenbraten Sch Suhl"}, {id:"80367", name:"Schinkenbraten End Suhl"}, {id:"80368", name:"Putenbrust Sch Suhl"},
    {id:"80369", name:"Putenbrust End Suhl"}, {id:"80370", name:"Pastrami Gew/ger Sch Willms"}, {id:"80371", name:"Pastrami Gew/ger End Willms"}, {id:"80372", name:"Kochsch geg salzr Sch/En Herta"}, {id:"80373", name:"Kochsch Honig ger Sch/En Herta"}, {id:"80374", name:"Kochsch gegart Sch/End Herta"}, {id:"80375", name:"Kochsch gegrillt Sch/End Herta"}, {id:"80376", name:"Hähn Boul Prov Sch/End Herta"}, {id:"80377", name:"Hähn Boul BBQ Sch/End Herta"}, {id:"80378", name:"Pute Sch frittiert EX Nölke"},
    {id:"80379", name:"Putenbrust Sch/End Pon"}, {id:"80380", name:"Hähnchenbrust Sch/End Pon"}, {id:"80381", name:"Pute mit Honig Sch/End Pon"}, {id:"80382", name:"Kochsch Pfeff Sch/End Pon"}, {id:"80383", name:"Kochschinken mit Bratenr TFB"}, {id:"80384", name:"Hähnch mit Bratenrand TFB"}, {id:"80385", name:"Pute mit Bratenrand TFB"}, {id:"80386", name:"Kasseler Pfeffer Willms"}, {id:"80387", name:"Pute Cury Sch/End Po EX"}, {id:"80388", name:"Hähnch Pap Sch/End Po EX"},
    {id:"80389", name:"Hähn Pap geb Sch/End Po EX"}, {id:"80390", name:"Kochschinken Olive Sch/End"}, {id:"80391", name:"Hähnch geb Sch/End Po EX"}, {id:"90100", name:"Gouda Scheiben 400g"}, {id:"90101", name:"Edamer Scheiben 400g"}, {id:"90102", name:"Tilsiter Scheiben 400g"}, {id:"90103", name:"Butterkåse Scheiben 400g"}
];

let db = { 
    suppliers: [], customers: [], articles: [], savedProdukteRaw: [],
    deletedSuppliers: [], supplierLines: {}, supplierLinesCleared: [],
    todo: [], lose: [], later: [], hidden: [],
    workers: ["Ahmed","Dominik","Robert","Julian","Alex"], 
    workerColors: {"Ahmed":"#d32f2f","Alex":"#1976d2","Dominik":"#fbc02d","Julian":"#388e3c","Robert":"#7b1fa2"}, 
    dailyAttendance: {}, deliveries: [], entries: [],
    settings: { 
        printerIp: "192.168.211.40", 
        notificationUrl: "https://formspree.io/f/xrejnkgq", 
        logistikPin: "3132",
        adminPin: DEFAULT_ADMIN_PIN,
        pinVersion: 1,
        inactivityTimeout: 0,
        noelkeDefaultArtNr: "NÖLKE" },
    company: {
        name: "Tresch & Sohn",
        color: "#004b93",
        modules: { lkw: true, sort: true, noelke: true },
            leergut: "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0"
    },
    v41_initialized: false,
    artikelMarkt: {},
    tierartZuordnung: {},
    teamTagesMengen: {},
    deletedSortierBuchungen: []
};

let activeV10Tab = 'todo';
let currentTargetId = null; 
let lastAction = null;
let statsWeekOffset = 0;
let editingFertigId = null;
let editingNoelkeIdx = null;
let editingPoolCtx = null;

/** Spiegelt PC-db nach kombi_* (gleicher Browser / Notfall-Kompatibilität zur Kombi-App). */
function mirrorToKombiStorage() {
    spiegelAufKombi(db);
}

/** Sortier-Buchungen + Deliveries vor Erfassung/Statistik angleichen (gleiche Quelle wie Analyse). */
function syncSortierDatenFuerErfassung() {
    if (typeof mergeLokaleSortierDatenAusStorage === 'function') mergeLokaleSortierDatenAusStorage();
    if (Array.isArray(window._lastCloudBuchungen) && window._lastCloudBuchungen.length
        && typeof mergeTeamSortierBuchungen === 'function') {
        // Merge respects local deletions — applyCloudSortierBuchungen would clear them
        db.teamSortierBuchungen = mergeTeamSortierBuchungen(
            db.teamSortierBuchungen || [],
            window._lastCloudBuchungen,
            db.deletedSortierBuchungen
        );
    }
    if (typeof hydrateSortierBuchungenInDb === 'function') hydrateSortierBuchungenInDb(db);
    if (typeof ensureDatenKonsistenz === 'function') ensureDatenKonsistenz(db);
    else if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
}

function initAdminDeliveryListClicks() {
    const list = document.getElementById('admin-delivery-list');
    if (!list || list._deliveryClickBound) return;
    list._deliveryClickBound = true;
    list.addEventListener('click', (e) => {
        const row = e.target.closest('[data-delivery-id]');
        if (!row) return;
        openAdminEditDelivery(row.getAttribute('data-delivery-id'));
    });
}

/** App-Wiegeschein-Buchungen aus logistik_offline_db übernehmen (neuerer Stand gewinnt). */
function mergeLokaleSortierDatenAusStorage() {
    try {
        const stored = JSON.parse(localStorage.getItem('logistik_offline_db') || '{}');
        if (Array.isArray(stored.deletedSortierBuchungen)) {
            // Migration: \0 null-byte separator → | (PostgreSQL jsonb rejects null bytes)
            stored.deletedSortierBuchungen = stored.deletedSortierBuchungen.map(k => k.replace('\0', '|'));
            db.deletedSortierBuchungen = mergeDeletedSortierKeys(db.deletedSortierBuchungen, stored.deletedSortierBuchungen);
        }
        if (Array.isArray(stored.teamSortierBuchungen)) {
            db.teamSortierBuchungen = mergeTeamSortierBuchungen(
                db.teamSortierBuchungen || [],
                stored.teamSortierBuchungen,
                db.deletedSortierBuchungen
            );
        }
        const kombiRaw = localStorage.getItem('kombi_logistik_db');
        if (kombiRaw) {
            const kombi = JSON.parse(kombiRaw);
            if (Array.isArray(kombi.teamSortierBuchungen)) {
                db.teamSortierBuchungen = mergeTeamSortierBuchungen(
                    db.teamSortierBuchungen || [],
                    kombi.teamSortierBuchungen,
                    db.deletedSortierBuchungen
                );
            }
            if (kombi.teamTagesMengen && typeof mergeTeamTagesMengen === 'function') {
                db.teamTagesMengen = mergeTeamTagesMengen(db.teamTagesMengen || {}, kombi.teamTagesMengen);
            }
        }
        if (stored.teamTagesMengen && typeof stored.teamTagesMengen === 'object') {
            db.teamTagesMengen = mergeTeamTagesMengen(db.teamTagesMengen || {}, stored.teamTagesMengen);
        }
        if (typeof bereinigeGeloeschteSortierDeliveries === 'function') bereinigeGeloeschteSortierDeliveries(db);
        if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
    } catch (e) { console.warn('Sortier-Daten-Merge', e); }
}

/** Nur wenn logistik_offline_db leer ist: Daten aus kombi_* übernehmen (kein Überschreiben). */
function hydrateFromKombiIfNeeded() {
    try {
        const local = localStorage.getItem('logistik_offline_db');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && ((parsed.articles && parsed.articles.length > 0) || (parsed.suppliers && parsed.suppliers.length > 0) || (parsed.deliveries && parsed.deliveries.length > 0))) return;
        }
        const l = localStorage.getItem('kombi_logistik_db');
        if (l) {
            const lDb = JSON.parse(l);
            ['suppliers', 'customers', 'articles', 'todo', 'lose', 'later', 'hidden', 'workers', 'deliveries', 'dailyStaff', 'dailyAttendance', 'workerColors', 'settings', 'company', 'deletedSuppliers', 'supplierLines', 'supplierLinesCleared', 'artikelMarkt', 'tierartZuordnung', 'teamTagesMengen', 'teamSortierBuchungen', 'deletedSortierBuchungen'].forEach(k => {
                if (lDb[k] !== undefined && lDb[k] !== null) db[k] = lDb[k];
            });
        }
        const r = localStorage.getItem('kombi_rechner_db');
        if (r) {
            const rDb = JSON.parse(r);
            if (rDb.savedProdukteRaw) db.savedProdukteRaw = rDb.savedProdukteRaw;
            if (rDb.sonderTemplates) db.sonderTemplates = rDb.sonderTemplates;
            if (rDb.entries) db.entries = rDb.entries;
        }
    } catch (e) { console.warn('Kombi-Hydration', e); }
}

function updateCloudSecretsStatus() {
    const el = document.getElementById('cloud-secrets-status');
    if (!el) return;
    el.innerHTML = '✅ Cloud-Zugang aktiv (Supabase)';
    el.style.color = 'var(--success)';
}

function importAppSecretsFile(input) {
    if (input) input.value = '';
    alert('ℹ️ Zugangsdaten werden nicht mehr benötigt – Cloud läuft über Supabase.');
}

window.onload = () => {
    updateCloudSecretsStatus();
    const localData = localStorage.getItem('logistik_offline_db');
    if(localData) { try {
        const parsed = JSON.parse(localData);
        // Migration: \0 null-byte separator → | (PostgreSQL jsonb rejects null bytes)
        if (Array.isArray(parsed.deletedSortierBuchungen)) {
            parsed.deletedSortierBuchungen = parsed.deletedSortierBuchungen.map(k => k.replace('\0', '|'));
        }
        db = { ...db, ...parsed };
    } catch(e){} }
    hydrateFromKombiIfNeeded();
    if (typeof hydrateSortierBuchungenInDb === 'function') hydrateSortierBuchungenInDb(db);
    
    if(!db.todo) db.todo = [];
    if(!db.lose) db.lose = [];
    if(!db.later) db.later = [];
    if(!db.hidden) db.hidden = [];
    if(!db.articles) db.articles = [];
    if (!db.artikelMarkt || typeof db.artikelMarkt !== 'object') db.artikelMarkt = {};
    migrateArtikelMarktFromNames();
    if (!db.teamTagesMengen || typeof db.teamTagesMengen !== 'object') db.teamTagesMengen = {};
    if (!Array.isArray(db.teamSortierBuchungen)) db.teamSortierBuchungen = [];
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    if (!db.dailyStaff) db.dailyStaff = {};
    if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
    migriereTeamAusDailyStaff(db.teamTagesMengen, db.dailyStaff);
    syncDailyStaffAusTeam(db.teamTagesMengen, db.dailyStaff);

    if (!db.v41_initialized) {
        rawData.forEach(r => {
            const inArt = db.articles.some(a => a.fertigNr === r.id || (a.name && a.name.includes(`(${r.id})`)));
            const inTodo = db.todo.some(a => a.fertigNr === r.id);
            const inLose = db.lose.some(a => a.fertigNr === r.id);
            const inLater = db.later.some(a => a.fertigNr === r.id);
            const inHidden = db.hidden.some(a => a.fertigNr === r.id);

            if (!inArt && !inTodo && !inLose && !inLater && !inHidden) {
                let item = { fertigNr: r.id, name: r.name, nr: "", suppliers: [] };
                if (r.name.toLowerCase().includes('lose')) db.lose.push(item);
                else db.todo.push(item);
            }
        });
        db.v41_initialized = true;
    }

    const dInput = document.getElementById('admin-work-date');
    if (dInput && !dInput.value) dInput.value = ccTodayISO();

    if (typeof initSupplierNumbersFromExcel === 'function') initSupplierNumbersFromExcel();
    initAdminDeliveryListClicks();
    renderAll();
    renderCloudLogs();
    if (location.hash === '#updates') {
        showTab('handy-update', document.getElementById('nav-handy-update'));
    }
};

const ADMIN_TABS = ['raw', 'cloud', 'stats', 'erfassung', 'company', 'system', 'handy-update'];

function openAdminSubmenu() {
    const sm = document.getElementById('admin-submenu');
    if (sm) sm.style.display = 'flex';
}

function adminNavElement(tabId) {
    return document.querySelector(`#admin-submenu .sub-item[onclick*="showTab('${tabId}'"]`)
        || document.getElementById('admin-toggle');
}

function showTab(id, element) {
    executeShowTab(id, element);
}

function executeShowTab(id, element) {
    document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-'+id).classList.add('active');
    if(element) element.classList.add('active');
    const sticky = document.getElementById('sticky-save-bar');
    if (sticky) sticky.style.display = (id === 'cloud' || id === 'system' || id === 'handy-update') ? 'none' : 'flex';
    if(id === 'raw') document.getElementById('raw-json-input').value = JSON.stringify(db, null, 4);
    if(id === 'erfassung') refreshErfassungFromCloud(true);
    if(id === 'noelke') renderNoelkeList();
    if(id === 'artikel') renderV10Table();
    if(id === 'stats') renderWorkerStats();
    if(id === 'sonderposten') renderAdminSonderTpl();
    if(id === 'qm') loadReklamationen();
    if(id === 'company') loadCompanySettingsToUI();
    if(id === 'handy-update') refreshDeployStatus(6);
    pendingTabId = null;
}

function toggleAdminMenu() {
    const sm = document.getElementById('admin-submenu');
    sm.style.display = sm.style.display === 'flex' ? 'none' : 'flex';
}

function renderAll() {
    db.articles = (db.articles||[]).filter(a => a && typeof a === 'object');
    
    // AUTOMATISCHE BEREINIGUNG: Fertige Artikel aus den offenen Listen entfernen
    const assignedFertigNrs = new Set();
    const assignedNames = new Set();
    db.articles.forEach(a => {
        if (a.fertigNr) assignedFertigNrs.add(a.fertigNr);
        if (a.name) {
            const m = a.name.match(/\((\d{5})\)$/);
            if(m) assignedFertigNrs.add(m[1]);
            assignedNames.add(a.name.toLowerCase().trim());
        }
        if (a.originalName) assignedNames.add(a.originalName.toLowerCase().trim());
    });
    const isNotAssigned = (a) => !(a.fertigNr && assignedFertigNrs.has(a.fertigNr)) && !(a.name && assignedNames.has(a.name.toLowerCase().trim()));

    db.todo = (db.todo||[]).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    db.lose = (db.lose||[]).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    db.later = (db.later||[]).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    db.hidden = (db.hidden||[]).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    
    if(!db.settings) db.settings = { printerIp: "192.168.211.40", notificationUrl: "https://formspree.io/f/xrejnkgq", logistikPin: "3132", adminPin: DEFAULT_ADMIN_PIN, pinVersion: 1, inactivityTimeout: 0, noelkeDefaultArtNr: "NÖLKE" };
    if (db.settings.pinVersion == null) db.settings.pinVersion = 1;
    if(!db.workers) db.workers = [];
    if(!db.workerColors) db.workerColors = {};
    (db.workers || []).forEach(w => { if (!db.workerColors[w]) db.workerColors[w] = nextWorkerColor(); });
    if(!db.company) db.company = { name: "Tresch & Sohn", color: "#004b93", modules: { lkw: true, sort: true, noelke: true }, leergut: "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0" };
    ADMIN_PIN = db.settings.adminPin || DEFAULT_ADMIN_PIN;
    
    document.getElementById('set-printer-ip').value = db.settings.printerIp || "";
    document.getElementById('set-notification-url').value = db.settings.notificationUrl || "";
    document.getElementById('set-logistik-pin').value = db.settings.logistikPin || "";
    document.getElementById('set-admin-pin').value = db.settings.adminPin || "";
    document.getElementById('set-inactivity-timeout').value = db.settings.inactivityTimeout ?? 0;
    document.getElementById('set-noelke-artnr').value = db.settings.noelkeDefaultArtNr || "NÖLKE";
    
    const DEFAULT_ZPL = "^XA\n^PW800\n^FO30,30^A0N,25,25^FDVerp-Tag^FS\n^FO200,30^A0N,25,25^FD{dateStr}^FS\n^FO500,30^A0N,25,25^FDUhrzeit^FS\n^FO650,30^A0N,25,25^FD{timeStr}^FS\n^FO30,70^GB740,2,2^FS\n^FO30,90^A0N,50,50^FD{artNr}^FS\n^FO600,90^A0N,40,40^FDKISTE^FS\n^FO30,150^A0N,30,30^FD{artName}^FS\n^FO30,220^A0N,22,22^FDCharge: {charge}^FS\n^FO30,260^A0N,22,22^FDMHD: {mhd}^FS\n^FO30,300^A0N,22,22^FDEinheit: {einheit}^FS\n^FO30,340^A0N,22,22^FDNr.: SP-000149^FS\n^FO530,130^BXN,5,200,0,0,1^FD{barcodeData}^FS\n^FO570,320^A0N,15,15^FD2D DataMatrix^FS\n^FO30,380^GB340,110,2^FS\n^FO40,390^A0N,22,22^FDGewicht^FS\n^FO40,430^A0N,60,60^FD{gewichtStr} kg^FS\n^FO400,380^GB200,110,2^FS\n^FO410,390^A0N,22,22^FDMenge^FS\n^FO410,430^A0N,60,60^FD{menge}^FS\n^FO30,510^GB740,2,2^FS\n^XZ";
    if(document.getElementById('set-zpl-template')) document.getElementById('set-zpl-template').value = db.settings.zplTemplate || DEFAULT_ZPL;
    
    if(document.getElementById('set-cloud-url')) document.getElementById('set-cloud-url').value = sanitizeCloudUrl(localStorage.getItem('custom_cloud_url') || "");

    db.savedProdukteRaw = db.savedProdukteRaw || [];
    db.sonderTemplates = db.sonderTemplates || [];
    ensureSupplierMeta();
    db.suppliers = mergeSuppliersList(db.suppliers, []);

    // LIEFERANTEN-LISTE (Card-Rows)
    document.getElementById('sup-body').innerHTML = (db.suppliers||[]).sort().map((s, i, arr) => {
        const key = supDomKey(s);
        const esc = s.replace(/"/g, '&quot;');
        const lines = getSupplierLines(s);
        const linesLabel = lines.length ? `${lines.length} Linie${lines.length > 1 ? 'n' : ''}` : 'Keine Warenlinien';
        const nr = (db.supplierNumbers || {})[s] || '';
        const borderBottom = i < arr.length - 1 ? 'border-bottom:1px solid var(--border);' : '';
        return `<div style="${borderBottom}">
            <div style="display:flex; align-items:center; gap:14px; padding:14px 22px; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span id="sup-label-${key}" style="font-weight:700; font-size:15px; cursor:pointer; color:#1a1a2e;" onclick="showSupplierStats(decodeURIComponent('${key}'))" title="Statistik anzeigen">${s}</span>
                        <span id="sup-nr-badge-${key}" onclick="editSupplierNr(decodeURIComponent('${key}'))" title="Lieferantennummer — klicken zum Bearbeiten" style="display:inline-flex; align-items:center; background:${nr ? '#dbeafe' : '#f3f4f6'}; color:${nr ? '#1d4ed8' : '#9ca3af'}; border:1px solid ${nr ? '#bfdbfe' : '#e5e7eb'}; border-radius:99px; padding:2px 10px; font-size:11px; font-weight:${nr ? '700' : '400'}; cursor:pointer; user-select:none;">${nr ? '# ' + nr : '+ Nr.'}</span>
                        <input type="text" id="sup-nr-${key}" value="${nr}" placeholder="z.B. 70145" style="visibility:hidden; position:absolute; width:90px; padding:2px 10px; font-size:12px; font-weight:700; border:2px solid #3b82f6; border-radius:99px; outline:none; color:#1d4ed8; background:#eff6ff;" onblur="saveSupplierNumber(decodeURIComponent('${key}'), this.value)" onkeydown="if(event.key==='Enter'||event.key==='Escape')this.blur()">
                    </div>
                    <input type="text" id="sup-edit-input-${key}" value="${esc}" style="display:none; width:100%; max-width:320px; padding:6px 10px; font-size:14px; margin-top:6px; border-radius:8px; border:2px solid var(--primary);">
                    <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">📦 ${linesLabel}</div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0; flex-wrap:wrap; align-items:center;">
                    <button type="button" onclick="showSupplierStats(decodeURIComponent('${key}'))" class="btn" style="background:#f3e8ff; color:#7c3aed; font-size:12px; padding:7px 13px;">📊 Statistik</button>
                    <button type="button" onclick="toggleSupplierLinesPanel(decodeURIComponent('${key}'))" class="btn" style="background:#e0f2fe; color:#0369a1; font-size:12px; padding:7px 13px;">📋 Warenlinien</button>
                    <button id="btn-edit-sup-${key}" onclick="inlineEditSupplier(decodeURIComponent('${key}'))" class="btn" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:12px; padding:7px 13px;">✏️ Umbenennen</button>
                    <button id="btn-save-sup-${key}" onclick="inlineSaveSupplier(decodeURIComponent('${key}'))" class="btn btn-success" style="display:none; font-size:12px; padding:7px 13px;">💾 Speichern</button>
                    <button onclick="deleteSupplier(decodeURIComponent('${key}'))" class="btn" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; font-size:12px; padding:7px 13px;">🗑️</button>
                </div>
            </div>
            <div id="sup-lines-${key}" style="display:none; background:#f8fafc; border-top:1px solid var(--border); padding:16px 22px;">
                <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted); margin-bottom:8px;">Warenlinien für „${esc}" — eine pro Zeile</div>
                <textarea id="sup-lines-ta-${key}" rows="4" style="width:100%; max-width:500px; font-size:13px; padding:10px 14px; border-radius:8px; border:1px solid var(--border); background:white; display:block; margin-bottom:10px; resize:vertical;" placeholder="Ecken &amp; Scheiben TFB&#10;Geflügel Aspik&#10;Hähnchen&#10;Pute">${lines.join('\n')}</textarea>
                <button type="button" class="btn btn-save" style="font-size:12px; padding:8px 16px;" onclick="saveSupplierLinesFromText(decodeURIComponent('${key}'))">💾 Warenlinien speichern</button>
            </div>
        </div>`;
    }).join('');

    renderWorkersList();
    ensureBriefingDefaults();
    renderBriefingUI();
    renderHomeWarnCards();

    const supSelect = document.getElementById('admin-supplier');
    if(supSelect) {
        const currentSup = supSelect.value;
        supSelect.innerHTML = (db.suppliers || []).sort().map(s => `<option value="${s}">${s}</option>`).join('');
        if(currentSup && db.suppliers.includes(currentSup)) supSelect.value = currentSup;
        updateAdminSupplierLineSelect();
    }
    
    const worSelect = document.getElementById('admin-worker-select');
    if(worSelect) {
        const currentWor = worSelect.value;
        worSelect.innerHTML = (db.workers || []).map(w => `<option value="${w}">${w}</option>`).join('');
        if(currentWor && db.workers.includes(currentWor)) worSelect.value = currentWor;
    }

    document.getElementById('todo-count-display').innerText = db.todo.length;
    const todoCard = document.getElementById('home-todo-card');
    if (todoCard) todoCard.style.display = db.todo.length > 0 ? 'block' : 'none';
    updateHomeDashboard();
    renderAssignLeft(); renderAssignRight(); renderNoelkeList();
    syncSortierDatenFuerErfassung();
    renderAdminDeliveries();
    document.getElementById('db-status').innerText = 'Stand: ' + new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('logistik_offline_db', JSON.stringify(db));
    mirrorToKombiStorage();
    const stickyStatus = document.getElementById('sticky-status');
    if (stickyStatus) stickyStatus.textContent = 'Lokal gespeichert · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function updateHomeDashboard() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('home-stat-articles', db.articles.length);
    set('home-stat-todo', db.todo.length);
    set('home-stat-suppliers', (db.suppliers || []).length);
    set('home-stat-workers', (db.workers || []).length);
    const openDel = (db.deliveries || []).filter(del => {
        const sum = (del.workerShares || []).reduce((a, v) => a + v.kg, 0);
        return sum < del.kg && !del.isFullySorted;
    }).length;
    set('home-stat-open-del', openDel);
}

const CC_DEFAULT_CHECKLIST = [
    { id: 'm1', text: 'Stapler prüfen (Wasser, Öl, Batterie)' },
    { id: 'm2', text: 'Tore & Türen öffnen' },
    { id: 'm3', text: 'LKW Ladezonen aufräumen / reinigen' },
    { id: 'm4', text: 'Leergut-Platz kontrollieren' },
    { id: 'm5', text: 'Müll / Pappe entsorgen' }
];

function ccTodayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function ensureBriefingDefaults() {
    if (!Array.isArray(db.checklistMorningTemplate) || !db.checklistMorningTemplate.length) {
        db.checklistMorningTemplate = CC_DEFAULT_CHECKLIST.map(t => ({ ...t }));
    }
    if (!db.teamDayBrief || typeof db.teamDayBrief !== 'object') {
        db.teamDayBrief = { date: ccTodayISO(), message: '', tasks: [] };
    }
    if (!Array.isArray(db.teamDayBrief.tasks)) db.teamDayBrief.tasks = [];
}

function renderHomeWarnCards() {
    const el = document.getElementById('home-warn-cards');
    if (!el) return;
    const today = ccTodayISO();
    const brief = db.teamDayBrief || {};
    const warns = [];

    const oldOpen = (db.deliveries || []).filter(del => {
        const sum = (del.workerShares || []).reduce((a, v) => a + v.kg, 0);
        if (sum >= del.kg || del.isFullySorted) return false;
        const days = (Date.now() - new Date(del.date + 'T12:00:00').getTime()) / 86400000;
        return days > 3;
    });
    if (oldOpen.length) {
        warns.push({ level: 'danger', icon: '🚨', text: `${oldOpen.length} manuelle Eingabe${oldOpen.length > 1 ? 'n' : ''} mit offener Zuweisung seit über 3 Tagen`, tab: 'erfassung', admin: true });
    }
    if (brief.date !== today && ((brief.tasks || []).length || (brief.message || '').trim())) {
        warns.push({ level: 'warn', icon: '📅', text: 'Tages-Briefing ist nicht auf heute datiert — Tablets zeigen es nicht', tab: 'briefing' });
    } else if (brief.date === today) {
        const open = (brief.tasks || []).filter(t => !t.done);
        if (open.length) warns.push({ level: 'info', icon: '📢', text: `${open.length} Team-Aufgabe${open.length > 1 ? 'n' : ''} heute noch offen (Banner in der App)`, tab: 'briefing' });
        else if (!(brief.message || '').trim() && !(brief.tasks || []).length) {
            warns.push({ level: 'info', icon: '💡', text: 'Noch kein Tages-Briefing für heute — Kollegen informieren?', tab: 'briefing' });
        }
    } else {
        warns.push({ level: 'info', icon: '💡', text: 'Noch kein Tages-Briefing für heute erstellt', tab: 'briefing' });
    }
    if ((db.todo || []).length >= 8) {
        warns.push({ level: 'warn', icon: '📦', text: `${db.todo.length} Artikel warten auf Lose-Zuordnung`, tab: 'artikel' });
    }

    el.innerHTML = warns.map((w, i) => `
        <div class="warn-card warn-${w.level}" onclick="jumpFromWarnCard('${w.tab}', ${!!w.admin})">
            <span class="warn-card-icon">${w.icon}</span>
            <span class="warn-card-text">${w.text}</span>
        </div>`).join('');
}

function jumpFromWarnCard(tab, admin) {
    if (admin || ADMIN_TABS.includes(tab)) {
        openAdminSubmenu();
        showTab(tab, adminNavElement(tab));
    } else if (tab === 'briefing') {
        showTab('briefing', document.getElementById('nav-briefing'));
    } else {
        const nav = document.getElementById('nav-' + tab) || document.querySelector(`.sidebar-nav-main .nav-item[onclick*="'${tab}'"]`);
        showTab(tab, nav);
    }
}

function renderBriefingUI() {
    ensureBriefingDefaults();
    const brief = db.teamDayBrief;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    setVal('brief-date', brief.date || ccTodayISO());
    setVal('brief-message', brief.message || '');
    setVal('home-brief-date', brief.date || ccTodayISO());
    setVal('home-brief-message', brief.message || '');

    const tasksEl = document.getElementById('brief-tasks-list');
    if (tasksEl) {
        const tasks = brief.tasks || [];
        tasksEl.innerHTML = tasks.length ? tasks.map((t, i) => `
            <div class="briefing-task-row">
                <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleBriefingTaskDone(${i})" title="Erledigt (Vorschau)">
                <input type="text" value="${(t.text || '').replace(/"/g, '&quot;')}" onchange="updateBriefingTaskText(${i}, this.value)">
                <button class="btn" style="background:var(--todo); padding:6px 10px; font-size:12px;" onclick="deleteBriefingTask(${i})">🗑️</button>
            </div>`).join('') : '<p style="color:#999; font-size:13px;">Noch keine Aufgaben.</p>';
    }

    const preview = document.getElementById('home-brief-tasks-preview');
    if (preview) {
        const today = ccTodayISO();
        const tasks = brief.date === today ? (brief.tasks || []) : [];
        const open = tasks.filter(t => !t.done);
        if (brief.date !== today) preview.innerHTML = '<span style="color:#d32f2f;">⚠ Nicht auf heute datiert</span>';
        else if (!tasks.length && !(brief.message || '').trim()) preview.innerHTML = 'Noch leer — Aufgaben im Tab „Tages-Briefing" anlegen.';
        else preview.innerHTML = open.length
            ? `<b>${open.length}</b> offen: ${open.map(t => t.text).slice(0, 3).join(' · ')}${open.length > 3 ? ' …' : ''}`
            : '✓ Alle Aufgaben erledigt oder keine offenen.';
    }

    const tplEl = document.getElementById('checklist-template-list');
    if (tplEl) {
        const tpl = db.checklistMorningTemplate || [];
        tplEl.innerHTML = tpl.map((t, i) => `
            <div class="checklist-template-row">
                <span style="color:#999; font-size:12px; min-width:24px;">${i + 1}.</span>
                <input type="text" value="${(t.text || '').replace(/"/g, '&quot;')}" onchange="updateChecklistTemplateText(${i}, this.value)">
                <button class="btn" style="background:var(--todo); padding:6px 10px; font-size:12px;" onclick="deleteChecklistTemplateItem(${i})">🗑️</button>
            </div>`).join('');
    }
}

function saveBriefingField(field, value) {
    ensureBriefingDefaults();
    if (field === 'date') db.teamDayBrief.date = value;
    else if (field === 'message') db.teamDayBrief.message = value;
    renderAll();
}

function syncBriefingFromHome() {
    ensureBriefingDefaults();
    const d = document.getElementById('home-brief-date');
    const m = document.getElementById('home-brief-message');
    if (d) db.teamDayBrief.date = d.value;
    if (m) db.teamDayBrief.message = m.value;
    renderAll();
}

function setBriefingToday() {
    ensureBriefingDefaults();
    db.teamDayBrief.date = ccTodayISO();
    renderAll();
}

function addBriefingTask() {
    const inp = document.getElementById('new-brief-task');
    const text = (inp && inp.value || '').trim();
    if (!text) return;
    ensureBriefingDefaults();
    db.teamDayBrief.tasks.push({ id: 'bt' + Date.now(), text, done: false });
    if (inp) inp.value = '';
    renderAll();
}

function deleteBriefingTask(index) {
    ensureBriefingDefaults();
    db.teamDayBrief.tasks.splice(index, 1);
    renderAll();
}

function updateBriefingTaskText(index, text) {
    ensureBriefingDefaults();
    if (db.teamDayBrief.tasks[index]) db.teamDayBrief.tasks[index].text = text.trim();
    renderAll();
}

function toggleBriefingTaskDone(index) {
    ensureBriefingDefaults();
    if (db.teamDayBrief.tasks[index]) db.teamDayBrief.tasks[index].done = !db.teamDayBrief.tasks[index].done;
    renderAll();
}

function addChecklistTemplateItem() {
    const inp = document.getElementById('new-checklist-item');
    const text = (inp && inp.value || '').trim();
    if (!text) return;
    ensureBriefingDefaults();
    db.checklistMorningTemplate.push({ id: 'm' + Date.now(), text });
    if (inp) inp.value = '';
    renderAll();
}

function deleteChecklistTemplateItem(index) {
    if (!confirm('Routine aus der Vorlage entfernen?')) return;
    ensureBriefingDefaults();
    db.checklistMorningTemplate.splice(index, 1);
    renderAll();
}

function updateChecklistTemplateText(index, text) {
    ensureBriefingDefaults();
    if (db.checklistMorningTemplate[index]) db.checklistMorningTemplate[index].text = text.trim();
    renderAll();
}

let customTabCounter = 0;

function loadCompanySettingsToUI() {
    if(!db.company) return;
    document.getElementById('comp-name').value = db.company.name || "Tresch & Sohn";
    document.getElementById('comp-color').value = db.company.color || "#004b93";
    let lgVal = db.company.leergut || "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0";
    document.getElementById('comp-leergut').value = lgVal;
    if(db.company.modules) {
        let m = db.company.modules;
        document.getElementById('mod-lkw').checked = typeof m.lkw === 'object' ? m.lkw.active !== false : m.lkw !== false;
        document.getElementById('mod-lkw-name').value = typeof m.lkw === 'object' && m.lkw.name ? m.lkw.name : "🚛 LKW";
        
        document.getElementById('mod-sort').checked = typeof m.sort === 'object' ? m.sort.active !== false : m.sort !== false;
        document.getElementById('mod-sort-name').value = typeof m.sort === 'object' && m.sort.name ? m.sort.name : "📦 Sortierung";
        
        document.getElementById('mod-noelke').checked = typeof m.noelke === 'object' ? m.noelke.active !== false : m.noelke !== false;
        document.getElementById('mod-noelke-name').value = typeof m.noelke === 'object' && m.noelke.name ? m.noelke.name : "📝 Nölke";

        document.getElementById('mod-leergut').checked = typeof m.leergut === 'object' ? m.leergut.active !== false : m.leergut !== false;
        document.getElementById('mod-leergut-name').value = typeof m.leergut === 'object' && m.leergut.name ? m.leergut.name : "📥 Leergut";

        document.getElementById('mod-brandenburg').checked = typeof m.brandenburg === 'object' ? m.brandenburg.active !== false : m.brandenburg !== false;
        document.getElementById('mod-brandenburg-name').value = typeof m.brandenburg === 'object' && m.brandenburg.name ? m.brandenburg.name : "🏭 Brandenburg";

        document.getElementById('mod-checklist').checked = typeof m.checklist === 'object' ? m.checklist.active !== false : m.checklist !== false;
        document.getElementById('mod-checklist-name').value = typeof m.checklist === 'object' && m.checklist.name ? m.checklist.name : "📋 Checkliste";
    }
    const tabsList = document.getElementById('custom-tabs-list');
    if(tabsList) {
        tabsList.innerHTML = '';
        if (db.company.customTabs && Array.isArray(db.company.customTabs)) {
            db.company.customTabs.forEach(t => addCustomTabUI(t));
        }
    }
}

function addCustomTabUI(t = null) {
    if (!t) t = { id: 'tab_' + Date.now(), name: '', sync: true, fields: [] };
    const tabId = t.id || 'tab_' + Date.now() + '_' + (++customTabCounter);
    
    const div = document.createElement('div');
    div.className = 'custom-tab-entry';
    div.dataset.id = tabId;
    div.style.cssText = "border: 2px solid #9c27b0; padding: 15px; border-radius: 8px; margin-bottom: 20px; background: #fff;";
    
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center; background:#f3e5f5; padding:10px; border-radius:6px;">
            <div style="flex:1; display:flex; gap:10px; align-items:center;">
                <b style="color:#9c27b0;">Tab-Name:</b>
                <input type="text" class="ct-name" placeholder="z.B. 'Wareneingang'" value="${t.name}" style="flex:1; padding:8px; border-radius:4px; border:1px solid #ccc; font-weight:bold;">
            </div>
            <button class="btn" style="background:#dc3545; margin-left:15px;" onclick="this.parentElement.parentElement.remove()">🗑️ Tab löschen</button>
        </div>
        
        <div style="margin-bottom: 15px; padding: 10px; background: #e3f2fd; border-radius: 6px; border: 1px solid #bbdefb;">
            <label style="cursor:pointer; font-size:13px; font-weight:bold; color:#0d47a1; display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="ct-sync" ${t.sync !== false ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;"> ☁️ Eingegebene Daten dieses Tabs mit der Cloud synchronisieren
            </label>
        </div>

        <div style="margin-bottom: 10px;"><b style="font-size:12px; color:#555;">FELDER (MASKEN-AUFBAU):</b></div>
        <div class="ct-fields-container" style="display:flex; flex-wrap:wrap; gap:10px; background:#fafafa; border:1px solid #ddd; padding:15px; border-radius:6px; min-height: 50px;">
        </div>
        <button class="btn" style="background:#4caf50; margin-top:10px; font-size:12px; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;" onclick="addFieldToTab(this.parentElement, null)">+ Neues Feld im Raster anlegen</button>
    `;
    document.getElementById('custom-tabs-list').appendChild(div);

    const fieldsContainer = div.querySelector('.ct-fields-container');
    if (t.fields && t.fields.length > 0) {
        t.fields.forEach(f => addFieldToTab(div, f));
    } else {
        addFieldToTab(div, { label: 'Artikel', type: 'text', width: 'half', mic: false, scan: true });
    }
}

function addFieldToTab(tabEl, f) {
    if (!f) f = { label: '', type: 'text', width: 'half', mic: false, scan: false };
    const container = tabEl.querySelector('.ct-fields-container');
    
    const fDiv = document.createElement('div');
    fDiv.className = 'ct-field-item card';
    fDiv.style.cssText = `flex: 1 1 ${f.width === 'full' ? '100%' : '45%'}; min-width:250px; background:white; padding:10px; margin-bottom:0; border-top: 3px solid #00bcd4; box-shadow: 0 2px 4px rgba(0,0,0,0.1);`;
    
    fDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <input type="text" class="cf-label" placeholder="Feld-Name (z.B. 'Gewicht')" value="${f.label}" style="width:70%; padding:6px; font-weight:bold; font-size:13px; border:1px solid #ccc; border-radius:4px;">
            <span style="cursor:pointer; color:red; font-size:18px; font-weight:bold;" onclick="this.parentElement.parentElement.remove()" title="Feld löschen">&times;</span>
        </div>
        <div style="display:flex; gap:5px; margin-bottom:8px;">
            <select class="cf-type" style="flex:1; padding:6px; font-size:11px; border-radius:4px; border:1px solid #ccc;">
                <option value="text" ${f.type==='text'?'selected':''}>Text/Zahl</option>
                <option value="number" ${f.type==='number'?'selected':''}>Nur Zahlen</option>
                <option value="date" ${f.type==='date'?'selected':''}>Datum</option>
                <option value="textarea" ${f.type==='textarea'?'selected':''}>Mehrzeiliger Text</option>
                <option value="photo" ${f.type==='photo'?'selected':''}>Kamera / Foto</option>
                <option value="select-suppliers" ${f.type==='select-suppliers'?'selected':''}>Liste: Lieferanten</option>
                <option value="select-workers" ${f.type==='select-workers'?'selected':''}>Liste: Mitarbeiter</option>
                <option value="select-articles" ${f.type==='select-articles'?'selected':''}>Liste: Artikel</option>
                <option value="select-noelke" ${f.type==='select-noelke'?'selected':''}>Liste: Nölke-Katalog</option>
            </select>
            <select class="cf-width" style="flex:1; padding:6px; font-size:11px; border-radius:4px; border:1px solid #ccc;" onchange="this.parentElement.parentElement.style.flexBasis = this.value==='full' ? '100%' : '45%'">
                <option value="half" ${f.width==='half'?'selected':''}>Halbe Breite (50%)</option>
                <option value="full" ${f.width==='full'?'selected':''}>Volle Breite (100%)</option>
            </select>
        </div>
        <div style="display:flex; gap:10px; font-size:11px; color:#555;">
            <label style="cursor:pointer;"><input type="checkbox" class="cf-scan" ${f.scan?'checked':''}> 📷 Scanner-Button</label>
            <label style="cursor:pointer;"><input type="checkbox" class="cf-mic" ${f.mic?'checked':''}> 🎤 Mikro-Button</label>
        </div>
    `;
    container.appendChild(fDiv);
}

function saveCompanySettings() {
    let customTabs = [];
    document.querySelectorAll('.custom-tab-entry').forEach(tabEl => {
        let tabData = {
            id: tabEl.dataset.id || 'tab_' + Date.now(),
            name: tabEl.querySelector('.ct-name').value.trim() || 'Unbenannter Tab',
            sync: tabEl.querySelector('.ct-sync').checked,
            fields: []
        };
        
        tabEl.querySelectorAll('.ct-field-item').forEach(fieldEl => {
            tabData.fields.push({
                label: fieldEl.querySelector('.cf-label').value.trim() || 'Feld',
                type: fieldEl.querySelector('.cf-type').value,
                width: fieldEl.querySelector('.cf-width').value,
                scan: fieldEl.querySelector('.cf-scan').checked,
                mic: fieldEl.querySelector('.cf-mic').checked
            });
        });
        customTabs.push(tabData);
    });

    let lgRaw = document.getElementById('comp-leergut').value.trim() || "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0";
    lgRaw = lgRaw.split(',').map(s => s.trim()).filter(p => p && !/^WK2\s*:/i.test(p)).join(', ');

    db.company = {
        name: document.getElementById('comp-name').value.trim() || "Tresch & Sohn",
        color: document.getElementById('comp-color').value || "#004b93",
        leergut: lgRaw,
        modules: { 
            lkw: { active: document.getElementById('mod-lkw').checked, name: document.getElementById('mod-lkw-name').value.trim() },
            sort: { active: document.getElementById('mod-sort').checked, name: document.getElementById('mod-sort-name').value.trim() },
            noelke: { active: document.getElementById('mod-noelke').checked, name: document.getElementById('mod-noelke-name').value.trim() },
            leergut: { active: document.getElementById('mod-leergut').checked, name: document.getElementById('mod-leergut-name').value.trim() },
            brandenburg: { active: document.getElementById('mod-brandenburg').checked, name: document.getElementById('mod-brandenburg-name').value.trim() },
            checklist: { active: document.getElementById('mod-checklist').checked, name: document.getElementById('mod-checklist-name').value.trim() }
        },
        customTabs: customTabs
    };
    saveSystemSettings(); 
}

function addCloudLog(action) {
    let logs = JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]');
    const now = new Date();
    const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const isErr = /fehler|error|nicht/i.test(action);
    const isOk = /\[OK\]|erfolg|gespeichert|geladen/i.test(action);
    logs.unshift({ date, time, action, cls: isErr ? 'err' : isOk ? 'ok' : '' });
    if(logs.length > 50) logs.pop();
    localStorage.setItem('admin_cloud_logs', JSON.stringify(logs));
    renderCloudLogs();
}

function renderCloudLogs() {
    const list = document.getElementById('cloud-log-list');
    if(!list) return;
    let logs = JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]');
    if(logs.length === 0) {
        list.innerHTML = '<div class="activity-item"><span class="activity-time">—</span><span class="activity-msg">Noch keine Cloud-Aktionen</span></div>';
        return;
    }
    list.innerHTML = logs.map(l => {
        const entry = typeof l === 'string' ? { date: '', time: '', action: l.replace(/C:\\&gt;\s*/, ''), cls: '' } : l;
        const ts = entry.date && entry.time ? `${entry.date} ${entry.time}` : '—';
        return `<div class="activity-item"><span class="activity-time">${ts}</span><span class="activity-msg ${entry.cls || ''}">${entry.action}</span></div>`;
    }).join('');
}

async function pushSettingsToCloud() {
    const res = await cloudFetch(CLOUD_URL + "/settings.json", {
        method: 'PUT',
        body: JSON.stringify(db.settings),
        headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error("Cloud-Status " + res.status);
    addCloudLog("UPLOAD: Einstellungen (PIN etc.) in Cloud gespeichert [OK]");
}

function applySettingsFromForm() {
    const newCloudUrl = sanitizeCloudUrl(document.getElementById('set-cloud-url').value);
    if (newCloudUrl) localStorage.setItem('custom_cloud_url', newCloudUrl);
    else localStorage.removeItem('custom_cloud_url');
    CLOUD_URL = getEffectiveCloudUrl();
    if (document.getElementById('set-cloud-url')) {
        document.getElementById('set-cloud-url').value = newCloudUrl;
    }
    const oldPin = (db.settings && db.settings.logistikPin) || '';
    const newPin = document.getElementById('set-logistik-pin').value.trim();
    let pinVersion = parseInt(db.settings?.pinVersion, 10) || 1;
    if (newPin && newPin !== oldPin) pinVersion += 1;
    db.settings = {
        printerIp: document.getElementById('set-printer-ip').value.trim(),
        notificationUrl: document.getElementById('set-notification-url').value.trim(),
        logistikPin: newPin,
        adminPin: document.getElementById('set-admin-pin').value.trim(),
        pinVersion: pinVersion,
        inactivityTimeout: Math.max(0, parseInt(document.getElementById('set-inactivity-timeout').value, 10) || 0),
        noelkeDefaultArtNr: document.getElementById('set-noelke-artnr').value.trim() || "NÖLKE",
        zplTemplate: document.getElementById('set-zpl-template').value.trim()
    };
    return { oldPin, newPin, pinVersion };
}

async function saveSystemSettings() {
    const { oldPin, newPin, pinVersion } = applySettingsFromForm();
    renderAll();
    mirrorToKombiStorage();
    try {
        await pushSettingsToCloud();
        alert("✅ Einstellungen in der Cloud gespeichert!" + (newPin !== oldPin ? "\n\n🔒 PIN geändert – pinVersion " + pinVersion : ""));
    } catch (e) {
        alert("❌ PIN/Einstellungen NICHT in der Cloud gespeichert:\n" + e.message + "\n\nControl Center über Server öffnen (nicht Doppelklick) und app-secrets.json laden.");
    }
}

function testZebraPrinter() {
    const ip = document.getElementById('set-printer-ip').value.trim();
    if(!ip) return alert("Bitte zuerst eine IP eintragen!");
    const zpl = "^XA\n^FO50,50^A0N,50,50^FDTESTDRUCK ERFOLGREICH^FS\n^XZ";
    fetch(`http://${ip}/pstprnt`, { method: 'POST', mode: 'no-cors', body: zpl })
    .then(() => alert("Testdruck gesendet! Wenn der Drucker verbunden ist, sollte jetzt ein kleines Etikett kommen."))
    .catch(err => alert("Fehler beim Senden: " + err.message));
}

function pushAppUpdate() {
    if(!confirm("Möchtest du jetzt ein Update-Signal an alle Tablets senden? Auf den Geräten erscheint dann ein Hinweis, die App neu zu laden.")) return;
    if(!db.settings) db.settings = {};
    db.settings.lastUpdatePush = Date.now();
    pushToCloud();
}

// TAGES-ERFASSUNG (MITARBEITER) LOGIK
// =========================================================================
function adminSaveDelivery() {
    const d = document.getElementById('admin-work-date').value;
    const s = document.getElementById('admin-supplier').value;
    const k = parseFloat(document.getElementById('admin-weight').value);
    const lineEl = document.getElementById('admin-supplier-line');
    const lineWrap = document.getElementById('admin-supplier-line-wrap');
    const line = (lineWrap && lineWrap.style.display !== 'none' && lineEl && lineEl.value) ? lineEl.value : '';
    if(!d || !s || !k) return alert("Bitte Datum, Lieferant und Gewicht eingeben.");
    
    if (!db.deliveries) db.deliveries = [];
    const entry = { id: Date.now().toString(), date: d, name: s, kg: k, workerShares: [], source: 'lkw' };
    if (line) entry.line = line;
    db.deliveries.push(entry);
    localStorage.setItem('logistik_offline_db', JSON.stringify(db));
    document.getElementById('admin-weight').value = '';
    renderAll();
}

function updateErfassungSyncStatus(extra) {
    const el = document.getElementById('erfassung-sync-status');
    if (!el) return;
    const datum = (document.getElementById('admin-work-date') || {}).value || '';
    const totalBuch = (db.teamSortierBuchungen || []).length;
    const isoDatum = typeof normalizeDatumIso === 'function' ? normalizeDatumIso(datum) : datum;
    const mergedBuch = typeof sortierBuchungenMitCloudCache === 'function'
        ? sortierBuchungenMitCloudCache(db)
        : (db.teamSortierBuchungen || []);
    const buchCnt = filterDeletedSortierBuchungen(mergedBuch, db.deletedSortierBuchungen)
        .filter((b) => typeof buchungDatumPasst === 'function' ? buchungDatumPasst(b, isoDatum) : b.datum === isoDatum).length;
    const cloudDatumCnt = (window._lastCloudBuchungen || []).filter((b) =>
        typeof buchungDatumPasst === 'function' ? buchungDatumPasst(b, isoDatum) : b.datum === isoDatum
    ).length;
    const handyCnt = typeof getHandySortierEntriesFuerDatum === 'function'
        ? getHandySortierEntriesFuerDatum(db, isoDatum).length
        : 0;
    const ts = window._erfassungLastCloudPull
        ? new Date(window._erfassungLastCloudPull).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';
    const cloudB = window._lastCloudBuchungenCount != null ? window._lastCloudBuchungenCount : '?';
    const cloudD = window._lastCloudSortierDelCount != null ? window._lastCloudSortierDelCount : '?';
    const datumLbl = datum ? datum.split('-').reverse().join('.') : '—';
    const cloudDays = Array.isArray(window._lastCloudDateRows) && window._lastCloudDateRows.length
        ? ' · Cloud-Tage: ' + window._lastCloudDateRows.slice(0, 4).map((r) => r.datum.split('-').reverse().join('.') + '(' + r.count + ')').join(' ')
        : '';
    const cloudHint = cloudDatumCnt > buchCnt ? ` · Cloud am Tag: ${cloudDatumCnt}` : '';
    el.textContent = `Cloud: ${ts} · gesamt: ${totalBuch}/${cloudB} Buch. · am ${datumLbl}: ${buchCnt} aktiv / ${handyCnt} Zeilen${cloudHint}${cloudDays}${extra ? ' · ' + extra : ''}`;
}

async function refreshErfassungFromCloud(silent) {
    const statusEl = document.getElementById('erfassung-sync-status');
    if (statusEl) statusEl.textContent = 'Cloud wird geladen…';
    syncSortierDatenFuerErfassung();
    try {
        const res = await cloudFetch(CLOUD_URL + ".json?t=" + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const cloudDb = await res.json();
        const cloudBuchungen = typeof asSortierBuchungenArray === 'function'
            ? asSortierBuchungenArray(cloudDb?.teamSortierBuchungen)
            : (Array.isArray(cloudDb?.teamSortierBuchungen) ? cloudDb.teamSortierBuchungen : []);
        window._lastCloudBuchungenCount = cloudBuchungen.length;
        window._lastCloudBuchungen = cloudBuchungen;
        window._lastCloudSortierDelCount = (cloudDb?.deliveries || []).filter((d) => d && d.source === 'sortieren').length;
        window._lastCloudDateRows = typeof sortierBuchungenNachDatum === 'function'
            ? sortierBuchungenNachDatum({ teamSortierBuchungen: cloudBuchungen })
            : [];
        if (cloudDb) {
            if (Array.isArray(cloudDb.deletedSortierBuchungen)) {
                // Migration: \0 null-byte separator → |
                cloudDb.deletedSortierBuchungen = cloudDb.deletedSortierBuchungen.map(k => k.replace('\0', '|'));
                db.deletedSortierBuchungen = mergeDeletedSortierKeys(db.deletedSortierBuchungen, cloudDb.deletedSortierBuchungen);
            }
            if (cloudBuchungen.length) {
                if (typeof applyCloudSortierBuchungen === 'function') {
                    applyCloudSortierBuchungen(db, cloudBuchungen);
                } else {
                    db.teamSortierBuchungen = mergeTeamSortierBuchungen(
                        db.teamSortierBuchungen || [],
                        cloudBuchungen,
                        db.deletedSortierBuchungen
                    );
                }
            }
            if (cloudDb.teamTagesMengen && typeof cloudDb.teamTagesMengen === 'object') {
                db.teamTagesMengen = mergeTeamTagesMengen(db.teamTagesMengen || {}, cloudDb.teamTagesMengen);
            }
            if (cloudDb.deliveries != null) {
                db.deliveries = mergeDeliveriesArrays(db.deliveries || [], cloudDb.deliveries);
            }
            if (typeof bereinigeGeloeschteSortierDeliveries === 'function') bereinigeGeloeschteSortierDeliveries(db);
            syncSortierDatenFuerErfassung();
            window._erfassungLastCloudPull = Date.now();
            localStorage.setItem('logistik_offline_db', JSON.stringify(db));
            mirrorToKombiStorage();
            addCloudLog('ERFASSUNG: Cloud-Stand geladen [OK]');
        }
        const dInput = document.getElementById('admin-work-date');
        if (dInput && !dInput.value) {
            const rows = typeof sortierBuchungenNachDatum === 'function' ? sortierBuchungenNachDatum(db) : [];
            dInput.value = rows.length ? rows[0].datum : ccTodayISO();
        }
    } catch (e) {
        syncSortierDatenFuerErfassung();
        updateErfassungSyncStatus(silent ? 'offline/lokal' : 'Fehler');
        if (!silent) alert('Cloud-Abruf fehlgeschlagen: ' + e.message);
        renderAdminDeliveries();
        return;
    }
    renderAdminDeliveries();
    if (!silent) {
        const sticky = document.getElementById('sticky-status');
        if (sticky) sticky.textContent = 'Erfassung aktualisiert · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
}

function renderAdminDeliveries() {
    const d = document.getElementById('admin-work-date'); if(!d) return;
    const list = document.getElementById('admin-delivery-list'); if(!list) return;
    const openList = document.getElementById('admin-open-deliveries-list');
    syncSortierDatenFuerErfassung();

    let datum = d.value;
    if (!datum) { datum = ccTodayISO(); d.value = datum; }
    if (typeof persistHandyEntriesToDeliveries === 'function') persistHandyEntriesToDeliveries(db, datum);
    const handyEntries = typeof getHandySortierEntriesFuerDatum === 'function'
        ? getHandySortierEntriesFuerDatum(db, datum)
        : (db.deliveries || []).filter((x) => x.date === datum && x.source === 'sortieren');
    const dateRows = typeof sortierBuchungenNachDatum === 'function' ? sortierBuchungenNachDatum(db) : [];
    const lkwEntries = (db.deliveries || []).filter((x) => x.date === datum && !isHandySortierEntry(x));
    updateErfassungSyncStatus();

    let html = '';

    html += '<div style="margin-bottom:16px;"><div style="font-size:12px; font-weight:bold; color:#2e7d32; margin-bottom:8px;">⚖️ Sortieren → Drucken (automatisch, pro Lieferant)</div>';
    const cloudRows = Array.isArray(window._lastCloudDateRows) ? window._lastCloudDateRows : [];
    const cloudCntTag = cloudRows.find((r) => r.datum === datum)?.count || 0;
    if (handyEntries.length === 0) {
        const dateHint = dateRows.length
            ? '<br><b>Lokal gespeichert:</b> ' + dateRows.slice(0, 5).map((r) => r.datum.split('-').reverse().join('.') + ' (' + r.count + ')').join(' · ')
            : '';
        const cloudHint = cloudRows.length
            ? '<br><b>In Cloud:</b> ' + cloudRows.slice(0, 5).map((r) => r.datum.split('-').reverse().join('.') + ' (' + r.count + ')').join(' · ')
            : '';
        html += '<p style="padding:12px; color:#666; background:#f5f5f5; border-radius:8px; margin:0;">Noch keine Druck-Buchung für <b>' + datum.split('-').reverse().join('.') + '</b>.'
            + (cloudCntTag ? ' In der Cloud sind <b>' + cloudCntTag + ' Buchungen</b> — bitte <b>🔄 Cloud aktualisieren</b>.' : ' Datum links anpassen (z.&nbsp;B. 10.06.) oder Rechner Sortieren → Drucken.')
            + dateHint + cloudHint + '</p>';
    } else {
        html += handyEntries.map((del) => {
            const st = deliveryErfassungStatus(del);
            const shareCount = (del.workerShares || []).length;
            const cloudBadge = del._ausCloud ? ' <span style="font-size:10px;background:#e3f2fd;color:#1565c0;padding:2px 6px;border-radius:4px;">Cloud</span>' : '';
            return `<div class="selectable-item" data-delivery-id="${String(del.id).replace(/"/g, '&quot;')}" style="border-left:6px solid #2e7d32; background:#f1f8f4; cursor:pointer;">
                <div>
                    <strong style="font-size:16px;">${deliveryDisplayName(del)}</strong>${cloudBadge}<br>
                    <small style="color:#666;">${shareCount > 0 ? shareCount + ' Mitarbeiter zugewiesen' : 'Klicken zum Zuweisen'}</small>
                </div>
                <div style="text-align:right;">
                    <strong style="font-size:16px;">${(parseFloat(del.kg) || 0).toLocaleString('de-DE')} kg</strong><br>
                    <small style="font-weight:bold;color:${st.color}">${st.label}</small>
                </div>
            </div>`;
        }).join('');
    }
    html += '</div>';

    html += '<div style="font-size:12px; font-weight:bold; color:#444; margin-bottom:8px;">📝 Manuelle Eingabe (nur PC, nicht Cloud)</div>';
    if (lkwEntries.length === 0) {
        html += '<p style="padding:12px; color:#666;">Keine manuellen Einträge für dieses Datum.</p>';
    } else {
        html += lkwEntries.map(del => {
            const st = deliveryErfassungStatus(del);
            const border = st.done ? 'var(--success)' : 'var(--accent)';
            const shareCount = del.workerShares ? del.workerShares.length : 0;
            return `<div class="selectable-item" data-delivery-id="${String(del.id).replace(/"/g, '&quot;')}" style="border-left: 6px solid ${border}; cursor:pointer;">
                <div>
                    <strong style="font-size:16px;">${deliveryDisplayName(del)}</strong><br>
                    <small style="color:#666;">${shareCount > 0 ? shareCount + ' Mitarbeiter zugewiesen' : 'Noch keine Zuweisung'}</small>
                </div>
                <div style="text-align:right;">
                    <strong style="font-size:16px;">${del.kg} kg</strong><br>
                    <small style="font-weight:bold; color:${st.color}">${st.label}</small>
                </div>
            </div>`;
        }).join('');
    }
    list.innerHTML = html;
    initAdminDeliveryListClicks();

    if (openList) {
        // Sortieren: direkt aus buchungen berechnen (alle Daten) — gleiche Quelle wie Erfassung-Anzeige
        const sortierenOpen = [];
        if (typeof sammleAlleErfassungsDaten === 'function' && typeof getHandySortierEntriesFuerDatum === 'function') {
            sammleAlleErfassungsDaten(db).forEach(d => {
                getHandySortierEntriesFuerDatum(db, d).forEach(entry => {
                    const sum = (entry.workerShares || []).reduce((acc, v) => acc + (parseFloat(v.kg) || 0), 0);
                    const kg = parseFloat(entry.kg) || 0;
                    if (!entry.isFullySorted && sum < kg) sortierenOpen.push(entry);
                });
            });
        }
        // Manuelle LKW-Einträge: aus db.deliveries (PC-lokal)
        const lkwOpen = (db.deliveries || [])
            .filter(del => typeof isHandySortierEntry === 'function' ? !isHandySortierEntry(del) : true)
            .filter(del => {
                const sum = (del.workerShares || []).reduce((acc, v) => acc + (parseFloat(v.kg) || 0), 0);
                return sum < (parseFloat(del.kg) || 0) && !del.isFullySorted;
            });

        const openDeliveries = [...sortierenOpen, ...lkwOpen]
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (openDeliveries.length === 0) {
            openList.innerHTML = '<div style="grid-column: 1 / -1; padding: 15px; background: #e8f5e9; border-radius: 8px; color: #137333; font-weight: bold; text-align: center;">✅ Alles erledigt! Keine offenen Posten mehr.</div>';
        } else {
            openList.innerHTML = openDeliveries.map(del => {
                const sum = (del.workerShares || []).reduce((acc, v) => acc + (parseFloat(v.kg) || 0), 0);
                const kg = parseFloat(del.kg) || 0;
                const remaining = kg - sum;
                const formattedDate = new Date(del.date).toLocaleDateString('de-DE');
                const isSortier = typeof isHandySortierEntry === 'function' && isHandySortierEntry(del);
                const borderColor = isSortier ? '#2e7d32' : 'var(--accent)';
                const badge = isSortier ? '<span style="font-size:10px;background:#e8f5e9;color:#2e7d32;padding:2px 6px;border-radius:4px;margin-left:6px;">Sortieren</span>' : '';
                return `<div style="background:#fff;border:1px solid #ddd;border-left:4px solid ${borderColor};border-radius:8px;padding:15px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.05);" data-delivery-id="${String(del.id).replace(/"/g, '&quot;')}" onclick="openAdminEditDelivery(this.dataset.deliveryId)">
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px;flex-wrap:wrap;gap:4px;">
                        <strong style="font-size:15px;color:var(--primary);">${deliveryDisplayName(del)}${badge}</strong>
                        <span style="font-size:12px;color:#666;background:#eee;padding:2px 6px;border-radius:4px;">📅 ${formattedDate}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
                        <div style="font-size:12px;color:#555;">Gesamt: ${kg.toLocaleString('de-DE')} kg<br>Verteilt: ${sum.toFixed(2)} kg</div>
                        <div style="text-align:right;color:var(--accent);font-weight:bold;font-size:16px;">${remaining.toFixed(2)} kg offen</div>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function openAdminEditDelivery(id) {
    if (!id) return;
    const del = typeof resolveSortierDeliveryInDb === 'function'
        ? resolveSortierDeliveryInDb(db, id)
        : db.deliveries.find((x) => x.id === id);
    if (!del) {
        alert('Eintrag nicht gefunden — bitte 🔄 Cloud aktualisieren.');
        return;
    }
    try {
        localStorage.setItem('logistik_offline_db', JSON.stringify(db));
        mirrorToKombiStorage();
    } catch (e) { /* ignore */ }
    adminEditingDeliveryId = del.id;
    document.getElementById('admin-edit-del-name').innerText = deliveryDisplayName(del);
    const kgInput = document.getElementById('admin-edit-total-kg');
    if (kgInput) {
        kgInput.value = del.kg;
        kgInput.readOnly = del.source === 'sortieren' || del.source === 'sortieren_tag';
        kgInput.title = (del.source === 'sortieren' || del.source === 'sortieren_tag')
            ? 'Gewicht kommt vom Handy (Sortieren → Drucken)'
            : '';
    }
    document.getElementById('admin-edit-date').value = del.date;
const wDateInput = document.getElementById('admin-worker-date');
if (wDateInput) wDateInput.value = new Date().toISOString().split('T')[0];
    const fullySortedCb = document.getElementById('admin-fully-sorted-cb');
    if(fullySortedCb) fullySortedCb.checked = !!del.isFullySorted;
    updateAdminShareList(); document.getElementById('edit-delivery-overlay').style.display = 'flex';
}
function closeAdminEditDelivery() { document.getElementById('edit-delivery-overlay').style.display = 'none'; adminEditingDeliveryId = null; }

function adminToggleFullySorted() {
    const del = db.deliveries.find(x => x.id === adminEditingDeliveryId); if(!del) return;
    const cb = document.getElementById('admin-fully-sorted-cb');
    del.isFullySorted = cb.checked;
    renderAll(); updateAdminShareList();
}

function updateAdminShareList() {
    const del = db.deliveries.find(x => x.id === adminEditingDeliveryId); if(!del) return;
    const shares = del.workerShares || []; const sum = shares.reduce((acc, v) => acc + v.kg, 0);
    const openKg = del.kg - sum;
    document.getElementById('admin-open-kg').innerText = openKg.toFixed(2);
    
    document.getElementById('admin-share-list').innerHTML = shares.map((s, i) => {
        let color = db.workerColors && db.workerColors[s.name] ? db.workerColors[s.name] : '#333';
    let dateHtml = s.date && s.date !== del.date ? ` <span style="font-size:11px; color:#888;">(${new Date(s.date).toLocaleDateString('de-DE')})</span>` : '';
        return `<div style="display:flex; justify-content:space-between; padding:10px; background:white; margin-bottom:5px; border-radius:4px; border:1px solid #ccc;">
        <strong style="color:${color}; font-size:15px;">${s.name}${dateHtml}</strong>
            <span style="font-weight:bold;">${s.kg} kg <button onclick="adminRemoveShare(${i})" style="border:none; background:none; color:red; cursor:pointer; font-size:18px; margin-left:10px;">&times;</button></span>
        </div>`;
    }).join('');

    const kgInput = document.getElementById('admin-worker-kg');
    if(kgInput) { kgInput.value = (openKg > 0 && !del.isFullySorted) ? parseFloat(openKg.toFixed(2)) : ''; }
}

function adminAddWorkerShare() {
    const del = db.deliveries.find(x => x.id === adminEditingDeliveryId); if(!del) return;
    const worker = document.getElementById('admin-worker-select').value;
    let kg = parseFloat(document.getElementById('admin-worker-kg').value);
    if(!worker) return alert("Bitte Mitarbeiter wählen.");
    
    const sum = (del.workerShares || []).reduce((acc, v) => acc + v.kg, 0); const open = del.kg - sum;
    if(isNaN(kg) || kg <= 0) { if(open > 0) kg = parseFloat(open.toFixed(2)); else return; }

    if(!del.workerShares) del.workerShares = [];
    del.workerShares.push({ name: worker, kg: kg });
    renderAll(); updateAdminShareList();
}

function adminRemoveShare(index) {
    const del = db.deliveries.find(x => x.id === adminEditingDeliveryId);
    if(!del || !del.workerShares) return; del.workerShares.splice(index, 1);
    renderAll(); updateAdminShareList();
}

function adminUpdateDelivery() {
    const del = db.deliveries.find(x => x.id === adminEditingDeliveryId); if(!del) return;
    const newKg = parseFloat(document.getElementById('admin-edit-total-kg').value);
    const newDate = document.getElementById('admin-edit-date').value;
    if(newKg && newKg > 0 && newDate) {
        del.kg = newKg;
        del.date = newDate;
        localStorage.setItem('logistik_offline_db', JSON.stringify(db));
        renderAll();
        closeAdminEditDelivery();
    }
}

function adminDeleteDelivery() {
    const del = db.deliveries.find(x => x.id === adminEditingDeliveryId);
    if (!del) return;
    const msg = (del.source === 'sortieren' || del.source === 'sortieren_tag')
        ? 'Handy-Gesamtgewicht für diesen Tag wirklich löschen?\n\nEr erscheint wieder, wenn in der App erneut gedruckt wird.'
        : 'Diesen manuellen Eintrag wirklich komplett löschen?';
    if (!confirm(msg)) return;

    if ((del.source === 'sortieren' || del.source === 'sortieren_tag') && typeof entferneSortierenAusDb === 'function') {
        entferneSortierenAusDb(db, del);
    }
    db.deliveries = db.deliveries.filter(x => x.id !== adminEditingDeliveryId);

    if (typeof patchOfflineDb === 'function') {
        patchOfflineDb({
            deliveries: db.deliveries,
            teamSortierBuchungen: db.teamSortierBuchungen || [],
            teamTagesMengen: db.teamTagesMengen || {},
            deletedSortierBuchungen: db.deletedSortierBuchungen || []
        });
    }
    localStorage.setItem('logistik_offline_db', JSON.stringify(db));
    closeAdminEditDelivery();
    renderAll();
}

// =========================================================================

function renderNoelkeList() {
    const q = document.getElementById('noelke-search').value.toLowerCase();
    const noelkeNr = s => { const m = s.match(/^\[Nr\.\s*(\d+)\]/i); return m ? parseInt(m[1]) : Infinity; };
    const sorted = db.savedProdukteRaw.map((p, i) => ({ p, i })).sort((a, b) => noelkeNr(a.p) - noelkeNr(b.p));
    document.getElementById('noelke-body').innerHTML = sorted.map(({ p, i }) => p.toLowerCase().includes(q) ? `<tr><td class="noelke-cell-text" style="padding:15px; border-bottom:1px solid #eee;">${p}</td><td style="text-align:right; border-bottom:1px solid #eee; white-space:nowrap;"><button onclick="openEditNoelkeModal(${i})" style="border:none; background:none; color:#17a2b8; cursor:pointer; font-size:18px;" title="Bearbeiten">✏️</button><button onclick="deleteNoelke(${i})" style="border:none; background:none; color:red; cursor:pointer; font-size:18px;" title="Löschen">🗑️</button></td></tr>` : '').join('');
}

function renderAdminSonderTpl() {
    const list = document.getElementById('admin-sonder-tpl-list');
    if(!list) return;
    const q = document.getElementById('sonder-tpl-search').value.toLowerCase();
    const filtered = (db.sonderTemplates || []).filter(t => t.name.toLowerCase().includes(q) || (t.ean && t.ean.includes(q)));
    
    filtered.sort((a,b) => a.name.localeCompare(b.name));
    
    list.innerHTML = filtered.map(t => {
        let info = [];
        if(t.s_kg) info.push(t.s_kg + ' kg/Stk');
        if(t.s_stk) info.push(t.s_stk + ' Stk/Krt');
        if(t.s_stke2) info.push(t.s_stke2 + ' Stk/E2');
        return `<div class="selectable-item" style="border-left: 6px solid var(--sonder);" onclick="adminEditSonderTpl('${t.id}')">
            <div>
                <strong style="font-size:16px;">${t.name}</strong><br>
                <small style="color:#666;">EAN: ${t.ean || '-'}</small>
            </div>
            <div style="text-align:right;">
                <span style="font-size:13px; color:var(--primary); font-weight:bold;">${info.join(' | ')}</span>
            </div>
        </div>`;
    }).join('') || '<p style="color:#999;">Keine Vorlagen gefunden.</p>';
}

function adminAddSonderTpl() {
    document.getElementById('admin-tpl-id').value = ''; document.getElementById('admin-edit-tpl-name').innerText = 'Neue Vorlage';
    ['name-input','ean-input','reihe','reihen','krtlage','lagen','stke2','stk','kg'].forEach(id => { document.getElementById('admin-tpl-' + id).value = ''; });
    document.getElementById('edit-sonder-tpl-overlay').style.display = 'flex';
}

function adminEditSonderTpl(id) {
    const tpl = db.sonderTemplates.find(t => t.id === id); if(!tpl) return;
    document.getElementById('admin-tpl-id').value = id; document.getElementById('admin-edit-tpl-name').innerText = tpl.name;
    document.getElementById('admin-tpl-name-input').value = tpl.name || ''; document.getElementById('admin-tpl-ean-input').value = tpl.ean || '';
    document.getElementById('admin-tpl-reihe').value = tpl.s_reihe || ''; document.getElementById('admin-tpl-reihen').value = tpl.s_reihen || '';
    document.getElementById('admin-tpl-krtlage').value = tpl.s_krtlage || ''; document.getElementById('admin-tpl-lagen').value = tpl.s_lagen || '';
    document.getElementById('admin-tpl-stke2').value = tpl.s_stke2 || ''; document.getElementById('admin-tpl-stk').value = tpl.s_stk || '';
    document.getElementById('admin-tpl-kg').value = tpl.s_kg || ''; document.getElementById('edit-sonder-tpl-overlay').style.display = 'flex';
}

function closeAdminSonderTpl() { document.getElementById('edit-sonder-tpl-overlay').style.display = 'none'; }

function adminSaveSonderTpl() {
    const id = document.getElementById('admin-tpl-id').value; const name = document.getElementById('admin-tpl-name-input').value.trim(); const kg = document.getElementById('admin-tpl-kg').value;
    if(!name || !kg) return alert("Bitte mindestens Name und kg/Stück ausfüllen!");
    const tplData = { name: name, ean: document.getElementById('admin-tpl-ean-input').value.trim(), s_reihe: document.getElementById('admin-tpl-reihe').value, s_reihen: document.getElementById('admin-tpl-reihen').value, s_krtlage: document.getElementById('admin-tpl-krtlage').value, s_lagen: document.getElementById('admin-tpl-lagen').value, s_stke2: document.getElementById('admin-tpl-stke2').value, s_stk: document.getElementById('admin-tpl-stk').value, s_kg: kg };
    if(id) { const tpl = db.sonderTemplates.find(t => t.id === id); if(tpl) Object.assign(tpl, tplData); } 
    else { tplData.id = Date.now().toString(); if(!db.sonderTemplates) db.sonderTemplates = []; db.sonderTemplates.push(tplData); }
    renderAll(); closeAdminSonderTpl();
}

function adminDeleteSonderTpl() {
    const id = document.getElementById('admin-tpl-id').value; if(!id) { closeAdminSonderTpl(); return; }
    if(confirm("Diese Vorlage wirklich löschen?")) { db.sonderTemplates = db.sonderTemplates.filter(t => t.id !== id); renderAll(); closeAdminSonderTpl(); }
}

function saveNoelkeItem() { const val = document.getElementById('new-noelke-val').value.trim(); if(val) { db.savedProdukteRaw.push(val); document.getElementById('new-noelke-val').value = ''; renderAll(); } }
function openEditNoelkeModal(i) {
    const p = db.savedProdukteRaw[i];
    if (p === undefined) return;
    editingNoelkeIdx = i;
    document.getElementById('edit-noelke-val').value = p;
    document.getElementById('edit-noelke-overlay').style.display = 'flex';
}
function closeEditNoelkeModal() { document.getElementById('edit-noelke-overlay').style.display = 'none'; editingNoelkeIdx = null; }
function saveEditNoelke() {
    if (editingNoelkeIdx === null) return;
    const val = document.getElementById('edit-noelke-val').value.trim();
    if (!val) return alert('Produktzeile darf nicht leer sein.');
    db.savedProdukteRaw[editingNoelkeIdx] = val;
    closeEditNoelkeModal();
    renderAll();
}
function deleteNoelke(i) { if(confirm("Löschen?")) { db.savedProdukteRaw.splice(i,1); renderAll(); } }

function saveRawJson() { 
    try { 
        let inputStr = document.getElementById('raw-json-input').value.trim();
        if (inputStr.startsWith("```json")) inputStr = inputStr.replace(/```json/g, "").replace(/```/g, "").trim();
        else if (inputStr.startsWith("```")) inputStr = inputStr.replace(/```/g, "").trim();
        
        db = { ...db, ...JSON.parse(inputStr) };
        localStorage.setItem('logistik_offline_db', JSON.stringify(db));
        mirrorToKombiStorage();
        alert("✅ JSON-Code erfolgreich gespeichert! Das Programm wird nun neu gestartet, um alles sauber zu laden."); 
        location.reload();
    } catch(e) { 
        alert("❌ Fehler beim Einlesen! Bitte prüfe, ob du den Text richtig kopiert hast.\n\nDetails: " + e.message); 
    } 
}
function downloadLocalBackup() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2)); const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", "Tresch_Backup_" + new Date().toISOString().split('T')[0] + ".json"); document.body.appendChild(dlAnchorElem); dlAnchorElem.click(); dlAnchorElem.remove(); }

async function pullFromCloud() {
    document.getElementById('db-status').innerText = "Lade Daten aus der Cloud...";
    try {
        const res = await cloudFetch(CLOUD_URL + ".json?t=" + Date.now()); 
        if(!res.ok) throw new Error("Server Fehler");
        const cloudDb = await res.json();
        if(cloudDb) { 
            if(cloudDb.savedProdukteRaw && cloudDb.savedProdukteRaw.length > 0) { const localSet = new Set(db.savedProdukteRaw || []); cloudDb.savedProdukteRaw.forEach(item => { if(!localSet.has(item)) db.savedProdukteRaw.push(item); }); }
            mergeDeletedSuppliersFromCloud(cloudDb.deletedSuppliers);
            mergeSupplierLinesClearedFromCloud(cloudDb.supplierLinesCleared);
            mergeSupplierLinesFromCloud(cloudDb.supplierLines);
            if(cloudDb.suppliers && cloudDb.suppliers.length > 0) db.suppliers = mergeSuppliersList(db.suppliers, cloudDb.suppliers);
            if(cloudDb.customers && cloudDb.customers.length > 0) { const custSet = new Set(db.customers || []); cloudDb.customers.forEach(c => { if(!custSet.has(c.trim())) db.customers.push(c.trim()); }); }
            db.articles = cloudDb.articles || db.articles; db.todo = cloudDb.todo || db.todo; db.lose = cloudDb.lose || db.lose; db.later = cloudDb.later || db.later; db.hidden = cloudDb.hidden || db.hidden; db.workers = cloudDb.workers || db.workers; db.workerColors = cloudDb.workerColors || db.workerColors; db.dailyStaff = cloudDb.dailyStaff || db.dailyStaff; db.dailyAttendance = cloudDb.dailyAttendance || db.dailyAttendance;
            if (cloudDb.teamTagesMengen && typeof cloudDb.teamTagesMengen === 'object') {
                db.teamTagesMengen = mergeTeamTagesMengen(db.teamTagesMengen || {}, cloudDb.teamTagesMengen);
                migriereTeamAusDailyStaff(db.teamTagesMengen, db.dailyStaff);
                syncDailyStaffAusTeam(db.teamTagesMengen, db.dailyStaff);
            }
            if (Array.isArray(cloudDb.deletedSortierBuchungen)) {
                db.deletedSortierBuchungen = mergeDeletedSortierKeys(db.deletedSortierBuchungen, cloudDb.deletedSortierBuchungen);
            }
            if (Array.isArray(cloudDb.teamSortierBuchungen)) {
                const cloudBuch = typeof asSortierBuchungenArray === 'function'
                    ? asSortierBuchungenArray(cloudDb.teamSortierBuchungen)
                    : cloudDb.teamSortierBuchungen;
                window._lastCloudBuchungen = cloudBuch;
                if (typeof applyCloudSortierBuchungen === 'function') {
                    applyCloudSortierBuchungen(db, cloudBuch);
                } else {
                    db.teamSortierBuchungen = mergeTeamSortierBuchungen(
                        db.teamSortierBuchungen || [],
                        cloudBuch,
                        db.deletedSortierBuchungen
                    );
                }
            }
            if (cloudDb.deliveries != null) {
                db.deliveries = mergeDeliveriesArrays(db.deliveries || [], cloudDb.deliveries);
            }
            if (typeof bereinigeGeloeschteSortierDeliveries === 'function') bereinigeGeloeschteSortierDeliveries(db);
            if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
            if (typeof ensureDatenKonsistenz === 'function') ensureDatenKonsistenz(db);
            if (cloudDb.sonderTemplates && cloudDb.sonderTemplates.length > 0) {
                if (!db.sonderTemplates) db.sonderTemplates = [];
                const tplById = new Map(db.sonderTemplates.filter(t => t && t.id).map(t => [t.id, t]));
                cloudDb.sonderTemplates.forEach(t => { if (t && t.id) tplById.set(t.id, t); });
                db.sonderTemplates = Array.from(tplById.values());
            }
            db.settings = cloudDb.settings || db.settings;
            db.company = cloudDb.company || db.company;
            if (cloudDb.artikelMarkt && typeof cloudDb.artikelMarkt === 'object') {
                db.artikelMarkt = { ...(db.artikelMarkt || {}), ...cloudDb.artikelMarkt };
            }
            if (cloudDb.tierartZuordnung && typeof cloudDb.tierartZuordnung === 'object') {
                db.tierartZuordnung = { ...(db.tierartZuordnung || {}), ...cloudDb.tierartZuordnung };
            }
            
            db.suppliers = db.suppliers.map(s => s.trim()).filter(s => s !== "");
            db.articles.forEach(a => { if(a.suppliers) a.suppliers = a.suppliers.map(s => s.trim()); });

            renderAll(); renderV10Table(); 
            document.getElementById('db-status').innerText = "Mit Cloud synchronisiert."; alert("✅ Daten geladen und Leerzeichen gesäubert!"); 
            addCloudLog("DOWNLOAD: System-Daten geladen [OK]");
        }
    } catch(e) {
        const noSecrets = /Cloud-Zugang|nicht konfiguriert|fehlt/i.test(e.message || '');
        if (!noSecrets) alert("❌ Lade-Fehler: " + e.message);
        document.getElementById('db-status').innerText = noSecrets ? "Kein Cloud-Zugang (Secrets fehlen)." : "Fehler.";
        addCloudLog("FEHLER: Download fehlgeschlagen - " + e.message);
    }
}

async function loadReklamationen() {
    const list = document.getElementById('qm-list'); if(!list) return;
    list.innerHTML = '<p style="padding:15px; color:#666;">Lade Daten sicher aus dem Archiv...</p>';
    try {
        // 2026-08-05: Ziel-Pfad ueber cloudTargetUrl, sonst wurde bei leerer CLOUD_URL 'main' gelesen
        const res = await cloudFetch(cloudTargetUrl('reklamationen') + ".json?t=" + Date.now());
        const data = await res.json(); qmData = [];
        if (data) { Object.keys(data).forEach(key => { qmData.push({ dbKey: key, ...data[key] }); });
            qmData.sort((a, b) => {
                let aStr = a.datum ? (a.datum.includes('.') ? a.datum.split('.').reverse().join('-') : a.datum) : '1970-01-01';
                let bStr = b.datum ? (b.datum.includes('.') ? b.datum.split('.').reverse().join('-') : b.datum) : '1970-01-01';
                return new Date(bStr + 'T' + (b.zeit||'00:00')) - new Date(aStr + 'T' + (a.zeit||'00:00'));
            });
        }
        const monthFilter = document.getElementById('qm-month-filter'); const months = new Set();
        qmData.forEach(q => { if(q.datum) { let m = q.datum.includes('.') ? q.datum.split('.')[1]+'.'+q.datum.split('.')[2] : q.datum.substring(0,7); months.add(m); }});
        let currentVal = monthFilter.value; monthFilter.innerHTML = '<option value="all">Alle Monate</option>';
        Array.from(months).sort().reverse().forEach(m => { monthFilter.innerHTML += `<option value="${m}">${m}</option>`; });
        if (Array.from(months).includes(currentVal)) monthFilter.value = currentVal;
        renderQmTable();
    } catch(e) { list.innerHTML = `<p style="padding:15px; color:red;">Fehler beim Laden: ${e.message}</p>`; }
}

function renderQmTable() {
    const list = document.getElementById('qm-list'); if(!list) return;
    const search = document.getElementById('qm-search').value.toLowerCase(); const month = document.getElementById('qm-month-filter').value;
    const filtered = qmData.filter(q => {
        const textMatch = Object.values(q).join(' ').toLowerCase().includes(search);
        let qMonth = q.datum ? (q.datum.includes('.') ? q.datum.split('.')[1]+'.'+q.datum.split('.')[2] : q.datum.substring(0,7)) : '';
        return textMatch && (month === 'all' || qMonth === month);
    });
    if (filtered.length === 0) { list.innerHTML = '<p style="padding:15px; color:#666;">Keine Reklamationen gefunden.</p>'; return; }
    list.innerHTML = filtered.map(q => {
        let leergut = (q.leergutSoll || q.leergutIst) ? `<div style="font-size:12px; color:#555; margin-bottom:4px;"><b>Leergut:</b> ${q.leergutSoll||'-'} (Soll) ➔ ${q.leergutIst||'-'} (Ist)</div>` : '';
        let gewicht = (q.soll || q.ist) ? `<div style="font-size:12px; color:#555; margin-bottom:4px;"><b>Gewicht:</b> ${q.soll||'-'} kg (Soll) ➔ ${q.ist||'-'} kg (Ist)</div>` : '';
        let imgBtn = q.photoBase64 ? `<button class="btn btn-black" style="font-size:11px; padding:6px 10px;" onclick="let w=window.open(''); w.document.write('<img src=\\'${q.photoBase64}\\' style=\\'max-width:100%;\\'>');">📸 Foto ansehen</button>` : '';
        return `<div class="selectable-item" style="border-left: 5px solid #d32f2f; display:flex; justify-content:space-between; align-items:flex-start; cursor:default;">
            <div style="flex:1;">
                <div style="font-size:11px; color:#888; margin-bottom:4px;">📅 ${q.datum} - ${q.zeit} Uhr | 👤 ${q.worker}</div>
                <div style="font-size:16px; font-weight:bold; color:var(--primary); margin-bottom:4px;">${q.lief} <span style="font-size:13px; color:#555; font-weight:normal;">(LS: ${q.ls})</span></div>
                <div style="font-size:14px; color:#d32f2f; font-weight:bold; margin-bottom:6px;">${q.kategorie} ${q.temp ? `(${q.temp} °C)` : ''} ${q.mhd ? `(MHD: ${q.mhd})` : ''}</div>
                ${gewicht} ${leergut}
                <div style="font-size:13px; color:#333; margin-top:6px;"><b>Betroffen:</b> ${q.positionen}</div>
                ${q.bemerkung ? `<div style="font-size:12px; color:#666; margin-top:4px; font-style:italic;">"${q.bemerkung}"</div>` : ''}
            </div>
            <div style="margin-left:15px; display: flex; flex-direction: column; gap: 5px;">
                ${imgBtn}
                <button class="btn btn-cloud" style="font-size:11px; padding:6px 10px;" onclick="editQmReklamation('${q.dbKey}')">✏️ Bearbeiten</button>
                <button class="btn btn-black" style="font-size:11px; padding:6px 10px; background: #dc3545; border-color: #dc3545;" onclick="deleteQmReklamation('${q.dbKey}')">🗑️ Löschen</button>
            </div>
        </div>`;
    }).join('');
}

function exportQmExcel() {
    if(qmData.length === 0) return alert("Keine Daten zum Exportieren!");
    let exportData = qmData.map(q => ({ "Datum": q.datum, "Uhrzeit": q.zeit, "Lieferant": q.lief, "Lieferschein": q.ls, "Kategorie": q.kategorie, "Mitarbeiter": q.worker, "Soll-Gewicht": q.soll || '', "Ist-Gewicht": q.ist || '', "Temp (°C)": q.temp || '', "MHD": q.mhd || '', "Leergut Soll": q.leergutSoll || '', "Leergut Ist": q.leergutIst || '', "Positionen": q.positionen, "Bemerkung": q.bemerkung || '', "Foto": q.photoBase64 ? 'Ja' : 'Nein' }));
    const ws = XLSX.utils.json_to_sheet(exportData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Reklamationen");
    XLSX.writeFile(wb, "QM_Reklamationen_Export.xlsx");
}

let currentEditQmKey = null;

function editQmReklamation(dbKey) {
    const q = qmData.find(x => x.dbKey === dbKey);
    if (!q) return;
    currentEditQmKey = dbKey;
    
    document.getElementById('edit-qm-datum').value = q.datum || '';
    document.getElementById('edit-qm-zeit').value = q.zeit || '';
    document.getElementById('edit-qm-lief').value = q.lief || '';
    document.getElementById('edit-qm-ls').value = q.ls || '';
    document.getElementById('edit-qm-worker').value = q.worker || '';
    document.getElementById('edit-qm-kategorie').value = q.kategorie || '';
    document.getElementById('edit-qm-soll').value = q.soll || '';
    document.getElementById('edit-qm-ist').value = q.ist || '';
    document.getElementById('edit-qm-leergutsoll').value = q.leergutSoll || '';
    document.getElementById('edit-qm-leergutist').value = q.leergutIst || '';
    document.getElementById('edit-qm-temp').value = q.temp || '';
    document.getElementById('edit-qm-mhd').value = q.mhd || '';
    document.getElementById('edit-qm-positionen').value = q.positionen || '';
    document.getElementById('edit-qm-bemerkung').value = q.bemerkung || '';
    
    const preview = document.getElementById('edit-qm-foto-preview');
    if (q.photoBase64) {
        preview.innerHTML = `<b style="font-size:11px;">Aktuelles Beweisfoto:</b><br><img src="${q.photoBase64}" style="max-height: 100px; border-radius: 6px; border: 1px solid #ccc; margin-top: 5px;">`;
        preview.style.display = 'block';
    } else {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }

    document.getElementById('edit-qm-overlay').style.display = 'flex';
}

function closeEditQmModal() {
    document.getElementById('edit-qm-overlay').style.display = 'none';
    currentEditQmKey = null;
}

function updateQmReklamation() {
    if (!currentEditQmKey) return;
    const q = qmData.find(x => x.dbKey === currentEditQmKey);
    if (!q) return;

    const btn = document.getElementById('edit-qm-save-btn');
    btn.innerText = "⏳ Speichere...";
    btn.disabled = true;

    const updatedData = {
        datum: document.getElementById('edit-qm-datum').value,
        zeit: document.getElementById('edit-qm-zeit').value,
        lief: document.getElementById('edit-qm-lief').value,
        ls: document.getElementById('edit-qm-ls').value,
        worker: document.getElementById('edit-qm-worker').value,
        kategorie: document.getElementById('edit-qm-kategorie').value,
        soll: document.getElementById('edit-qm-soll').value,
        ist: document.getElementById('edit-qm-ist').value,
        leergutSoll: document.getElementById('edit-qm-leergutsoll').value,
        leergutIst: document.getElementById('edit-qm-leergutist').value,
        temp: document.getElementById('edit-qm-temp').value,
        mhd: document.getElementById('edit-qm-mhd').value,
        positionen: document.getElementById('edit-qm-positionen').value,
        bemerkung: document.getElementById('edit-qm-bemerkung').value,
        photoBase64: q.photoBase64 || ""
    };

    // 2026-08-05: bisher wurde bei leerer CLOUD_URL der komplette Hauptdatensatz mit einer Reklamation ueberschrieben
    let rekUrl = cloudTargetUrl('reklamationen', currentEditQmKey) + ".json";

    cloudFetch(rekUrl, { method: 'PUT', body: JSON.stringify(updatedData), headers: { 'Content-Type': 'application/json' } })
    .then(res => {
        btn.innerText = "💾 Änderungen speichern";
        btn.disabled = false;
        if(res.ok) { alert("Erfolgreich aktualisiert!"); closeEditQmModal(); loadReklamationen(); } 
        else { alert("Fehler beim Speichern."); }
    }).catch(e => { btn.innerText = "💾 Änderungen speichern"; btn.disabled = false; alert("Netzwerkfehler."); });
}

function deleteQmReklamation(dbKey) {
    if (confirm("Möchtest du diese Reklamation wirklich dauerhaft aus der Cloud löschen?")) {
        // 2026-08-05: ohne cloudTargetUrl fehlte der Reklamations-Unterschluessel, das Loeschen lief ins Leere
        let rekUrl = cloudTargetUrl('reklamationen', dbKey) + ".json";
        cloudFetch(rekUrl, { method: 'DELETE' }).then(res => { if (res.ok) { alert("Reklamation gelöscht!"); loadReklamationen(); } else { alert("Fehler beim Löschen."); } }).catch(e => { alert("Netzwerkfehler."); });
    }
}

async function archiveOldData() {
    if(!confirm("Möchtest du jetzt alle LKW-Erfassungen, die älter als 90 Tage sind, ins Archiv verschieben? Dies macht das System auf den Tablets wieder schneller!")) return;
    
    document.getElementById('db-status').innerText = "Archiviere Daten...";
    
    const now = new Date();
    now.setDate(now.getDate() - 90);
    const cutoffDate = now.toISOString().split('T')[0];
    
    let toArchive = [];
    let toKeep = [];
    
    (db.deliveries || []).forEach(d => {
        if (d.date < cutoffDate) toArchive.push(d);
        else toKeep.push(d);
    });
    
    if (toArchive.length === 0) {
        alert("Es gibt aktuell keine Daten, die älter als 90 Tage sind. Alles ist sauber!");
        document.getElementById('db-status').innerText = "Bereit.";
        return;
    }
    
    try {
        // 2026-08-05: bisher zeigte archiveUrl bei leerer CLOUD_URL auf 'main' - die alten Lieferungen wurden dadurch geloescht
        let archiveUrl = cloudTargetUrl('archive');
        const res = await cloudFetch(archiveUrl + ".json?t=" + Date.now());
        let archiveDb = {};
        if (res.ok) { archiveDb = await res.json() || {}; }
        
        if (!archiveDb.deliveries) archiveDb.deliveries = [];
        archiveDb.deliveries = archiveDb.deliveries.concat(toArchive);
        
        await cloudFetch(archiveUrl + ".json", { method: 'PUT', body: JSON.stringify(archiveDb), headers: { 'Content-Type': 'application/json' } });
        
        db.deliveries = toKeep;
        let uploadDb = prepareDbForCloudUpload(db);
        try {
            // 2026-08-05: Hauptdatensatz jetzt explizit ueber cloudTargetUrl, damit Archiv und Haupt sauber getrennt sind
            const snapRes = await cloudFetch(cloudTargetUrl('backup') + ".json?t=" + Date.now());
            if (snapRes.ok) {
                const snap = await snapRes.json();
                if (typeof finalizeCloudPutPayload === 'function') uploadDb = finalizeCloudPutPayload(uploadDb, snap);
            }
        } catch (e) { /* Archiv-Upload ohne Snapshot */ }
        db.supplierLines = uploadDb.supplierLines;
        await cloudFetch(cloudTargetUrl('backup') + ".json", { method: 'PUT', body: JSON.stringify(uploadDb), headers: { 'Content-Type': 'application/json' } });
        
        renderAll();
        addCloudLog("ARCHIV: " + toArchive.length + " Einträge verschoben [OK]");
        alert("✅ Erfolgreich " + toArchive.length + " alte Einträge ins Archiv verschoben! Das System ist jetzt wieder rank und schlank.");
    } catch(e) {
        alert("❌ Fehler beim Archivieren: " + e.message);
        addCloudLog("FEHLER: Archivierung fehlgeschlagen - " + e.message);
        document.getElementById('db-status').innerText = "Fehler.";
    }
}

function createManualSnapshot() {
    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    // 2026-08-05: Snapshot landete bei leerer CLOUD_URL auf dem Hauptdatensatz statt in der Snapshot-Zeile
    const snapshotUrl = cloudTargetUrl('snapshot', todayStr + '_' + timeStr);
    
    document.getElementById('db-status').innerText = "Erstelle Snapshot...";
    let payload;
    try { payload = prepareDbForCloudUpload(db); }
    catch (e) { alert("❌ Fehler beim Snapshot: " + e.message); return; }
    cloudFetch(snapshotUrl + ".json", { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } })
    .then(res => {
        if(!res.ok) throw new Error("Fehler " + res.status);
        addCloudLog("SNAPSHOT: Manuelles Backup gesichert [OK]");
        document.getElementById('db-status').innerText = "Snapshot gesichert.";
        alert("📸 Snapshot erfolgreich in der Cloud gespeichert!");
    })
    .catch(e => { addCloudLog("FEHLER: Snapshot fehlgeschlagen - " + e.message); alert("❌ Fehler beim Snapshot: " + e.message); });
}

async function pushToCloud(skipConfirm) {
    if(!skipConfirm && !confirm("System in der Cloud speichern?")) return;
    applySettingsFromForm();
    if (typeof hydrateSortierBuchungenInDb === 'function') hydrateSortierBuchungenInDb(db);
    document.getElementById('db-status').innerText = "Bereite Speicherung vor (Smart Sync)...";
    db.suppliers = (db.suppliers || []).map(s => String(s || '').trim()).filter(s => s !== "");
    db.articles.forEach(a => { if(a.suppliers) a.suppliers = a.suppliers.map(s => s.trim()).filter(s => s !== ""); if(a.nr) a.nr = a.nr.trim(); });

    let cloudSnapshot = null;
    try {
        const res = await cloudFetch(CLOUD_URL + ".json?t=" + Date.now()); 
        if(res.ok) {
            const cloudDb = await res.json();
            cloudSnapshot = cloudDb;
            if(cloudDb) {
                // Schutzmechanismus: Verhindert, dass eine leere PC-Liste die volle Cloud-Liste löscht
                if (db.articles.length === 0 && cloudDb.articles && cloudDb.articles.length > 0) {
                    if (!confirm("WARNUNG: Deine lokale 'Fertig'-Liste ist leer, aber in der Cloud gibt es " + cloudDb.articles.length + " fertige Artikel! Wenn du jetzt speicherst, werden diese in der Cloud GELÖSCHT. Wirklich überschreiben?")) {
                        document.getElementById('db-status').innerText = "Speichern abgebrochen.";
                        return;
                    }
                }
                
                // === SMART SYNC: VERHINDERT DATENVERLUST VON TABLET-EINGABEN ===
                // 1. Rechner Entries (LKW-Liste - wird nur am Tablet genutzt)
                if (cloudDb.entries) db.entries = cloudDb.entries;
                
                // 2. Mitarbeiter & Kunden (werden auf Tablets gemanagt)
                if(cloudDb.workers) { 
                    if(!db.workers) db.workers = [];
                    const wSet = new Set(db.workers); cloudDb.workers.forEach(w => { if(!wSet.has(w)) db.workers.push(w); }); 
                }
                if(cloudDb.workerColors) db.workerColors = { ...cloudDb.workerColors, ...(db.workerColors || {}) };
                if(cloudDb.customers) { 
                    if(!db.customers) db.customers = [];
                    const cSet = new Set(db.customers); cloudDb.customers.forEach(c => { if(!cSet.has(c)) db.customers.push(c); }); 
                }
                
                // 3. Anwesenheiten (Tablets)
                if(cloudDb.dailyStaff) db.dailyStaff = { ...cloudDb.dailyStaff, ...(db.dailyStaff || {}) };
                if(cloudDb.dailyAttendance) db.dailyAttendance = { ...cloudDb.dailyAttendance, ...(db.dailyAttendance || {}) };
                if (cloudDb.teamTagesMengen) {
                    db.teamTagesMengen = mergeTeamTagesMengen(db.teamTagesMengen || {}, cloudDb.teamTagesMengen);
                }
                if (Array.isArray(cloudDb.deletedSortierBuchungen)) {
                    db.deletedSortierBuchungen = mergeDeletedSortierKeys(db.deletedSortierBuchungen, cloudDb.deletedSortierBuchungen);
                }
                if (Array.isArray(cloudDb.teamSortierBuchungen)) {
                    db.teamSortierBuchungen = mergeTeamSortierBuchungen(
                        db.teamSortierBuchungen || [],
                        cloudDb.teamSortierBuchungen,
                        db.deletedSortierBuchungen
                    );
                }
                migriereTeamAusDailyStaff(db.teamTagesMengen, db.dailyStaff);
                syncDailyStaffAusTeam(db.teamTagesMengen, db.dailyStaff);
                
                // 4. Kataloge mergen
                if(cloudDb.savedProdukteRaw) { const localSet = new Set(db.savedProdukteRaw || []); cloudDb.savedProdukteRaw.forEach(item => { if(!localSet.has(item)) db.savedProdukteRaw.push(item); }); }
                mergeDeletedSuppliersFromCloud(cloudDb.deletedSuppliers);
                mergeSupplierLinesClearedFromCloud(cloudDb.supplierLinesCleared);
                mergeSupplierLinesFromCloud(cloudDb.supplierLines);
                if(cloudDb.suppliers) db.suppliers = mergeSuppliersList(db.suppliers, cloudDb.suppliers);
                
                // 5. LKW-Erfassungen (Deliveries) verschmelzen – lokale Eintraege behalten
                if(cloudDb.deliveries) {
                    db.deliveries = mergeDeliveriesArrays(db.deliveries || [], cloudDb.deliveries);
                }
                if (typeof bereinigeGeloeschteSortierDeliveries === 'function') bereinigeGeloeschteSortierDeliveries(db);
                if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);

                // 6. Tages-Briefing: Erledigt-Status von Tablets übernehmen
                if (cloudDb.teamDayBrief) {
                    ensureBriefingDefaults();
                    if (cloudDb.teamDayBrief.date === db.teamDayBrief.date) {
                        const cMap = new Map((cloudDb.teamDayBrief.tasks || []).map(t => [t.id, t]));
                        (db.teamDayBrief.tasks || []).forEach(t => {
                            if (cMap.has(t.id)) t.done = !!cMap.get(t.id).done;
                        });
                    }
                }
                if (cloudDb.checklistMorningTemplate && Array.isArray(cloudDb.checklistMorningTemplate) && cloudDb.checklistMorningTemplate.length
                    && (!db.checklistMorningTemplate || !db.checklistMorningTemplate.length)) {
                    db.checklistMorningTemplate = cloudDb.checklistMorningTemplate;
                }
            }
        }
    } catch(e) { console.warn("Smart Sync failed", e); }

    if (typeof reconcileSupplierLinesCleared === 'function') reconcileSupplierLinesCleared(db);

    document.getElementById('db-status').innerText = "Speichere in der Cloud...";
    let payload;
    try {
        payload = prepareDbForCloudUpload(db);
        if (typeof finalizeCloudPutPayload === 'function') {
            payload = finalizeCloudPutPayload(payload, cloudSnapshot);
        }
    } catch (prepErr) {
        alert("❌ FEHLER: " + prepErr.message);
        document.getElementById('db-status').innerText = "Fehler.";
        addCloudLog("FEHLER: Upload-Vorbereitung - " + prepErr.message);
        return;
    }
    db.supplierLines = payload.supplierLines;
    if (payload.supplierLinesCleared) db.supplierLinesCleared = payload.supplierLinesCleared;
    const buchCnt = (payload.teamSortierBuchungen || []).length;
    addCloudLog('UPLOAD: teamSortierBuchungen=' + buchCnt + ' (Cloud-Snapshot ' + (cloudSnapshot?.teamSortierBuchungen?.length || 0) + ')');
    cloudFetch(CLOUD_URL + ".json", { 
        method: 'PUT', 
        body: JSON.stringify(payload), 
        headers: { 'Content-Type': 'application/json' } 
    })
        .then(async (res) => {
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error("Status " + res.status + (detail ? " – " + detail.slice(0, 180) : ''));
            }
            return res.json().catch(() => ({}));
        })
        .then(() => { 
            mirrorToKombiStorage();
            renderAll(); document.getElementById('db-status').innerText = "Mit Cloud synchronisiert."; 
            addCloudLog("UPLOAD: System in der Cloud gespeichert [OK]"); 
            if (!skipConfirm) alert("✅ Sauber in der Cloud gespeichert!"); 
            else {
                const stickyStatus = document.getElementById('sticky-status');
                if (stickyStatus) stickyStatus.textContent = 'Cloud gespeichert · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            }
            
            // Automatischer Tages-Snapshot (überschreibt sich pro Tag selbst, um nicht zu übermüllen)
            try {
                const todayStr = new Date().toISOString().split('T')[0];
                // 2026-08-05: Tages-Snapshot ueberschrieb bisher den Hauptdatensatz statt die Snapshot-Zeile zu fuellen
                const snapshotUrl = cloudTargetUrl('snapshot', 'auto_' + todayStr);
                cloudFetch(snapshotUrl + ".json", { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
            } catch(e) {}
        })
        .catch(e => {
            alert("❌ FEHLER: " + e.message); document.getElementById('db-status').innerText = "Fehler.";
            addCloudLog("FEHLER: Upload fehlgeschlagen - " + e.message);
        });
}

