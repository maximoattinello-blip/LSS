# RESERMAX – Setup

## Stack
- **Backend**: Python / Flask
- **Database**: SQLite (`resermax.db`, auto-created on first run)
- **Frontend**: Jinja2 HTML templates + Tailwind CSS (CDN) + Vanilla JS

## Project Structure

```
resermax/
├── app.py                  ← Flask app + all API routes + DB init
├── requirements.txt
├── resermax.db             ← Auto-generated SQLite database
├── templates/
│   ├── login.html          ← Login & Register
│   ├── index.html          ← Explore / Court listing
│   ├── perfil.html         ← Athlete profile & reservations
│   ├── premios.html        ← Rewards / Redemption
│   └── admin.html          ← Admin dashboard (ADM role only)
└── static/
    ├── css/
    │   └── index.css       ← Shared styles & CSS variables
    └── scripts/
        ├── index.js        ← Court listing, search, booking modal
        ├── perfil.js       ← Profile data, reservations, cancel
        ├── premios.js      ← Rewards listing, redemption
        └── admin.js        ← Admin stats, bookings table, facility mgmt
```

## Setup

```bash
# 1. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the app
python app.py
```

The server starts at **http://localhost:5000**

The database (`resermax.db`) is created automatically on first run with seed data.

## Demo Accounts

| Role    | Email                    | Password       |
|---------|--------------------------|----------------|
| Admin   | valentino@example.com    | ValentinoPass  |
| Admin   | mateo@example.com        | MateoPass      |
| Athlete | marcus@athlete.com       | Marcus123      |

## Database Tables

| Table         | Purpose                                  |
|---------------|------------------------------------------|
| `users`       | Athletes and admins (login, points)      |
| `courts`      | Bookable facilities with pricing         |
| `reservations`| Bookings linking users ↔ courts          |
| `rewards`     | Redeemable prizes catalog                |
| `redemptions` | Log of reward redemptions                |

## API Endpoints

| Method | Route                        | Auth     | Description               |
|--------|------------------------------|----------|---------------------------|
| GET    | `/api/me`                    | User     | Current user profile      |
| GET    | `/api/courts`                | —        | Available courts           |
| GET    | `/api/reservations`          | User     | My reservations            |
| POST   | `/api/reserve`               | User     | Create reservation         |
| POST   | `/api/cancel/<id>`           | User     | Cancel reservation         |
| GET    | `/api/rewards`               | User     | Rewards catalog            |
| POST   | `/api/redeem/<id>`           | User     | Redeem a reward            |
| GET    | `/api/admin/stats`           | Admin    | Dashboard stats            |
| GET    | `/api/reservations/all`      | Admin    | All reservations           |
| GET    | `/api/courts/all`            | Admin    | All courts (incl. inactive)|
| POST   | `/api/admin/court`           | Admin    | Add new court              |
| POST   | `/api/admin/court/<id>/toggle`| Admin   | Toggle court availability  |
# LSS
