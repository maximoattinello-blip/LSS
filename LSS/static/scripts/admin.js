// RESERMAX – Panel unificado de control administrativo

function showToast(msg, type = '') {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.className = `fixed bottom-6 right-6 bg-[#1f1f1f] border border-white/10 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-2xl transition-all duration-300 z-50 opacity-100`;
	if (type === 'success') t.style.borderColor = 'rgba(16, 185, 129, 0.4)';
	if (type === 'error') t.style.borderColor = 'rgba(239, 68, 68, 0.4)';
	setTimeout(() => t.classList.replace('opacity-100', 'opacity-0'), 3000);
}

// ── NAVEGACIÓN EN SECCIONES ──
const sections = ['dashboard', 'facilities', 'calendar'];

function showSection(name) {
	sections.forEach(s => {
		const target = document.getElementById(`section-${s}`);
		if (target) target.classList.toggle('hidden', s !== name);
	});
	
	document.querySelectorAll('.nav-link').forEach(link => {
		const active = link.dataset.section === name;
		link.classList.toggle('bg-[#f7bb07]', active);
		link.classList.toggle('text-black', active);
		link.classList.toggle('hover:bg-white/5', !active);
		link.classList.toggle('text-[#d3c5ac]', !active);
		link.classList.toggle('hover:text-white', !active);
	});

	if (name === 'dashboard') loadStats();
	if (name === 'facilities') loadFacilities();
	if (name === 'calendar') {
		fetchPointsEvents();
		initCalendarSuggestions();
	}
}

document.querySelectorAll('.nav-link').forEach(link => {
	link.addEventListener('click', (e) => {
		e.preventDefault();
		showSection(link.dataset.section);
	});
});

// ── CARGAR STATS DEL DASHBOARD ──
async function loadStats() {
	try {
		const res = await fetch('/api/admin/stats');
		if (!res.ok) return;
		const data = await res.json();
		document.getElementById('stat-revenue').textContent = `$${data.total_revenue.toFixed(2)}`;
		document.getElementById('stat-bookings').textContent = data.active_bookings;
		document.getElementById('stat-users').textContent = data.total_users;
		document.getElementById('stat-new').textContent = data.new_today;
	} catch (e) { console.error("Error al cargar stats", e); }
}

// ── MÓDULO DE INSTALACIONES (COURTS) ──
async function loadFacilities() {
	const grid = document.getElementById('facilities-grid');
	if (!grid) return;
	try {
		const res = await fetch('/api/courts/all'); // Cambiar a tu ruta correspondiente si difiere
		const courts = res.ok ? await res.json() : [];
		if (!courts.length) {
			grid.innerHTML = '<p class="text-[#d3c5ac]/40 text-xs uppercase font-bold tracking-widest py-8 col-span-3 text-center">No hay canchas creadas</p>';
			return;
		}
		grid.innerHTML = courts.map(c => `
			<div class="bg-[#131313] border ${c.status === 'Operational' ? 'border-white/5' : 'border-red-500/20'} rounded-2xl p-6 flex flex-col justify-between space-y-4">
				<div>
					<div class="flex justify-between items-start">
						<h4 class="text-white font-bold text-lg">${c.name}</h4>
						<span class="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${c.status === 'Operational' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}">${c.status}</span>
					</div>
					<p class="text-xs text-[#d3c5ac] mt-1">${c.type} • Base x${c.points_multiplier}</p>
				</div>
				<div class="flex justify-between items-center pt-2 border-t border-white/5">
					<span class="text-sm font-black text-white">$${c.price}/h</span>
					<button onclick="toggleCourtStatus(${c.id})" class="text-xs font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all">Alterar Estado</button>
				</div>
			</div>
		`).join('');
	} catch (e) { grid.innerHTML = '<p class="text-center text-xs py-8 text-red-400">Error al enlazar canchas.</p>'; }
}

async function toggleCourtStatus(id) {
	try {
		const res = await fetch(`/api/admin/court/${id}/toggle`, { method: 'POST' });
		if (res.ok) { showToast('Estado de instalación modificado', 'success'); loadFacilities(); }
	} catch (e) { showToast('Error operativo', 'error'); }
}

// Controladores de Ventana Modal de Canchas
document.getElementById('add-facility-btn')?.addEventListener('click', () => {
	document.getElementById('add-facility-modal').classList.replace('hidden', 'flex');
});
document.getElementById('cancel-add-facility')?.addEventListener('click', () => {
	document.getElementById('add-facility-modal').classList.replace('flex', 'hidden');
});
document.getElementById('confirm-add-facility')?.addEventListener('click', async () => {
	const name = document.getElementById('new-court-name').value.trim();
	const type = document.getElementById('new-court-type').value;
	const price = parseFloat(document.getElementById('new-court-price').value);
	const multiplier = parseFloat(document.getElementById('new-court-multiplier').value) || 1.0;

	if (!name || !price) { showToast('Completá todos los campos', 'error'); return; }
	try {
		const res = await fetch('/api/admin/court', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, type, price, multiplier })
		});
		if (res.ok) {
			document.getElementById('add-facility-modal').classList.replace('flex', 'hidden');
			showToast('¡Instalación agregada!', 'success');
			loadFacilities();
		}
	} catch (e) { showToast('Error al agregar cancha', 'error'); }
});


// =====================================================================
// LÓGICA DEL CALENDARIO DINÁMICO DE MULTIPLICADORES DE PUNTOS
// =====================================================================

let pointsEventsList = [];
let calYear = 2026; 
let calMonth = 5; // Junio por defecto

const monthList = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

async function fetchPointsEvents() {
	try {
		const res = await fetch('/api/admin/points-events');
		if (!res.ok) return;
		pointsEventsList = await res.json();
		buildCalendarView();
		buildActiveMonthEvents();
	} catch (e) { showToast('Error al descargar reglas de puntos', 'error'); }
}

function buildCalendarView() {
	const grid = document.getElementById("calendar-grid");
	const label = document.getElementById("current-month-label");
	if (!grid || !label) return;

	grid.innerHTML = "";
	label.textContent = `${monthList[calMonth]} ${calYear}`;

	const firstDay = new Date(calYear, calMonth, 1).getDay();
	const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

	for (let i = 0; i < firstDay; i++) {
		const empty = document.createElement("div");
		empty.className = "bg-transparent min-h-[60px] aspect-square pointer-events-none";
		grid.appendChild(empty);
	}

	for (let day = 1; day <= daysInMonth; day++) {
		const cell = document.createElement("div");
		cell.className = "bg-white/[0.02] border border-white/5 rounded-xl p-1.5 flex flex-col justify-between cursor-pointer min-h-[60px] aspect-square transition-all hover:bg-white/5 hover:border-[#f7bb07]/30";
		
		const mm = String(calMonth + 1).padStart(2, '0');
		const dd = String(day).padStart(2, '0');
		const checkDate = `${calYear}-${mm}-${dd}`;

		const matchedEvent = pointsEventsList.find(e => {
			if (e.start_date === checkDate) return true;
			if (e.recurrence_type === 'YEARLY') {
				return e.start_date.slice(5) === `${mm}-${dd}`;
			}
			return false;
		});

		let innerHTML = `<span class="text-xs font-bold text-[#d3c5ac]">${day}</span>`;
		if (matchedEvent) {
			cell.classList.add("border-[#f7bb07]/40", "bg-gradient-to-br", "from-[#f7bb07]/5");
			innerHTML += `<div class="bg-[#f7bb07]/10 text-[#f7bb07] border border-[#f7bb07]/20 text-[8px] font-black px-1 rounded truncate">x${matchedEvent.multiplier}</div>`;
		}

		cell.innerHTML = innerHTML;
		cell.addEventListener("click", () => {
			document.getElementById("event-date").value = checkDate;
			document.getElementById("selected-date-display").textContent = checkDate;
			document.getElementById("event-name").value = "";
			document.getElementById("event-modal").classList.remove("hidden");
		});
		grid.appendChild(cell);
	}
}

function buildActiveMonthEvents() {
	const list = document.getElementById("active-events-list");
	if (!list) return;

	const targetMM = String(calMonth + 1).padStart(2, '0');
	const monthEvents = pointsEventsList.filter(e => e.start_date.slice(5, 7) === targetMM);

	if (!monthEvents.length) {
		list.innerHTML = '<p class="text-center text-[#d3c5ac]/30 text-xs py-4 uppercase font-bold">Sin reglas este mes</p>';
		return;
	}

	list.innerHTML = monthEvents.map(e => `
		<div class="flex justify-between items-center p-2.5 bg-white/[0.01] border border-white/5 rounded-xl">
			<div class="truncate pr-2">
				<h5 class="text-xs font-bold text-white truncate">${e.name}</h5>
				<p class="text-[9px] text-[#d3c5ac] font-mono">${e.start_date} • ${e.recurrence_type}</p>
			</div>
			<div class="flex items-center gap-2 flex-shrink-0">
				<span class="text-xs font-black text-[#f7bb07]">x${e.multiplier}</span>
				<button onclick="removePointsEvent(${e.id})" class="text-white/40 hover:text-red-400 transition-colors flex items-center">
					<span class="material-symbols-outlined text-sm">delete</span>
				</button>
			</div>
		</div>
	`).join('');
}

window.removePointsEvent = async function(id) {
	if (!confirm("¿Eliminar este multiplicador del calendario operativo?")) return;
	try {
		const res = await fetch(`/api/admin/points-events/${id}`, { method: 'DELETE' });
		if (res.ok) { showToast("Multiplicador eliminado", "success"); fetchPointsEvents(); }
	} catch (err) { showToast("Error en la transacción", "error"); }
};

document.getElementById("event-form")?.addEventListener("submit", async (e) => {
	e.preventDefault();
	const name = document.getElementById("event-name").value.trim();
	const recurrence_type = document.getElementById("event-recurrence").value;
	const multiplier = document.getElementById("event-multiplier").value;
	const start_date = document.getElementById("event-date").value;

	try {
		const res = await fetch('/api/admin/points-events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, recurrence_type, multiplier, start_date })
		});
		if (res.ok) {
			showToast("Regla guardada correctamente", "success");
			document.getElementById("event-modal").classList.add("hidden");
			fetchPointsEvents();
		}
	} catch (err) { showToast("Error al procesar guardado", "error"); }
});

function initCalendarSuggestions() {
	document.querySelectorAll(".suggestion-card").forEach(card => {
		card.onclick = () => {
			const name = card.dataset.name;
			const mult = card.dataset.mult;
			const targetMM = String(calMonth + 1).padStart(2, '0');
			let calculatedDate = `${calYear}-${targetMM}-15`;

			if (card.dataset.date === "09-21") calculatedDate = `${calYear}-09-21`;

			document.getElementById("event-date").value = calculatedDate;
			document.getElementById("selected-date-display").textContent = calculatedDate;
			document.getElementById("event-name").value = name;
			document.getElementById("event-multiplier").value = mult;
			document.getElementById("event-modal").classList.remove("hidden");
		};
	});
}

document.getElementById("btn-prev-month")?.addEventListener("click", () => {
	calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } buildCalendarView(); buildActiveMonthEvents();
});
document.getElementById("btn-next-month")?.addEventListener("click", () => {
	calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } buildCalendarView(); buildActiveMonthEvents();
});
document.getElementById("btn-close-modal")?.addEventListener("click", () => {
	document.getElementById("event-modal").classList.add("hidden");
});

// Arranke inicial automático
document.addEventListener('DOMContentLoaded', () => {
	showSection('dashboard');
});