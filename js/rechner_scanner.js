// ======================= HYBRID BARCODE SCANNER =======================

let html5QrCode = null;
let nativeVideoStream = null;
let nativeScanInterval = null;
let isTorchOn = false;
let isScannerStarting = false;
let isScannerStopping = false;
let isZoomed = false;
let scannerTarget = 'noelke';
let scannerExpectedType = null; // 'BC' or 'QR' or null (auto)
let scannerReleasePromise = Promise.resolve();

function stopAllVideoTracks() {
    document.querySelectorAll('#qr-reader video').forEach((videoEl) => {
        const stream = videoEl.srcObject;
        if (stream && stream.getTracks) stream.getTracks().forEach((track) => track.stop());
        videoEl.srcObject = null;
    });
    if (nativeVideoStream) {
        nativeVideoStream.getTracks().forEach((track) => track.stop());
        nativeVideoStream = null;
    }
}

function waitForScannerIdle(timeoutMs = 6000) {
    return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            if (!isScannerStarting && !isScannerStopping) return resolve();
            if (Date.now() - started >= timeoutMs) return resolve();
            setTimeout(tick, 50);
        };
        tick();
    });
}

function waitForModalLayout() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

function getCameraErrorMessage(err) {
    const name = (err && err.name) || '';
    const msg = ((err && (err.message || err.toString())) || '').toLowerCase();
    if (name === 'NotAllowedError' || msg.includes('permission') || msg.includes('denied')) {
        return 'Kamera blockiert – in den Einstellungen erlauben.';
    }
    if (name === 'NotFoundError' || msg.includes('not found')) {
        return 'Keine Kamera gefunden.';
    }
    if (name === 'NotReadableError' || msg.includes('in use') || msg.includes('busy')) {
        return 'Kamera belegt – kurz warten oder App neu starten.';
    }
    if (!window.isSecureContext && !(typeof AndroidApp !== 'undefined')) {
        return 'Kamera nur mit HTTPS – GitHub-Link oder App nutzen.';
    }
    return 'Kamera-Fehler – bitte erneut versuchen.';
}

function getScannerConfig() {
    return {
        fps: 15,
        qrbox: function(w, h) {
            const size = Math.min(w, h) * 0.9;
            return { width: size, height: size };
        }
    };
}

function onScannerDecode(decodedText) {
    stopBarcodeScanner();
    playBeep();
    handleScannedBarcode(decodedText);
}

async function getCameraConfigs() {
    const configs = [{ facingMode: 'environment' }, { facingMode: 'user' }];
    if (typeof Html5Qrcode.getCameras === 'function') {
        try {
            const cameras = await Html5Qrcode.getCameras();
            if (Array.isArray(cameras) && cameras.length) {
                const backCam = cameras.find((cam) => /back|rear|environment|hinten|rück/i.test(cam.label || ''));
                const pick = backCam || cameras[cameras.length - 1];
                if (pick && pick.id) configs.unshift({ deviceId: { exact: pick.id } });
            }
        } catch (e) {}
    }
    return configs;
}

async function releaseScannerResources() {
    stopAllVideoTracks();
    if (!html5QrCode) return;
    const instance = html5QrCode;
    html5QrCode = null;
    try {
        let state = 1;
        if (instance.getState) state = instance.getState();
        else if (instance.isScanning) state = 2;
        if (state !== 1) await instance.stop();
    } catch (e) {}
    try { instance.clear(); } catch (e) {}
    const qrReader = document.getElementById('qr-reader');
    if (qrReader) qrReader.innerHTML = '';
}

async function startScannerCamera() {
    const qrReader = document.getElementById('qr-reader');
    if (qrReader) qrReader.innerHTML = '';
    stopAllVideoTracks();

    const configs = await getCameraConfigs();
    let lastErr = null;

    for (const cameraConfig of configs) {
        try {
            if (html5QrCode) await releaseScannerResources();
            html5QrCode = new Html5Qrcode('qr-reader');
            await html5QrCode.start(
                cameraConfig,
                getScannerConfig(),
                onScannerDecode,
                () => {}
            );
            return;
        } catch (err) {
            lastErr = err;
            await releaseScannerResources();
        }
    }
    throw lastErr || new Error('Kamera konnte nicht gestartet werden.');
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') stopBarcodeScanner();
    });
}

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
}

async function startBarcodeScanner(target = 'noelke', expectedType = null) {
    scannerTarget = target;
    scannerExpectedType = expectedType;
    document.getElementById('scanner-modal').style.display = 'flex';

    await scannerReleasePromise;
    await waitForScannerIdle();
    if (isScannerStarting) return;
    isScannerStarting = true;

    try {
        await waitForModalLayout();
        if (typeof Html5Qrcode === 'undefined') {
            showToast('Scanner-Bibliothek fehlt – App-Update prüfen oder Internet.', 'error');
            stopBarcodeScanner();
            return;
        }
        await startScannerCamera();
    } catch (err) {
        console.error('Scanner Fehler:', err);
        showToast(getCameraErrorMessage(err), 'error');
        stopBarcodeScanner();
    } finally {
        isScannerStarting = false;
    }
}

function stopBarcodeScanner() {
    isTorchOn = false;
    const tb = document.getElementById('torch-btn');
    if (tb) { tb.innerText = '🔦 Licht an'; tb.style.background = '#fff3e0'; }

    isZoomed = false;
    const zb = document.getElementById('zoom-btn');
    if (zb) { zb.innerText = '🔍 Zoom'; zb.style.background = '#e3f2fd'; }

    document.getElementById('scanner-modal').style.display = 'none';

    if (nativeScanInterval) { clearInterval(nativeScanInterval); nativeScanInterval = null; }

    isScannerStopping = true;
    scannerReleasePromise = (async () => {
        try {
            await releaseScannerResources();
        } finally {
            stopAllVideoTracks();
            isScannerStopping = false;
            isScannerStarting = false;
        }
    })();
}

function toggleTorch() {
    isTorchOn = !isTorchOn;
    const tb = document.getElementById('torch-btn');
    
    const applyTorch = (track) => {
        track.applyConstraints({ advanced: [{ torch: isTorchOn }] })
            .then(() => {
                if(tb) { tb.innerText = isTorchOn ? "🔦 Licht aus" : "🔦 Licht an"; tb.style.background = isTorchOn ? "#ffb74d" : "#fff3e0"; }
            })
            .catch(err => {
                isTorchOn = !isTorchOn; 
                showToast("Licht nicht unterstützt", "warning");
            });
    };

    if (nativeVideoStream) {
        const track = nativeVideoStream.getVideoTracks()[0];
        if (track) applyTorch(track);
    } else if (html5QrCode) {
        html5QrCode.applyVideoConstraints({ advanced: [{ torch: isTorchOn }] })
            .then(() => {
                if(tb) { tb.innerText = isTorchOn ? "🔦 Licht aus" : "🔦 Licht an"; tb.style.background = isTorchOn ? "#ffb74d" : "#fff3e0"; }
            }).catch(err => {
                isTorchOn = !isTorchOn; 
                showToast("Licht nicht unterstützt", "warning");
            });
    }
}

function toggleZoom() {
    isZoomed = !isZoomed;
    const updateBtn = () => {
        const zb = document.getElementById('zoom-btn');
        if(zb) { zb.innerText = isZoomed ? "🔍 Zoom aus" : "🔍 Zoom"; zb.style.background = isZoomed ? "#90caf9" : "#e3f2fd"; }
    };

    const applyDigitalZoom = () => {
        const videoEl = document.querySelector('#qr-reader video');
        if (videoEl) {
            videoEl.style.transform = isZoomed ? "scale(2.5)" : "scale(1.0)";
            videoEl.style.transformOrigin = "center center";
            videoEl.style.transition = "transform 0.3s ease";
        }
        updateBtn();
    };

    const applyHardwareZoom = (track) => {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.zoom) {
            const targetZoom = isZoomed ? Math.min(2.5, capabilities.zoom.max || 2.5) : (capabilities.zoom.min || 1.0);
            track.applyConstraints({ advanced: [{ zoom: targetZoom }] })
                .then(() => updateBtn())
                .catch(() => applyDigitalZoom());
        } else {
            applyDigitalZoom();
        }
    };

    if (nativeVideoStream) {
        const track = nativeVideoStream.getVideoTracks()[0];
        if (track) applyHardwareZoom(track);
        else applyDigitalZoom();
    } else if (html5QrCode) {
        const videoEl = document.querySelector('#qr-reader video');
        if (videoEl && videoEl.srcObject) {
            const track = videoEl.srcObject.getVideoTracks()[0];
            if (track) applyHardwareZoom(track);
            else applyDigitalZoom();
        } else {
            applyDigitalZoom();
        }
    }
}

// ======================= GS1 LOGIK =======================

function parseGS1(barcode) {
    if (typeof barcode !== 'string') return null;
    let cleanBarcode = barcode.replace(/^\][A-Za-z]\d/, '');
    cleanBarcode = cleanBarcode.replace(/[^\x20-\x7E\x1D]/g, '');

    const hasAIs = cleanBarcode.includes("(") || cleanBarcode.includes(String.fromCharCode(29)) || /^(01|02|10|15|17|31)/.test(cleanBarcode);

    if (!hasAIs) {
        if (/^\d{13}$/.test(cleanBarcode)) {
            return { gtin: '0' + cleanBarcode, ean: cleanBarcode, mhd: null, charge: null };
        }
        if (/^\d{8}$/.test(cleanBarcode)) {
            return { gtin: '000000' + cleanBarcode, ean: cleanBarcode, mhd: null, charge: null };
        }
        return null; 
    }

    let result = { gtin: null, mhd: null, ean: null, charge: null };

    const formatDate = (yymmdd) => {
        let yy = yymmdd.substring(0, 2);
        let mm = yymmdd.substring(2, 4);
        let dd = yymmdd.substring(4, 6);
        if (dd === '00') dd = '01'; 
        return `${dd}.${mm}.20${yy}`;
    };

    if (cleanBarcode.includes("(01)") || cleanBarcode.includes("(02)")) {
        let gtinMatch = cleanBarcode.match(/\((?:01|02)\)(\d{14})/);
        if (gtinMatch) result.gtin = gtinMatch[1];
        let mhdMatch = cleanBarcode.match(/\((?:15|17)\)(\d{6})/);
        if (mhdMatch) result.mhd = formatDate(mhdMatch[1]);
        let chargeMatch = cleanBarcode.match(/\(10\)([^()]+)/);
        if (chargeMatch) result.charge = chargeMatch[1];
    } else {
        let pos = 0;
        let foundGtin = null;
        while (pos < cleanBarcode.length) {
            let ai = cleanBarcode.substring(pos, pos + 2);
            if ((ai === '01' || ai === '02') && pos + 16 <= cleanBarcode.length) {
                foundGtin = cleanBarcode.substring(pos + 2, pos + 16);
                pos += 16;
            } else if ((ai === '15' || ai === '17') && pos + 8 <= cleanBarcode.length) {
                result.mhd = formatDate(cleanBarcode.substring(pos + 2, pos + 8));
                pos += 8;
            } else if (ai === '31' && pos + 10 <= cleanBarcode.length) {
                pos += 10;
            } else if (ai === '10') {
                let fnc1 = cleanBarcode.indexOf('\x1D', pos + 2);
                if (fnc1 !== -1) {
                    result.charge = cleanBarcode.substring(pos + 2, fnc1);
                    pos = fnc1 + 1;
                } else {
                    let rest = cleanBarcode.substring(pos + 2);
                    let mhdMatch = rest.match(/(?:15|17)(\d{6})$/);
                    if (mhdMatch && rest.length > 8) {
                        result.mhd = formatDate(mhdMatch[1]);
                        result.charge = rest.substring(0, rest.length - 8);
                    } else {
                        result.charge = rest;
                    }
                    break; 
                }
            } else {
                break;
            }
        }
        if (foundGtin) result.gtin = foundGtin;

        if (!result.gtin) {
            let match = cleanBarcode.match(/(?:01|02)(\d{14})/);
            if (match) result.gtin = match[1];
        }
        if (!result.mhd) {
            let fallbackMhdList = [...cleanBarcode.matchAll(/(?:15|17)(\d{6})/g)];
            for (let match of fallbackMhdList) {
                if (result.gtin && result.gtin.includes(match[1])) continue;
                let m = parseInt(match[1].substring(2,4));
                let d = parseInt(match[1].substring(4,6));
                if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                    result.mhd = formatDate(match[1]);
                    break;
                }
            }
        }
    }
    
    if (result.gtin) {
        result.ean = result.gtin.startsWith('0') ? result.gtin.substring(1) : result.gtin;
        return result;
    }
    return null;
}

function handleScannedBarcode(ean) {
    if (scannerTarget === 'brandenburg-scan-input') {
        if (typeof handleBrandenburgScan === 'function') {
            handleBrandenburgScan(ean);
        }
        return; 
    }

    let gs1Data = parseGS1(ean);

    if(scannerTarget === 'rek-ls') {
        const parts = ean.split('#');
        document.getElementById('rek-ls').value = parts[parts.length - 1]; 
        showToast("Lieferschein übernommen!", "success");
        if (typeof saveReklamationDraft === 'function') saveReklamationDraft();
    } else if(scannerTarget === 'tpl-ean-input') {
        let searchEan = gs1Data ? gs1Data.gtin : ean;
        let altEan = gs1Data ? gs1Data.ean : ean;
        
        document.getElementById('tpl-ean').value = searchEan;
        
        if (gs1Data && gs1Data.mhd) {
            const sMhdInput = document.getElementById('s-mhd');
            if(sMhdInput) {
                sMhdInput.value = gs1Data.mhd;
                showToast(`MHD ${gs1Data.mhd} übernommen!`, "success");
            }
        }
        
        const rDb = AppStorage.get('kombi_rechner_db', {});
        const produkte = Array.isArray(rDb.savedProdukteRaw) ? rDb.savedProdukteRaw : [];
        const lDb = AppStorage.get('kombi_logistik_db', {});
        const articles = Array.isArray(lDb.articles) ? lDb.articles : [];
        
        let foundName = "";
        let matchArt = articles.find(a => a.nr === searchEan || a.nr === altEan || (gs1Data && (a.nr === gs1Data.gtin || a.nr === gs1Data.ean)));
        if (matchArt) foundName = matchArt.name;
        else {
            let matchProd = produkte.find(p => typeof p === 'string' && (p.includes(searchEan) || p.includes(altEan) || (gs1Data && (p.includes(gs1Data.gtin) || p.includes(gs1Data.ean)))));
            if (matchProd) foundName = matchProd.replace(/^\d+\s*-\s*/, '').replace(/^\[?Nr\.?\s*\d+\]?\s*-?\s*(.*)/i, '');
        }
        
        if (foundName) {
            document.getElementById('tpl-name').value = foundName;
            if (!gs1Data || !gs1Data.mhd) showToast("Artikelname gefunden und befüllt!", "success");
        } else {
            if (!gs1Data || !gs1Data.mhd) showToast(gs1Data ? "GTIN übernommen!" : "EAN übernommen!", "success");
        }

        const existingTpl = sonderTemplates.find(t => t.ean === searchEan || t.ean === altEan || (gs1Data && (t.ean === gs1Data.gtin || t.ean === gs1Data.ean)));
        if (existingTpl) {
            document.getElementById('tpl-reihe').value = existingTpl.s_reihe || "";
            document.getElementById('tpl-reihen').value = existingTpl.s_reihen || "";
            document.getElementById('tpl-krtlage').value = existingTpl.s_krtlage || "";
            document.getElementById('tpl-lagen').value = existingTpl.s_lagen || "";
            document.getElementById('tpl-stk').value = existingTpl.s_stk || "";
            document.getElementById('tpl-kg').value = existingTpl.s_kg || "";
            document.getElementById('tpl-stke2').value = existingTpl.s_stke2 || "";
            showToast("Bestehende Vorlage geladen!", "info");
        }
    } else if(scannerTarget === 'sonder-tpl' || scannerTarget === 'sonder-tpl-sort') {
        if (gs1Data) {
            const tpl = sonderTemplates.find(t => t.ean === gs1Data.gtin || t.ean === gs1Data.ean);
            if(tpl) { 
                showToast("✅ GS1-Barcode & Vorlage erkannt!", "success"); 
                currentSearchType = scannerTarget; 
                selectResult(tpl.id, gs1Data.mhd); 
            } else { 
                showToast(`❌ Vorlage mit GTIN ${gs1Data.gtin} nicht gefunden!`, "error"); 
                if (gs1Data.mhd) {
                    const suffix = scannerTarget === 'sonder-tpl-sort' ? '-sort' : '';
                    const sMhdInput = document.getElementById('s-mhd' + suffix);
                    if (sMhdInput) sMhdInput.value = gs1Data.mhd;
                }
                openSearchModal(scannerTarget);
                setTimeout(() => {
                    const searchInput = document.getElementById('modal-search-input');
                    if (searchInput) { searchInput.value = gs1Data.ean; filterResults(); }
                }, 300);
            }
        } else {
            const tpl = sonderTemplates.find(t => t.ean === ean);
            if(tpl) { 
                showToast("✅ Vorlage erkannt!", "success"); 
                currentSearchType = scannerTarget; 
                selectResult(tpl.id); 
            } else { 
                showToast(`❌ Vorlage mit Code ${ean} nicht gefunden!`, "error"); 
                openSearchModal(scannerTarget);
                setTimeout(() => {
                    const searchInput = document.getElementById('modal-search-input');
                    if (searchInput) { searchInput.value = ean; filterResults(); }
                }, 300);
            }
        }
    } else if(scannerTarget === 'sorte') {
        const lDb = AppStorage.get('kombi_logistik_db', {});
        const articles = Array.isArray(lDb.articles) ? lDb.articles : [];
        let searchEan = gs1Data ? gs1Data.ean : ean;
        
        const match = articles.find(a => {
            const nr = a.nr ? a.nr.toString() : '';
            return nr === searchEan || nr === searchEan.replace(/^0+/, '') || (!gs1Data && nr.length >= 3 && ean.includes(nr)) || (gs1Data && nr === gs1Data.gtin);
        });
        
        if (match) { 
            showToast("✅ Artikel erkannt!", "success"); 
            currentSearchType = 'sorte'; 
            selectResult((match.nr || '') + " - " + (match.name || '')); 
            
            if (!gs1Data && ean.length === 13 && (ean.startsWith('21') || ean.startsWith('22') || ean.startsWith('28') || ean.startsWith('29'))) {
                const weightRaw = ean.substring(7, 12);
                const weightKg = parseInt(weightRaw, 10) / 1000;
                const bruInput = document.getElementById('bru-sort');
                if(bruInput && weightKg > 0) {
                    bruInput.value = weightKg.toFixed(2);
                    bruInput.dispatchEvent(new Event('input', { bubbles: true }));
                    showToast("Gewicht " + weightKg.toFixed(2) + " kg übernommen!", "success");
                }
            }
        } 
        else { 
            openSearchModal('sorte');
            setTimeout(() => {
                const searchInput = document.getElementById('modal-search-input');
                if (searchInput) { searchInput.value = ean; filterResults(); }
            }, 300);
            showToast(`Nicht direkt gefunden: ${ean}`, "warning"); 
        }
    } else {
        const rDb = AppStorage.get('kombi_rechner_db', {});
        const produkte = rDb.savedProdukteRaw || [];
        let searchEan = gs1Data ? gs1Data.ean : ean;
        const match = produkte.find(p => typeof p === 'string' && (p.includes(searchEan) || (gs1Data && p.includes(gs1Data.gtin)))); 
        
        if (match) { 
            showToast("✅ Artikel erkannt!", "success"); 
            currentSearchType = 'noelke'; 
            selectResult(match); 
            if (gs1Data && gs1Data.mhd) {
                const nMhdInput = document.getElementById('n-mhd');
                if(nMhdInput) { nMhdInput.value = gs1Data.mhd; showToast(`MHD ${gs1Data.mhd} übernommen!`, "success"); }
            }
        } 
        else { showToast(`❌ EAN ${ean} nicht gefunden!`, "error"); }
    }
}