// Tages-Briefing (Team) + private Admin-Notizen (nur dieses Gerät)

const PRIVATE_NOTES_KEY = 'admin_device_notes';
const DEFAULT_CHECKLIST_MORNING = [
    { id: 'm1', text: 'Stapler prüfen (Wasser, Öl, Batterie)' },
    { id: 'm2', text: 'Tore & Türen öffnen' },
    { id: 'm3', text: 'LKW Ladezonen aufräumen / reinigen' },
    { id: 'm4', text: 'Leergut-Platz kontrollieren' },
    { id: 'm5', text: 'Müll / Pappe entsorgen' }
];

function getLocalISODate() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function getMorningChecklistTemplate() {
    const lDb = AppStorage.get('kombi_logistik_db', {});
    const tpl = lDb.checklistMorningTemplate;
    if (Array.isArray(tpl) && tpl.length) return tpl;
    return DEFAULT_CHECKLIST_MORNING.map(t => ({ ...t }));
}

function getTeamDayBrief() {
    const lDb = AppStorage.get('kombi_logistik_db', {});
    const brief = lDb.teamDayBrief;
    if (brief && typeof brief === 'object') return brief;
    return { date: getLocalISODate(), message: '', tasks: [] };
}

function setTeamDayBrief(brief) {
    const lDb = AppStorage.get('kombi_logistik_db', {});
    lDb.teamDayBrief = brief;
    AppStorage.set('kombi_logistik_db', lDb);
}

function getTodayTeamBriefTasks() {
    const brief = getTeamDayBrief();
    if (brief.date !== getLocalISODate()) return [];
    return Array.isArray(brief.tasks) ? brief.tasks : [];
}

function updateAdminOnlyDrawerItems() {
    const show = typeof isAuswertungAuthenticated === 'function' && isAuswertungAuthenticated();
    document.querySelectorAll('.admin-only-drawer').forEach(el => {
        el.style.display = show ? '' : 'none';
    });
}

function renderTeamDayBanner() {
    const banner = document.getElementById('team-day-banner');
    if (!banner) return;
    const brief = getTeamDayBrief();
    const today = getLocalISODate();
    const tasks = brief.date === today && Array.isArray(brief.tasks) ? brief.tasks : [];
    const open = tasks.filter(t => !t.done);
    const msg = (brief.message || '').trim();
    const hasContent = msg || tasks.length > 0;

    if (!hasContent || brief.date !== today) {
        banner.style.display = 'none';
        return;
    }

    const textEl = document.getElementById('team-day-banner-text');
    const badgeEl = document.getElementById('team-day-banner-badge');
    if (textEl) {
        textEl.textContent = msg || (open.length
            ? `${open.length} Aufgabe${open.length === 1 ? '' : 'n'} offen für heute`
            : 'Alle Tages-Aufgaben erledigt ✓');
    }
    if (badgeEl) {
        if (open.length > 0) {
            badgeEl.textContent = open.length;
            badgeEl.style.display = 'inline-flex';
        } else {
            badgeEl.style.display = 'none';
        }
    }
    banner.style.display = 'flex';
    banner.classList.toggle('all-done', open.length === 0 && tasks.length > 0);
}

function openTeamDayPanel() {
    const brief = getTeamDayBrief();
    const today = getLocalISODate();
    const tasks = brief.date === today && Array.isArray(brief.tasks) ? brief.tasks : [];
    const msg = brief.date === today ? (brief.message || '').trim() : '';

    let modal = document.getElementById('team-day-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'team-day-modal';
        modal.className = 'modal team-day-modal';
        modal.innerHTML = `
            <div class="modal-content team-day-modal-content">
                <div class="team-day-modal-head">
                    <h2>📢 Tages-Aufgaben</h2>
                    <button type="button" class="drawer-close" onclick="closeTeamDayPanel()" aria-label="Schließen">✕</button>
                </div>
                <p id="team-day-modal-message" class="team-day-modal-message"></p>
                <ul id="team-day-modal-list" class="team-day-task-list"></ul>
                <p id="team-day-modal-empty" class="team-day-modal-empty" style="display:none;">Keine Aufgaben für heute vom Büro.</p>
                <button type="button" class="pin-btn pin-btn-primary" style="width:100%; margin-top:12px;" onclick="closeTeamDayPanel()">Schließen</button>
            </div>`;
        modal.onclick = (e) => { if (e.target === modal) closeTeamDayPanel(); };
        document.body.appendChild(modal);
    }

    const msgEl = document.getElementById('team-day-modal-message');
    const listEl = document.getElementById('team-day-modal-list');
    const emptyEl = document.getElementById('team-day-modal-empty');
    if (msgEl) {
        msgEl.textContent = msg;
        msgEl.style.display = msg ? 'block' : 'none';
    }
    if (!listEl) return;

    if (!tasks.length) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
    } else {
        if (emptyEl) emptyEl.style.display = 'none';
        listEl.innerHTML = tasks.map(t => {
            const done = !!t.done;
            return `<li class="team-day-task-item${done ? ' done' : ''}" onclick="toggleTeamDayTask('${t.id}')">
                <input type="checkbox" ${done ? 'checked' : ''} tabindex="-1" aria-hidden="true">
                <span>${escapeHtmlBrief(t.text)}</span>
            </li>`;
        }).join('');
    }
    modal.style.display = 'flex';
}

function closeTeamDayPanel() {
    const modal = document.getElementById('team-day-modal');
    if (modal) modal.style.display = 'none';
}

function escapeHtmlBrief(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function toggleTeamDayTask(taskId) {
    const brief = getTeamDayBrief();
    if (brief.date !== getLocalISODate() || !Array.isArray(brief.tasks)) return;
    const task = brief.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    setTeamDayBrief(brief);
    renderTeamDayBanner();
    openTeamDayPanel();
    // 2026-08-18: NICHT mehr ueber triggerAutoSync('logistik') — das schickte das volle
    // Logistik-Payload hoch und konnte Stammdaten ueberschreiben. Es geht nur der Haken raus.
    if (typeof silentPushTeamDayBriefToCloud === 'function') silentPushTeamDayBriefToCloud();
}

function initTeamDayBrief() {
    renderTeamDayBanner();
    updateAdminOnlyDrawerItems();
}

// —— Private Admin-Notizen (nur localStorage auf diesem Gerät) ——

function getPrivateAdminNotes() {
    return AppStorage.get(PRIVATE_NOTES_KEY, []);
}

function savePrivateAdminNotes(notes) {
    AppStorage.set(PRIVATE_NOTES_KEY, notes);
}

function openPrivateNotesModal() {
    if (typeof isAuswertungAuthenticated === 'function' && !isAuswertungAuthenticated()) {
        if (typeof showAdminPinForAuswertung === 'function') {
            _pendingPinAction = 'privateNotes';
            showAdminPinForAuswertung();
        }
        return;
    }
    renderPrivateNotesModal();
}

function renderPrivateNotesModal() {
    let modal = document.getElementById('private-notes-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'private-notes-modal';
        modal.className = 'modal private-notes-modal';
        modal.innerHTML = `
            <div class="modal-content private-notes-modal-content">
                <div class="team-day-modal-head">
                    <h2>📝 Meine Notizen</h2>
                    <button type="button" class="drawer-close" onclick="closePrivateNotesModal()" aria-label="Schließen">✕</button>
                </div>
                <p class="private-notes-hint">Nur auf diesem Gerät — wird nicht synchronisiert.</p>
                <ul id="private-notes-list" class="private-notes-list"></ul>
                <form id="private-notes-form" class="checklist-form" style="margin-top:12px;">
                    <input type="text" id="private-note-input" placeholder="Neue Notiz…" autocomplete="off">
                    <button type="submit">+</button>
                </form>
                <button type="button" class="pin-btn pin-btn-primary" style="width:100%; margin-top:12px;" onclick="closePrivateNotesModal()">Schließen</button>
            </div>`;
        modal.onclick = (e) => { if (e.target === modal) closePrivateNotesModal(); };
        document.body.appendChild(modal);
        document.getElementById('private-notes-form').addEventListener('submit', (e) => {
            e.preventDefault();
            addPrivateNote();
        });
    }
    const notes = getPrivateAdminNotes();
    const list = document.getElementById('private-notes-list');
    if (list) {
        list.innerHTML = notes.length
            ? notes.map((n, i) => `<li class="private-note-item"><span>${escapeHtmlBrief(n.text)}</span><button type="button" onclick="deletePrivateNote(${i})" aria-label="Löschen">✕</button></li>`).join('')
            : '<li class="private-notes-empty">Noch keine Notizen.</li>';
    }
    modal.style.display = 'flex';
    const inp = document.getElementById('private-note-input');
    if (inp) inp.value = '';
}

function closePrivateNotesModal() {
    const modal = document.getElementById('private-notes-modal');
    if (modal) modal.style.display = 'none';
}

function addPrivateNote() {
    const inp = document.getElementById('private-note-input');
    const text = (inp && inp.value || '').trim();
    if (!text) return;
    const notes = getPrivateAdminNotes();
    notes.unshift({ id: Date.now().toString(), text, createdAt: new Date().toISOString() });
    savePrivateAdminNotes(notes);
    if (inp) inp.value = '';
    renderPrivateNotesModal();
}

function deletePrivateNote(index) {
    const notes = getPrivateAdminNotes();
    notes.splice(index, 1);
    savePrivateAdminNotes(notes);
    renderPrivateNotesModal();
}

window.openTeamDayPanel = openTeamDayPanel;
window.closeTeamDayPanel = closeTeamDayPanel;
window.toggleTeamDayTask = toggleTeamDayTask;
window.openPrivateNotesModal = openPrivateNotesModal;
window.renderPrivateNotesModal = renderPrivateNotesModal;
window.closePrivateNotesModal = closePrivateNotesModal;
window.deletePrivateNote = deletePrivateNote;
window.initTeamDayBrief = initTeamDayBrief;
window.renderTeamDayBanner = renderTeamDayBanner;
window.updateAdminOnlyDrawerItems = updateAdminOnlyDrawerItems;
window.getMorningChecklistTemplate = getMorningChecklistTemplate;
window.DEFAULT_CHECKLIST_MORNING = DEFAULT_CHECKLIST_MORNING;
