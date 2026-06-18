// admin_special_days.js — Gestión de días especiales con multiplicadores

async function loadSpecialDays() {
    const list = document.getElementById('special-days-list');
    if (!list) return;
    try {
        const res  = await fetch('/api/special-days');
        const days = await res.json();
        if (!days.length) {
            list.innerHTML = '<p class="text-[#d3c5ac] text-xs uppercase tracking-widest text-center py-8">Sin días especiales configurados.</p>';
            return;
        }
        const multColors = {
            '1.5': 'text-[#f7bb07] bg-[#f7bb07]/10',
            '2.0': 'text-emerald-400 bg-emerald-500/10',
            '3.0': 'text-purple-400 bg-purple-500/10',
            '5.0': 'text-red-400 bg-red-500/10',
        };
        list.innerHTML = days.map(d => {
            const colorClass = multColors[String(parseFloat(d.multiplier).toFixed(1))] || 'text-white bg-white/10';
            const rec = d.recurrence === 'YEARLY' ? '🔄 Anual' : '📅 Una vez';
            return `
            <div class="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:border-[#f7bb07]/20 transition-all">
                <div>
                    <p class="text-sm font-bold text-white">${d.name}</p>
                    <p class="text-[10px] text-[#d3c5ac] mt-0.5">${d.date} · ${rec}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-black px-2 py-1 rounded ${colorClass}">x${parseFloat(d.multiplier).toFixed(1)}</span>
                    <button onclick="deleteSpecialDay(${d.id})" class="text-red-400/60 hover:text-red-400 transition-colors">
                        <span class="material-symbols-outlined text-base">delete</span>
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = '<p class="text-red-400 text-xs text-center py-8">Error al cargar.</p>';
    }
}

async function deleteSpecialDay(id) {
    if (!confirm('¿Eliminar este día especial?')) return;
    await fetch(`/api/admin/special-days/${id}`, { method: 'DELETE' });
    loadSpecialDays();
    showToast('Día especial eliminado.');
}

async function saveSpecialDay() {
    const name       = document.getElementById('event-name').value.trim();
    const date       = document.getElementById('event-date').value;
    const recurrence = document.getElementById('event-recurrence').value;
    const multiplier = document.getElementById('event-multiplier').value;
    if (!name || !date) { showToast('Completá nombre y fecha.'); return; }
    const res = await fetch('/api/admin/special-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date, recurrence, multiplier: parseFloat(multiplier) })
    });
    const data = await res.json();
    if (data.success) {
        closeEventModal();
        loadSpecialDays();
        showToast('✓ Día especial guardado.');
    } else {
        showToast('Error: ' + (data.error || 'desconocido'));
    }
}

function openEventModal(prefill = {}) {
    const modal = document.getElementById('event-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (prefill.name)       document.getElementById('event-name').value       = prefill.name;
    if (prefill.date)       document.getElementById('event-date').value       = prefill.date;
    if (prefill.multiplier) document.getElementById('event-multiplier').value = prefill.multiplier;
}

function closeEventModal() {
    const modal = document.getElementById('event-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('event-name').value  = '';
    document.getElementById('event-date').value  = '';
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('opacity-0');
    t.classList.add('opacity-100');
    setTimeout(() => { t.classList.remove('opacity-100'); t.classList.add('opacity-0'); }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-new-special-day')?.addEventListener('click', () => openEventModal());
    document.getElementById('btn-close-modal')?.addEventListener('click', closeEventModal);
    document.getElementById('btn-save-special-day')?.addEventListener('click', saveSpecialDay);

    // Sugerencias clickeables
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const rawDate = card.dataset.date; // formato MM-DD
            const year    = new Date().getFullYear();
            const isoDate = rawDate ? `${year}-${rawDate}` : '';
            openEventModal({
                name:       card.dataset.name,
                date:       isoDate,
                multiplier: card.dataset.mult,
            });
            document.getElementById('event-recurrence').value = 'YEARLY';
        });
    });

    // Cargar días al entrar a la sección
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (link.dataset.section === 'calendar') loadSpecialDays();
        });
    });
});