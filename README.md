# Tax Filing Project

This project is a Django + React geographic information system for San Pascual, Batangas. It combines a GeoDjango/PostGIS backend with a Vite/React frontend for lot mapping, dashboard analytics, and property tax visualization.

## For System Administrators (admins)
To access the latest system changes and log in to the admin dashboard on your machine:

1. **Pull the latest code** from the repository.
2. **Update your local database** by running:
   ```bash
   venv\Scripts\activate
   python manage.py migrate
   ```
3. **Restart the server**:
   ```bash
   python manage.py runserver
   ```
4. **Log in with the shared account**:
   * **Email**: `lgusanpascual.sysadmin@gmail.com`
   * **Password**: `lgusp123`

*Note: The system automatically creates this account on your local machine the first time you attempt to log in after running migrations.*

### Implementation Logic (How it works)
To ensure every admin has immediate access without manual database entry or shared SQL dumps, we implemented a **Just-In-Time (JIT) provisioning** system:
- **Automatic Provisioning**: In the custom `AdminEmailLoginView`, the backend specifically monitors for the `lgusanpascual.sysadmin@gmail.com` email.
- **Auto-Correction**: If that administrator record is missing from your local SQLite or PostGIS database, the backend creates it automatically (via `User.objects.create_superuser(...)`) before proceeding with the password check.
- **Portability**: This allows the code to be "portable" across any new machine; as long as you have the latest code, the login will "just work."

## Quick Start (Windows)

### 1. Prerequisites
- Docker Desktop
- Python 3.11 or 3.12
- Node.js LTS
- QGIS or OSGeo4W for GDAL/GEOS support

The project can usually detect QGIS or OSGeo4W automatically from standard install paths such as `C:\Program Files\QGIS` or `C:\OSGeo4W`.

### 2. Database Setup
From the project root:

```bash
docker compose up -d
```

Wait until the database container is healthy, then enable PostGIS:

```bash
docker exec -it taxfiling-postgis psql -U taxuser -d taxfiling -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 3. Backend Setup
First, make sure you navigate into the project root directory:

```bash
cd tax-filling-alpha-main
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 9000
```

Backend URL:
`http://127.0.0.1:9000`

### 4. Frontend Setup
Open a second terminal:

```bash
cd tax-filling-alpha-main\frontend
npm install
npm run dev
```

Frontend URL:
`http://localhost:5173`

### 5. Importing GeoPackage Data
If you need to import `.gpkg` files into PostGIS:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import_gpkg_to_postgis.ps1
```

### 6. Database Export & Restore

#### Exporting (create a portable SQL dump)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export_db.ps1 -DumpPath "taxfiling.sql"
```

#### Restoring (load a SQL dump into a fresh or existing DB)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore_db.ps1 -DumpPath "taxfiling.sql"
```

The restore script automatically:
1. Ensures PostGIS extension exists
2. Loads the SQL dump into the container
3. Runs Django migrations
4. Rebuilds the dashboard RPT report cache

> **Important**: After restoring, always restart both the Django backend and the Vite frontend dev server to clear in-memory caches.

### 7. Tax Computation Data Requirements

For per-lot tax computations to work (non-zero values), **three things** must be in place:

| Requirement | Location | Purpose |
|---|---|---|
| **PostGIS lot data** | `pim_sections` table | Provides lot geometry and area attributes (`area_res`, `area_agri`, etc.) |
| **SMV GeoPackage files** | `maps/static/SMV/<Class>/` | Provides unit values per PIN for each land classification |
| **Dashboard cache** | `maps/static/rpt_report_cache.json` | Pre-computed aggregate totals for the dashboard |

**SMV folder structure** (must contain `.gpkg` files with `PIN` and `Unit Value` columns):
```
maps/static/SMV/
├── Residential/       ← .gpkg files per barangay
├── Agricultural/      ← .gpkg files per barangay
├── Commercial/        ← .gpkg files per barangay
└── Industrial/        ← .gpkg files per barangay
```

**Rebuilding the dashboard cache manually**:
```bash
venv\Scripts\activate
python manage.py build_rpt_report_cache
```

## Authentication

### Current Login Behavior
- The login screen is admin-only.
- The app now uses role-based admin authentication only.
- Admin login accepts `Admin Email or ID`.

### Shared Admin Account
The system includes an automatic shared thesis/demo admin account:

- Email: `lgusanpascual.sysadmin@gmail.com`
- Password: `lgusp123`

How it works:
- When someone logs in using `lgusanpascual.sysadmin@gmail.com`, the Django backend automatically creates or repairs that admin account in the local database if it does not already exist.
- This means admins can pull the updated code, run migrations, start the backend, and use the same shared admin credentials even if each laptop has its own separate local database.

Important:
- This system uses a **Shared Account Architecture**.
- While each administrator runs their own local **PostgreSQL/PostGIS** database instance (via Docker) to ensure high performance and data isolation, the **admin credentials are shared and automatically synchronized** via the backend code.
- This ensures a seamless login experience for all collaborators using the same `lgusanpascual.sysadmin@gmail.com` account.

## Features

### Dashboard
- Interactive lot map for municipal land-use visualization
- Area classification pie chart
- Proportional revenue pie chart
- Revenue breakdown and tax category bar chart
- Search-driven dashboard map behavior using barangay and PIN inputs

### Mapping
- Cadastral map view
- Tax map view
- Lot-level selection and inspection
- Barangay and section-based navigation

### Assessment Data
- Barangay-level assessment table
- Market value and assessed value summaries
- Real property tax reporting support

## pgAdmin Access
- URL: `http://localhost:5050`
- Login Email: `admin@example.com`
- Login Password: `admin123`

Database connection values:
- Host: `db` from inside Docker/pgAdmin, or `localhost` from host tools
- Port: `5432` internally, or `5433` on the host
- User: `taxuser`
- Password: `pops1245`

## Troubleshooting

### Frontend loads but page is blank
- Hard refresh the browser with `Ctrl+F5`
- Restart the frontend dev server:

```bash
cd frontend
npm run dev
```

- Restart the Django backend:

```bash
python manage.py runserver
```

### Shared admin does not work on another laptop
Make sure that laptop:
1. Pulled the latest code
2. Ran `python manage.py migrate`
3. Restarted the Django backend

Then log in with:
- `lgusanpascual.sysadmin@gmail.com`
- `lgusp123`

### GDAL / GeoDjango errors
If the project cannot find `ogr2ogr.exe` or related GIS libraries:
- confirm QGIS or OSGeo4W is installed
- if needed, set `OSGEO4W_ROOT` manually

### Database connection failure
- Ensure Docker Desktop is running
- Check `docker compose ps`
- If needed, inspect logs with:

```bash
docker compose logs db
```

## Project Structure
- `/taxfiling`: Django project settings
- `/maps`: backend app, auth, GIS APIs, and reporting logic
- `/frontend`: React + Vite frontend
- `/scripts`: database and import helper scripts
