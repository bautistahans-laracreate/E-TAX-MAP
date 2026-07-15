import os
import django
from pathlib import Path

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxfiling.settings')
django.setup()

from maps.pim_views import _prepare_lot_data

def test_rrw_injection():
    # Mock properties likely to be in Alalum for PIN 05-136
    # Note: In the database, it probably doesn't have area_res yet
    raw_props = {
        'pin': '05-136',
    }
    
    barangay_name = 'Alalum'
    
    print(f"Testing RRW injection for PIN {raw_props['pin']} in {barangay_name}...")
    
    # We call _prepare_lot_data with barangay_name to trigger SMV injection
    props = _prepare_lot_data(raw_props, barangay_name=barangay_name)
    
    print("\nResulting properties:")
    for k, v in props.items():
        if 'area' in k or 'unit_value' in k or 'pin' == k:
            print(f"  {k}: {v}")

if __name__ == "__main__":
    test_rrw_injection()
