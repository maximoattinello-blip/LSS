import os
import sqlite3
import uuid
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

def add_column_if_missing(cursor, table, column, col_type):
	"""Agrega una columna a una tabla existente si no existe."""
	cursor.execute(f"PRAGMA table_info({table})")
	cols = [row[1] for row in cursor.fetchall()]
	if column not in cols:
		cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
		print(f"  Migración: columna '{column}' agregada a '{table}'")

def migrate_db():
	"""Agrega columnas nuevas a tablas existentes sin borrar datos."""
	conn = get_db()
	c = conn.cursor()

	# rewards: columnas nuevas para horas gratis
	add_column_if_missing(c, 'rewards', 'is_free_hours', 'INTEGER DEFAULT 0')
	add_column_if_missing(c, 'rewards', 'free_hours',    'INTEGER DEFAULT 0')

	# reservations: columna para reservas con horas gratis
	add_column_if_missing(c, 'reservations', 'is_free_hours', 'INTEGER DEFAULT 0')

	# redemptions: token único y estado de uso
	add_column_if_missing(c, 'redemptions', 'token', 'TEXT')
	add_column_if_missing(c, 'redemptions', 'used',  'INTEGER DEFAULT 0')

	conn.commit()
	conn.close()
	print("Migración completada.")

def init_db():
	conn = get_db()
	c = conn.cursor()

	c.execute('''CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		puesto TEXT NOT NULL DEFAULT 'ATHLETE',
		points INTEGER DEFAULT 0,
		member_since TEXT DEFAULT (date('now'))
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS courts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		type TEXT NOT NULL,
		price REAL NOT NULL,
		points_multiplier REAL DEFAULT 1.0,
		available INTEGER DEFAULT 1,
		status TEXT DEFAULT 'Operational'
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS reservations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		court_id INTEGER NOT NULL,
		start_datetime TEXT NOT NULL,
		end_datetime TEXT NOT NULL,
		duration_hours INTEGER NOT NULL,
		estado TEXT DEFAULT 'confirmed',
		paid INTEGER DEFAULT 1,
		points_earned INTEGER DEFAULT 0,
		is_free_hours INTEGER DEFAULT 0,
		created_at TEXT DEFAULT (datetime('now')),
		FOREIGN KEY (user_id) REFERENCES users(id),
		FOREIGN KEY (court_id) REFERENCES courts(id)
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS rewards (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		description TEXT,
		cost_points INTEGER NOT NULL,
		stock INTEGER DEFAULT 10,
		category TEXT DEFAULT 'gear',
		image_url TEXT,
		is_free_hours INTEGER DEFAULT 0,
		free_hours INTEGER DEFAULT 0
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS redemptions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		reward_id INTEGER NOT NULL,
		redeemed_at TEXT DEFAULT (datetime('now')),
		token TEXT,
		used INTEGER DEFAULT 0,
		FOREIGN KEY (user_id) REFERENCES users(id),
		FOREIGN KEY (reward_id) REFERENCES rewards(id)
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS disabled_days (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT NOT NULL,
		recurring INTEGER DEFAULT 0,
		reason TEXT,
		created_by INTEGER,
		created_at TEXT DEFAULT (datetime('now'))
	)''')

	# Seed admins
	admins = [
		('Valentino', 'valentino@example.com', 'ValentinoPass', 'ADM'),
		('Mateo',     'mateo@example.com',     'MateoPass',     'ADM'),
		('Noelia',    'noelia@example.com',    'NoeliaPass',    'ADM'),
		('Maximo',    'maximo@example.com',    'MaximoPass',    'ADM'),
	]
	for a in admins:
		c.execute('INSERT OR IGNORE INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,0)', a)

	# Seed courts
	courts_seed = [
		('Soccer Pitch A', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational'),
		('Soccer Pitch B', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational'),
		('Tennis Court 1', 'Tennis Court', 32.0, 1.2, 0, 'Maintenance'),
		('Tennis Court 2', 'Tennis Court', 32.0, 1.2, 1, 'Operational'),
		('Paddle Arena 1', 'Paddle Arena', 38.0, 1.3, 1, 'Operational'),
	]
	for ct in courts_seed:
		c.execute('INSERT OR IGNORE INTO courts (name, type, price, points_multiplier, available, status) VALUES (?,?,?,?,?,?)', ct)

	# Seed demo athlete
	c.execute('INSERT OR IGNORE INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,?)',
			  ('Marcus Sterling', 'marcus@athlete.com', 'Marcus123', 'ATHLETE', 2450))

	conn.commit()
	conn.close()
	print("Base de datos inicializada.")

def seed_rewards():
	"""Inserta los premios base solo si la tabla está vacía."""
	conn = get_db()
	c = conn.cursor()
	count = c.execute('SELECT COUNT(*) FROM rewards').fetchone()[0]
	if count == 0:
		rewards_data = [
			('Pelota Cinética RESERMAX v2',    'Pelota de partido de grado profesional con unión térmica.',              4500, 8,  'gear',      '', 0, 0),
			('Electrolitos Power Plus',         'Paquete de hidratación premium para entrenamientos de alta intensidad.', 850,  20, 'nutrition', '', 0, 0),
			('1 Hora de Reserva Gratis',        'Canjeá 1 hora gratis en cualquier cancha disponible.',                  1500, 50, 'access',    '', 1, 1),
			('2 Horas de Reserva Gratis',       'Canjeá 2 horas gratis en cualquier cancha disponible.',                 2500, 30, 'access',    '', 1, 2),
			('3 Horas de Reserva Gratis',       'Canjeá 3 horas gratis en cualquier cancha disponible.',                 3500, 20, 'access',    '', 1, 3),
			('Camiseta de Entrenamiento',       'Equipo de entrenamiento oficial con tela de alto rendimiento.',         2000, 15, 'apparel',   '', 0, 0),
			('Sesión de Entrenamiento (1hr)',   'Sesión privada de una hora con entrenador certificado.',                3500, 3,  'training',  '', 0, 0),
		]
		for r in rewards_data:
			c.execute('INSERT INTO rewards (name, description, cost_points, stock, category, image_url, is_free_hours, free_hours) VALUES (?,?,?,?,?,?,?,?)', r)
		conn.commit()
		print("Premios iniciales insertados.")
	else:
		# Actualizar is_free_hours/free_hours en premios existentes que sean de acceso/horas
		# (por si la DB ya tenía datos pero sin esas columnas)
		c.execute("UPDATE rewards SET is_free_hours=1, free_hours=1 WHERE name LIKE '%1 Hora%Gratis%' AND is_free_hours=0")
		c.execute("UPDATE rewards SET is_free_hours=1, free_hours=2 WHERE name LIKE '%2 Hora%Gratis%' AND is_free_hours=0")
		c.execute("UPDATE rewards SET is_free_hours=1, free_hours=3 WHERE name LIKE '%3 Hora%Gratis%' AND is_free_hours=0")
		conn.commit()
	conn.close()

# Ejecutar en orden: primero crear tablas, luego migrar columnas, luego seed
init_db()
migrate_db()
seed_rewards()

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
		email    = request.form.get('email',    '').strip()
		password = request.form.get('password', '').strip()
		conn = get_db()
		user = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
		conn.close()
		if user and user['password'] == password:
			session['user_id']  = user['id']
			session['username'] = user['username']
			session['puesto']   = user['puesto']
			if user['puesto'] == 'ADM':
				return redirect(url_for('admin'))
			return redirect(url_for('index'))
		error = 'Contraseña incorrecta.' if user else 'Email no registrado.'
		return render_template('login.html', error=error)
	return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
	if request.method == 'POST':
		username = request.form.get('username', '').strip()
		email    = request.form.get('email',    '').strip()
		password = request.form.get('password', '').strip()
		try:
			conn = get_db()
			conn.execute('INSERT INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,0)',
						 (username, email, password, 'ATHLETE'))
			conn.commit()
			conn.close()
			return redirect(url_for('login'))
		except sqlite3.IntegrityError:
			return render_template('login.html', error='Email ya registrado.', show_register=True)
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
	user = conn.execute(
		'SELECT id, username, email, points, puesto, member_since FROM users WHERE id=?',
		(session['user_id'],)
	).fetchone()
	conn.close()
	if not user:
		return jsonify({'error': 'Not found'}), 404
	return jsonify(dict(user))

@app.route('/api/courts')
def api_courts():
	court_type = request.args.get('type', '').strip()
	name_q     = request.args.get('q',    '').strip()
	conn = get_db()
	query  = 'SELECT * FROM courts WHERE available=1'
	params = []
	if court_type:
		query += ' AND type=?'
		params.append(court_type)
	if name_q:
		query += ' AND name LIKE ?'
		params.append(f'%{name_q}%')
	courts = conn.execute(query, params).fetchall()
	conn.close()
	return jsonify([dict(c) for c in courts])

@app.route('/api/courts/all')
@admin_required
def api_courts_all():
	conn = get_db()
	courts = conn.execute('SELECT * FROM courts').fetchall()
	conn.close()
	return jsonify([dict(c) for c in courts])

@app.route('/api/courts/<int:court_id>/slots')
@login_required
def api_court_slots(court_id):
	"""Devuelve los bloques horarios ocupados de una cancha para una fecha."""
	date_str = request.args.get('date', '').strip()
	if not date_str:
		return jsonify({'error': 'Missing date'}), 400
	conn = get_db()
	rows = conn.execute('''
		SELECT start_datetime, end_datetime FROM reservations
		WHERE court_id=? AND estado='confirmed'
		  AND date(start_datetime)=?
	''', (court_id, date_str)).fetchall()
	conn.close()
	booked = []
	for r in rows:
		try:
			start = datetime.fromisoformat(r['start_datetime'])
			end   = datetime.fromisoformat(r['end_datetime'])
			booked.append({'start': start.hour, 'end': end.hour})
		except Exception:
			pass
	return jsonify(booked)

@app.route('/api/reservations')
@login_required
def api_reservations():
	conn = get_db()
	rows = conn.execute('''
		SELECT r.*, c.name as court_name, c.type as court_type, c.price
		FROM reservations r
		JOIN courts c ON r.court_id = c.id
		WHERE r.user_id=?
		ORDER BY r.start_datetime DESC
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

@app.route('/api/disabled-days')
def api_disabled_days():
	conn = get_db()
	rows = conn.execute('SELECT * FROM disabled_days ORDER BY date ASC').fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/admin/disabled-days', methods=['POST'])
@admin_required
def api_add_disabled_day():
	data      = request.json or {}
	date_val  = data.get('date', '').strip()
	recurring = 1 if data.get('recurring') else 0
	reason    = data.get('reason', '').strip()
	if not date_val:
		return jsonify({'success': False, 'error': 'Falta la fecha'}), 400
	conn = get_db()
	existing = conn.execute(
		'SELECT id FROM disabled_days WHERE date=? AND recurring=?',
		(date_val, recurring)
	).fetchone()
	if existing:
		conn.close()
		return jsonify({'success': False, 'error': 'Este día ya está inhabilitado'}), 409
	conn.execute(
		'INSERT INTO disabled_days (date, recurring, reason, created_by) VALUES (?,?,?,?)',
		(date_val, recurring, reason, session['user_id'])
	)
	conn.commit()
	conn.close()
	return jsonify({'success': True})

@app.route('/api/admin/disabled-days/<int:day_id>', methods=['DELETE'])
@admin_required
def api_delete_disabled_day(day_id):
	conn = get_db()
	conn.execute('DELETE FROM disabled_days WHERE id=?', (day_id,))
	conn.commit()
	conn.close()
	return jsonify({'success': True})

@app.route('/api/reserve', methods=['POST'])
@login_required
def api_reserve():
	data              = request.json or {}
	court_id          = data.get('courtId')
	start_datetime    = data.get('startDateTime')
	duration_hours    = data.get('durationHours')
	is_free           = bool(data.get('isFreeHours', False))
	redemption_token  = data.get('redemptionToken', None)

	if not court_id or not start_datetime or not duration_hours:
		return jsonify({'success': False, 'error': 'Faltan campos'}), 400

	try:
		court_id = int(court_id)
	except (TypeError, ValueError):
		return jsonify({'success': False, 'error': 'ID de cancha inválido'}), 400

	conn = get_db()
	court = conn.execute('SELECT * FROM courts WHERE id=? AND available=1', (court_id,)).fetchone()
	if not court:
		conn.close()
		return jsonify({'success': False, 'error': 'Cancha no disponible'}), 400

	try:
		duration_hours = int(float(duration_hours))
		if duration_hours not in [1, 2, 3]:
			raise ValueError
	except (TypeError, ValueError):
		conn.close()
		return jsonify({'success': False, 'error': 'Duración inválida. Debe ser 1, 2 o 3 horas'}), 400

	try:
		normalized = str(start_datetime).strip().replace('Z', '+00:00').replace(' ', 'T')
		start_dt   = datetime.fromisoformat(normalized)
	except (TypeError, ValueError):
		conn.close()
		return jsonify({'success': False, 'error': 'Formato de fecha inválido'}), 400

	# Verificar día inhabilitado
	date_str  = start_dt.date().isoformat()
	month_day = start_dt.strftime('%m-%d')
	disabled  = conn.execute(
		"SELECT id FROM disabled_days WHERE (date=? AND recurring=0) OR (substr(date,6)=? AND recurring=1)",
		(date_str, month_day)
	).fetchone()
	if disabled:
		conn.close()
		return jsonify({'success': False, 'error': 'Este día está inhabilitado para reservas'}), 400

	end_dt       = start_dt + timedelta(hours=duration_hours)
	end_datetime = end_dt.isoformat()

	# Verificar conflicto de horario
	conflict = conn.execute('''
		SELECT id FROM reservations
		WHERE court_id=? AND estado='confirmed'
		  AND ((start_datetime < ? AND end_datetime > ?)
			   OR  (start_datetime >= ? AND start_datetime < ?))
	''', (court_id, end_datetime, start_datetime, start_datetime, end_datetime)).fetchone()
	if conflict:
		conn.close()
		return jsonify({'success': False, 'error': 'Horario ya reservado'}), 409

	# Lógica de puntos / horas gratis
	if is_free and redemption_token:
		redemption = conn.execute('''
			SELECT rd.*, rw.is_free_hours, rw.free_hours
			FROM redemptions rd
			JOIN rewards rw ON rd.reward_id = rw.id
			WHERE rd.token=? AND rd.user_id=? AND rd.used=0
		''', (redemption_token, session['user_id'])).fetchone()

		if not redemption:
			conn.close()
			return jsonify({'success': False, 'error': 'Token inválido o ya utilizado'}), 400
		if not redemption['is_free_hours']:
			conn.close()
			return jsonify({'success': False, 'error': 'Este token no es de horas gratis'}), 400
		if redemption['free_hours'] < duration_hours:
			conn.close()
			return jsonify({'success': False, 'error': f"Token cubre {redemption['free_hours']}h, pediste {duration_hours}h"}), 400

		conn.execute('UPDATE redemptions SET used=1 WHERE token=?', (redemption_token,))
		points_earned = 0
		paid          = 0
	else:
		hour       = start_dt.hour
		multiplier = court['points_multiplier']
		if (8 <= hour < 11) or (13 <= hour < 16) or hour >= 22:
			multiplier *= 2.5
		points_earned = int(court['price'] * multiplier * duration_hours)
		paid          = 1
		conn.execute('UPDATE users SET points = points + ? WHERE id=?', (points_earned, session['user_id']))

	conn.execute('''
		INSERT INTO reservations
			(user_id, court_id, start_datetime, end_datetime, duration_hours, estado, paid, points_earned, is_free_hours)
		VALUES (?,?,?,?,?,?,?,?,?)
	''', (session['user_id'], court_id, start_datetime, end_datetime, duration_hours,
		  'confirmed', paid, points_earned, 1 if is_free else 0))
	conn.commit()
	conn.close()
	return jsonify({'success': True, 'points_earned': points_earned})

@app.route('/api/cancel/<int:res_id>', methods=['POST'])
@login_required
def api_cancel(res_id):
	conn = get_db()
	res = conn.execute(
		'SELECT * FROM reservations WHERE id=? AND user_id=?',
		(res_id, session['user_id'])
	).fetchone()
	if not res:
		conn.close()
		return jsonify({'success': False, 'error': 'No encontrado'}), 404
	try:
		dt = datetime.fromisoformat(res['start_datetime'])
	except Exception:
		conn.close()
		return jsonify({'success': False, 'error': 'Fecha inválida'}), 400
	if dt - datetime.now() < timedelta(hours=24):
		conn.close()
		return jsonify({'success': False, 'error': 'No se puede cancelar con menos de 24h de anticipación'}), 400

	conn.execute('UPDATE reservations SET estado="cancelled" WHERE id=?', (res_id,))
	if not res['is_free_hours']:
		conn.execute(
			'UPDATE users SET points = MAX(0, points - ?) WHERE id=?',
			(res['points_earned'], session['user_id'])
		)
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
	user   = conn.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone()
	if not reward or not user:
		conn.close()
		return jsonify({'success': False, 'error': 'No encontrado'}), 404
	if user['points'] < reward['cost_points']:
		conn.close()
		return jsonify({'success': False, 'error': 'Puntos insuficientes'}), 400

	token = str(uuid.uuid4())
	conn.execute('UPDATE users SET points = points - ? WHERE id=?',
				 (reward['cost_points'], session['user_id']))
	conn.execute('UPDATE rewards SET stock = stock - 1 WHERE id=?', (reward_id,))
	conn.execute('INSERT INTO redemptions (user_id, reward_id, token, used) VALUES (?,?,?,0)',
				 (session['user_id'], reward_id, token))
	conn.commit()

	is_free  = bool(reward['is_free_hours'])
	fr_hours = int(reward['free_hours']) if is_free else 0
	conn.close()
	return jsonify({
		'success':        True,
		'token':          token,
		'is_free_hours':  is_free,
		'free_hours':     fr_hours
	})

@app.route('/api/my-redemptions')
@login_required
def api_my_redemptions():
	conn = get_db()
	rows = conn.execute('''
		SELECT rd.*, rw.name as reward_name, rw.category, rw.is_free_hours, rw.free_hours
		FROM redemptions rd
		JOIN rewards rw ON rd.reward_id = rw.id
		WHERE rd.user_id=?
		ORDER BY rd.redeemed_at DESC
	''', (session['user_id'],)).fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/admin/stats')
@admin_required
def api_admin_stats():
	conn = get_db()
	total_revenue  = conn.execute(
		"SELECT SUM(c.price * r.duration_hours) FROM reservations r JOIN courts c ON r.court_id=c.id WHERE r.estado='confirmed' AND r.is_free_hours=0"
	).fetchone()[0] or 0
	active_bookings = conn.execute(
		"SELECT COUNT(*) FROM reservations WHERE estado='confirmed'"
	).fetchone()[0]
	total_users = conn.execute(
		"SELECT COUNT(*) FROM users WHERE puesto='ATHLETE'"
	).fetchone()[0]
	today     = datetime.now().date().isoformat()
	new_today = conn.execute(
		"SELECT COUNT(*) FROM users WHERE member_since=?", (today,)
	).fetchone()[0]
	conn.close()
	return jsonify({
		'total_revenue':  round(float(total_revenue), 2),
		'active_bookings': active_bookings,
		'total_users':    total_users,
		'new_today':      new_today
	})

@app.route('/api/admin/court', methods=['POST'])
@admin_required
def api_admin_add_court():
	data = request.json or {}
	conn = get_db()
	conn.execute(
		'INSERT INTO courts (name, type, price, points_multiplier, available, status) VALUES (?,?,?,?,?,?)',
		(data['name'], data['type'], float(data['price']), float(data.get('multiplier', 1.0)), 1, 'Operational')
	)
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
	new_avail  = 0 if court['available'] else 1
	new_status = 'Operational' if new_avail else 'Maintenance'
	conn.execute('UPDATE courts SET available=?, status=? WHERE id=?', (new_avail, new_status, court_id))
	conn.commit()
	conn.close()
	return jsonify({'success': True})

if __name__ == '__main__':
	app.run(host='127.0.0.1', port=5000, debug=True)