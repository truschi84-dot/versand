// ======================= SAUBERER DRUCK & EXCEL (ohne Screenshot) =======================

function escapePrintHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    const orient = landscape ? 'landscape' : 'portrait';

    const docHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${escapePrintHtml(title) || 'Druck'}</title>
<style>
@page { margin: 12mm; size: A4 ${orient}; }
* { box-sizing: border-box; }
body { font-family: Arial, 'Segoe UI', sans-serif; padding: 0; margin: 0; color: #222; background: #fff; }
h1.doc-title { text-align: center; color: #004b93; margin: 0 0 4px; font-size: 20px; }
p.doc-subtitle { text-align: center; color: #666; margin: 0 0 18px; font-size: 13px; }
table { border-collapse: collapse; }
th, td { border: 1px solid #bbb; padding: 7px 10px; text-align: left; font-size: 13px; color: #222; }
th { background: #f0f0f0; font-weight: bold; }
tr:nth-child(even) td { background: #fafafa; }
img { max-width: 100%; height: auto; }
.page-break, [style*="page-break-after"] { page-break-after: always; }
</style></head><body>
${title ? `<h1 class="doc-title">${escapePrintHtml(title)}</h1>` : ''}
${subtitle ? `<p class="doc-subtitle">${escapePrintHtml(subtitle)}</p>` : ''}
${bodyHtml}
<script>
window.onload = function() {
    setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 800);
    }, 400);
};
<\/script></body></html>`;

    const w = window.open('', '_blank', 'width=920,height=760');
    if (!w) {
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
    w.document.write(docHtml);
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
