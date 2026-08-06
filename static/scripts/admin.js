// RESERMAX – admin.js

function showToast(msg, type = '') {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.className = `toast ${type} show`;
	setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Navegación entre secciones ──
const sectionIds = {
	dashboard: 'section-dashboard',
	facilities: 'section-facilities',
	calendar: 'section-calendar',
	multipliers: 'section-multipliers',
	users: 'section-users',
	policy: 'section-policy',
};

function setSectionVisibility(name) {
	const safeName = sectionIds[name] ? name : 'dashboard';
	Object.entries(sectionIds).forEach(([key, id]) => {
		const section = document.getElementById(id);
		if (section) section.classList.toggle('hidden', key !== safeName);
	});
}

function setActiveNav(name) {
	const safeName = sectionIds[name] ? name : 'dashboard';
	document.querySelectorAll('.nav-link').forEach(link => {
		const active = link.dataset.section === safeName;
		link.classList.toggle('bg-[#f7bb07]', active);
		link.classList.toggle('text-black', active);
		link.classList.toggle('hover:bg-white/5', !active);
		link.classList.toggle('text-[#d3c5ac]', !active);
		link.classList.toggle('hover:text-white', !active);
	});
}

function showSection(name) {
	const safeName = sectionIds[name] ? name : 'dashboard';
	setSectionVisibility(safeName);
	setActiveNav(safeName);
	if (safeName === 'dashboard') { loadStats(); loadBookings(); loadFacilitiesDashboard(); loadAnalytics(); }
	if (safeName === 'facilities') loadFacilities();
	if (safeName === 'calendar') loadDisabledDays();
	if (safeName === 'multipliers') loadPointMultipliers();
	if (safeName === 'users') loadUsers();
	if (safeName === 'policy') loadPolicy();
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
function isNoShowAllowed(startDatetime) {
	try {
		const start = new Date(startDatetime);
		const now = new Date();
		return start.getFullYear() === now.getFullYear()
			&& start.getMonth() === now.getMonth()
			&& start.getDate() === now.getDate()
			&& start.getHours() === now.getHours()
			&& now >= start
			&& now < new Date(start.getTime() + 60 * 60 * 1000);
	} catch (e) {
		return false;
	}
}

async function loadBookings() {
	try {
		const res = await fetch('/api/reservations/all');
		const rows = await res.json();
		const tbody = document.getElementById('admin-bookings-list');
		if (!rows.length) {
			tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-[#d3c5ac] text-xs uppercase tracking-widest">Sin reservas.</td></tr>';
			return;
		}
		tbody.innerHTML = rows.map(r => {
			const dt = new Date(r.start_datetime);
			const isConfirmed = r.estado === 'confirmed';
			const isFree = r.is_free_hours;
			const canMarkNoshow = !['noshow', 'cancelled', 'completed'].includes(r.estado) && isNoShowAllowed(r.start_datetime);
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
				<td class="py-4">
					${canMarkNoshow ? `<button data-reservation-id="${r.id}" class="mark-noshow-btn rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-all">No-Show</button>` : '<span class="text-[9px] text-[#d3c5ac] uppercase tracking-widest">—</span>'}
				</td>
			</tr>`;
		}).join('');

		document.querySelectorAll('.mark-noshow-btn').forEach(btn => {
			btn.addEventListener('click', () => markReservationNoShow(parseInt(btn.dataset.reservationId), btn));
		});
	} catch (e) {}
}

async function markReservationNoShow(reservationId, button) {
	if (!reservationId) return;
	button.disabled = true;
	button.textContent = 'Procesando...';
	try {
		const res = await fetch(`/api/admin/reservations/${reservationId}/noshow`, { method: 'POST' });
		const data = await res.json();
		if (data.success) {
			showToast('Reserva marcada como no-show', 'success');
			loadBookings();
			loadStats();
			loadAnalytics();
		} else {
			showToast(data.error || 'No se pudo marcar', 'error');
			button.disabled = false;
			button.textContent = 'No-Show';
		}
	} catch (e) {
		showToast('Error de red', 'error');
		button.disabled = false;
		button.textContent = 'No-Show';
	}
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
	const multiplier = parseFloat(document.getElementById('multiplier-value').value) || 2.0;
	const reason = document.getElementById('multiplier-reason').value.trim();
	const recurring = document.getElementById('multiplier-recurring')?.checked || false;
	if (!startDate) { showToast('Selecciona una fecha de inicio', 'error'); return; }
	if (multiplier < 1) { showToast('El multiplicador debe ser mayor a 1', 'error'); return; }
	try {
		const res = await fetch('/api/admin/point-multipliers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ start_date: startDate, end_date: endDate, multiplier, reason, recurring })
		});
		const data = await res.json();
		if (data.success) {
			showToast('Multiplicador x2 programado', 'success');
			document.getElementById('multiplier-start-date').value = '';
			document.getElementById('multiplier-end-date').value = '';
			document.getElementById('multiplier-value').value = '';
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
							${p.recurring ? '<span class="text-[8px] bg-white/10 text-[#d3c5ac] border-white/10 px-2 py-0.5 rounded border font-black uppercase tracking-widest">Todos los años</span>' : ''}
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

function setModalVisible(modalId, visible) {
	const modal = document.getElementById(modalId);
	if (!modal) return;
	modal.classList.toggle('hidden', !visible);
	modal.classList.toggle('flex', visible);
}

document.getElementById('add-facility-btn')?.addEventListener('click', () => {
	setModalVisible('add-facility-modal', true);
});
document.getElementById('cancel-add-facility')?.addEventListener('click', () => {
	setModalVisible('add-facility-modal', false);
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
			setModalVisible('add-facility-modal', false);
			document.getElementById('new-court-image-key').value = '';
			showToast('¡Instalación agregada!', 'success');
			loadFacilities();
		}
	} catch (e) { showToast('Error al agregar', 'error'); }
});

// ── Init ──
initAnalyticsDates();
showSection('dashboard');
setInterval(() => {
	const dashVisible = !document.getElementById('section-dashboard').classList.contains('hidden');
	if (dashVisible) { loadStats(); loadBookings(); }
}, 30000);

// ══════════════════════════════════════════════════════
// ANALÍTICAS HISTÓRICAS (Chart.js)
// ══════════════════════════════════════════════════════
let analyticsCharts = {};
const CHART_GRID = 'rgba(255,255,255,0.06)';
const CHART_TICK = 'rgba(211,197,172,0.8)';

function destroyCharts() {
	Object.values(analyticsCharts).forEach(c => { if (c) c.destroy(); });
	analyticsCharts = {};
}

function initAnalyticsDates() {
	const to = document.getElementById('analytics-to');
	const from = document.getElementById('analytics-from');
	if (to) to.value = new Date().toISOString().slice(0, 10);
	if (from) { const d = new Date(); d.setDate(d.getDate() - 30); from.value = d.toISOString().slice(0, 10); }
}

async function loadAnalytics() {
	const from = document.getElementById('analytics-from')?.value || '';
	const to   = document.getElementById('analytics-to')?.value || '';
	try {
		const res = await fetch(`/api/admin/analytics?from=${from}&to=${to}`);
		const d = await res.json();
		document.getElementById('stat-noshow-rate').textContent = d.no_show_rate + '%';
		document.getElementById('stat-cancel-rate').textContent = d.cancellation_rate + '%';
		renderAnalyticsCharts(d);
	} catch (e) {}
}

function renderAnalyticsCharts(d) {
	destroyCharts();
	const baseOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: { legend: { labels: { color: CHART_TICK, font: { size: 10 } } } },
		scales: {
			x: { grid: { color: CHART_GRID }, ticks: { color: CHART_TICK, font: { size: 10 } } },
			y: { grid: { color: CHART_GRID }, ticks: { color: CHART_TICK, font: { size: 10 } } }
		}
	};

	analyticsCharts.revenue = new Chart(document.getElementById('chart-revenue'), {
		type: 'line',
		data: {
			labels: d.revenue_by_day.map(x => x.date.slice(5)),
			datasets: [{
				label: 'Ingresos ($)',
				data: d.revenue_by_day.map(x => x.revenue),
				borderColor: '#f7bb07',
				backgroundColor: 'rgba(247,187,7,0.15)',
				fill: true,
				tension: 0.35,
				pointRadius: 2,
			}]
		},
		options: { ...baseOptions, plugins: { legend: { display: false } } }
	});

	analyticsCharts.hours = new Chart(document.getElementById('chart-hours'), {
		type: 'bar',
		data: {
			labels: d.bookings_by_hour.map(x => String(x.hour).padStart(2, '0') + ':00'),
			datasets: [{
				label: 'Reservas',
				data: d.bookings_by_hour.map(x => x.bookings),
				backgroundColor: 'rgba(247,187,7,0.7)',
				borderRadius: 4,
			}]
		},
		options: { ...baseOptions, plugins: { legend: { display: false } } }
	});

	analyticsCharts.courts = new Chart(document.getElementById('chart-courts'), {
		type: 'bar',
		data: {
			labels: d.popular_courts.map(x => x.name),
			datasets: [{
				label: 'Reservas',
				data: d.popular_courts.map(x => x.bookings),
				backgroundColor: 'rgba(247,187,7,0.7)',
				borderRadius: 4,
			}]
		},
		options: {
			...baseOptions,
			indexAxis: 'y',
			plugins: { legend: { display: false } }
		}
	});

	const completed = Math.max(0, d.total_reservations - d.total_cancelled - d.total_noshow);
	analyticsCharts.rates = new Chart(document.getElementById('chart-rates'), {
		type: 'doughnut',
		data: {
			labels: ['Canceladas', 'No-Show', 'Completadas'],
			datasets: [{
				data: [d.total_cancelled, d.total_noshow, completed],
				backgroundColor: ['#ef4444', '#f97316', 'rgba(34,197,94,0.8)'],
				borderWidth: 0,
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { position: 'bottom', labels: { color: CHART_TICK, font: { size: 10 } } } }
		}
	});
}

document.getElementById('apply-analytics')?.addEventListener('click', loadAnalytics);
document.querySelectorAll('.analytics-preset').forEach(btn => {
	btn.addEventListener('click', () => {
		const days = parseInt(btn.dataset.days || '30');
		const from = document.getElementById('analytics-from');
		if (from) { const d = new Date(); d.setDate(d.getDate() - days); from.value = d.toISOString().slice(0, 10); }
		loadAnalytics();
	});
});

// ══════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS
// ══════════════════════════════════════════════════════
let usersCache = [];
let selectedUser = null;

let userSearchDebounce = null;
document.getElementById('user-search')?.addEventListener('input', (e) => {
	clearTimeout(userSearchDebounce);
	userSearchDebounce = setTimeout(loadUsers, 250);
});
document.getElementById('user-status-filter')?.addEventListener('change', loadUsers);

async function loadUsers() {
	const q = document.getElementById('user-search').value.trim();
	const status = document.getElementById('user-status-filter').value;
	const params = [];
	if (q) params.push('q=' + encodeURIComponent(q));
	if (status) params.push('status=' + encodeURIComponent(status));
	try {
		const res = await fetch('/api/admin/users?' + params.join('&'));
		usersCache = await res.json();
		renderUsers(usersCache);
	} catch (e) {}
}

function renderUsers(users) {
	const tbody = document.getElementById('admin-users-list');
	if (!users.length) {
		tbody.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-[#d3c5ac] text-xs uppercase tracking-widest">Sin usuarios.</td></tr>';
		return;
	}
	const statusColor = { active: 'bg-green-500/10 text-green-500 border-green-500/20', suspended: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', deactivated: 'bg-red-500/10 text-red-500 border-red-500/20' };
	tbody.innerHTML = users.map(u => `
		<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
			<td class="py-4">
				<div class="flex items-center gap-3">
					<div class="h-8 w-8 rounded-full bg-[#f7bb07] flex items-center justify-center font-black text-black text-xs">${u.username[0].toUpperCase()}</div>
					<span class="text-xs font-bold">${u.username}</span>
				</div>
			</td>
			<td class="py-4 text-xs text-[#d3c5ac]">${u.email}</td>
			<td class="py-4 text-xs">${u.puesto}</td>
			<td class="py-4 text-xs font-black text-[#f7bb07]">${u.points.toLocaleString()}</td>
			<td class="py-4 text-xs text-[#d3c5ac]">${u.bookings}</td>
			<td class="py-4">
				<span class="${statusColor[u.status] || statusColor.active} px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border">${u.status}</span>
			</td>
			<td class="py-4">
				<select data-user-id="${u.id}" class="user-status-select bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-widest outline-none focus:border-[#f7bb07]">
					<option value="active" ${u.status === 'active' ? 'selected' : ''}>Activo</option>
					<option value="suspended" ${u.status === 'suspended' ? 'selected' : ''}>Suspendido</option>
					<option value="deactivated" ${u.status === 'deactivated' ? 'selected' : ''}>Desactivado</option>
				</select>
			</td>
			<td class="py-4">
				<div class="flex items-center gap-2">
					<button data-user-id="${u.id}" title="Ajustar puntos" class="user-points-btn p-2 rounded-lg bg-[#f7bb07]/10 text-[#f7bb07] hover:bg-[#f7bb07]/20 transition-all">
						<span class="material-symbols-outlined text-sm">add_card</span>
					</button>
					<button data-user-id="${u.id}" title="Historial" class="user-history-btn p-2 rounded-lg bg-white/5 text-[#d3c5ac] hover:bg-white/10 transition-all">
						<span class="material-symbols-outlined text-sm">receipt_long</span>
					</button>
				</div>
			</td>
		</tr>
	`).join('');

	document.querySelectorAll('.user-status-select').forEach(sel => {
		sel.addEventListener('change', () => setUserStatus(parseInt(sel.dataset.userId), sel.value));
	});
	document.querySelectorAll('.user-points-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const user = usersCache.find(u => u.id === parseInt(btn.dataset.userId));
			openPointsModal(user);
		});
	});
	document.querySelectorAll('.user-history-btn').forEach(btn => {
		btn.addEventListener('click', () => openHistoryModal(parseInt(btn.dataset.userId)));
	});
}

async function setUserStatus(userId, status) {
	try {
		const res = await fetch(`/api/admin/users/${userId}/status`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status })
		});
		const data = await res.json();
		if (data.success) { showToast('Estado actualizado', 'success'); loadUsers(); }
		else showToast(data.error || 'Error al cambiar estado', 'error');
	} catch (e) { showToast('Error de red', 'error'); }
}

function openPointsModal(user) {
	if (!user) return;
	selectedUser = user;
	document.getElementById('points-modal-username').textContent = user.username;
	document.getElementById('points-modal-current').textContent = user.points.toLocaleString() + ' pts';
	document.getElementById('points-amount').value = '';
	document.getElementById('points-reason').value = '';
	setModalVisible('points-modal', true);
}

function closePointsModal() {
	selectedUser = null;
	setModalVisible('points-modal', false);
}

document.getElementById('close-points-modal')?.addEventListener('click', closePointsModal);
document.getElementById('close-points-modal-2')?.addEventListener('click', closePointsModal);
document.getElementById('confirm-points-btn')?.addEventListener('click', async () => {
	if (!selectedUser) return;
	const points = parseInt(document.getElementById('points-amount').value);
	const reason = document.getElementById('points-reason').value.trim();
	if (!points) { showToast('Ingresá un monto distinto de 0', 'error'); return; }
	if (!reason) { showToast('El motivo es obligatorio', 'error'); return; }
	try {
		const res = await fetch(`/api/admin/users/${selectedUser.id}/points`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ points, reason })
		});
		const data = await res.json();
		if (data.success) {
			showToast('Puntos ajustados', 'success');
			closePointsModal();
			loadUsers();
		} else {
			showToast(data.error || 'Error al ajustar puntos', 'error');
		}
	} catch (e) { showToast('Error de red', 'error'); }
});

async function openHistoryModal(userId) {
	try {
		const res = await fetch(`/api/admin/users/${userId}/history`);
		const d = await res.json();
		if (!d.user) { showToast('Usuario no encontrado', 'error'); return; }
		document.getElementById('history-modal-name').textContent = d.user.username;
		document.getElementById('history-modal-email').textContent = d.user.email;
		document.getElementById('history-modal-status').textContent = d.user.status;
		document.getElementById('history-modal-points').textContent = d.user.points.toLocaleString() + ' pts';

		const resBox = document.getElementById('history-reservations');
		resBox.innerHTML = d.reservations.length ? d.reservations.map(r => `
			<div class="flex items-center justify-between gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
				<div>
					<span class="block text-xs font-bold">${r.court_name}</span>
					<span class="text-[10px] text-[#d3c5ac]">${new Date(r.start_datetime).toLocaleString()}</span>
				</div>
				<span class="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${r.estado === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}">${r.estado}</span>
			</div>
		`).join('') : '<p class="text-[#d3c5ac] text-xs py-6 text-center">Sin reservas.</p>';

		const adjBox = document.getElementById('history-adjustments');
		adjBox.innerHTML = d.adjustments.length ? d.adjustments.map(a => `
			<div class="flex items-center justify-between gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
				<div>
					<span class="block text-xs font-bold">${a.reason}</span>
					<span class="text-[10px] text-[#d3c5ac]">${a.admin_name || 'Admin'} · ${new Date(a.created_at).toLocaleString()}</span>
				</div>
				<span class="text-xs font-black ${a.points >= 0 ? 'text-green-500' : 'text-red-400'}">${a.points >= 0 ? '+' : ''}${a.points}</span>
			</div>
		`).join('') : '<p class="text-[#d3c5ac] text-xs py-6 text-center">Sin ajustes de puntos.</p>';

		const revBox = document.getElementById('history-reviews');
		revBox.innerHTML = d.reviews.length ? d.reviews.map(rv => `
			<div class="flex items-center justify-between gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
				<div>
					<span class="block text-xs font-bold">${rv.court_name}</span>
					${rv.comment ? `<span class="text-[10px] text-[#d3c5ac]">${rv.comment}</span>` : ''}
				</div>
				<span class="text-[#f7bb07] text-xs">${'★'.repeat(rv.rating)}${'☆'.repeat(5 - rv.rating)}</span>
			</div>
		`).join('') : '<p class="text-[#d3c5ac] text-xs py-6 text-center">Sin reseñas.</p>';

		setModalVisible('history-modal', true);
	} catch (e) { showToast('Error de red', 'error'); }
}

document.getElementById('close-history-modal')?.addEventListener('click', () => {
	setModalVisible('history-modal', false);
});

// ══════════════════════════════════════════════════════
// POLÍTICA DE CANCELACIÓN Y REEMBOLSO
// ══════════════════════════════════════════════════════
async function loadPolicy() {
	try {
		const res = await fetch('/api/admin/cancellation-policy');
		const tiers = await res.json();
		renderPolicy(tiers);
	} catch (e) {}
}

function renderPolicy(tiers) {
	const list = document.getElementById('policy-tiers-list');
	list.innerHTML = tiers.map(t => `
		<div class="policy-row grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-white/5 border rounded-xl p-4 ${t.is_noshow ? 'border-red-500/30' : 'border-white/10'}" data-noshow="${t.is_noshow}">
			<div class="md:col-span-2">
				<label class="block text-[9px] font-black uppercase tracking-widest text-[#d3c5ac] mb-2">${t.is_noshow ? 'Tipo' : 'Horas antes'}</label>
				${t.is_noshow
					? '<span class="block text-xs font-black text-red-400 py-3 uppercase tracking-widest">No-Show</span>'
					: `<input data-field="hours" type="number" step="0.5" min="0" value="${t.hours_before}" class="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-3 text-xs outline-none focus:border-[#f7bb07]">`}
			</div>
			<div class="md:col-span-2">
				<label class="block text-[9px] font-black uppercase tracking-widest text-[#d3c5ac] mb-2">Reembolso %</label>
				<input data-field="refund" type="number" min="0" max="100" value="${t.refund_percent}" class="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-3 text-xs outline-none focus:border-[#f7bb07]">
			</div>
			<div class="md:col-span-5">
				<label class="block text-[9px] font-black uppercase tracking-widest text-[#d3c5ac] mb-2">Descripción</label>
				<input data-field="label" type="text" value="${t.label}" class="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-3 text-xs outline-none focus:border-[#f7bb07]">
			</div>
			<div class="md:col-span-2">
				<label class="block text-[9px] font-black uppercase tracking-widest text-[#d3c5ac] mb-2">Penalización pts</label>
				<input data-field="penalty" type="number" min="0" value="${t.penalty_points}" class="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-3 text-xs outline-none focus:border-[#f7bb07]">
			</div>
			<div class="md:col-span-1 text-right text-[#d3c5ac]/40"><span class="material-symbols-outlined text-lg">${t.is_noshow ? 'block' : 'schedule'}</span></div>
		</div>
	`).join('');
}

document.getElementById('save-policy-btn')?.addEventListener('click', async () => {
	const tiers = [];
	document.querySelectorAll('#policy-tiers-list .policy-row').forEach(row => {
		tiers.push({
			hours_before: parseFloat(row.querySelector('[data-field="hours"]')?.value ?? 0) || 0,
			refund_percent: parseFloat(row.querySelector('[data-field="refund"]').value) || 0,
			label: row.querySelector('[data-field="label"]').value,
			penalty_points: parseInt(row.querySelector('[data-field="penalty"]').value) || 0,
			is_noshow: parseInt(row.dataset.noshow || '0'),
		});
	});
	try {
		const res = await fetch('/api/admin/cancellation-policy', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tiers })
		});
		const data = await res.json();
		if (data.success) { showToast('Política guardada', 'success'); loadPolicy(); }
		else showToast(data.error || 'Error al guardar', 'error');
	} catch (e) { showToast('Error de red', 'error'); }
});
