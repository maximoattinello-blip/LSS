import os
import sqlite3
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = 'resermax_dev_secret_key_replace_in_production'

basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'resermax.db')

# ==========================================
# DATABASE HELPERS
# ==========================================

def get_db():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        puesto TEXT NOT NULL DEFAULT 'ATHLETE',
        points INTEGER DEFAULT 0,
        member_since TEXT DEFAULT (date('now'))
    )''')

    # Courts / Canchas
    c.execute('''CREATE TABLE IF NOT EXISTS courts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        price REAL NOT NULL,
        points_multiplier REAL DEFAULT 1.0,
        available INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Operational'
    )''')

    # Reservations / Bookings
    c.execute('''CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        court_id INTEGER NOT NULL,
        fecha_hora TEXT NOT NULL,
        estado TEXT DEFAULT 'confirmed',
        paid INTEGER DEFAULT 1,
        points_earned INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (court_id) REFERENCES courts(id)
    )''')

    # Rewards / Premios
    c.execute('''CREATE TABLE IF NOT EXISTS rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        cost_points INTEGER NOT NULL,
        stock INTEGER DEFAULT 10,
        category TEXT DEFAULT 'gear',
        image_url TEXT
    )''')

    # Redemptions
    c.execute('''CREATE TABLE IF NOT EXISTS redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        reward_id INTEGER NOT NULL,
        redeemed_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (reward_id) REFERENCES rewards(id)
    )''')

    # Seed admins
    admins = [
        ('Valentino', 'valentino@example.com', 'ValentinoPass', 'ADM'),
        ('Mateo', 'mateo@example.com', 'MateoPass', 'ADM'),
        ('Noelia', 'noelia@example.com', 'NoeliaPass', 'ADM'),
        ('Maximo', 'maximo@example.com', 'MaximoPass', 'ADM'),
    ]
    for a in admins:
        c.execute('INSERT OR IGNORE INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,0)', a)

    # Seed courts
    courts = [
        ('Soccer Pitch A', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational'),
        ('Soccer Pitch B', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational'),
        ('Tennis Court 1', 'Tennis Court', 32.0, 1.2, 0, 'Maintenance'),
        ('Tennis Court 2', 'Tennis Court', 32.0, 1.2, 1, 'Operational'),
        ('Paddle Arena 1', 'Paddle Arena', 38.0, 1.3, 1, 'Operational'),
    ]
    for ct in courts:
        c.execute('INSERT OR IGNORE INTO courts (name, type, price, points_multiplier, available, status) VALUES (?,?,?,?,?,?)', ct)

    # Seed rewards
    rewards_data = [
        ('RESERMAX Kinetic Ball v2', 'Professional grade thermal-bonded match ball.', 4500, 8, 'gear', ''),
        ('Electrolyte Power Plus', 'Premium hydration pack for high-intensity training.', 850, 20, 'nutrition', ''),
        ('Prime Time Court Access', 'Unlock 2 hours of peak-time booking on any facility.', 6000, 5, 'access', ''),
        ('RESERMAX Training Jersey', 'Official training kit with performance fabric.', 2000, 15, 'apparel', ''),
        ('Coaching Session (1hr)', 'One hour private session with certified coach.', 3500, 3, 'training', ''),
    ]
    for r in rewards_data:
        c.execute('INSERT OR IGNORE INTO rewards (name, description, cost_points, stock, category, image_url) VALUES (?,?,?,?,?,?)', r)

    # Seed a demo athlete
    c.execute('INSERT OR IGNORE INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,?)',
              ('Marcus Sterling', 'marcus@athlete.com', 'Marcus123', 'ATHLETE', 2450))

    conn.commit()
    conn.close()
    print("Database initialized.")

init_db()

# ==========================================
# AUTH HELPERS
# ==========================================

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone()
        conn.close()
        if not user or user['puesto'] != 'ADM':
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated

# ==========================================
# PAGE ROUTES
# ==========================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '').strip()
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        conn.close()
        if user and user['password'] == password:
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['puesto'] = user['puesto']
            if user['puesto'] == 'ADM':
                return redirect(url_for('admin'))
            return redirect(url_for('index'))
        error = 'Incorrect password.' if user else 'Email not registered.'
        return render_template('login.html', error=error)
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '').strip()
        try:
            conn = get_db()
            conn.execute('INSERT INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,0)',
                         (username, email, password, 'ATHLETE'))
            conn.commit()
            conn.close()
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            return render_template('login.html', error='Email already registered.', show_register=True)
    return render_template('login.html', show_register=True)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/perfil')
@login_required
def perfil():
    return render_template('perfil.html')

@app.route('/premios')
@login_required
def premios():
    return render_template('premios.html')

@app.route('/admin')
@admin_required
def admin():
    return render_template('admin.html')

# ==========================================
# API ROUTES
# ==========================================

@app.route('/api/me')
@login_required
def api_me():
    conn = get_db()
    user = conn.execute('SELECT id, username, email, points, puesto, member_since FROM users WHERE id=?',
                        (session['user_id'],)).fetchone()
    conn.close()
    if not user:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(user))

@app.route('/api/courts')
def api_courts():
    court_type = request.args.get('type')
    conn = get_db()
    if court_type:
        courts = conn.execute('SELECT * FROM courts WHERE type=? AND available=1', (court_type,)).fetchall()
    else:
        courts = conn.execute('SELECT * FROM courts WHERE available=1').fetchall()
    conn.close()
    return jsonify([dict(c) for c in courts])

@app.route('/api/courts/all')
@admin_required
def api_courts_all():
    conn = get_db()
    courts = conn.execute('SELECT * FROM courts').fetchall()
    conn.close()
    return jsonify([dict(c) for c in courts])

@app.route('/api/reservations')
@login_required
def api_reservations():
    conn = get_db()
    rows = conn.execute('''
        SELECT r.*, c.name as court_name, c.type as court_type, c.price
        FROM reservations r
        JOIN courts c ON r.court_id = c.id
        WHERE r.user_id=?
        ORDER BY r.fecha_hora DESC
    ''', (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/reservations/all')
@admin_required
def api_reservations_all():
    conn = get_db()
    rows = conn.execute('''
        SELECT r.*, u.username, u.email, c.name as court_name, c.price
        FROM reservations r
        JOIN users u ON r.user_id = u.id
        JOIN courts c ON r.court_id = c.id
        ORDER BY r.created_at DESC
        LIMIT 50
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/reserve', methods=['POST'])
@login_required
def api_reserve():
    data = request.json
    court_id = data.get('courtId')
    fecha_str = data.get('fechaHora')
    if not court_id or not fecha_str:
        return jsonify({'success': False, 'error': 'Missing fields'}), 400

    conn = get_db()
    court = conn.execute('SELECT * FROM courts WHERE id=? AND available=1', (court_id,)).fetchone()
    if not court:
        conn.close()
        return jsonify({'success': False, 'error': 'Court not available'}), 400

    # Check for conflicts
    conflict = conn.execute('''SELECT id FROM reservations WHERE court_id=? AND fecha_hora=? AND estado="confirmed"''',
                            (court_id, fecha_str)).fetchone()
    if conflict:
        conn.close()
        return jsonify({'success': False, 'error': 'Time slot already booked'}), 409

    # Calculate points with off-peak multiplier
    try:
        dt = datetime.fromisoformat(fecha_str)
    except ValueError:
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid date format'}), 400

    hour = dt.hour
    multiplier = court['points_multiplier']
    if (8 <= hour < 11) or (13 <= hour < 16) or hour >= 22:
        multiplier *= 2.5

    points_earned = int(court['price'] * multiplier)

    conn.execute('INSERT INTO reservations (user_id, court_id, fecha_hora, estado, paid, points_earned) VALUES (?,?,?,?,?,?)',
                 (session['user_id'], court_id, fecha_str, 'confirmed', 1, points_earned))
    conn.execute('UPDATE users SET points = points + ? WHERE id=?', (points_earned, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'points_earned': points_earned})

@app.route('/api/cancel/<int:res_id>', methods=['POST'])
@login_required
def api_cancel(res_id):
    conn = get_db()
    res = conn.execute('SELECT * FROM reservations WHERE id=? AND user_id=?',
                       (res_id, session['user_id'])).fetchone()
    if not res:
        conn.close()
        return jsonify({'success': False, 'error': 'Not found'}), 404
    try:
        dt = datetime.fromisoformat(res['fecha_hora'])
    except Exception:
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid date'}), 400
    if dt - datetime.now() < timedelta(hours=24):
        conn.close()
        return jsonify({'success': False, 'error': 'Cannot cancel with less than 24h notice'}), 400

    conn.execute('UPDATE reservations SET estado="cancelled" WHERE id=?', (res_id,))
    conn.execute('UPDATE users SET points = MAX(0, points - ?) WHERE id=?',
                 (res['points_earned'], session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/rewards')
@login_required
def api_rewards():
    conn = get_db()
    rewards = conn.execute('SELECT * FROM rewards ORDER BY cost_points ASC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rewards])

@app.route('/api/redeem/<int:reward_id>', methods=['POST'])
@login_required
def api_redeem(reward_id):
    conn = get_db()
    reward = conn.execute('SELECT * FROM rewards WHERE id=? AND stock>0', (reward_id,)).fetchone()
    user = conn.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone()
    if not reward or not user:
        conn.close()
        return jsonify({'success': False, 'error': 'Not found'}), 404
    if user['points'] < reward['cost_points']:
        conn.close()
        return jsonify({'success': False, 'error': 'Insufficient points'}), 400
    conn.execute('UPDATE users SET points = points - ? WHERE id=?', (reward['cost_points'], session['user_id']))
    conn.execute('UPDATE rewards SET stock = stock - 1 WHERE id=?', (reward_id,))
    conn.execute('INSERT INTO redemptions (user_id, reward_id) VALUES (?,?)', (session['user_id'], reward_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/stats')
@admin_required
def api_admin_stats():
    conn = get_db()
    total_revenue = conn.execute("SELECT SUM(c.price) FROM reservations r JOIN courts c ON r.court_id=c.id WHERE r.estado='confirmed'").fetchone()[0] or 0
    active_bookings = conn.execute("SELECT COUNT(*) FROM reservations WHERE estado='confirmed'").fetchone()[0]
    total_users = conn.execute("SELECT COUNT(*) FROM users WHERE puesto='ATHLETE'").fetchone()[0]
    today = datetime.now().date().isoformat()
    new_today = conn.execute("SELECT COUNT(*) FROM users WHERE member_since=?", (today,)).fetchone()[0]
    conn.close()
    return jsonify({
        'total_revenue': round(float(total_revenue), 2),
        'active_bookings': active_bookings,
        'total_users': total_users,
        'new_today': new_today
    })

@app.route('/api/admin/court', methods=['POST'])
@admin_required
def api_admin_add_court():
    data = request.json
    conn = get_db()
    conn.execute('INSERT INTO courts (name, type, price, points_multiplier, available, status) VALUES (?,?,?,?,?,?)',
                 (data['name'], data['type'], data['price'], data.get('multiplier', 1.0), 1, 'Operational'))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/court/<int:court_id>/toggle', methods=['POST'])
@admin_required
def api_admin_toggle_court(court_id):
    conn = get_db()
    court = conn.execute('SELECT * FROM courts WHERE id=?', (court_id,)).fetchone()
    if not court:
        conn.close()
        return jsonify({'success': False}), 404
    new_status = 0 if court['available'] else 1
    new_label = 'Operational' if new_status else 'Maintenance'
    conn.execute('UPDATE courts SET available=?, status=? WHERE id=?', (new_status, new_label, court_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
