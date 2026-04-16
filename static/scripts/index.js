// RESERMAX – index.js

const COURT_ICONS = {
    'Soccer Pitch': 'sports_soccer',
    'Tennis Court': 'sports_tennis',
    'Paddle Arena': 'sports_handball',
};

let allCourts = [];
let selectedCourt = null;

// ── Toast ──
function showToast(msg, type = '') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

// ── Fetch & Render Courts ──
async function loadCourts(filter = '') {
    const grid = document.getElementById('courts-grid');
    grid.innerHTML = '<div class="col-span-full flex items-center justify-center py-16"><p class="text-[#d3c5ac] text-sm uppercase tracking-widest animate-pulse">Loading courts...</p></div>';
    try {
        const url = filter ? `/api/courts?type=${encodeURIComponent(filter)}` : '/api/courts';
        const res = await fetch(url);
        allCourts = await res.json();
        renderCourts(allCourts);
    } catch (e) {
        grid.innerHTML = '<div class="col-span-full text-center py-16 text-red-400 text-xs uppercase tracking-widest">Failed to load courts.</div>';
    }
}

function renderCourts(courts) {
    const grid = document.getElementById('courts-grid');
    if (!courts.length) {
        grid.innerHTML = '<div class="col-span-full text-center py-16 text-[#d3c5ac] text-sm uppercase tracking-widest">No courts available.</div>';
        return;
    }
    grid.innerHTML = courts.map(c => `
        <div class="group bg-[#131313] rounded-3xl overflow-hidden border border-white/5 hover:border-[#f7bb07]/40 transition-all duration-500 flex flex-col">
            <div class="h-48 bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] flex items-center justify-center relative overflow-hidden">
                <span class="material-symbols-outlined text-7xl text-[#f7bb07]/20 group-hover:text-[#f7bb07]/40 transition-all duration-500 group-hover:scale-110">${COURT_ICONS[c.type] || 'sports'}</span>
                <div class="absolute top-4 right-4">
                    <span class="bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-green-500/20">Available</span>
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
                    Reserve Now
                </button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.book-btn').forEach(btn => {
        btn.addEventListener('click', () => openBookingModal(parseInt(btn.dataset.courtId)));
    });
}

// ── Booking Modal ──
function openBookingModal(courtId) {
    selectedCourt = allCourts.find(c => c.id === courtId);
    if (!selectedCourt) return;

    // Check logged in (server will redirect, but give feedback)
    document.getElementById('modal-court-name').textContent = selectedCourt.name;
    document.getElementById('modal-court-type').textContent = selectedCourt.type;
    document.getElementById('modal-price').textContent = `$${selectedCourt.price.toFixed(2)}`;
    updateModalPoints();

    const modal = document.getElementById('booking-modal');
    modal.style.display = 'flex';
    document.getElementById('modal-error').classList.add('hidden');
}

function updateModalPoints() {
    if (!selectedCourt) return;
    const dtInput = document.getElementById('modal-datetime');
    let multiplier = selectedCourt.points_multiplier;
    if (dtInput.value) {
        const h = new Date(dtInput.value).getHours();
        if ((h >= 8 && h < 11) || (h >= 13 && h < 16) || h >= 22) multiplier *= 2.5;
    }
    const pts = Math.round(selectedCourt.price * multiplier);
    document.getElementById('modal-points').textContent = `${pts.toLocaleString()} pts`;
}

document.getElementById('modal-datetime')?.addEventListener('change', updateModalPoints);

document.getElementById('modal-close')?.addEventListener('click', () => {
    document.getElementById('booking-modal').style.display = 'none';
});

document.getElementById('booking-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('booking-modal')) {
        document.getElementById('booking-modal').style.display = 'none';
    }
});

document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const dt = document.getElementById('modal-datetime').value;
    if (!dt) { showToast('Please select a date and time', 'error'); return; }

    const btn = document.getElementById('modal-confirm');
    btn.textContent = 'Booking...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courtId: selectedCourt.id, fechaHora: dt })
        });
        const data = await res.json();
        if (res.status === 401) { window.location.href = '/login'; return; }
        if (data.success) {
            document.getElementById('booking-modal').style.display = 'none';
            showToast(`Booked! +${data.points_earned} pts earned`, 'success');
            loadUserPoints();
        } else {
            document.getElementById('modal-error').textContent = data.error || 'Booking failed';
            document.getElementById('modal-error').classList.remove('hidden');
        }
    } catch (e) {
        document.getElementById('modal-error').textContent = 'Network error. Please try again.';
        document.getElementById('modal-error').classList.remove('hidden');
    } finally {
        btn.textContent = 'Confirm Reservation';
        btn.disabled = false;
    }
});

// ── User Points in wallet card ──
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
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('bg-primary-container', 'text-on-primary-container', 'border-primary-container');
            b.classList.add('border-outline-variant/30', 'text-on-surface-variant');
        });
        btn.classList.add('bg-primary-container', 'text-on-primary-container', 'border-primary-container');
        btn.classList.remove('border-outline-variant/30', 'text-on-surface-variant');
        loadCourts(btn.dataset.filter);
    });
});

// ── Search button ──
document.getElementById('search-btn')?.addEventListener('click', () => {
    const type = document.getElementById('court-type').value;
    loadCourts(type);
});

// ── Search input live filter ──
document.getElementById('search-input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allCourts.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
    renderCourts(filtered);
});

// ── Init ──
// Set default datetime to now + 1h
const dtDefault = document.getElementById('booking-date');
if (dtDefault) {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    dtDefault.value = d.toISOString().slice(0, 16);
}

loadCourts();
loadUserPoints();
