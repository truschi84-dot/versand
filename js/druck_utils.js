// ======================= SAUBERER DRUCK & EXCEL (ohne Screenshot) =======================

function escapePrintHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function downloadExcelSheet(rows, sheetName, filename) {
    if (typeof XLSX === 'undefined') { alert('Excel-Bibliothek nicht geladen.'); return false; }
    if (!rows || rows.length === 0) { alert('Keine Daten zum Exportieren!'); return false; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Daten');
    XLSX.writeFile(wb, filename || 'export.xlsx');
    return true;
}
