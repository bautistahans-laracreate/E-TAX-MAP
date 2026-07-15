import sqlite3
import os

db_path = 'maps/static/CAD/BarangayBoundaryIndexMap.gpkg'

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Tables:", [t[0] for t in tables])

# Check gpkg_contents to find the main spatial table
try:
    cursor.execute("SELECT table_name, data_type, identifier FROM gpkg_contents;")
    contents = cursor.fetchall()
    print("\nGPKG Contents:")
    for row in contents:
        print(row)
except Exception as e:
    print(f"\nCould not read gpkg_contents: {e}")

# Check columns of the potential main table (assuming 'sanpascual' or similar)
for table in [t[0] for t in tables]:
    if not table.startswith('gpkg_') and not table.startswith('sqlite_'):
        print(f"\nColumns in {table}:")
        cursor.execute(f"PRAGMA table_info({table});")
        cols = cursor.fetchall()
        for col in cols:
            print(col)
        
        # Sample data
        cursor.execute(f"SELECT * FROM {table} LIMIT 1;")
        sample = cursor.fetchone()
        print(f"Sample row: {sample}")

conn.close()
