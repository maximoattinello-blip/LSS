import os
import random
import smtplib
import sqlite3
import threading
import time
import uuid
from email.message import EmailMessage
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = 'resermax_dev_secret_key_replace_in_production'

basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'resermax.db')

COURT_IMAGE_KEYS = {
	'cancha_futbol_5',
	'cancha_futbol_7',
	'cancha_futbol_11',
	'cancha_padel_indoor',
	'cancha_padel_outdoor',
	'cancha_tenis_arcilla',
	'cancha_tenis_cesped',
	'cancha_tenis_cemento',
}

COURT_IMAGE_URLS = {
	key: f'/static/images/courts/{key}.jpg'
	for key in COURT_IMAGE_KEYS
}

def infer_court_image_key(name, court_type):
	"""Infer the most specific image key available for a court."""
	text = f'{name or ""} {court_type or ""}'.lower()
	if 'futbol' in text or 'football' in text or 'soccer' in text:
		if '11' in text:
			return 'cancha_futbol_11'
		if '7' in text:
			return 'cancha_futbol_7'
		return 'cancha_futbol_5'
	if 'padel' in text or 'paddle' in text:
		if 'outdoor' in text or 'exterior' in text or 'aire libre' in text:
			return 'cancha_padel_outdoor'
		return 'cancha_padel_indoor'
	if 'tenis' in text or 'tennis' in text:
		if 'arcilla' in text or 'clay' in text:
			return 'cancha_tenis_arcilla'
		if 'cesped' in text or 'grass' in text:
			return 'cancha_tenis_cesped'
		return 'cancha_tenis_cemento'
	return ''

def court_to_dict(row):
	court = dict(row)
	image_key = court.get('image_key') or infer_court_image_key(court.get('name'), court.get('type'))
	court['image_key'] = image_key
	court['image_url'] = COURT_IMAGE_URLS.get(image_key, '')
	return court

def verify_password(stored_password, submitted_password):
	if not stored_password:
		return False
	if stored_password.startswith(('pbkdf2:', 'scrypt:')):
		return check_password_hash(stored_password, submitted_password)
	return stored_password == submitted_password

def send_email_message(to_email, subject, body):
	smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com').strip()
	smtp_port = int(os.environ.get('SMTP_PORT', '587'))
	smtp_user = os.environ.get('SMTP_USER', 'lssresermax@gmail.com').strip()
	smtp_password = os.environ.get('SMTP_PASSWORD', 'ehqjcapivzygcink').strip()
	email_from = os.environ.get('EMAIL_FROM', smtp_user or 'lssresermax@gmail.com').strip()
	if not smtp_host or not smtp_user or not smtp_password:
		return False

	msg = EmailMessage()
	msg['Subject'] = subject
	msg['From'] = email_from
	msg['To'] = to_email
	msg.set_content(body)

	try:
		with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
			if os.environ.get('SMTP_USE_TLS', '1') != '0':
				smtp.starttls()
			smtp.login(smtp_user, smtp_password)
			smtp.send_message(msg)
		return True
	except Exception as e:
		print(f'[EMAIL ERROR] No se pudo enviar el correo a {to_email}: {e}')
		return False


def send_recovery_code_email(to_email, code):
	body = (
		f'Tu codigo de recuperacion RESERMAX es: {code}\n\n'
		'Este codigo vence en 15 minutos. Si no solicitaste este cambio, ignora este correo.'
	)
	return send_email_message(to_email, 'Codigo de recuperacion RESERMAX', body)


def send_reservation_reminder_email(to_email, user_name, court_name, start_datetime, reminder_hours):
	try:
		start_dt = datetime.fromisoformat(start_datetime)
	except Exception:
		start_dt = datetime.now()
	start_label = start_dt.strftime('%d/%m/%Y a las %H:%M')
	body = (
		f'Hola {user_name},\n\n'
		f'Te recordamos que tu reserva en {court_name} está programada para el {start_label}.\n'
		f'Faltan {reminder_hours} horas para que comience tu turno.\n\n'
		'Gracias por reservar con RESERMAX.'
	)
	return send_email_message(
		to_email,
		f'RESERMAX: recordatorio de reserva en {reminder_hours} horas',
		body
	)

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

	# courts: clave estable para imagen publica
	add_column_if_missing(c, 'courts', 'image_key', 'TEXT')
	add_column_if_missing(c, 'point_multiplier_periods', 'recurring', 'INTEGER DEFAULT 0')

	# reservations: columna para reservas con horas gratis
	add_column_if_missing(c, 'reservations', 'is_free_hours', 'INTEGER DEFAULT 0')

	# redemptions: token único y estado de uso
	add_column_if_missing(c, 'redemptions', 'token', 'TEXT')
	add_column_if_missing(c, 'redemptions', 'used',  'INTEGER DEFAULT 0')

	# users: estado de cuenta para gestión administrativa
	add_column_if_missing(c, 'users', 'status', "TEXT DEFAULT 'active'")

	# reservations: registro de reembolsos parciales y fecha de cancelación
	add_column_if_missing(c, 'reservations', 'refunded_points', 'INTEGER DEFAULT 0')
	add_column_if_missing(c, 'reservations', 'cancelled_at', 'TEXT')
	add_column_if_missing(c, 'reservations', 'reminder_24_sent', 'INTEGER DEFAULT 0')
	add_column_if_missing(c, 'reservations', 'reminder_12_sent', 'INTEGER DEFAULT 0')

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
		status TEXT DEFAULT 'Operational',
		image_key TEXT
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
		reminder_24_sent INTEGER DEFAULT 0,
		reminder_12_sent INTEGER DEFAULT 0,
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

	c.execute('''CREATE TABLE IF NOT EXISTS password_reset_codes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		code_hash TEXT NOT NULL,
		expires_at TEXT NOT NULL,
		used INTEGER DEFAULT 0,
		attempts INTEGER DEFAULT 0,
		created_at TEXT DEFAULT (datetime('now')),
		FOREIGN KEY (user_id) REFERENCES users(id)
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS disabled_days (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		date TEXT NOT NULL,
		recurring INTEGER DEFAULT 0,
		reason TEXT,
		created_by INTEGER,
		created_at TEXT DEFAULT (datetime('now'))
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS point_multiplier_periods (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		start_date TEXT NOT NULL,
		end_date TEXT NOT NULL,
		multiplier REAL NOT NULL DEFAULT 2.0,
		reason TEXT,
		active INTEGER DEFAULT 1,
		recurring INTEGER DEFAULT 0,
		created_by INTEGER,
		created_at TEXT DEFAULT (datetime('now'))
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS reviews (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		court_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		reservation_id INTEGER NOT NULL UNIQUE,
		rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
		comment TEXT,
		created_at TEXT DEFAULT (datetime('now')),
		FOREIGN KEY (court_id) REFERENCES courts(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS point_adjustments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		points INTEGER NOT NULL,
		reason TEXT,
		admin_id INTEGER,
		created_at TEXT DEFAULT (datetime('now')),
		FOREIGN KEY (user_id) REFERENCES users(id),
		FOREIGN KEY (admin_id) REFERENCES users(id)
	)''')

	c.execute('''CREATE TABLE IF NOT EXISTS cancellation_policy (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		hours_before REAL NOT NULL,
		refund_percent REAL NOT NULL,
		label TEXT,
		penalty_points INTEGER DEFAULT 0,
		is_noshow INTEGER DEFAULT 0,
		sort_order INTEGER DEFAULT 0,
		active INTEGER DEFAULT 1
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

	# Seed demo athlete
	c.execute('INSERT OR IGNORE INTO users (username, email, password, puesto, points) VALUES (?,?,?,?,?)',
			  ('Marcus Sterling', 'marcus@athlete.com', 'Marcus123', 'ATHLETE', 2450))

	conn.commit()
	conn.close()
	print("Base de datos inicializada.")

def sync_court_catalog():
	"""Keeps the demo catalog aligned with the available court images."""
	conn = get_db()
	c = conn.cursor()

	legacy_updates = [
		('Cancha Futbol 5', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational', 'cancha_futbol_5', 'Soccer Pitch A'),
		('Cancha Futbol 7', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational', 'cancha_futbol_7', 'Soccer Pitch B'),
		('Cancha Tenis Arcilla', 'Tennis Court', 32.0, 1.2, 1, 'Operational', 'cancha_tenis_arcilla', 'Tennis Court 1'),
		('Cancha Tenis Cemento', 'Tennis Court', 32.0, 1.2, 1, 'Operational', 'cancha_tenis_cemento', 'Tennis Court 2'),
		('Cancha Padel Indoor', 'Paddle Arena', 38.0, 1.3, 1, 'Operational', 'cancha_padel_indoor', 'Paddle Arena 1'),
	]
	for name, court_type, price, multiplier, available, status, image_key, legacy_name in legacy_updates:
		c.execute('''
			UPDATE courts
			SET name=?, type=?, price=?, points_multiplier=?, available=?, status=?, image_key=?
			WHERE name=?
		''', (name, court_type, price, multiplier, available, status, image_key, legacy_name))

	court_defaults = [
		('Cancha Futbol 5', 'Soccer Pitch', 45.0, 1.5, 1, 'Operational', 'cancha_futbol_5'),
		('Cancha Futbol 7', 'Soccer Pitch', 55.0, 1.6, 1, 'Operational', 'cancha_futbol_7'),
		('Cancha Futbol 11', 'Soccer Pitch', 75.0, 1.8, 1, 'Operational', 'cancha_futbol_11'),
		('Cancha Padel Indoor', 'Paddle Arena', 38.0, 1.3, 1, 'Operational', 'cancha_padel_indoor'),
		('Cancha Padel Outdoor', 'Paddle Arena', 34.0, 1.2, 1, 'Operational', 'cancha_padel_outdoor'),
		('Cancha Tenis Arcilla', 'Tennis Court', 32.0, 1.2, 1, 'Operational', 'cancha_tenis_arcilla'),
		('Cancha Tenis Cesped', 'Tennis Court', 36.0, 1.25, 1, 'Operational', 'cancha_tenis_cesped'),
		('Cancha Tenis Cemento', 'Tennis Court', 30.0, 1.15, 1, 'Operational', 'cancha_tenis_cemento'),
	]
	for court in court_defaults:
		exists = c.execute('SELECT id FROM courts WHERE image_key=?', (court[6],)).fetchone()
		if not exists:
			c.execute('''
				INSERT INTO courts (name, type, price, points_multiplier, available, status, image_key)
				VALUES (?,?,?,?,?,?,?)
			''', court)

	c.execute('SELECT id, name, type FROM courts WHERE image_key IS NULL OR image_key=""')
	for court in c.fetchall():
		image_key = infer_court_image_key(court['name'], court['type'])
		if image_key:
			c.execute('UPDATE courts SET image_key=? WHERE id=?', (image_key, court['id']))

	conn.commit()
	conn.close()

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
		c.execute("UPDATE rewards SET is_free_hours=1, free_hours=1 WHERE name LIKE '%1 Hora%Gratis%' AND is_free_hours=0")
		c.execute("UPDATE rewards SET is_free_hours=1, free_hours=2 WHERE name LIKE '%2 Hora%Gratis%' AND is_free_hours=0")
		c.execute("UPDATE rewards SET is_free_hours=1, free_hours=3 WHERE name LIKE '%3 Hora%Gratis%' AND is_free_hours=0")
		conn.commit()
	conn.close()

def seed_cancellation_policy():
	"""Inserta la política de cancelación por niveles solo si la tabla está vacía."""
	conn = get_db()
	c = conn.cursor()
	count = c.execute('SELECT COUNT(*) FROM cancellation_policy').fetchone()[0]
	if count == 0:
		defaults = [
			# (hours_before, refund_percent, label, penalty_points, is_noshow, sort_order)
			(24, 100, 'Cancelación con más de 24h de anticipación', 0, 0, 1),
			(12, 50,  'Cancelación con 12–24h de anticipación',      0, 0, 2),
			(0,  0,   'Cancelación con menos de 12h de anticipación', 0, 0, 3),
			(0,  0,   'No-show (inasistencia registrada)',           100, 1, 4),
		]
		for row in defaults:
			c.execute('''
				INSERT INTO cancellation_policy (hours_before, refund_percent, label, penalty_points, is_noshow, sort_order)
				VALUES (?,?,?,?,?,?)
			''', row)
		conn.commit()
		print("Política de cancelación inicial insertada.")
	conn.close()

def get_refund_tier(conn, hours_remaining):
	"""Devuelve el nivel de reembolso aplicable según las horas restantes."""
	rows = conn.execute('''
		SELECT * FROM cancellation_policy
		WHERE active=1 AND is_noshow=0
		ORDER BY hours_before DESC
	''').fetchall()
	tier = rows[-1] if rows else None
	for row in rows:
		if hours_remaining >= float(row['hours_before']):
			tier = row
			break
	return tier

def get_court_ratings(conn, court_id):
	row = conn.execute(
		'SELECT COUNT(*) as cnt, ROUND(AVG(rating), 2) as avg FROM reviews WHERE court_id=?',
		(court_id,)
	).fetchone()
	return {
		'rating_count': row['cnt'] or 0,
		'rating_avg': float(row['avg']) if row['avg'] is not None else 0.0,
	}

# Ejecutar en orden: primero crear tablas, luego migrar columnas, luego seed
init_db()
migrate_db()
sync_court_catalog()
seed_rewards()
seed_cancellation_policy()

REMINDER_WORKER_STARTED = False


def process_pending_reservation_reminders():
	global REMINDER_WORKER_STARTED
	while True:
		try:
			conn = get_db()
			now = datetime.now()
			rows = conn.execute('''
				SELECT r.*, u.email, u.username, c.name AS court_name
				FROM reservations r
				JOIN users u ON u.id = r.user_id
				JOIN courts c ON c.id = r.court_id
				WHERE r.estado = 'confirmed'
			''').fetchall()
			for row in rows:
				try:
					start_dt = datetime.fromisoformat(row['start_datetime'])
				except Exception:
					continue
				if start_dt <= now:
					continue
				hours_until = (start_dt - now).total_seconds() / 3600.0
				if row['reminder_24_sent'] != 1 and hours_until <= 24 and hours_until > 12:
					if send_reservation_reminder_email(row['email'], row['username'], row['court_name'], row['start_datetime'], 24):
						conn.execute('UPDATE reservations SET reminder_24_sent=1 WHERE id=?', (row['id'],))
				elif row['reminder_12_sent'] != 1 and hours_until <= 12 and hours_until > 0:
					if send_reservation_reminder_email(row['email'], row['username'], row['court_name'], row['start_datetime'], 12):
						conn.execute('UPDATE reservations SET reminder_12_sent=1 WHERE id=?', (row['id'],))
			conn.commit()
			conn.close()
		except Exception as e:
			print(f'[REMINDERS ERROR] {e}')
			time.sleep(60)


def start_reminder_worker():
	global REMINDER_WORKER_STARTED
	if REMINDER_WORKER_STARTED:
		return
	REMINDER_WORKER_STARTED = True
	thread = threading.Thread(target=process_pending_reservation_reminders, daemon=True, name='reservation-reminder-worker')
	thread.start()


start_reminder_worker()

# ==========================================
# LÓGICA DE DÍAS CON BONUS DE PUNTOS
# ==========================================
# Días de la semana con baja concurrencia → bonus de +50% de puntos
# 0=Lunes, 1=Martes, 2=Miércoles, 3=Jueves, 4=Viernes, 5=Sábado, 6=Domingo
LOW_DEMAND_DAYS = [0, 1]  # Lunes y Martes
LOW_DEMAND_BONUS = 1.5    # Multiplicador extra (+50%)
ADMIN_POINTS_MULTIPLIER = 2.0

def is_low_demand_day(dt):
	"""Devuelve True si la fecha cae en un día de baja demanda."""
	return dt.weekday() in LOW_DEMAND_DAYS

def get_active_points_multiplier(conn, date_str):
	month_day = date_str[5:]
	rows = conn.execute('''
		SELECT * FROM point_multiplier_periods
		WHERE active=1
		ORDER BY multiplier DESC, created_at DESC
	''').fetchall()
	for row in rows:
		if row['recurring']:
			start_md = row['start_date'][5:]
			end_md = row['end_date'][5:]
			in_range = start_md <= month_day <= end_md if start_md <= end_md else month_day >= start_md or month_day <= end_md
		else:
			in_range = row['start_date'] <= date_str <= row['end_date']
		if in_range:
			return float(row['multiplier'])
	return 1.0

def get_low_demand_info():
	"""Devuelve info sobre los días de baja demanda para el frontend."""
	day_names = {0: 'Lunes', 1: 'Martes', 2: 'Miércoles', 3: 'Jueves', 4: 'Viernes', 5: 'Sábado', 6: 'Domingo'}
	return {
		'days': LOW_DEMAND_DAYS,
		'day_names': [day_names[d] for d in LOW_DEMAND_DAYS],
		'bonus_multiplier': LOW_DEMAND_BONUS,
		'bonus_percent': int((LOW_DEMAND_BONUS - 1) * 100)
	}

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
		if user and verify_password(user['password'], password):
			if user['status'] == 'suspended':
				error = 'Tu cuenta está suspendida temporalmente. Contactá al administrador.'
				return render_template('login.html', error=error)
			if user['status'] == 'deactivated':
				error = 'Tu cuenta fue desactivada por un administrador.'
				return render_template('login.html', error=error)
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
						 (username, email, generate_password_hash(password), 'ATHLETE'))
			conn.commit()
			conn.close()
			return redirect(url_for('login'))
		except sqlite3.IntegrityError:
			return render_template('login.html', error='Email ya registrado.', show_register=True)
	return render_template('login.html', show_register=True)

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
	if request.method == 'POST':
		email = request.form.get('email', '').strip().lower()
		if not email:
			return render_template('login.html', show_forgot=True, error='Ingresa tu correo.')
		conn = get_db()
		user = conn.execute('SELECT id, email FROM users WHERE lower(email)=?', (email,)).fetchone()
		if user:
			code = f'{random.randint(0, 999999):06d}'
			expires_at = (datetime.now() + timedelta(minutes=15)).isoformat(timespec='seconds')
			conn.execute('UPDATE password_reset_codes SET used=1 WHERE user_id=? AND used=0', (user['id'],))
			conn.execute('''
				INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
				VALUES (?,?,?)
			''', (user['id'], generate_password_hash(code), expires_at))
			conn.commit()
			email_sent = send_recovery_code_email(user['email'], code)
			conn.close()
			if not email_sent:
				return render_template(
					'login.html',
					show_forgot=True,
					error='No se pudo enviar el correo. Configura SMTP_HOST, SMTP_USER y SMTP_PASSWORD.'
				)
		else:
			conn.close()
		session['reset_email'] = email
		return render_template(
			'login.html',
			show_verify_code=True,
			reset_email=email,
			success='Si el correo existe, enviamos un codigo de recuperacion.'
		)
	return render_template('login.html', show_forgot=True)

@app.route('/verify-reset-code', methods=['POST'])
def verify_reset_code():
	email = request.form.get('email', '').strip().lower() or session.get('reset_email', '')
	code = request.form.get('code', '').strip()
	if not email or not code:
		return render_template('login.html', show_verify_code=True, reset_email=email, error='Ingresa el codigo recibido.')

	conn = get_db()
	user = conn.execute('SELECT id FROM users WHERE lower(email)=?', (email,)).fetchone()
	reset_code = None
	if user:
		reset_code = conn.execute('''
			SELECT * FROM password_reset_codes
			WHERE user_id=? AND used=0
			ORDER BY created_at DESC
			LIMIT 1
		''', (user['id'],)).fetchone()

	valid = False
	if reset_code:
		expired = datetime.fromisoformat(reset_code['expires_at']) < datetime.now()
		locked = reset_code['attempts'] >= 5
		valid = not expired and not locked and check_password_hash(reset_code['code_hash'], code)
		if not valid:
			conn.execute('UPDATE password_reset_codes SET attempts=attempts+1 WHERE id=?', (reset_code['id'],))
			conn.commit()

	if not valid:
		conn.close()
		return render_template('login.html', show_verify_code=True, reset_email=email, error='Codigo invalido o vencido.')

	session['password_reset_user_id'] = user['id']
	session['password_reset_code_id'] = reset_code['id']
	conn.close()
	return render_template('login.html', show_reset_password=True)

@app.route('/reset-password', methods=['POST'])
def reset_password():
	user_id = session.get('password_reset_user_id')
	code_id = session.get('password_reset_code_id')
	if not user_id or not code_id:
		return redirect(url_for('forgot_password'))

	password = request.form.get('password', '').strip()
	confirm_password = request.form.get('confirm_password', '').strip()
	if len(password) < 6:
		return render_template('login.html', show_reset_password=True, error='La nueva clave debe tener al menos 6 caracteres.')
	if password != confirm_password:
		return render_template('login.html', show_reset_password=True, error='Las claves no coinciden.')

	conn = get_db()
	reset_code = conn.execute('''
		SELECT * FROM password_reset_codes
		WHERE id=? AND user_id=? AND used=0
	''', (code_id, user_id)).fetchone()
	if not reset_code or datetime.fromisoformat(reset_code['expires_at']) < datetime.now():
		conn.close()
		session.pop('password_reset_user_id', None)
		session.pop('password_reset_code_id', None)
		return render_template('login.html', show_forgot=True, error='El codigo vencio. Solicita uno nuevo.')

	conn.execute('UPDATE users SET password=? WHERE id=?', (generate_password_hash(password), user_id))
	conn.execute('UPDATE password_reset_codes SET used=1 WHERE id=?', (code_id,))
	conn.commit()
	conn.close()
	session.pop('password_reset_user_id', None)
	session.pop('password_reset_code_id', None)
	session.pop('reset_email', None)
	return render_template('login.html', success='Clave actualizada. Inicia sesion con tu nueva clave.')

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
		'SELECT id, username, email, points, puesto, member_since, status FROM users WHERE id=?',
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
	
	# Obtener multiplicador de día especial hoy
	today = datetime.now().date().isoformat()
	day_multiplier = get_active_points_multiplier(conn, today)

	result = [court_to_dict(c) for c in courts]
	for court in result:
		court['has_special_day'] = day_multiplier > 1.0
		court['day_multiplier'] = day_multiplier
		court.update(get_court_ratings(conn, court['id']))
	conn.close()
	return jsonify(result)

@app.route('/api/courts/all')
@admin_required
def api_courts_all():
	conn = get_db()
	courts = conn.execute('SELECT * FROM courts').fetchall()
	
	# Obtener multiplicador de día especial hoy
	today = datetime.now().date().isoformat()
	day_multiplier = get_active_points_multiplier(conn, today)

	result = [court_to_dict(c) for c in courts]
	for court in result:
		court['has_special_day'] = day_multiplier > 1.0
		court['day_multiplier'] = day_multiplier
		court.update(get_court_ratings(conn, court['id']))
	conn.close()
	return jsonify(result)

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

# ── NUEVO: endpoint para obtener configuración de días de baja demanda ──
@app.route('/api/low-demand-days')
def api_low_demand_days():
	"""Devuelve qué días de la semana son de baja demanda y el bonus de puntos."""
	return jsonify(get_low_demand_info())

@app.route('/api/point-multiplier')
def api_point_multiplier():
	date_str = request.args.get('date', '').strip() or datetime.now().date().isoformat()
	try:
		normalized_date = datetime.fromisoformat(date_str).date().isoformat()
	except (TypeError, ValueError):
		return jsonify({'active': False, 'multiplier': 1.0}), 400
	conn = get_db()
	multiplier = get_active_points_multiplier(conn, normalized_date)
	conn.close()
	return jsonify({
		'active': multiplier > 1,
		'multiplier': multiplier
	})

@app.route('/api/reservations')
@login_required
def api_reservations():
	conn = get_db()
	rows = conn.execute('''
		SELECT r.*, c.name as court_name, c.type as court_type, c.price,
		       (SELECT COUNT(*) FROM reviews rv WHERE rv.reservation_id = r.id) AS has_review
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

@app.route('/api/admin/point-multipliers')
@admin_required
def api_admin_point_multipliers():
	conn = get_db()
	rows = conn.execute('''
		SELECT * FROM point_multiplier_periods
		ORDER BY start_date ASC, end_date ASC
	''').fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/admin/point-multipliers', methods=['POST'])
@admin_required
def api_admin_add_point_multiplier():
	data = request.json or {}
	start_date = data.get('start_date', '').strip()
	end_date = data.get('end_date', '').strip() or start_date
	multiplier = data.get('multiplier', 2.0)
	reason = data.get('reason', '').strip()
	recurring = 1 if data.get('recurring') else 0
	if not start_date:
		return jsonify({'success': False, 'error': 'Falta la fecha de inicio'}), 400
	try:
		multiplier = float(multiplier)
		if multiplier < 1:
			return jsonify({'success': False, 'error': 'El multiplicador debe ser mayor a 1'}), 400
	except (TypeError, ValueError):
		return jsonify({'success': False, 'error': 'Multiplicador inválido'}), 400
	try:
		start_dt = datetime.fromisoformat(start_date).date()
		end_dt = datetime.fromisoformat(end_date).date()
	except (TypeError, ValueError):
		return jsonify({'success': False, 'error': 'Formato de fecha invalido'}), 400
	if end_dt < start_dt:
		return jsonify({'success': False, 'error': 'La fecha final no puede ser anterior a la inicial'}), 400

	conn = get_db()
	if not recurring:
		overlap = conn.execute('''
			SELECT id FROM point_multiplier_periods
			WHERE active=1 AND recurring=0 AND start_date<=? AND end_date>=?
		''', (end_dt.isoformat(), start_dt.isoformat())).fetchone()
		if overlap:
			conn.close()
			return jsonify({'success': False, 'error': 'Ya existe un multiplicador activo en ese rango'}), 409
	conn.execute('''
		INSERT INTO point_multiplier_periods (start_date, end_date, multiplier, reason, active, recurring, created_by)
		VALUES (?,?,?,?,1,?,?)
	''', (start_dt.isoformat(), end_dt.isoformat(), multiplier, reason, recurring, session['user_id']))
	conn.commit()
	conn.close()
	return jsonify({'success': True})

@app.route('/api/admin/point-multipliers/<int:period_id>', methods=['DELETE'])
@admin_required
def api_admin_delete_point_multiplier(period_id):
	conn = get_db()
	conn.execute('DELETE FROM point_multiplier_periods WHERE id=?', (period_id,))
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
	if not is_account_active(conn, session['user_id']):
		conn.close()
		return jsonify({'success': False, 'error': 'Tu cuenta está suspendida. No podés reservar.'}), 403
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
	points_multiplier_applied = 1.0
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
		# Calcular puntos base con multiplicadores normales
		multiplier = court['points_multiplier']

		# Bonus por horario pico (horas de menor afluencia en el día)
		hour = start_dt.hour
		if (8 <= hour < 11) or (13 <= hour < 16) or hour >= 22:
			multiplier *= 2.5

		# Bonus por día de baja demanda semanal
		if is_low_demand_day(start_dt):
			multiplier *= LOW_DEMAND_BONUS

		# Calcular puntos base
		base_points = court['price'] * multiplier * duration_hours
		
		# Verificar si hay un multiplicador de día especial y aplicarlo al resultado final
		points_multiplier_applied = get_active_points_multiplier(conn, date_str)
		points_earned = int(base_points * points_multiplier_applied)
		
		paid          = 1
		conn.execute('UPDATE users SET points = points + ? WHERE id=?', (points_earned, session['user_id']))

	conn.execute('''
		INSERT INTO reservations
			(user_id, court_id, start_datetime, end_datetime, duration_hours, estado, paid, points_earned, is_free_hours, reminder_24_sent, reminder_12_sent)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
	''', (session['user_id'], court_id, start_datetime, end_datetime, duration_hours,
		  'confirmed', paid, points_earned, 1 if is_free else 0, 0, 0))
	conn.commit()
	conn.close()
	return jsonify({
		'success': True,
		'points_earned': points_earned,
		'points_multiplier_applied': points_multiplier_applied
	})

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

	if res['estado'] != 'confirmed':
		conn.close()
		return jsonify({'success': False, 'error': 'Esta reserva ya fue cancelada'}), 400

	try:
		dt = datetime.fromisoformat(res['start_datetime'])
	except Exception:
		conn.close()
		return jsonify({'success': False, 'error': 'Fecha inválida'}), 400

	tiempo_restante = dt - datetime.now()
	hours_remaining = tiempo_restante.total_seconds() / 3600.0
	if hours_remaining <= 0:
		conn.close()
		return jsonify({'success': False, 'error': 'La reserva ya comenzó. No se puede cancelar.'}), 400

	# ── Política de cancelación por niveles (configurable) ──
	tier = get_refund_tier(conn, hours_remaining)
	refund_percent = float(tier['refund_percent']) if tier else 0.0
	points_earned  = res['points_earned'] or 0
	# La reversión es la parte NO reembolsada de los puntos ganados
	points_reversed = int(round(points_earned * (100 - refund_percent) / 100))

	conn.execute('UPDATE reservations SET estado="cancelled", cancelled_at=datetime("now"), refunded_points=? WHERE id=?',
				 (points_reversed, res_id))
	# Descontar los puntos no reembolsados (si no era reserva gratis)
	if not res['is_free_hours'] and points_reversed > 0:
		conn.execute(
			'UPDATE users SET points = MAX(0, points - ?) WHERE id=?',
			(points_reversed, session['user_id'])
		)
	conn.commit()
	conn.close()
	return jsonify({
		'success': True,
		'refund_percent': refund_percent,
		'points_reversed': points_reversed,
		'tier_label': tier['label'] if tier else '',
	})

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
	if not is_account_active(conn, session['user_id']):
		conn.close()
		return jsonify({'success': False, 'error': 'Tu cuenta está suspendida. No podés canjear.'}), 403
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
	name = data['name']
	court_type = data['type']
	image_key = data.get('image_key') or infer_court_image_key(name, court_type)
	if image_key not in COURT_IMAGE_KEYS:
		image_key = ''
	conn = get_db()
	conn.execute(
		'INSERT INTO courts (name, type, price, points_multiplier, available, status, image_key) VALUES (?,?,?,?,?,?,?)',
		(name, court_type, float(data['price']), float(data.get('multiplier', 1.0)), 1, 'Operational', image_key)
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

def is_account_active(conn, user_id):
	row = conn.execute('SELECT status FROM users WHERE id=?', (user_id,)).fetchone()
	return bool(row) and row['status'] == 'active'

# ==========================================
# RESEÑAS Y CALIFICACIONES
# ==========================================

@app.route('/api/courts/<int:court_id>/reviews')
def api_court_reviews(court_id):
	conn = get_db()
	rows = conn.execute('''
		SELECT rv.*, u.username
		FROM reviews rv JOIN users u ON rv.user_id = u.id
		WHERE rv.court_id=?
		ORDER BY rv.created_at DESC
		LIMIT 50
	''', (court_id,)).fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/reviews', methods=['POST'])
@login_required
def api_add_review():
	data = request.json or {}
	try:
		court_id       = int(data.get('court_id'))
		reservation_id = int(data.get('reservation_id'))
		rating         = int(data.get('rating'))
	except (TypeError, ValueError):
		return jsonify({'success': False, 'error': 'Datos inválidos'}), 400
	comment = (data.get('comment') or '').strip()
	if rating < 1 or rating > 5:
		return jsonify({'success': False, 'error': 'La calificación debe ser entre 1 y 5 estrellas'}), 400

	conn = get_db()
	res = conn.execute('SELECT * FROM reservations WHERE id=? AND user_id=?',
					   (reservation_id, session['user_id'])).fetchone()
	if not res:
		conn.close()
		return jsonify({'success': False, 'error': 'Reserva no encontrada'}), 404
	if res['court_id'] != court_id:
		conn.close()
		return jsonify({'success': False, 'error': 'La reserva no corresponde a esta cancha'}), 400
	try:
		started = datetime.fromisoformat(res['start_datetime'])
	except Exception:
		started = None
	if not started or started > datetime.now():
		conn.close()
		return jsonify({'success': False, 'error': 'Solo podés calificar reservas ya completadas'}), 400
	if res['estado'] != 'confirmed':
		conn.close()
		return jsonify({'success': False, 'error': 'Solo se califican reservas completadas'}), 400
	existing = conn.execute('SELECT id FROM reviews WHERE reservation_id=?', (reservation_id,)).fetchone()
	if existing:
		conn.close()
		return jsonify({'success': False, 'error': 'Esta reserva ya fue calificada'}), 409

	conn.execute('INSERT INTO reviews (court_id, user_id, reservation_id, rating, comment) VALUES (?,?,?,?,?)',
				 (court_id, session['user_id'], reservation_id, rating, comment))
	conn.commit()
	conn.close()
	return jsonify({'success': True})

# ==========================================
# ANALÍTICAS HISTÓRICAS (ADMIN)
# ==========================================

@app.route('/api/admin/analytics')
@admin_required
def api_admin_analytics():
	from_arg = request.args.get('from', '').strip()
	to_arg   = request.args.get('to',   '').strip()
	today    = datetime.now().date()
	from_date = today - timedelta(days=30)
	to_date   = today
	try:
		if from_arg: from_date = datetime.fromisoformat(from_arg).date()
	except ValueError:
		pass
	try:
		if to_arg: to_date = datetime.fromisoformat(to_arg).date()
	except ValueError:
		pass
	if to_date < from_date:
		from_date, to_date = to_date, from_date
	fd = from_date.isoformat()
	td = to_date.isoformat()

	conn = get_db()

	# Ingresos por día
	rev_rows = conn.execute('''
		SELECT date(start_datetime) AS day, SUM(c.price * r.duration_hours) AS revenue
		FROM reservations r JOIN courts c ON r.court_id = c.id
		WHERE r.estado='confirmed' AND r.is_free_hours=0
		  AND date(r.start_datetime) BETWEEN ? AND ?
		GROUP BY date(start_datetime)
	''', (fd, td)).fetchall()
	rev_map = {row['day']: float(row['revenue']) for row in rev_rows}
	days = []
	cur  = from_date
	while cur <= to_date:
		days.append(cur.isoformat())
		cur += timedelta(days=1)
	revenue_by_day = [{'date': d, 'revenue': round(rev_map.get(d, 0.0), 2)} for d in days]

	# Reservas por hora pico
	hour_rows = conn.execute('''
		SELECT CAST(strftime('%H', start_datetime) AS INTEGER) AS hour, COUNT(*) AS cnt
		FROM reservations
		WHERE estado != 'cancelled' AND date(start_datetime) BETWEEN ? AND ?
		GROUP BY hour
	''', (fd, td)).fetchall()
	hour_map = {row['hour']: row['cnt'] for row in hour_rows}
	bookings_by_hour = [{'hour': h, 'bookings': hour_map.get(h, 0)} for h in range(24)]

	# Canchas más populares
	pop_rows = conn.execute('''
		SELECT c.id, c.name, c.type, COUNT(r.id) AS bookings, SUM(c.price * r.duration_hours) AS revenue
		FROM reservations r JOIN courts c ON r.court_id = c.id
		WHERE r.estado != 'cancelled' AND date(r.start_datetime) BETWEEN ? AND ?
		GROUP BY c.id
		ORDER BY bookings DESC
	''', (fd, td)).fetchall()
	popular_courts = [
		{'court_id': row['id'], 'name': row['name'], 'type': row['type'],
		 'bookings': row['bookings'], 'revenue': round(float(row['revenue'] or 0), 2)}
		for row in pop_rows
	]

	# Tasas de cancelación y no-show
	total_res   = conn.execute('SELECT COUNT(*) FROM reservations WHERE date(start_datetime) BETWEEN ? AND ?', (fd, td)).fetchone()[0]
	total_cancelled = conn.execute("SELECT COUNT(*) FROM reservations WHERE estado='cancelled' AND date(start_datetime) BETWEEN ? AND ?", (fd, td)).fetchone()[0]
	total_noshow    = conn.execute("SELECT COUNT(*) FROM reservations WHERE estado='noshow' AND date(start_datetime) BETWEEN ? AND ?", (fd, td)).fetchone()[0]

	conn.close()
	return jsonify({
		'from': fd,
		'to': td,
		'total_reservations': total_res,
		'total_cancelled': total_cancelled,
		'total_noshow': total_noshow,
		'total_revenue': round(sum(d['revenue'] for d in revenue_by_day), 2),
		'range_bookings': sum(d['bookings'] for d in bookings_by_hour),
		'cancellation_rate': round((total_cancelled / total_res) * 100, 1) if total_res else 0.0,
		'no_show_rate': round((total_noshow / total_res) * 100, 1) if total_res else 0.0,
		'revenue_by_day': revenue_by_day,
		'bookings_by_hour': bookings_by_hour,
		'popular_courts': popular_courts,
	})

@app.route('/api/admin/reservations/<int:res_id>/noshow', methods=['POST'])
@admin_required
def api_admin_mark_noshow(res_id):
	conn = get_db()
	res = conn.execute('SELECT * FROM reservations WHERE id=?', (res_id,)).fetchone()
	if not res:
		conn.close()
		return jsonify({'success': False, 'error': 'Reserva no encontrada'}), 404
	if res['estado'] == 'noshow':
		conn.close()
		return jsonify({'success': False, 'error': 'Ya registrada como no-show'}), 400

	try:
		start_dt = datetime.fromisoformat(res['start_datetime'])
	except Exception:
		conn.close()
		return jsonify({'success': False, 'error': 'Fecha inválida de la reserva'}), 400

	now = datetime.now()
	if now.date() != start_dt.date() or now.hour != start_dt.hour:
		conn.close()
		return jsonify({'success': False, 'error': 'Solo se puede marcar como no-show en la fecha y hora de la reserva'}), 400
	if now < start_dt or now >= start_dt + timedelta(hours=1):
		conn.close()
		return jsonify({'success': False, 'error': 'El no-show solo está habilitado durante la hora de la reserva'}), 400

	noshow_tier = conn.execute(
		'SELECT * FROM cancellation_policy WHERE active=1 AND is_noshow=1 ORDER BY sort_order ASC LIMIT 1'
	).fetchone()
	refund_percent = float(noshow_tier['refund_percent']) if noshow_tier else 0.0
	penalty        = int(noshow_tier['penalty_points']) if noshow_tier else 0
	points_earned  = res['points_earned'] or 0
	points_reversed = int(round(points_earned * (100 - refund_percent) / 100))

	if not res['is_free_hours']:
		total_deduction = points_reversed + penalty
		if total_deduction > 0:
			conn.execute('UPDATE users SET points = MAX(0, points - ?) WHERE id=?',
						 (total_deduction, res['user_id']))
			if penalty > 0:
				conn.execute(
					'INSERT INTO point_adjustments (user_id, points, reason, admin_id) VALUES (?,?,?,?)',
					(res['user_id'], -penalty, 'Penalización por no-show', session['user_id'])
				)
	conn.execute('UPDATE reservations SET estado="noshow", refunded_points=? WHERE id=?',
				 (points_reversed, res_id))
	conn.commit()
	conn.close()
	return jsonify({
		'success': True,
		'refund_percent': refund_percent,
		'points_reversed': points_reversed,
		'penalty_points': penalty,
	})

# ==========================================
# POLÍTICA DE CANCELACIÓN Y REEMBOLSO
# ==========================================

@app.route('/api/cancellation-policy')
def api_cancellation_policy():
	conn = get_db()
	rows = conn.execute('SELECT * FROM cancellation_policy WHERE active=1 ORDER BY sort_order ASC').fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/admin/cancellation-policy')
@admin_required
def api_admin_cancellation_policy():
	conn = get_db()
	rows = conn.execute('SELECT * FROM cancellation_policy ORDER BY sort_order ASC').fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/admin/cancellation-policy', methods=['POST'])
@admin_required
def api_admin_save_cancellation_policy():
	data  = request.json or {}
	tiers = data.get('tiers')
	if not isinstance(tiers, list) or len(tiers) < 2:
		return jsonify({'success': False, 'error': 'Se necesitan al menos 2 niveles de política'}), 400

	normalized = []
	for t in tiers:
		try:
			hours  = float(t.get('hours_before', 0))
			refund = float(t.get('refund_percent', 0))
			penalty = int(t.get('penalty_points', 0))
		except (TypeError, ValueError):
			return jsonify({'success': False, 'error': 'Valores numéricos inválidos'}), 400
		if refund < 0 or refund > 100:
			return jsonify({'success': False, 'error': 'El porcentaje de reembolso debe estar entre 0 y 100'}), 400
		if penalty < 0:
			return jsonify({'success': False, 'error': 'La penalización no puede ser negativa'}), 400
		normalized.append({
			'hours_before': hours,
			'refund_percent': refund,
			'label': (t.get('label') or '').strip(),
			'penalty_points': penalty,
			'is_noshow': 1 if t.get('is_noshow') else 0,
		})

	ordered = sorted(normalized, key=lambda x: (1 if x['is_noshow'] else 0, -x['hours_before']))
	conn = get_db()
	conn.execute('DELETE FROM cancellation_policy')
	for idx, t in enumerate(ordered):
		conn.execute('''
			INSERT INTO cancellation_policy (hours_before, refund_percent, label, penalty_points, is_noshow, sort_order, active)
			VALUES (?,?,?,?,?,?,1)
		''', (t['hours_before'], t['refund_percent'], t['label'], t['penalty_points'], t['is_noshow'], idx + 1))
	conn.commit()
	conn.close()
	return jsonify({'success': True})

# ==========================================
# GESTIÓN DE USUARIOS (ADMIN)
# ==========================================

@app.route('/api/admin/users')
@admin_required
def api_admin_users():
	q      = request.args.get('q', '').strip()
	status = request.args.get('status', '').strip()
	query = '''
		SELECT u.id, u.username, u.email, u.puesto, u.points, u.status, u.member_since,
		       (SELECT COUNT(*) FROM reservations r WHERE r.user_id = u.id) AS bookings,
		       (SELECT COUNT(*) FROM reviews rv WHERE rv.user_id = u.id) AS reviews
		FROM users u
	'''
	where  = []
	params = []
	if q:
		where.append('(u.username LIKE ? OR u.email LIKE ?)')
		params.extend([f'%{q}%', f'%{q}%'])
	if status:
		where.append('u.status=?')
		params.append(status)
	if where:
		query += ' WHERE ' + ' AND '.join(where)
	query += ' ORDER BY u.member_since DESC, u.id DESC'
	conn = get_db()
	rows = conn.execute(query, params).fetchall()
	conn.close()
	return jsonify([dict(r) for r in rows])

@app.route('/api/admin/users/<int:user_id>/points', methods=['POST'])
@admin_required
def api_admin_adjust_points(user_id):
	data = request.json or {}
	try:
		points = int(data.get('points'))
	except (TypeError, ValueError):
		return jsonify({'success': False, 'error': 'Cantidad de puntos inválida'}), 400
	reason = (data.get('reason') or '').strip()
	if points == 0:
		return jsonify({'success': False, 'error': 'El ajuste debe ser distinto de 0'}), 400
	if not reason:
		return jsonify({'success': False, 'error': 'El motivo es obligatorio'}), 400

	conn = get_db()
	user = conn.execute('SELECT id, points FROM users WHERE id=?', (user_id,)).fetchone()
	if not user:
		conn.close()
		return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
	new_points = max(0, user['points'] + points)
	conn.execute('UPDATE users SET points=? WHERE id=?', (new_points, user_id))
	conn.execute('INSERT INTO point_adjustments (user_id, points, reason, admin_id) VALUES (?,?,?,?)',
				 (user_id, points, reason, session['user_id']))
	conn.commit()
	conn.close()
	return jsonify({'success': True, 'points': new_points})

@app.route('/api/admin/users/<int:user_id>/status', methods=['POST'])
@admin_required
def api_admin_set_user_status(user_id):
	data   = request.json or {}
	status = (data.get('status') or '').strip()
	if status not in ('active', 'suspended', 'deactivated'):
		return jsonify({'success': False, 'error': 'Estado inválido'}), 400
	if user_id == session['user_id']:
		return jsonify({'success': False, 'error': 'No podés cambiar tu propio estado'}), 400
	conn = get_db()
	user = conn.execute('SELECT id FROM users WHERE id=?', (user_id,)).fetchone()
	if not user:
		conn.close()
		return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
	conn.execute('UPDATE users SET status=? WHERE id=?', (status, user_id))
	conn.commit()
	conn.close()
	return jsonify({'success': True})

@app.route('/api/admin/users/<int:user_id>/history')
@admin_required
def api_admin_user_history(user_id):
	conn = get_db()
	user = conn.execute(
		'SELECT id, username, email, points, status, puesto, member_since FROM users WHERE id=?',
		(user_id,)
	).fetchone()
	if not user:
		conn.close()
		return jsonify({'error': 'Usuario no encontrado'}), 404
	reservations = conn.execute('''
		SELECT r.*, c.name AS court_name FROM reservations r
		JOIN courts c ON r.court_id = c.id
		WHERE r.user_id=? ORDER BY r.created_at DESC
	''', (user_id,)).fetchall()
	adjustments = conn.execute('''
		SELECT pa.*, a.username AS admin_name FROM point_adjustments pa
		LEFT JOIN users a ON pa.admin_id = a.id
		WHERE pa.user_id=? ORDER BY pa.created_at DESC
	''', (user_id,)).fetchall()
	reviews = conn.execute('''
		SELECT rv.*, c.name AS court_name FROM reviews rv
		JOIN courts c ON rv.court_id = c.id
		WHERE rv.user_id=? ORDER BY rv.created_at DESC
	''', (user_id,)).fetchall()
	conn.close()
	return jsonify({
		'user': dict(user),
		'reservations': [dict(r) for r in reservations],
		'adjustments': [dict(r) for r in adjustments],
		'reviews': [dict(r) for r in reviews],
	})

if __name__ == '__main__':
	app.run(host='127.0.0.1', port=5000, debug=True)