// RESERMAX – index.js

const COURT_ICONS = {
	'Soccer Pitch': 'sports_soccer',
	'Tennis Court': 'sports_tennis',
	'Paddle Arena': 'sports_handball',
};

const COURT_IMAGE_PATHS = {
	cancha_futbol_5: '/static/images/courts/cancha_futbol_5.jpg',
	cancha_futbol_7: '/static/images/courts/cancha_futbol_7.jpg',
	cancha_futbol_11: '/static/images/courts/cancha_futbol_11.jpg',
	cancha_padel_indoor: '/static/images/courts/cancha_padel_indoor.jpg',
	cancha_padel_outdoor: '/static/images/courts/cancha_padel_outdoor.jpg',
	cancha_tenis_arcilla: '/static/images/courts/cancha_tenis_arcilla.jpg',
	cancha_tenis_cesped: '/static/images/courts/cancha_tenis_cesped.jpg',
	cancha_tenis_cemento: '/static/images/courts/cancha_tenis_cemento.jpg',
};

let allCourts = [];
let selectedCourt = null;
let selectedHour = null;
let selectedDuration = 1;
let freeHoursToken = null;
let freeHoursAvailable = 0;
let disabledDays = [];

function showToast(msg, type = '') {
	const t = document.createElement('div');
	t.className = `toast ${type}`;
	t.textContent = msg;
	document.body.appendChild(t);
	requestAnimationFrame(() => t.classList.add('show'));
	setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

// ── Cargar días inhabilitados ──
async function loadDisabledDays() {
	try {
		const res = await fetch('/api/disabled-days');
		disabledDays = await res.json();
	} catch (e) { disabledDays = []; }
}

function isDayDisabled(dateStr) {
	// dateStr: YYYY-MM-DD
	const monthDay = dateStr.slice(5); // MM-DD
	return disabledDays.some(d =>
		(d.recurring == 0 && d.date === dateStr) ||
		(d.recurring == 1 && d.date.slice(5) === monthDay)
	);
}

// ── Fetch & Render Courts ──
async function loadCourts(filter = '', nameQ = '') {
	const grid = document.getElementById('courts-grid');
	grid.innerHTML = '<div class="col-span-full flex items-center justify-center py-16"><p class="text-[#d3c5ac] text-sm uppercase tracking-widest animate-pulse">Cargando canchas...</p></div>';
	try {
		let url = '/api/courts';
		const params = [];
		if (filter) params.push(`type=${encodeURIComponent(filter)}`);
		if (nameQ) params.push(`q=${encodeURIComponent(nameQ)}`);
		if (params.length) url += '?' + params.join('&');
		const res = await fetch(url);
		allCourts = await res.json();
		renderCourts(allCourts);
	} catch (e) {
		grid.innerHTML = '<div class="col-span-full text-center py-16 text-red-400 text-xs uppercase tracking-widest">Error al cargar canchas.</div>';
	}
}

function renderCourts(courts) {
	const grid = document.getElementById('courts-grid');
	if (!courts.length) {
		grid.innerHTML = '<div class="col-span-full text-center py-16 text-[#d3c5ac] text-sm uppercase tracking-widest">No hay canchas disponibles.</div>';
		return;
	}
	grid.innerHTML = courts.map(c => {
		const imageUrl = c.image_url || COURT_IMAGE_PATHS[c.image_key] || '';
		const icon = COURT_ICONS[c.type] || 'sports';
		const media = imageUrl
			? `<img src="${imageUrl}" alt="${c.name}" class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" onerror="this.classList.add('hidden'); this.nextElementSibling.classList.remove('hidden');">
				<div class="hidden flex absolute inset-0 items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]">
					<span class="material-symbols-outlined text-7xl text-[#f7bb07]/25">${icon}</span>
				</div>`
			: `<div class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]">
					<span class="material-symbols-outlined text-7xl text-[#f7bb07]/25">${icon}</span>
				</div>`;
		return `
		<div class="group bg-[#131313] rounded-3xl overflow-hidden border border-white/5 hover:border-[#f7bb07]/40 transition-all duration-500 flex flex-col">
			<div class="h-48 bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] relative overflow-hidden">
				${media}
				<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
				<div class="absolute top-4 right-4">
					<span class="bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-green-500/20">Disponible</span>
				</div>
				<div class="absolute bottom-4 left-4">
					<span class="text-[8px] font-black uppercase tracking-widest text-[#d3c5ac]">${c.type}</span>
				</div>
			</div>
			<div class="p-6 flex flex-col flex-1">
				<h3 class="font-['Space_Grotesk'] text-xl font-black tracking-tighter uppercase mb-2">${c.name}</h3>
				<div class="flex items-center justify-between mb-6 mt-auto pt-4">
					<div>
						<span class="text-2xl font-black text-[#f7bb07]">$${c.price.toFixed(2)}</span>
						<span class="text-[10px] text-[#d3c5ac] uppercase tracking-widest ml-1">/ hr</span>
					</div>
					<div class="text-right">
						<span class="text-[10px] text-[#d3c5ac] uppercase tracking-widest block">Pts Mult.</span>
						<span class="font-black text-[#f7bb07]">${c.points_multiplier}x</span>
					</div>
				</div>
				<button data-court-id="${c.id}" class="book-btn w-full bg-[#f7bb07] text-black py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95 transition-all">
					Reservar Ahora
				</button>
			</div>
		</div>
	`}).join('');

	document.querySelectorAll('.book-btn').forEach(btn => {
		btn.addEventListener('click', () => openBookingModal(parseInt(btn.dataset.courtId)));
	});
}

// ── Booking Modal ──
function openBookingModal(courtId, token = null, freeHours = 0) {
	selectedCourt = allCourts.find(c => c.id === courtId);
	if (!selectedCourt) return;
	selectedHour = null;
	selectedDuration = freeHours || 1;
	freeHoursToken = token;
	freeHoursAvailable = freeHours;

	document.getElementById('modal-court-name').textContent = selectedCourt.name;
	document.getElementById('modal-court-type').textContent = selectedCourt.type;
	document.getElementById('modal-error').classList.add('hidden');

	// Banner horas gratis
	const banner = document.getElementById('free-hours-banner');
	if (token && freeHours > 0) {
		banner.classList.remove('hidden');
		document.getElementById('free-hours-label').textContent = `Token activo · ${freeHours} hora${freeHours > 1 ? 's' : ''} gratis`;
		document.getElementById('modal-price').textContent = 'GRATIS';
		document.getElementById('modal-points').textContent = '0 pts';
	} else {
		banner.classList.add('hidden');
		updateModalSummary();
	}

	// Seleccionar duración por defecto
	document.querySelectorAll('.duration-btn').forEach(b => {
		const active = parseInt(b.dataset.hours) === selectedDuration;
		b.classList.toggle('border-[#f7bb07]', active);
		b.classList.toggle('text-[#f7bb07]', active);
		b.classList.toggle('border-white/10', !active);
		// Si hay token de horas gratis, deshabilitar los otros
		if (token && freeHours > 0) {
			b.disabled = parseInt(b.dataset.hours) !== freeHours;
			b.classList.toggle('opacity-40', parseInt(b.dataset.hours) !== freeHours);
		} else {
			b.disabled = false;
			b.classList.remove('opacity-40');
		}
	});

	// Fecha mínima = hoy
	const today = new Date().toISOString().split('T')[0];
	document.getElementById('modal-date').min = today;
	document.getElementById('modal-date').value = '';
	document.getElementById('slots-container').innerHTML = '<p class="col-span-4 text-[#d3c5ac] text-xs text-center py-4 animate-pulse uppercase tracking-widest">Seleccioná una fecha primero</p>';

	document.getElementById('booking-modal').style.display = 'flex';
}

function updateModalSummary() {
	if (!selectedCourt) return;
	let multiplier = selectedCourt.points_multiplier;
	if (selectedHour !== null) {
		const h = selectedHour;
		if ((h >= 8 && h < 11) || (h >= 13 && h < 16) || h >= 22) multiplier *= 2.5;
	}
	const pts = Math.round(selectedCourt.price * multiplier * selectedDuration);
	const price = (selectedCourt.price * selectedDuration).toFixed(2);
	document.getElementById('modal-price').textContent = `$${price}`;
	document.getElementById('modal-points').textContent = `${pts.toLocaleString()} pts`;
}

async function renderSlots(dateStr) {
	const container = document.getElementById('slots-container');
	container.innerHTML = '<p class="col-span-4 text-[#d3c5ac] text-xs text-center py-4 animate-pulse uppercase tracking-widest">Cargando horarios...</p>';

	if (isDayDisabled(dateStr)) {
		container.innerHTML = '<p class="col-span-4 text-red-400 text-xs text-center py-4 font-black uppercase tracking-widest">⚠ Este día está inhabilitado para reservas</p>';
		return;
	}

	try {
		const res = await fetch(`/api/courts/${selectedCourt.id}/slots?date=${dateStr}`);
		const booked = await res.json();

		const hours = Array.from({length: 16}, (_, i) => i + 7); // 07:00 a 22:00
		selectedHour = null;

		container.innerHTML = hours.map(h => {
			// Verificar si este bloque está libre dado la duración
			let blocked = false;
			for (let bk of booked) {
				if (h < bk.end && h + selectedDuration > bk.start) { blocked = true; break; }
			}
			// No mostrar si el bloque de duración cae fuera de horario
			if (h + selectedDuration > 23) blocked = true;

			const label = `${String(h).padStart(2,'0')}:00`;
			return `<button data-hour="${h}" class="slot-btn py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all
				${blocked ? 'border-red-500/20 text-red-500/40 bg-red-500/5 cursor-not-allowed' : 'border-white/10 text-[#d3c5ac] hover:border-[#f7bb07] hover:text-[#f7bb07]'}"
				${blocked ? 'disabled' : ''}>${label}</button>`;
		}).join('');

		container.querySelectorAll('.slot-btn:not([disabled])').forEach(btn => {
			btn.addEventListener('click', () => {
				container.querySelectorAll('.slot-btn').forEach(b => {
					b.classList.remove('border-[#f7bb07]', 'text-[#f7bb07]', 'bg-[#f7bb07]/10');
				});
				btn.classList.add('border-[#f7bb07]', 'text-[#f7bb07]', 'bg-[#f7bb07]/10');
				selectedHour = parseInt(btn.dataset.hour);
				if (!freeHoursToken) updateModalSummary();
			});
		});
	} catch(e) {
		container.innerHTML = '<p class="col-span-4 text-red-400 text-xs text-center py-4 uppercase tracking-widest">Error al cargar horarios</p>';
	}
}

// Duración buttons
document.getElementById('duration-selector')?.addEventListener('click', (e) => {
	const btn = e.target.closest('.duration-btn');
	if (!btn || btn.disabled) return;
	selectedDuration = parseInt(btn.dataset.hours);
	document.querySelectorAll('.duration-btn').forEach(b => {
		const active = parseInt(b.dataset.hours) === selectedDuration;
		b.classList.toggle('border-[#f7bb07]', active);
		b.classList.toggle('text-[#f7bb07]', active);
		b.classList.toggle('border-white/10', !active);
	});
	selectedHour = null;
	const dateVal = document.getElementById('modal-date').value;
	if (dateVal) renderSlots(dateVal);
	if (!freeHoursToken) updateModalSummary();
});

// Fecha change
document.getElementById('modal-date')?.addEventListener('change', (e) => {
	if (e.target.value) renderSlots(e.target.value);
});

document.getElementById('modal-close')?.addEventListener('click', () => {
	document.getElementById('booking-modal').style.display = 'none';
});
document.getElementById('booking-modal')?.addEventListener('click', (e) => {
	if (e.target === document.getElementById('booking-modal'))
		document.getElementById('booking-modal').style.display = 'none';
});

document.getElementById('modal-confirm')?.addEventListener('click', async () => {
	const dateVal = document.getElementById('modal-date').value;
	if (!dateVal) { showToast('Seleccioná una fecha', 'error'); return; }
	if (selectedHour === null) { showToast('Seleccioná un horario disponible', 'error'); return; }

	const startDateTime = `${dateVal}T${String(selectedHour).padStart(2,'0')}:00:00`;

	const btn = document.getElementById('modal-confirm');
	btn.textContent = 'Reservando...';
	btn.disabled = true;

	try {
		const body = {
			courtId: selectedCourt.id,
			startDateTime,
			durationHours: selectedDuration,
		};
		if (freeHoursToken) {
			body.isFreeHours = true;
			body.redemptionToken = freeHoursToken;
		}

		const res = await fetch('/api/reserve', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json();
		if (res.status === 401) { window.location.href = '/login'; return; }
		if (data.success) {
			document.getElementById('booking-modal').style.display = 'none';
			const msg = freeHoursToken
				? '¡Reserva gratuita confirmada!'
				: `¡Reservado! +${data.points_earned} pts`;
			showToast(msg, 'success');
			freeHoursToken = null;
			loadUserPoints();
		} else {
			document.getElementById('modal-error').textContent = data.error || 'La reserva falló';
			document.getElementById('modal-error').classList.remove('hidden');
		}
	} catch (e) {
		document.getElementById('modal-error').textContent = 'Error de red. Intenta de nuevo.';
		document.getElementById('modal-error').classList.remove('hidden');
	} finally {
		btn.textContent = 'Confirmar Reserva';
		btn.disabled = false;
	}
});

// ── User Points ──
async function loadUserPoints() {
	try {
		const res = await fetch('/api/me');
		if (!res.ok) return;
		const user = await res.json();
		const el = document.getElementById('wallet-points');
		if (el) el.textContent = user.points.toLocaleString() + ' pts';
	} catch (e) {}
}

// ── Filter Buttons ──
let activeFilter = '';
document.querySelectorAll('.filter-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		document.querySelectorAll('.filter-btn').forEach(b => {
			b.classList.remove('bg-primary-container', 'text-on-primary-container', 'border-primary-container');
			b.classList.add('border-outline-variant/30', 'text-on-surface-variant');
		});
		btn.classList.add('bg-primary-container', 'text-on-primary-container', 'border-primary-container');
		btn.classList.remove('border-outline-variant/30', 'text-on-surface-variant');
		activeFilter = btn.dataset.filter;
		const q = document.getElementById('search-input')?.value?.trim() || '';
		loadCourts(activeFilter, q);
	});
});

// ── Search button ──
document.getElementById('search-btn')?.addEventListener('click', () => {
	const type = document.getElementById('court-type').value;
	activeFilter = type;
	loadCourts(type);
});

// ── Search input — filtro instantáneo del servidor ──
let searchDebounce = null;
document.getElementById('search-input')?.addEventListener('input', (e) => {
	clearTimeout(searchDebounce);
	searchDebounce = setTimeout(() => {
		loadCourts(activeFilter, e.target.value.trim());
	}, 250);
});

// ── Init ──
const dtDefault = document.getElementById('booking-date');
if (dtDefault) {
	const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
	dtDefault.value = d.toISOString().slice(0, 16);
}

// Exponer openBookingModal globalmente para premios.js
window.openBookingModalWithToken = openBookingModal;

loadDisabledDays();
loadCourts();
loadUserPoints();
