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
            grid.innerHTML = '<p class="text-center text-[#d3c5ac] text-sm uppercase tracking-widest">No rewards available.</p>';
            return;
        }

        grid.className = 'px-6 lg:px-24 pb-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8';
        grid.innerHTML = rewards.map((r, i) => {
            const canAfford = userPoints >= r.cost_points;
            const noStock = r.stock <= 0;
            const icon = REWARD_ICONS[r.category] || 'card_giftcard';

            if (i === 0) {
                // Featured – large card
                return `
                <div class="lg:col-span-2 group relative bg-[#131313] rounded-3xl overflow-hidden border ${canAfford ? 'border-[#f7bb07]/30' : 'border-white/5'} hover:border-[#f7bb07]/40 transition-all duration-500">
                    <div class="grid grid-cols-1 md:grid-cols-2 h-full">
                        <div class="p-12 flex flex-col justify-between">
                            <div>
                                <span class="bg-[#f7bb07]/10 text-[#f7bb07] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#f7bb07]/20 mb-6 inline-block">Featured Reward</span>
                                <h2 class="font-['Space_Grotesk'] text-3xl font-black tracking-tighter uppercase mb-4">${r.name}</h2>
                                <p class="text-[#d3c5ac] text-sm mb-8">${r.description}</p>
                            </div>
                            <div class="flex items-center gap-6">
                                <div class="flex flex-col">
                                    <span class="text-3xl font-black text-[#f7bb07]">${r.cost_points.toLocaleString()}</span>
                                    <span class="text-[8px] font-black uppercase tracking-widest text-[#d3c5ac]">Points Required</span>
                                </div>
                                <button data-id="${r.id}" data-cost="${r.cost_points}" class="redeem-btn flex-1 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all
                                    ${noStock ? 'bg-white/5 text-[#d3c5ac] cursor-not-allowed opacity-50' : canAfford ? 'bg-[#f7bb07] text-black hover:scale-[1.02]' : 'bg-white/5 text-[#d3c5ac] opacity-60 cursor-not-allowed'}"
                                    ${noStock || !canAfford ? 'disabled' : ''}>
                                    ${noStock ? 'Out of Stock' : canAfford ? 'Redeem Gear' : 'Insufficient Points'}
                                </button>
                            </div>
                            <p class="mt-4 text-[10px] text-[#d3c5ac] uppercase tracking-widest">${r.stock} in stock</p>
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
                        <span class="material-symbols-outlined text-6xl text-[#f7bb07]/20 group-hover:text-[#f7bb07]/40 group-hover:scale-110 transition-all duration-500">${icon}</span>
                    </div>
                    <h3 class="font-['Space_Grotesk'] text-2xl font-black tracking-tighter uppercase mb-2">${r.name}</h3>
                    <p class="text-[#d3c5ac] text-xs">${r.description}</p>
                    <p class="mt-2 text-[10px] text-[#d3c5ac]/60 uppercase tracking-widest">${r.stock} in stock</p>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-xl font-black text-[#f7bb07]">${r.cost_points.toLocaleString()} <span class="text-[10px] text-[#d3c5ac]">PTS</span></span>
                    <button data-id="${r.id}" data-cost="${r.cost_points}" class="redeem-btn px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all
                        ${noStock ? 'bg-white/5 text-[#d3c5ac] cursor-not-allowed opacity-50' : canAfford ? 'bg-[#f7bb07] text-black hover:scale-[1.02]' : 'bg-white/5 text-[#d3c5ac] opacity-50 cursor-not-allowed'}"
                        ${noStock || !canAfford ? 'disabled' : ''}>
                        ${noStock ? 'Sold Out' : canAfford ? 'Redeem' : 'Locked'}
                    </button>
                </div>
            </div>`;
        }).join('');

        document.querySelectorAll('.redeem-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => redeemReward(parseInt(btn.dataset.id)));
        });
    } catch (e) {
        grid.innerHTML = '<p class="col-span-full text-center text-red-400 text-sm uppercase tracking-widest">Failed to load rewards.</p>';
    }
}

async function redeemReward(id) {
    if (!confirm('Redeem this reward?')) return;
    try {
        const res = await fetch(`/api/redeem/${id}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Reward redeemed! Check your profile.', 'success');
            await loadUserPoints();
            await loadRewards();
        } else {
            showToast(data.error || 'Redemption failed', 'error');
        }
    } catch (e) {
        showToast('Error redeeming reward', 'error');
    }
}

async function init() {
    await loadUserPoints();
    await loadRewards();
    setInterval(loadUserPoints, 30000);
}

init();
