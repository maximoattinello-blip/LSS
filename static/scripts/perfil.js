// RESERMAX – perfil.js

let showAll = false;
let reservations = [];

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

async function loadProfile() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) { window.location.href = '/login'; return; }
        const user = await res.json();

        document.getElementById('user-name').textContent = user.username;
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-since').textContent = 'Since ' + (user.member_since || '—');
        document.getElementById('user-points').textContent = user.points.toLocaleString();
        document.getElementById('user-avatar-letter').textContent = user.username[0].toUpperCase();

        // Progress bar toward 5000 pts
        const pct = Math.min((user.points / 5000) * 100, 100);
        document.getElementById('points-bar').style.width = pct + '%';
    } catch (e) {
        window.location.href = '/login';
    }
}

async function loadReservations() {
    try {
        const res = await fetch('/api/reservations');
        if (!res.ok) return;
        reservations = await res.json();

        // Stats
        const total = reservations.length;
        const confirmed = reservations.filter(r => r.estado === 'confirmed').length;
        const cancelled = reservations.filter(r => r.estado === 'cancelled').length;
        const pts = reservations.filter(r => r.estado === 'confirmed').reduce((sum, r) => sum + (r.points_earned || 0), 0);

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-confirmed').textContent = confirmed;
        document.getElementById('stat-cancelled').textContent = cancelled;
        document.getElementById('stat-pts').textContent = pts.toLocaleString();

        renderReservations();
    } catch (e) {}
}

function renderReservations() {
    const list = document.getElementById('reservations-list');
    const items = showAll ? reservations : reservations.filter(r => r.estado === 'confirmed').slice(0, 5);

    if (!items.length) {
        list.innerHTML = `<div class="text-center py-12">
            <p class="text-[#d3c5ac] text-sm uppercase tracking-widest">No reservations found.</p>
            <a href="/" class="inline-block mt-4 text-[#f7bb07] text-xs font-black uppercase tracking-widest border-b border-[#f7bb07]">Book a Court</a>
        </div>`;
        return;
    }

    list.innerHTML = items.map(r => {
        const dt = new Date(r.fecha_hora);
        const isConfirmed = r.estado === 'confirmed';
        const isPast = dt < new Date();
        const canCancel = isConfirmed && !isPast && (dt - new Date() > 24 * 60 * 60 * 1000);
        return `
        <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
            <div class="flex items-center gap-4">
                <div class="h-12 w-12 rounded-xl bg-[#131313] flex items-center justify-center border border-white/10">
                    <span class="material-symbols-outlined text-[#f7bb07]">event_available</span>
                </div>
                <div>
                    <span class="block text-sm font-bold">${r.court_name}</span>
                    <span class="text-[10px] text-[#d3c5ac] uppercase tracking-widest">${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-[10px] font-black text-[#f7bb07]">+${(r.points_earned || 0)} pts</span>
                <span class="${isConfirmed ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'} px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border">
                    ${r.estado}
                </span>
                ${canCancel ? `<button data-id="${r.id}" class="cancel-btn text-[#d3c5ac] hover:text-red-400 transition-colors">
                    <span class="material-symbols-outlined text-sm">cancel</span>
                </button>` : ''}
            </div>
        </div>`;
    }).join('');

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => cancelReservation(parseInt(btn.dataset.id)));
    });
}

async function cancelReservation(id) {
    if (!confirm('Cancel this reservation?')) return;
    try {
        const res = await fetch(`/api/cancel/${id}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Reservation cancelled', 'success');
            await loadReservations();
            await loadProfile();
        } else {
            showToast(data.error || 'Cannot cancel', 'error');
        }
    } catch (e) {
        showToast('Error cancelling', 'error');
    }
}

document.getElementById('toggle-history')?.addEventListener('click', () => {
    showAll = !showAll;
    document.getElementById('toggle-history').textContent = showAll ? 'Show Active' : 'Show All';
    renderReservations();
});

loadProfile();
loadReservations();
