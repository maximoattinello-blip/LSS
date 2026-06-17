// RESERMAX – premios.js

let userPoints = 0;

function showToast(msg, type = '') {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.className = `toast ${type} show`;
	setTimeout(() => t.classList.remove('show'), 3000);
}

const REWARD_ICONS = {
	'gear': 'sports_soccer',
	'nutrition': 'local_drink',
	'access': 'key',
	'apparel': 'checkroom',
	'training': 'fitness_center',
};

async function loadUserPoints() {
	try {
		const res = await fetch('/api/me');
		if (!res.ok) return;
		const user = await res.json();
		userPoints = user.points;
		const nav = document.getElementById('user-points-nav');
		const avatar = document.getElementById('nav-avatar');
		if (nav) nav.textContent = user.points.toLocaleString();
		if (avatar) avatar.textContent = user.username[0].toUpperCase();
	} catch (e) {}
}

async function loadRewards() {
	const grid = document.getElementById('rewards-grid');
	try {
		const res = await fetch('/api/rewards');
		const rewards = await res.json();
		if (!rewards.length) {
			grid.innerHTML = '<p class="text-center text-[#d3c5ac] text-sm uppercase tracking-widest">Sin recompensas disponibles.</p>';
			return;
		}
		grid.className = 'px-6 lg:px-24 pb-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8';
		grid.innerHTML = rewards.map((r, i) => {
			const canAfford = userPoints >= r.cost_points;
			const noStock = r.stock <= 0;
			const icon = r.is_free_hours ? 'schedule' : (REWARD_ICONS[r.category] || 'card_giftcard');
			const isFreeHours = r.is_free_hours;

			const btnLabel = noStock ? 'Agotado' : !canAfford ? (i === 0 ? 'Puntos Insuficientes' : 'Bloqueado') : (isFreeHours ? `Canjear ${r.free_hours}h Gratis` : 'Canjear');
			const btnClass = noStock || !canAfford
				? 'bg-white/5 text-[#d3c5ac] cursor-not-allowed opacity-50'
				: isFreeHours
					? 'bg-green-500 text-black hover:scale-[1.02]'
					: 'bg-[#f7bb07] text-black hover:scale-[1.02]';

			if (i === 0) {
				return `
				<div class="lg:col-span-2 group relative bg-[#131313] rounded-3xl overflow-hidden border ${canAfford ? 'border-[#f7bb07]/30' : 'border-white/5'} hover:border-[#f7bb07]/40 transition-all duration-500">
					<div class="grid grid-cols-1 md:grid-cols-2 h-full">
						<div class="p-12 flex flex-col justify-between">
							<div>
								<span class="bg-[#f7bb07]/10 text-[#f7bb07] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#f7bb07]/20 mb-6 inline-block">${isFreeHours ? '⏱ Horas Gratis' : 'Recompensa Destacada'}</span>
								<h2 class="font-['Space_Grotesk'] text-3xl font-black tracking-tighter uppercase mb-4">${r.name}</h2>
								<p class="text-[#d3c5ac] text-sm mb-8">${r.description}</p>
							</div>
							<div class="flex items-center gap-6">
								<div class="flex flex-col">
									<span class="text-3xl font-black text-[#f7bb07]">${r.cost_points.toLocaleString()}</span>
									<span class="text-[8px] font-black uppercase tracking-widest text-[#d3c5ac]">Puntos Requeridos</span>
								</div>
								<button data-id="${r.id}" data-free-hours="${r.free_hours}" data-is-free="${r.is_free_hours}" class="redeem-btn flex-1 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${btnClass}"
									${noStock || !canAfford ? 'disabled' : ''}>${btnLabel}</button>
							</div>
							<p class="mt-4 text-[10px] text-[#d3c5ac] uppercase tracking-widest">${r.stock} en stock</p>
						</div>
						<div class="h-64 md:h-full bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] flex items-center justify-center relative overflow-hidden">
							<span class="material-symbols-outlined text-9xl text-[#f7bb07]/20 group-hover:text-[#f7bb07]/40 transition-all duration-700 group-hover:scale-110">${icon}</span>
						</div>
					</div>
				</div>`;
			}

			return `
			<div class="bg-[#131313] rounded-3xl p-8 border border-white/5 flex flex-col justify-between group hover:border-[#f7bb07]/30 transition-all">
				<div class="mb-8">
					<div class="h-40 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] mb-6 flex items-center justify-center overflow-hidden">
						<span class="material-symbols-outlined text-6xl ${isFreeHours ? 'text-green-500/30 group-hover:text-green-500/60' : 'text-[#f7bb07]/20 group-hover:text-[#f7bb07]/40'} group-hover:scale-110 transition-all duration-500">${icon}</span>
					</div>
					${isFreeHours ? '<span class="inline-block mb-2 bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-green-500/20">Horas Gratis</span>' : ''}
					<h3 class="font-['Space_Grotesk'] text-2xl font-black tracking-tighter uppercase mb-2">${r.name}</h3>
					<p class="text-[#d3c5ac] text-xs">${r.description}</p>
					<p class="mt-2 text-[10px] text-[#d3c5ac]/60 uppercase tracking-widest">${r.stock} en stock</p>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-xl font-black text-[#f7bb07]">${r.cost_points.toLocaleString()} <span class="text-[10px] text-[#d3c5ac]">PTS</span></span>
					<button data-id="${r.id}" data-free-hours="${r.free_hours}" data-is-free="${r.is_free_hours}" class="redeem-btn px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${btnClass}"
						${noStock || !canAfford ? 'disabled' : ''}>${btnLabel}</button>
				</div>
			</div>`;
		}).join('');

		document.querySelectorAll('.redeem-btn:not([disabled])').forEach(btn => {
			btn.addEventListener('click', () => redeemReward(
				parseInt(btn.dataset.id),
				parseInt(btn.dataset.freeHours) || 0,
				btn.dataset.isFree === '1'
			));
		});
	} catch (e) {
		grid.innerHTML = '<p class="col-span-full text-center text-red-400 text-sm uppercase tracking-widest">Error al cargar recompensas.</p>';
	}
}

// ── Modal de QR / Canje ──
function showRedemptionModal(token, rewardName, isFreeHours, freeHours) {
	// Crear modal dinámicamente
	const existing = document.getElementById('redemption-modal');
	if (existing) existing.remove();

	const modal = document.createElement('div');
	modal.id = 'redemption-modal';
	modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4';

	const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('RESERMAX:' + token)}&bgcolor=131313&color=f7bb07&format=png`;

	modal.innerHTML = `
		<div class="bg-[#131313] rounded-3xl p-8 w-full max-w-sm border border-white/10 text-center">
			<h3 class="font-['Space_Grotesk'] text-2xl font-black uppercase tracking-tighter mb-2">${rewardName}</h3>
			<p class="text-[#d3c5ac] text-xs uppercase tracking-widest mb-6">Tu comprobante de canje</p>

			${isFreeHours ? `
			<div class="mb-6 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
				<p class="text-green-400 text-xs font-black uppercase tracking-widest">¡${freeHours} hora${freeHours > 1 ? 's' : ''} gratis desbloqueada${freeHours > 1 ? 's' : ''}!</p>
				<p class="text-[#d3c5ac] text-[10px] mt-1">Usá el botón de abajo para reservar ahora.</p>
			</div>
			` : ''}

			<div class="bg-white p-4 rounded-2xl inline-block mb-4">
				<img src="${qrSrc}" alt="QR Token" class="w-40 h-40"/>
			</div>
			<p class="text-[10px] text-[#d3c5ac] uppercase tracking-widest mb-1">Token único</p>
			<p class="font-mono text-xs text-[#f7bb07] break-all px-4 mb-6">${token}</p>

			<div class="flex flex-col gap-3">
				${isFreeHours ? `<button id="use-free-hours-btn" class="w-full py-3 rounded-xl bg-green-500 text-black font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-all">Reservar Ahora (${freeHours}h Gratis)</button>` : ''}
				<button id="close-redemption-modal" class="w-full py-3 rounded-xl border border-white/10 font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all">Cerrar</button>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	document.getElementById('close-redemption-modal').addEventListener('click', () => modal.remove());

	if (isFreeHours) {
		document.getElementById('use-free-hours-btn').addEventListener('click', () => {
			modal.remove();
			// Redirigir al index con el token para abrir el modal de reserva
			window.location.href = `/?freeToken=${encodeURIComponent(token)}&freeHours=${freeHours}`;
		});
	}
}

async function redeemReward(id, freeHours, isFreeHours) {
	const label = isFreeHours ? `¿Canjear ${freeHours} hora${freeHours > 1 ? 's' : ''} gratis?` : '¿Canjear esta recompensa?';
	if (!confirm(label)) return;
	try {
		const res = await fetch(`/api/redeem/${id}`, { method: 'POST' });
		const data = await res.json();
		if (data.success) {
			await loadUserPoints();
			await loadRewards();
			showRedemptionModal(data.token, '', isFreeHours, data.free_hours || freeHours);
		} else {
			showToast(data.error || 'Error al canjear', 'error');
		}
	} catch (e) {
		showToast('Error al canjear la recompensa', 'error');
	}
}

async function init() {
	await loadUserPoints();
	await loadRewards();
	setInterval(loadUserPoints, 30000);
}

init();