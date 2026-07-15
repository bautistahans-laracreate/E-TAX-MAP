import geopandas as gpd
import os

db_path = 'maps/static/CAD/BarangayBoundaryIndexMap.gpkg'

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
    exit(1)

try:
    # Use pyogrio engine for speed
    gdf = gpd.read_file(db_path, engine='pyogrio')
    print("Columns:", gdf.columns.tolist())
    print("\nSample Data (ADM4_EN):")
    print(gdf['ADM4_EN'].unique())
    print("\nTotal features:", len(gdf))
    
    # Test GeoJSON conversion
    geojson = gdf.to_json()
    print("\nGeoJSON snippet:", geojson[:200])
except Exception as e:
    print(f"Error: {e}")
