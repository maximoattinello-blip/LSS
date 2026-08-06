// RESERMAX – perfil.js

let showAll = false;
let reservations = [];
let pendingCancelReservationId = null;
let cancellationPolicy = [];
let reviewRating = 0;
let reviewReservationId = null;

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

async function loadCancellationPolicy() {
    try {
        const res = await fetch('/api/cancellation-policy');
        cancellationPolicy = await res.json();
    } catch (e) { cancellationPolicy = []; }
}

function getRefundTier(hoursRemaining) {
    const tiers = cancellationPolicy
        .filter(t => !t.is_noshow)
        .sort((a, b) => b.hours_before - a.hours_before);
    let tier = tiers[tiers.length - 1] || null;
    for (const t of tiers) {
        if (hoursRemaining >= t.hours_before) { tier = t; break; }
    }
    return tier;
}

async function loadProfile() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) { window.location.href = '/login'; return; }
        const user = await res.json();

        document.getElementById('user-name').textContent = user.username;
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-since').textContent = 'Desde ' + (user.member_since || '—');
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
            <p class="text-[#d3c5ac] text-sm uppercase tracking-widest">No hay reservas encontradas.</p>
            <a href="/" class="inline-block mt-4 text-[#f7bb07] text-xs font-black uppercase tracking-widest border-b border-[#f7bb07]">Reservar una Cancha</a>
        </div>`;
        return;
    }

    list.innerHTML = items.map(r => {
        const dt = new Date(r.start_datetime);
        const isConfirmed = r.estado === 'confirmed';
        const isPast = dt < new Date();
        const canCancel = isConfirmed && !isPast;
        const canReview = isConfirmed && isPast && !r.has_review;
        return `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
            <div class="flex items-center gap-4 min-w-0">
                <div class="h-12 w-12 rounded-xl bg-[#131313] flex items-center justify-center border border-white/10">
                    <span class="material-symbols-outlined text-[#f7bb07]">event_available</span>
                </div>
                <div>
                    <span class="block text-sm font-bold">${r.court_name}</span>
                    <span class="text-[10px] text-[#d3c5ac] uppercase tracking-widest">${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                </div>
            </div>
            <div class="flex items-center gap-3 flex-wrap md:justify-end">
                <span class="text-[10px] font-black text-[#f7bb07]">+${(r.points_earned || 0)} pts</span>
                <span class="${isConfirmed ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'} px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border">
                    ${r.estado}
                </span>
                ${canReview ? `<button data-id="${r.id}" data-court="${r.court_id}" class="review-btn inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f7bb07]/10 text-[#f7bb07] border border-[#f7bb07]/20 hover:bg-[#f7bb07]/20 transition-colors text-[10px] font-black uppercase tracking-widest">
                    <span class="material-symbols-outlined text-sm">star</span>
                    Calificar
                </button>` : ''}
                ${canCancel ? `<button data-id="${r.id}" class="cancel-btn inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors text-[10px] font-black uppercase tracking-widest">
                    <span class="material-symbols-outlined text-sm">cancel</span>
                    Cancelar
                </button>` : ''}
            </div>
        </div>`;
    }).join('');

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => openCancelConfirm(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.review-btn').forEach(btn => {
        btn.addEventListener('click', () => openReviewModal(parseInt(btn.dataset.id), parseInt(btn.dataset.court)));
    });
}

function openCancelConfirm(id) {
    pendingCancelReservationId = id;
    const res = reservations.find(r => r.id === id);
    const infoEl = document.getElementById('cancel-refund-info');
    if (res && infoEl) {
        const hours = (new Date(res.start_datetime) - new Date()) / 3600000;
        const tier = getRefundTier(hours);
        const points = res.points_earned || 0;
        const reversed = Math.round(points * (100 - (tier ? tier.refund_percent : 0)) / 100);
        if (tier) {
            infoEl.innerHTML = `
                <div class="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <span class="block text-[10px] font-black uppercase tracking-widest text-[#f7bb07] mb-1">${tier.label}</span>
                    <span class="text-xs text-[#d3c5ac]">Reembolso: ${tier.refund_percent}% · Se descontarán ${reversed} pts de tu saldo</span>
                </div>`;
        } else {
            infoEl.innerHTML = '';
        }
    }
    document.getElementById('cancel-confirm-modal').style.display = 'flex';
}

// ── Modal de reseñas ──
function openReviewModal(reservationId, courtId) {
    reviewReservationId = reservationId;
    reviewRating = 0;
    const court = reservations.find(r => r.id === reservationId);
    document.getElementById('review-modal-court-name').textContent = court ? court.court_name : '';
    document.getElementById('review-comment').value = '';
    document.getElementById('review-error').classList.add('hidden');
    document.querySelectorAll('.star-btn').forEach(b => {
        const v = parseInt(b.dataset.star);
        b.classList.toggle('text-[#f7bb07]', v <= reviewRating);
        b.classList.toggle('text-[#4f4632]', v > reviewRating);
    });
    document.getElementById('review-modal').style.display = 'flex';
}

function closeReviewModal() {
    reviewReservationId = null;
    reviewRating = 0;
    document.getElementById('review-modal').style.display = 'none';
}

async function submitReview() {
    if (reviewRating < 1) { showToast('Seleccioná una calificación', 'error'); return; }
    if (!reviewReservationId) return;
    const btn = document.getElementById('submit-review-btn');
    btn.textContent = 'Enviando...';
    btn.disabled = true;
    try {
        const comment = document.getElementById('review-comment').value.trim();
        const courtId = reservations.find(r => r.id === reviewReservationId)?.court_id;
        const res = await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                court_id: courtId,
                reservation_id: reviewReservationId,
                rating: reviewRating,
                comment
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('¡Gracias por tu reseña!', 'success');
            closeReviewModal();
            await loadReservations();
        } else {
            document.getElementById('review-error').textContent = data.error || 'No se pudo enviar la reseña';
            document.getElementById('review-error').classList.remove('hidden');
        }
    } catch (e) {
        document.getElementById('review-error').textContent = 'Error de red. Intenta de nuevo.';
        document.getElementById('review-error').classList.remove('hidden');
    } finally {
        btn.textContent = 'Enviar Reseña';
        btn.disabled = false;
    }
}

function closeCancelConfirm() {
    pendingCancelReservationId = null;
    document.getElementById('cancel-confirm-modal').style.display = 'none';
}

async function cancelReservation(id) {
    try {
        const res = await fetch(`/api/cancel/${id}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            if (data.refund_percent < 100) {
                showToast(`Cancelada · Se descontaron ${data.points_reversed} pts`, 'error');
            } else {
                showToast('Reserva cancelada con reembolso total', 'success');
            }
            await loadReservations();
            await loadProfile();
        } else {
            showToast(data.error || 'No se puede cancelar', 'error');
        }
    } catch (e) {
        showToast('Error al cancelar', 'error');
    }
}

document.getElementById('confirm-cancel-reservation')?.addEventListener('click', async () => {
    if (!pendingCancelReservationId) return;
    const id = pendingCancelReservationId;
    const btn = document.getElementById('confirm-cancel-reservation');
    btn.textContent = 'Cancelando...';
    btn.disabled = true;
    await cancelReservation(id);
    btn.textContent = 'Si, cancelar reserva';
    btn.disabled = false;
    closeCancelConfirm();
});

document.getElementById('dismiss-cancel-reservation')?.addEventListener('click', closeCancelConfirm);

document.getElementById('cancel-confirm-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('cancel-confirm-modal')) closeCancelConfirm();
});

document.getElementById('toggle-history')?.addEventListener('click', () => {
    showAll = !showAll;
    document.getElementById('toggle-history').textContent = showAll ? 'Mostrar Activas' : 'Mostrar Todo';
    renderReservations();
});

document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        reviewRating = parseInt(btn.dataset.star);
        document.querySelectorAll('.star-btn').forEach(b => {
            const v = parseInt(b.dataset.star);
            b.classList.toggle('text-[#f7bb07]', v <= reviewRating);
            b.classList.toggle('text-[#4f4632]', v > reviewRating);
        });
    });
});

document.getElementById('close-review-modal')?.addEventListener('click', closeReviewModal);
document.getElementById('submit-review-btn')?.addEventListener('click', submitReview);
document.getElementById('review-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('review-modal')) closeReviewModal();
});

loadCancellationPolicy();
loadProfile();
loadReservations();
