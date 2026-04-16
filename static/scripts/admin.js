// RESERMAX – admin.js

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        const stats = await res.json();
        document.getElementById('stat-revenue').textContent = '$' + stats.total_revenue.toLocaleString();
        document.getElementById('stat-bookings').textContent = stats.active_bookings;
        document.getElementById('stat-users').textContent = stats.total_users;
        document.getElementById('stat-new-today').textContent = stats.new_today;
    } catch (e) {}
}

async function loadBookings() {
    try {
        const res = await fetch('/api/reservations/all');
        const rows = await res.json();
        const tbody = document.getElementById('admin-bookings-list');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-[#d3c5ac] text-xs uppercase tracking-widest">No bookings yet.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const dt = new Date(r.fecha_hora);
            const isConfirmed = r.estado === 'confirmed';
            return `
            <tr class="border-b border-white/5">
                <td class="py-4">
                    <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-full bg-[#f7bb07] flex items-center justify-center font-black text-black text-xs">
                            ${r.username[0].toUpperCase()}
                        </div>
                        <div>
                            <span class="block text-xs font-bold">${r.username}</span>
                            <span class="text-[9px] text-[#d3c5ac]">${r.email}</span>
                        </div>
                    </div>
                </td>
                <td class="py-4 text-xs">${r.court_name}</td>
                <td class="py-4 text-xs">${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                <td class="py-4">
                    <span class="${isConfirmed ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'} px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border">${r.estado}</span>
                </td>
                <td class="py-4 text-xs font-black">$${r.price.toFixed(2)}</td>
            </tr>`;
        }).join('');
    } catch (e) {}
}

async function loadFacilities() {
    try {
        const res = await fetch('/api/courts/all');
        const courts = await res.json();
        const list = document.getElementById('facilities-list');
        const ICONS = {'Soccer Pitch':'sports_soccer','Tennis Court':'sports_tennis','Paddle Arena':'sports_handball'};
        list.innerHTML = courts.map(c => `
            <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div class="flex items-center gap-4">
                    <span class="material-symbols-outlined text-[#f7bb07]">${ICONS[c.type] || 'sports'}</span>
                    <div>
                        <span class="block text-xs font-bold uppercase tracking-tight">${c.name}</span>
                        <span class="text-[8px] ${c.available ? 'text-green-500' : 'text-red-500'} font-black uppercase tracking-widest">${c.status}</span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right">
                        <span class="text-[10px] font-black text-[#f7bb07]">${c.points_multiplier}x</span>
                        <span class="block text-[8px] text-[#d3c5ac] uppercase tracking-widest">Multiplier</span>
                    </div>
                    <button data-court-id="${c.id}" data-available="${c.available}" class="toggle-court-btn p-1.5 rounded-lg ${c.available ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'} transition-all">
                        <span class="material-symbols-outlined text-sm">${c.available ? 'pause_circle' : 'play_circle'}</span>
                    </button>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.toggle-court-btn').forEach(btn => {
            btn.addEventListener('click', () => toggleCourt(parseInt(btn.dataset.courtId)));
        });
    } catch (e) {}
}

async function toggleCourt(courtId) {
    try {
        const res = await fetch(`/api/admin/court/${courtId}/toggle`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Court status updated', 'success');
            loadFacilities();
        } else {
            showToast('Update failed', 'error');
        }
    } catch (e) {
        showToast('Error updating court', 'error');
    }
}

// ── Add Facility Modal ──
document.getElementById('add-facility-btn')?.addEventListener('click', () => {
    document.getElementById('add-facility-modal').style.display = 'flex';
});
document.getElementById('cancel-add-facility')?.addEventListener('click', () => {
    document.getElementById('add-facility-modal').style.display = 'none';
});
document.getElementById('confirm-add-facility')?.addEventListener('click', async () => {
    const name = document.getElementById('new-court-name').value.trim();
    const type = document.getElementById('new-court-type').value;
    const price = parseFloat(document.getElementById('new-court-price').value);
    const multiplier = parseFloat(document.getElementById('new-court-multiplier').value) || 1.0;

    if (!name || !price) { showToast('Please fill all fields', 'error'); return; }

    try {
        const res = await fetch('/api/admin/court', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, price, multiplier })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('add-facility-modal').style.display = 'none';
            showToast('Facility added!', 'success');
            loadFacilities();
        }
    } catch (e) {
        showToast('Error adding facility', 'error');
    }
});

// ── Init ──
loadStats();
loadBookings();
loadFacilities();
setInterval(() => { loadStats(); loadBookings(); }, 30000);
