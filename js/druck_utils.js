// ======================= SAUBERER DRUCK & EXCEL (ohne Screenshot) =======================

function escapePrintHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isIosPrintDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isNativeAndroidApp() {
    return typeof AndroidApp !== 'undefined';
}

function buildPrintDocumentHtml(title, subtitle, bodyHtml, landscape) {
    const orient = landscape ? 'landscape' : 'portrait';
    const tableFont = landscape ? '11px' : '12px';
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapePrintHtml(title) || 'Druck'}</title>
<style>
@page { margin: 10mm; size: A4 ${orient}; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { width: 100%; margin: 0; padding: 0; background: #fff; color: #222; }
body { font-family: -apple-system, BlinkMacSystemFont, Arial, 'Segoe UI', sans-serif; padding: 0; }
h1.doc-title { text-align: center; color: #004b93; margin: 0 0 4px; font-size: ${landscape ? '18px' : '20px'}; }
p.doc-subtitle { text-align: center; color: #666; margin: 0 0 14px; font-size: 12px; }
p.ios-hint { text-align: center; color: #888; font-size: 10px; margin: 0 0 10px; }
table { border-collapse: collapse; width: 100%; max-width: 100%; table-layout: fixed; }
th, td { border: 1px solid #333; padding: 5px 6px; text-align: left; font-size: ${tableFont}; color: #222; word-wrap: break-word; overflow-wrap: anywhere; vertical-align: top; }
th { background: #eee; font-weight: bold; }
tr:nth-child(even) td { background: #fafafa; }
img { max-width: 100%; height: auto; }
.page-break, [style*="page-break-after"] { page-break-after: always; break-after: page; }
</style></head><body>
${title ? `<h1 class="doc-title">${escapePrintHtml(title)}</h1>` : ''}
${subtitle ? `<p class="doc-subtitle">${escapePrintHtml(subtitle)}</p>` : ''}
${isIosPrintDevice() && landscape ? '<p class="ios-hint">Tipp iPhone: Im Druckdialog „Querformat“ wählen, sonst werden breite Tabellen abgeschnitten.</p>' : ''}
${bodyHtml}
</body></html>`;
}

function printHtmlViaIframe(fullHtml, onClose) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();
    const cleanup = () => { try { iframe.remove(); } catch (_) {} if (onClose) onClose(); };
    const doPrint = () => {
        try {
            win.focus();
            win.print();
        } catch (e) {
            console.error('iframe print', e);
        }
        setTimeout(cleanup, 8000);
    };
    if (doc.readyState === 'complete') setTimeout(doPrint, 350);
    else iframe.onload = () => setTimeout(doPrint, 350);
    return true;
}

function sharePlainText(text, subject) {
    if (!text) return false;
    if (typeof AndroidApp !== 'undefined' && typeof AndroidApp.shareText === 'function') {
        AndroidApp.shareText(text, subject || '');
        return true;
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
        return navigator.share({ title: subject || 'Teilen', text: text }).then(() => true).catch(() => false);
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast('Liste kopiert – in WhatsApp einfügen', 'info');
            return true;
        }).catch(() => false);
    }
    return false;
}

function printCleanDocument(opts) {
    const title = opts.title || '';
    const subtitle = opts.subtitle || '';
    const bodyHtml = opts.bodyHtml || '';
    const landscape = !!opts.landscape;
    const onClose = opts.onClose || null;

    if (typeof AndroidApp !== 'undefined' && AndroidApp.printHtml) {
        AndroidApp.printHtml(title, subtitle, bodyHtml);
        if (onClose) setTimeout(onClose, 500);
        return true;
    }

    const docHtml = buildPrintDocumentHtml(title, subtitle, bodyHtml, landscape);

    if (isIosPrintDevice() || isNativeAndroidApp()) {
        return printHtmlViaIframe(docHtml, onClose);
    }

    const w = window.open('', '_blank', 'width=920,height=760');
    if (!w) {
        if (printHtmlViaIframe(docHtml, onClose)) return true;
        const printEl = document.getElementById('printArea');
        if (printEl) {
            printEl.innerHTML = (title ? `<h1>${escapePrintHtml(title)}</h1>` : '') + (subtitle ? `<p>${escapePrintHtml(subtitle)}</p>` : '') + bodyHtml;
            window.print();
        } else {
            alert('Popup blockiert – bitte Popups erlauben oder Excel-Export nutzen.');
        }
        if (onClose) onClose();
        return false;
    }
    w.document.open();
    w.document.write(docHtml + `<script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},800);},400);};<\/script>`);
    w.document.close();
    if (onClose) setTimeout(onClose, 3000);
    return true;
}

function printTableDocument(opts) {
    const headers = opts.headers || [];
    const rows = opts.rows || [];
    let tableHtml = '<table><thead><tr>';
    headers.forEach(h => { tableHtml += `<th>${escapePrintHtml(h)}</th>`; });
    tableHtml += '</tr></thead><tbody>';
    rows.forEach(row => {
        const cells = Array.isArray(row) ? row : headers.map(h => row[h] ?? '');
        tableHtml += '<tr>';
        cells.forEach(cell => { tableHtml += `<td>${escapePrintHtml(cell)}</td>`; });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    return printCleanDocument({
        title: opts.title,
        subtitle: opts.subtitle,
        bodyHtml: tableHtml,
        landscape: opts.landscape,
        onClose: opts.onClose
    });
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function buildExcelWorkbook(rows, sheetName) {
    if (typeof XLSX === 'undefined') return null;
    const ws = XLSX.utils.json_to_sheet(rows);
    const keys = rows.length ? Object.keys(rows[0]) : [];
    if (keys.length) {
        ws['!cols'] = keys.map((key) => {
            const maxLen = Math.max(
                key.length,
                ...rows.map((r) => String(r[key] ?? '').length)
            );
            return { wch: Math.min(Math.max(maxLen + 2, 10), 70) };
        });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Daten');
    return wb;
}

function workbookToBlob(wb) {
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
}

async function shareOrDownloadExcelSheet(rows, sheetName, filename) {
    if (typeof XLSX === 'undefined') {
        if (typeof showToast === 'function') showToast('Excel-Bibliothek fehlt – App neu starten.', 'error');
        else alert('Excel-Bibliothek nicht geladen.');
        return false;
    }
    if (!rows || rows.length === 0) {
        if (typeof showToast === 'function') showToast('Keine Daten zum Exportieren!', 'warning');
        else alert('Keine Daten zum Exportieren!');
        return false;
    }

    const name = filename || 'export.xlsx';
    const wb = buildExcelWorkbook(rows, sheetName);
    if (!wb) return false;
    const blob = workbookToBlob(wb);
    const mime = blob.type;

    if (typeof AndroidApp !== 'undefined' && typeof AndroidApp.shareFile === 'function') {
        try {
            const buf = await blob.arrayBuffer();
            AndroidApp.shareFile(name, mime, arrayBufferToBase64(buf));
            return true;
        } catch (e) {
            console.error('AndroidApp.shareFile', e);
        }
    }

    if (typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
        try {
            const file = new File([blob], name, { type: mime });
            const canShareFiles = !navigator.canShare || navigator.canShare({ files: [file] });
            if (canShareFiles) {
                await navigator.share({
                    files: [file],
                    title: sheetName || 'Excel Export',
                    text: name
                });
                return true;
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return false;
            console.warn('navigator.share', e);
        }
    }

    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 1000);
        return true;
    } catch (e) {
        try {
            XLSX.writeFile(wb, name);
            return true;
        } catch (e2) {
            if (typeof showToast === 'function') showToast('Excel-Export fehlgeschlagen.', 'error');
            return false;
        }
    }
}

function downloadExcelSheet(rows, sheetName, filename) {
    return shareOrDownloadExcelSheet(rows, sheetName, filename);
}
