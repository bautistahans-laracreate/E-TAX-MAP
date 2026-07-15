import sqlite3
import os

db_path = 'maps/static/PIM/Alalum.gpkg'

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'")
    table_name = cursor.fetchone()[0]
    print(f"Table: {table_name}")
    
    cursor.execute(f"PRAGMA table_info('{table_name}')")
    cols = cursor.fetchall()
    print("Columns:")
    for col in cols:
        print(col[1])
        
    cursor.execute(f"SELECT * FROM '{table_name}' LIMIT 1")
    row = cursor.fetchone()
    print(f"Sample data: {row}")
    
except Exception as e:
    print(f"Error: {e}")

conn.close()
