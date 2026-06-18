// RESERMAX – admin.js

function showToast(msg, type = '') {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.className = `toast ${type} show`;
	setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Navegación entre secciones ──
const sections = ['dashboard', 'facilities', 'calendar', 'multipliers'];

function showSection(name) {
	sections.forEach(s => {
		document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name);
	});
	document.querySelectorAll('.nav-link').forEach(link => {
		const active = link.dataset.section === name;
		link.classList.toggle('bg-[#f7bb07]', active);
		link.classList.toggle('text-black', active);
		link.classList.toggle('hover:bg-white/5', !active);
		link.classList.toggle('text-[#d3c5ac]', !active);
		link.classList.toggle('hover:text-white', !active);
	});
	if (name === 'dashboard') { loadStats(); loadBookings(); loadFacilitiesDashboard(); }
	if (name === 'facilities') loadFacilities();
	if (name === 'calendar') loadDisabledDays();
	if (name === 'multipliers') loadPointMultipliers();
}

document.querySelectorAll('.nav-link').forEach(link => {
	link.addEventListener('click', (e) => {
		e.preventDefault();
		showSection(link.dataset.section);
	});
});

// ── Stats ──
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

// ── Bookings ──
async function loadBookings() {
	try {
		const res = await fetch('/api/reservations/all');
		const rows = await res.json();
		const tbody = document.getElementById('admin-bookings-list');
		if (!rows.length) {
			tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-[#d3c5ac] text-xs uppercase tracking-widest">Sin reservas.</td></tr>';
			return;
		}
		tbody.innerHTML = rows.map(r => {
			const dt = new Date(r.start_datetime);
			const isConfirmed = r.estado === 'confirmed';
			const isFree = r.is_free_hours;
			return `
			<tr class="border-b border-white/5">
				<td class="py-4">
					<div class="flex items-center gap-3">
						<div class="h-8 w-8 rounded-full bg-[#f7bb07] flex items-center justify-center font-black text-black text-xs">${r.username[0].toUpperCase()}</div>
						<div>
							<span class="block text-xs font-bold">${r.username}</span>
							<span class="text-[9px] text-[#d3c5ac]">${r.email}</span>
						</div>
					</div>
				</td>
				<td class="py-4 text-xs">${r.court_name}</td>
				<td class="py-4 text-xs">${dt.toLocaleDateString()} ${dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
				<td class="py-4">
					<span class="${isConfirmed ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'} px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border">${r.estado}</span>
				</td>
				<td class="py-4 text-xs font-black">${isFree ? '<span class="text-[#f7bb07]">GRATIS</span>' : '$' + r.price.toFixed(2)}</td>
			</tr>`;
		}).join('');
	} catch (e) {}
}

// ── Facilities (dashboard mini) ──
async function loadFacilitiesDashboard() {
	try {
		const res = await fetch('/api/courts/all');
		const courts = await res.json();
		const list = document.getElementById('facilities-list-dashboard');
		const ICONS = {'Soccer Pitch':'sports_soccer','Tennis Court':'sports_tennis','Paddle Arena':'sports_handball'};
		list.innerHTML = courts.slice(0, 5).map(c => `
			<div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
				<div class="flex items-center gap-3">
					<span class="material-symbols-outlined text-[#f7bb07] text-sm">${ICONS[c.type] || 'sports'}</span>
					<span class="text-xs font-bold">${c.name}</span>
				</div>
				<span class="text-[8px] ${c.available ? 'text-green-500' : 'text-red-500'} font-black uppercase tracking-widest">${c.status}</span>
			</div>
		`).join('');
	} catch(e) {}
}

// ── Facilities (full list) ──
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
					${c.has_special_day ? `<div class="text-right">
						<span class="text-[10px] font-black text-[#f7bb07]">x${c.day_multiplier.toFixed(1)}</span>
						<span class="block text-[8px] text-[#d3c5ac] uppercase tracking-widest">Día Especial</span>
					</div>` : ''}
					<button data-court-id="${c.id}" class="toggle-court-btn p-1.5 rounded-lg ${c.available ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'} transition-all">
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
		if (data.success) { showToast('Estado actualizado', 'success'); loadFacilities(); }
		else showToast('Error al actualizar', 'error');
	} catch (e) { showToast('Error de red', 'error'); }
}

// ── Días Inhabilitados ──
let recurringSelected = 0;

document.querySelectorAll('.recurring-type-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		recurringSelected = parseInt(btn.dataset.recurring);
		document.querySelectorAll('.recurring-type-btn').forEach(b => {
			const active = b.dataset.recurring == recurringSelected;
			b.classList.toggle('border-[#f7bb07]', active);
			b.classList.toggle('text-[#f7bb07]', active);
			b.classList.toggle('border-white/10', !active);
			b.classList.toggle('text-[#d3c5ac]', !active);
		});
		document.getElementById('recurring-hint').textContent = recurringSelected
			? 'Este día/mes se bloqueará todos los años.'
			: 'Esta fecha exacta será bloqueada.';
	});
});

document.getElementById('add-disabled-day-btn')?.addEventListener('click', async () => {
	const date = document.getElementById('disable-date-input').value;
	const reason = document.getElementById('disable-reason-input').value.trim();
	if (!date) { showToast('Seleccioná una fecha', 'error'); return; }
	try {
		const res = await fetch('/api/admin/disabled-days', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ date, recurring: recurringSelected, reason })
		});
		const data = await res.json();
		if (data.success) {
			showToast('Fecha bloqueada', 'success');
			document.getElementById('disable-date-input').value = '';
			document.getElementById('disable-reason-input').value = '';
			loadDisabledDays();
		} else {
			showToast(data.error || 'Error al bloquear', 'error');
		}
	} catch(e) { showToast('Error de red', 'error'); }
});

async function loadDisabledDays() {
	try {
		const res = await fetch('/api/disabled-days');
		const days = await res.json();
		const list = document.getElementById('disabled-days-list');
		if (!days.length) {
			list.innerHTML = '<p class="text-[#d3c5ac] text-xs uppercase tracking-widest text-center py-8">No hay fechas bloqueadas.</p>';
			return;
		}
		list.innerHTML = days.map(d => `
			<div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
				<div class="flex items-center gap-3">
					<span class="material-symbols-outlined text-red-400">event_busy</span>
					<div>
						<span class="block text-sm font-bold">${d.date}</span>
						<div class="flex items-center gap-2 mt-1">
							<span class="text-[8px] ${d.recurring ? 'bg-[#f7bb07]/10 text-[#f7bb07] border-[#f7bb07]/20' : 'bg-white/10 text-[#d3c5ac] border-white/10'} px-2 py-0.5 rounded border font-black uppercase tracking-widest">${d.recurring ? 'Todos los años' : 'Solo este año'}</span>
							${d.reason ? `<span class="text-[10px] text-[#d3c5ac]">${d.reason}</span>` : ''}
						</div>
					</div>
				</div>
				<button data-id="${d.id}" class="delete-day-btn p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
					<span class="material-symbols-outlined text-sm">delete</span>
				</button>
			</div>
		`).join('');

		document.querySelectorAll('.delete-day-btn').forEach(btn => {
			btn.addEventListener('click', async () => {
				try {
					const res = await fetch(`/api/admin/disabled-days/${btn.dataset.id}`, { method: 'DELETE' });
					const data = await res.json();
					if (data.success) { showToast('Fecha desbloqueada', 'success'); loadDisabledDays(); }
				} catch(e) {}
			});
		});
	} catch(e) {}
}

// ── Add Facility Modal ──
// Multiplicadores de puntos
document.getElementById('add-multiplier-btn')?.addEventListener('click', async () => {
	const startDate = document.getElementById('multiplier-start-date').value;
	const endDate = document.getElementById('multiplier-end-date').value || startDate;
	const reason = document.getElementById('multiplier-reason').value.trim();
	const recurring = document.getElementById('multiplier-recurring')?.checked || false;
	if (!startDate) { showToast('Selecciona una fecha de inicio', 'error'); return; }
	try {
		const res = await fetch('/api/admin/point-multipliers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ start_date: startDate, end_date: endDate, reason, recurring })
		});
		const data = await res.json();
		if (data.success) {
			showToast('Multiplicador x2 programado', 'success');
			document.getElementById('multiplier-start-date').value = '';
			document.getElementById('multiplier-end-date').value = '';
			document.getElementById('multiplier-reason').value = '';
			document.getElementById('multiplier-recurring').checked = false;
			loadPointMultipliers();
		} else {
			showToast(data.error || 'Error al programar', 'error');
		}
	} catch(e) { showToast('Error de red', 'error'); }
});

async function loadPointMultipliers() {
	try {
		const res = await fetch('/api/admin/point-multipliers');
		const periods = await res.json();
		const list = document.getElementById('multipliers-list');
		if (!periods.length) {
			list.innerHTML = '<p class="text-[#d3c5ac] text-xs uppercase tracking-widest text-center py-8">No hay multiplicadores programados.</p>';
			return;
		}
		list.innerHTML = periods.map(p => {
			const sameDay = p.start_date === p.end_date;
			const rangeLabel = sameDay ? p.start_date : `${p.start_date} al ${p.end_date}`;
			return `
			<div class="flex items-center justify-between gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
				<div class="flex items-center gap-3 min-w-0">
					<span class="material-symbols-outlined text-[#f7bb07]">offline_bolt</span>
					<div>
						<span class="block text-sm font-bold">${rangeLabel}</span>
						<div class="flex items-center gap-2 mt-1 flex-wrap">
							<span class="text-[8px] bg-[#f7bb07]/10 text-[#f7bb07] border-[#f7bb07]/20 px-2 py-0.5 rounded border font-black uppercase tracking-widest">x${p.multiplier}</span>
							${p.recurring ? '<span class="text-[8px] bg-white/10 text-[#d3c5ac] border-white/10 px-2 py-0.5 rounded border font-black uppercase tracking-widest">Todos los anos</span>' : ''}
							${p.reason ? `<span class="text-[10px] text-[#d3c5ac]">${p.reason}</span>` : ''}
						</div>
					</div>
				</div>
				<button data-id="${p.id}" class="delete-multiplier-btn p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
					<span class="material-symbols-outlined text-sm">delete</span>
				</button>
			</div>`;
		}).join('');

		document.querySelectorAll('.delete-multiplier-btn').forEach(btn => {
			btn.addEventListener('click', async () => {
				try {
					const res = await fetch(`/api/admin/point-multipliers/${btn.dataset.id}`, { method: 'DELETE' });
					const data = await res.json();
					if (data.success) { showToast('Multiplicador eliminado', 'success'); loadPointMultipliers(); }
				} catch(e) {}
			});
		});
	} catch(e) {}
}

document.getElementById('add-facility-btn')?.addEventListener('click', () => {
	document.getElementById('add-facility-modal').style.display = 'flex';
});
document.getElementById('cancel-add-facility')?.addEventListener('click', () => {
	document.getElementById('add-facility-modal').style.display = 'none';
});
document.getElementById('confirm-add-facility')?.addEventListener('click', async () => {
	const name = document.getElementById('new-court-name').value.trim();
	const type = document.getElementById('new-court-type').value;
	const imageKey = document.getElementById('new-court-image-key')?.value || '';
	const price = parseFloat(document.getElementById('new-court-price').value);
	const multiplier = parseFloat(document.getElementById('new-court-multiplier').value) || 1.0;
	if (!name || !price) { showToast('Completá todos los campos', 'error'); return; }
	try {
		const res = await fetch('/api/admin/court', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, type, price, multiplier, image_key: imageKey })
		});
		const data = await res.json();
		if (data.success) {
			document.getElementById('add-facility-modal').style.display = 'none';
			document.getElementById('new-court-image-key').value = '';
			showToast('¡Instalación agregada!', 'success');
			loadFacilities();
		}
	} catch (e) { showToast('Error al agregar', 'error'); }
});

// ── Init ──
showSection('dashboard');
setInterval(() => {
	const dashVisible = !document.getElementById('section-dashboard').classList.contains('hidden');
	if (dashVisible) { loadStats(); loadBookings(); }
}, 30000);
