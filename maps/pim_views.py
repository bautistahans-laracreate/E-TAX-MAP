"""
PIM API Views backed by PostGIS tables.

Tables:
    pim_sections
    pim_enlargements
    pim_barangay_boundaries
"""
import json
import math
import re
import sqlite3
import os
import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping
from pathlib import Path
from django.db.models import Count, Min, Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.contrib.gis.db.models.aggregates import Union
from django.conf import settings

from .models import PimSection, PimEnlargement, LotAdjustment
from .views import _RPT_REPORT_CACHE, _RPT_REPORT_CACHE_FILE
from .views import api_login_required

BARANGAY_VARIANTS = {
    'Sta. Elena': ['Sta. Elena', 'Sta Elena', 'Santa Elena'],
    'Sto. Nino': ['Sto. Nino', 'Sto Nino', 'Sto Niño', 'Sto. Niño', 'Santo Nino', 'Santo Niño'],
    'Ilat North': ['Ilat North', 'Ilat'],
    'Natunuan South': ['Natunuan South', 'Natunuan'],
    'Balimbing': ['Balimbing', 'Balimbing New'],
    'Poblacion': ['Poblacion'],
    'Poblacion 1': ['Poblacion 1'],
    'Poblacion 2': ['Poblacion 2'],
    'Poblacion 3': ['Poblacion 3'],
    'Poblacion 4': ['Poblacion 4'],
}

# Column name normalisation for frontend consistency.
COLUMN_MAP = {
    'pin': 'pin',
    'name of owner': 'owner',
    'property owner': 'owner',
    'address of owner': 'address',
    'address': 'address',
    'addres of owner': 'address',
    'adress of owner': 'address',
    'arp number': 'arp_no',
    'arp no.': 'arp_no',
    'arp no': 'arp_no',
    'previous arp number': 'prev_arp_no',
    'previous arp numberr': 'prev_arp_no',
    'previous arp no.': 'prev_arp_no',
    'previous arp no': 'prev_arp_no',
    'previos arp no.': 'prev_arp_no',
    'prevous arp no.': 'prev_arp_no',
    'area (res)': 'area_res',
    'area res': 'area_res',
    'area (agri)': 'area_agri',
    'area agri': 'area_agri',
    "area (ind'l)": 'area_indl',
    "area (ind_l)": 'area_indl',
    'area ind': 'area_indl',
    "area ind'l": 'area_indl',
    'area indus': 'area_indl',
    'area industri': 'area_indl',
    "agrea (ind'l)": 'area_indl',
    "agrea (ind_l)": 'area_indl',
    "area (comm'l)": 'area_comml',
    "area (comm_l)": 'area_comml',
    'area comml': 'area_comml',
    "area comm'l": 'area_comml',
    'area (rrw)': 'area_rrw',
    'area rrw': 'area_rrw',
    'area (exempt)': 'area_exempt',
    'area exempt': 'area_exempt',
    # Spacing and typo variants found in database
    'area agri ': 'area_agri',
    'area res ': 'area_res',
    'area ind ': 'area_indl',
    'area comml ': 'area_comml',
    'arp no. ': 'arp_no',
    'property owner ': 'owner',
    'property of owner': 'owner',
    'lot no.': 'lot_no',
    'lot no': 'lot_no',
    'lot_no': 'lot_no',
    'lot number': 'lot_no',
    'type of land use': 'land_use',
    'address of owner': 'address',
    'section': 'section',
    'barangay': 'barangay',
}

IGNORE_COLUMNS = {'1', 'geometry', 'geom', 'id', 'fid'}

SECTION_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#e11d48', '#8b5cf6', '#0ea5e9', '#d946ef',
    '#65a30d', '#dc2626', '#0891b2', '#7c3aed', '#ca8a04',
]

# Land-use classification colors for the dashboard and tax-map lots.
DASHBOARD_LOT_COLOR_MAP = {
    'AGRI': '#22c55e',
    'COMM': '#fbbf24',
    'INDUSTRIAL': '#3b82f6',
    'RES': '#ef4444',
    'EXEMPT': '#9ca3af',
    'UNCLASSIFIED': '#ff00ff',
}

# Barangay colors consistent with MapComponent.jsx
BARANGAY_COLORS = [
    '#e11d48', '#d946ef', '#8b5cf6', '#a855f7', '#ec4899',
    '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444'
]

def _get_barangay_color(barangay_name):
    """Returns the theme color for a barangay based on its index in the municipal list."""
    all_brgys = [
        'Alalum', 'Antipolo', 'Balimbing', 'Banaba', 'Bayanan', 'Danglayan',
        'Del Pilar', 'Gelerang Kawayan', 'Ilat North', 'Ilat South', 'Kaingin',
        'Laurel', 'Malaking Pook', 'Mataas na Lupa', 'Natunuan North', 'Natunuan South',
        'Padre Castillo', 'Palsahingin', 'Pila', 'Poblacion', 'Pook ni Banal',
        'Pook ni Kapitan', 'Resplandor', 'Sambat', 'San Antonio', 'San Mariano',
        'San Mateo', 'Sta. Elena', 'Sto. Nino'
    ]
    try:
        idx = all_brgys.index(barangay_name)
        return BARANGAY_COLORS[idx % len(BARANGAY_COLORS)]
    except ValueError:
        requested_slug = re.sub(r'[^a-z0-9]+', '', (barangay_name or '').lower())
        for i, b in enumerate(all_brgys):
            if re.sub(r'[^a-z0-9]+', '', b.lower()) == requested_slug:
                return BARANGAY_COLORS[i % len(BARANGAY_COLORS)]
        return '#64748b' # Gray fallback

TAX_MAP_LOT_COLOR_MAP = {
    'WITH_DATA': '#3b82f6',
    'UNCLASSIFIED': '#ff00ff',
}


def _has_positive_area(props, *keys):
    return any(_safe_num(props.get(key)) > 0 for key in keys)


def _primary_area_values(props):
    return {
        'AGRI': _safe_num(props.get('area_agri')),
        'COMM': max(_safe_num(props.get('area_comml')), _safe_num(props.get('area_commml'))),
        'INDUSTRIAL': max(_safe_num(props.get('area_indl')), _safe_num(props.get('area_ind'))),
        'RES': _safe_num(props.get('area_res')),
    }


def _has_any_lot_data(props):
    return (
        any(val > 0 for val in _primary_area_values(props).values())
        or _has_positive_area(props, 'area_exempt')
        or _has_positive_area(props, 'area_rrw')
    )


def get_dashboard_lot_color_key(props):
    """
    Dashboard rule:
    - Use only 6 colors.
    - If multiple primary classes have values, use the class with the highest area.
    - Exempt-only lots are gray.
    - Lots with no usable class data are pink.
    - RRW-only lots fall back to blue to keep them in the "with data" bucket.
    """
    primary_values = _primary_area_values(props)
    best_key = None
    best_value = 0.0
    for key, value in primary_values.items():
        if value > best_value:
            best_key = key
            best_value = value

    if best_key and best_value > 0:
        return best_key
    if _has_positive_area(props, 'area_exempt'):
        return 'EXEMPT'
    if _has_positive_area(props, 'area_rrw'):
        return 'INDUSTRIAL'
    return 'UNCLASSIFIED'


def get_tax_map_lot_color_key(props):
    return 'WITH_DATA' if _has_any_lot_data(props) else 'UNCLASSIFIED'


def get_dashboard_lot_color(props):
    key = get_dashboard_lot_color_key(props)
    return key, DASHBOARD_LOT_COLOR_MAP.get(key, DASHBOARD_LOT_COLOR_MAP['UNCLASSIFIED'])


def get_tax_map_lot_color(props):
    key = get_tax_map_lot_color_key(props)
    return key, TAX_MAP_LOT_COLOR_MAP.get(key, TAX_MAP_LOT_COLOR_MAP['UNCLASSIFIED'])


def _get_assessment_class_keys(props: dict, barangay_name: str) -> list[str]:
    """
    Return only the class keys that would actually be counted by the
    assessment table: positive area and available SMV unit value.
    """
    if not barangay_name:
        return []

    pin = str(props.get('pin') or props.get('PIN') or '').strip()
    if not pin:
        return []

    class_keys = []
    for class_key, meta in _RPT_CLASS_META.items():
        area = _safe_num(props.get(meta['area_key']))
        if area <= 0:
            continue
        smv = _load_smv_cache(barangay_name, class_key)
        unit_val = _safe_num(smv.get(pin, {}).get('unit_value'))
        if unit_val <= 0:
            continue
        class_keys.append(class_key)
    return class_keys

SMV_CLASS_FOLDERS = {
    'res': 'Residential',
    'agri': 'Agricultural',
    'comml': 'Commercial',
    'indl': 'Industrial',
}

_SMV_CACHE = {}

_RPT_REPORT_CACHE_FILE = Path(settings.BASE_DIR) / 'maps' / 'static' / 'rpt_report_cache.json'

_RPT_CLASS_META = {
    'res': {'label': 'RESIDENTIAL', 'area_key': 'area_res', 'assessment_level': 0.05},
    'agri': {'label': 'AGRICULTURAL', 'area_key': 'area_agri', 'assessment_level': 0.06},
    'comml': {'label': 'COMMERCIAL', 'area_key': 'area_comml', 'assessment_level': 0.25},
    'indl': {'label': 'INDUSTRIAL', 'area_key': 'area_indl', 'assessment_level': 0.45},
}

def _normalise_single_property(key, value):
    """Internal helper to normalise a single key-value pair."""
    key_raw = str(key).strip()
    if not key_raw: return None, None
    if key_raw in IGNORE_COLUMNS: return None, None
    
    key_lower = key_raw.lower()
    if key_lower in COLUMN_MAP:
        out_key = COLUMN_MAP[key_lower]
    else:
        out_key = key_lower.replace(' ', '_')
        if out_key in IGNORE_COLUMNS: return None, None
        
    return out_key, _clean_val(value)


def _slug(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (value or '').lower())


def _find_smv_files(class_folder: str, barangay_name: str) -> list[Path]:
    base_dir = Path(settings.BASE_DIR) / 'maps' / 'static' / 'SMV' / class_folder
    if not base_dir.exists():
        return []
    variants = _barangay_variants(barangay_name)
    needles = [_slug(v) for v in variants] + [_slug(barangay_name)]
    matches = []
    for file in base_dir.glob('*.gpkg'):
        slug = _slug(file.stem)
        if any(n and n in slug for n in needles):
            matches.append(file)
    return matches


def _load_smv_cache(barangay_name: str, class_key: str) -> dict:
    cache_key = (barangay_name, class_key)
    if cache_key in _SMV_CACHE:
        return _SMV_CACHE[cache_key]

    class_folder = SMV_CLASS_FOLDERS.get(class_key)
    if not class_folder:
        _SMV_CACHE[cache_key] = {}
        return {}

    files = _find_smv_files(class_folder, barangay_name)
    data = {}
    for file_path in files:
        try:
            conn = sqlite3.connect(str(file_path))
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in cur.fetchall()]
            for table in tables:
                if table.startswith('gpkg_') or table.startswith('rtree_') or table == 'sqlite_sequence':
                    continue
                cur.execute(f"PRAGMA table_info('{table}')")
                cols = [c[1] for c in cur.fetchall()]
                if not cols:
                    continue
                pin_col = next((c for c in cols if str(c).lower() == 'pin'), None)
                unit_col = next((c for c in cols if 'unit value' in str(c).lower()), None)
                rrw_col = next((c for c in cols if 'area rrw' in str(c).lower()), None)
                if not pin_col or not unit_col:
                    continue
                cur.execute(f"SELECT \"{pin_col}\", \"{unit_col}\"{f', \"{rrw_col}\"' if rrw_col else ''} FROM '{table}'")
                for row in cur.fetchall():
                    pin = str(row[0]).strip() if row[0] is not None else ''
                    if not pin:
                        continue
                    if pin in data:
                        continue
                    unit_val = row[1]
                    rrw_val = None
                    if rrw_col:
                        rrw_val = row[2]
                    data[pin] = {
                        'unit_value': unit_val,
                        'area_rrw': rrw_val,
                    }
        except Exception:
            pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

    _SMV_CACHE[cache_key] = data
    return data


def _safe_num(value):
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        s = str(value).replace(',', '').strip()
        if not s or s.lower() in ('n/a', 'none', 'null', 'nan', '-', '.'):
            return 0.0
        res = re.search(r'[-+]?\d*\.?\d+', s)
        if not res:
            return 0.0
        val_str = res.group()
        if val_str in ('-', '+', '.'):
            return 0.0
        return float(val_str)
    except Exception:
        return 0.0


def _prepare_lot_data(raw_props, enlargement_properties=None, adj_rate=None, barangay_name=None, use_assessment_classification=False, color_mode='dashboard'):
    """
    Standardizes lot properties with enlargement overrides and adjustments.
    """
    # 1. Start with raw props, override with enlargement if provided
    marker_source_props = raw_props or {}
    base_props = marker_source_props
    if enlargement_properties:
        # Merge enlargement props on top of base props
        merged = base_props.copy()
        merged.update(enlargement_properties)
        base_props = merged
        
    # 2. Normalise
    props = _normalise_properties(base_props)
    
    # 3. Apply adjustment rate
    if adj_rate is not None:
        props['adjustment_rate'] = adj_rate
        
    # 4. Compute color
    if use_assessment_classification:
        assessed_keys = _get_assessment_class_keys(props, barangay_name or '')
        area_to_lot_key = {
            'agri': 'AGRI',
            'comml': 'COMM',
            'indl': 'INDUSTRIAL',
            'res': 'RES',
        }
        assessed_types = [area_to_lot_key[k] for k in assessed_keys if k in area_to_lot_key]
        combo_key = assessed_types[0] if assessed_types else 'UNCLASSIFIED'
        props['assessment_class_keys'] = assessed_keys
        props['assessment_combo_key'] = combo_key
        props['is_assessed'] = combo_key != 'UNCLASSIFIED'
        props['color'] = DASHBOARD_LOT_COLOR_MAP.get(combo_key, DASHBOARD_LOT_COLOR_MAP['UNCLASSIFIED'])
    else:
        if color_mode == 'tax_map':
            color_key, color = get_tax_map_lot_color(props)
            props['tax_map_status'] = color_key
            props['dashboard_color_key'] = get_dashboard_lot_color_key(props)
        else:
            color_key, color = get_dashboard_lot_color(props)
            props['dashboard_color_key'] = color_key
            props['tax_map_status'] = get_tax_map_lot_color_key(props)
        props['is_unclassified'] = color_key == 'UNCLASSIFIED' or props.get('tax_map_status') == 'UNCLASSIFIED'
        props['color_key'] = color_key
        props['color'] = color
    
    # 5. Inject SMV unit values so the frontend can compute per-lot tax
    if barangay_name:
        pin = str(props.get('pin') or props.get('PIN') or '').strip()
        if pin:
            # Track if we found a unit value to potentially use for RRW fallback
            found_unit_val = None
            
            for class_key, meta in _RPT_CLASS_META.items():
                # We check the SMV for the PIN regardless of whether area_{class} is defined in props.
                # This allows recovering classification and unit values missing from the primary section files.
                smv = _load_smv_cache(barangay_name, class_key)
                smv_entry = smv.get(pin, {})
                unit_val = _safe_num(smv_entry.get('unit_value'))
                
                if unit_val > 0:
                    props[f'unit_value_{class_key}'] = unit_val
                    found_unit_val = unit_val # Capture for RRW fallback
                
                smv_rrw = _safe_num(smv_entry.get('area_rrw'))
                if smv_rrw > 0:
                    props['area_rrw'] = smv_rrw
            
            # If we have RRW area but no RRW unit value, use the best available unit value from SMVs
            if _safe_num(props.get('area_rrw')) > 0 and _safe_num(props.get('unit_value_rrw')) <= 0:
                if found_unit_val:
                    props['unit_value_rrw'] = found_unit_val

    # 6. Marker for enlargement (always check raw base for "see enlargement")
    props['has_enlargement'] = _has_enlargement_marker(marker_source_props)
    
    return props


def _update_rpt_cache_for_pin(pin: str, old_rate: float, new_rate: float):
    if not pin or old_rate == new_rate:
        return
    if not _RPT_REPORT_CACHE_FILE.exists():
        return
    try:
        with open(_RPT_REPORT_CACHE_FILE, 'r', encoding='utf-8') as f:
            payload = json.load(f)
    except Exception:
        return

    rows = payload.get('assessment_table', {}).get('rows', [])
    rpt_by_class = payload.get('rpt_by_class', [])
    if not rows or not rpt_by_class:
        return

    # Find lot properties
    lot_props = None
    lot_barangay = None
    for row in PimSection.objects.values('barangay_name', 'properties').iterator():
        props = _normalise_properties(row.get('properties') or {})
        p = props.get('pin') or props.get('PIN')
        if p and str(p).strip() == pin:
            lot_props = props
            lot_barangay = _canonical_barangay_name(row.get('barangay_name') or '')
            break

    if not lot_props or not lot_barangay:
        return

    # Compute deltas
    delta_market = 0.0
    delta_assessed = 0.0
    delta_rpt_by_class = {k: 0.0 for k in _RPT_CLASS_META.keys()}
    tax_rate = 0.02

    for class_key, meta in _RPT_CLASS_META.items():
        area = _safe_num(lot_props.get(meta['area_key']))
        if area <= 0:
            continue
        smv = _load_smv_cache(lot_barangay, class_key)
        unit_val = _safe_num(smv.get(pin, {}).get('unit_value'))
        if unit_val <= 0:
            continue

        market_old = area * unit_val * old_rate
        market_new = area * unit_val * new_rate
        assessed_old = market_old * meta['assessment_level']
        assessed_new = market_new * meta['assessment_level']

        delta_market += (market_new - market_old)
        delta_assessed += (assessed_new - assessed_old)
        delta_rpt_by_class[class_key] += (assessed_new - assessed_old) * tax_rate

    if delta_market == 0 and delta_assessed == 0:
        return

    # Update barangay row totals
    for row in rows:
        if row.get('barangay') == lot_barangay:
            row['market_value'] = _safe_num(row.get('market_value')) + delta_market
            row['assessed_value'] = _safe_num(row.get('assessed_value')) + delta_assessed
            break

    # Update total row if present
    totals = payload.get('assessment_table', {}).get('totals')
    if totals:
        totals['market_value'] = _safe_num(totals.get('market_value')) + delta_market
        totals['assessed_value'] = _safe_num(totals.get('assessed_value')) + delta_assessed

    # Update rpt_by_class totals
    for item in rpt_by_class:
        key = item.get('key')
        if key in delta_rpt_by_class:
            item['amount'] = _safe_num(item.get('amount')) + delta_rpt_by_class[key]

    try:
        with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(payload, f)
    except Exception:
        pass


def _clean_val(value):
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def _normalise_properties(properties):
    normalised = {}
    for key, value in (properties or {}).items():
        key_raw = str(key).strip()
        if not key_raw:
            continue
        if key_raw in IGNORE_COLUMNS:
            continue

        key_lower = key_raw.lower()
        if key_lower in COLUMN_MAP:
            out_key = COLUMN_MAP[key_lower]
        else:
            out_key = key_lower.replace(' ', '_')
            if out_key in IGNORE_COLUMNS:
                continue

        normalised[out_key] = _clean_val(value)

    # Compatibility aliases for existing frontend checks/tooltips.
    if 'pin' in normalised and 'PIN' not in normalised:
        normalised['PIN'] = normalised['pin']
    if 'owner' in normalised and 'Name of Owner' not in normalised:
        normalised['Name of Owner'] = normalised['owner']

    return normalised


def _has_enlargement_marker(properties: dict) -> bool:
    for value in (properties or {}).values():
        if isinstance(value, str) and 'see enlargement' in value.strip().lower():
            return True
    return False


def _extract_section_number(filename):
    match = re.search(r'[Ss]ection\s*(\d+)', filename or '')
    if match:
        return int(match.group(1))
    return 0


def _canonical_barangay_name(name: str) -> str:
    cleaned = " ".join((name or '').strip().split())
    for canonical, variants in BARANGAY_VARIANTS.items():
        for variant in variants:
            if cleaned.lower() == variant.lower():
                return canonical
    return cleaned


def _barangay_variants(requested: str) -> list[str]:
    canonical = _canonical_barangay_name(requested)
    if canonical in BARANGAY_VARIANTS:
        return BARANGAY_VARIANTS[canonical]
    return [canonical]


def _filter_by_barangay(queryset, requested_barangay: str):
    variants = _barangay_variants(requested_barangay)
    condition = Q()
    for variant in variants:
        condition |= Q(barangay_name__iexact=variant)
    return queryset.filter(condition), _canonical_barangay_name(requested_barangay)


def _feature_from_geom(geom, properties):
    return {
        'type': 'Feature',
        'properties': properties,
        'geometry': json.loads(geom.geojson),
    }


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_list(request):
    rows_raw = (
        PimSection.objects.values('barangay_name')
        .annotate(section_count=Count('section_number', distinct=True))
        .order_by('barangay_name')
    )
    grouped = {}
    for row in rows_raw:
        canonical = _canonical_barangay_name(row['barangay_name'])
        grouped[canonical] = grouped.get(canonical, 0) + row['section_count']

    barangays = []
    for canonical, section_count in sorted(grouped.items()):
        barangays.append({
            'name': canonical,
            'section_count': section_count,
            'has_data': section_count > 0,
        })

    return JsonResponse({'barangays': barangays})


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_geojson(request, barangay_name):
    sections_qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)
    sections = (
        sections_qs
        .values('section_number')
        .annotate(geom=Union('geom'))
        .order_by('section_number')
    )
    sections = list(sections)
    if not sections:
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    features = []
    for idx, row in enumerate(sections):
        geom = row.get('geom')
        if geom is None:
            continue
        features.append(
            _feature_from_geom(
                geom,
                {
                    'barangay': canonical_name,
                    'section_number': row['section_number'],
                    'section_color': '#3b82f6',
                },
            )
        )

    if not features:
        return JsonResponse({'error': 'Failed to process section data.'}, status=500)

    return JsonResponse({'type': 'FeatureCollection', 'features': features})


@api_login_required
@require_http_methods(["GET"])
def pim_section_lots_geojson(request, barangay_name, section_number):
    section_base_qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)
    lots_qs = section_base_qs.filter(section_number=section_number).order_by('id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'Section {section_number} not found.'}, status=404)

    enlargement_base_qs, _ = _filter_by_barangay(PimEnlargement.objects, barangay_name)
    section_enlargement_qs = enlargement_base_qs.filter(section_number=section_number)
    section_has_enlargement_file = section_enlargement_qs.exists()

    lots_list = list(lots_qs)
    pins = []
    for row in lots_list:
        props = row.properties or {}
        pin_val = props.get('PIN') or props.get('pin')
        if pin_val:
            pins.append(str(pin_val).strip())
    adj_map = {a.pin: float(a.adjustment_rate) for a in LotAdjustment.objects.filter(pin__in=pins)}

    # Pre-fetch enlargements for this section to override attributes
    enlargement_qs = enlargement_base_qs.filter(section_number=section_number)
    enlargement_map = {}
    for en in enlargement_qs.iterator():
        p = en.properties or {}
        en_pin = str(p.get('pin') or p.get('PIN') or '').strip()
        if en_pin:
            enlargement_map[en_pin] = p

    features = []
    marker_count = 0
    for row in lots_list:
        raw_props = row.properties or {}
        pin_value = str(raw_props.get('pin') or raw_props.get('PIN') or '').strip()
        
        # Unified preparation
        props = _prepare_lot_data(
            raw_props, 
            enlargement_properties=enlargement_map.get(pin_value),
            adj_rate=adj_map.get(pin_value),
            barangay_name=canonical_name,
            color_mode='tax_map',
        )
        
        props['barangay'] = canonical_name
        props['section_number'] = section_number
        
        if props.get('has_enlargement'):
            marker_count += 1
            
        features.append(_feature_from_geom(row.geom, props))

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': canonical_name,
            'section_number': section_number,
            'lot_count': len(features),
            # Keep section-level flag for UI flow:
            # true if either a marker exists in lots or an enlargement file exists.
            'has_enlargement': bool(marker_count > 0 or section_has_enlargement_file),
        },
    }
    return JsonResponse(geojson)


def _get_barangay_parcels_file(barangay_name):
    base_dir = Path(settings.BASE_DIR) / 'maps' / 'static' / 'CAD' / 'Barangay by Parcels'
    if not base_dir.exists():
        return None
    
    # Try exact match
    p = base_dir / f"{barangay_name}.gpkg"
    if p.exists(): return p
    
    # Case-insensitive/slugified search
    requested_slug = re.sub(r'[^a-z0-9]+', '', (barangay_name or '').lower())
    for f in base_dir.glob('*.gpkg'):
        f_slug = re.sub(r'[^a-z0-9]+', '', f.stem.lower())
        if f_slug == requested_slug:
            return f
            
    # Variant-based search
    for v in _barangay_variants(barangay_name):
        v_slug = re.sub(r'[^a-z0-9]+', '', v.lower())
        for f in base_dir.glob('*.gpkg'):
            f_slug = re.sub(r'[^a-z0-9]+', '', f.stem.lower())
            if f_slug == v_slug:
                return f
    return None


@api_login_required
@require_http_methods(["GET"])
def pim_barangay_lots_geojson(request, barangay_name):
    """
    Returns ALL lots for a given barangay (across all sections).
    Used for overlaying lots on the Cadastral Map.
    Now prioritises GPKG source from 'Barangay by Parcels'.
    """
    canonical_name = _canonical_barangay_name(barangay_name)
    gpkg_path = _get_barangay_parcels_file(canonical_name)

    # 1. Try to load from GPKG first
    if (gpkg_path):
        try:
            gdf = gpd.read_file(str(gpkg_path), engine='pyogrio')
            
            # 1. Calculate Area fallback while still in projected (metric) CRS
            if 'Area' not in gdf.columns:
                gdf['Area'] = gdf.geometry.area
            else:
                gdf['Area'] = gdf['Area'].fillna(gdf.geometry.area)

            # 2. Convert to 4326 for GeoJSON output
            if gdf.crs and gdf.crs.to_epsg() != 4326:
                gdf = gdf.to_crs(epsg=4326)

            # Determine color for this barangay
            brgy_color = _get_barangay_color(canonical_name)

            features = []
            for idx, row in gdf.iterrows():
                raw_props = row.drop('geometry').to_dict()
                # Clean NaNs for JSON
                for k, v in raw_props.items():
                    if pd.isna(v): raw_props[k] = v = None
                
                # Normalise and prepare props
                props = _prepare_lot_data(
                    raw_props, 
                    barangay_name=canonical_name,
                    use_assessment_classification=False,
                    color_mode='tax_map'
                )
                
                # Use barangay-specific color for Cadastral Map
                props['color'] = brgy_color

                # Fallback mapping for "Lot Number" to "pin"
                lot_num = raw_props.get('Lot Number')
                has_lot_num = bool(lot_num and not pd.isna(lot_num))

                if not has_lot_num:
                    # For unidentified parcels, we use a placeholder pin to ensure selection works
                    # but hide it in formatting. We use the index as a unique ID.
                    props['pin'] = props['PIN'] = props['lot_no'] = f"UNIDENTIFIED-{idx}"
                    props['is_unidentified'] = True
                    props['area'] = None
                else:
                    if not props.get('pin'):
                        props['pin'] = props['PIN'] = str(lot_num)
                    if not props.get('lot_no'):
                        props['lot_no'] = str(lot_num)
                
                props['barangay'] = canonical_name
                
                geom = row['geometry']
                if geom is None: continue
                
                try:
                    features.append({
                        'type': 'Feature',
                        'properties': props,
                        'geometry': mapping(geom)
                    })
                except Exception as ex:
                    print(f"Geometry mapping error for row {idx}: {ex}")
                    continue

            return JsonResponse({
                'type': 'FeatureCollection',
                'features': features,
                'metadata': {
                    'barangay': canonical_name,
                    'lot_count': len(features),
                    'source': 'gpkg'
                }
            })
        except Exception as e:
            # On error, we allow fallback to DB
            print(f"GPKG load error for {barangay_name}: {e}")

    # 2. Fallback to PostGIS database
    lots_qs, _ = _filter_by_barangay(PimSection.objects, barangay_name)
    lots_qs = lots_qs.order_by('section_number', 'id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'Barangay "{barangay_name}" lots not found.'}, status=404)

    # Fetch all adjustments for these lots at once
    pins = []
    lots_list = list(lots_qs)
    for row in lots_list:
        p = row.properties or {}
        pin = p.get('pin') or p.get('PIN')
        if pin:
            pins.append(str(pin).strip())
    adj_map = {a.pin: float(a.adjustment_rate) for a in LotAdjustment.objects.filter(pin__in=pins)}

    brgy_color = _get_barangay_color(canonical_name)
    features = []
    for row in lots_list:
        raw_props = row.properties or {}
        pin_value = str(raw_props.get('pin') or raw_props.get('PIN') or '').strip()
        
        props = _prepare_lot_data(
            raw_props, 
            adj_rate=adj_map.get(pin_value),
            barangay_name=canonical_name,
            use_assessment_classification=False,
            color_mode='tax_map',
        )
        props['barangay'] = canonical_name
        props['section_number'] = row.section_number
        props['color'] = brgy_color
        
        features.append(_feature_from_geom(row.geom, props))

    return JsonResponse({
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': canonical_name,
            'lot_count': len(features),
            'source': 'database'
        },
    })


@api_login_required
@require_http_methods(["GET"])
def pim_enlargement_geojson(request, barangay_name, section_number):
    enlargement_base_qs, canonical_name = _filter_by_barangay(PimEnlargement.objects, barangay_name)
    lots_qs = enlargement_base_qs.filter(section_number=section_number).order_by('id')

    if not lots_qs.exists():
        return JsonResponse({'error': f'No enlargement for section {section_number}.'}, status=404)

    features = []
    for row in lots_qs:
        raw_props = row.properties or {}
        props = _prepare_lot_data(raw_props, barangay_name=canonical_name, color_mode='tax_map') # No enlargement of an enlargement
        props['barangay'] = canonical_name
        props['section_number'] = section_number
        features.append(_feature_from_geom(row.geom, props))

    geojson = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'barangay': canonical_name,
            'section_number': section_number,
            'lot_count': len(features),
            'is_enlargement': True,
        },
    }
    return JsonResponse(geojson)


@api_login_required
@require_http_methods(["GET"])
def pim_section_list(request, barangay_name):
    section_base_qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)
    sections_qs = (
        section_base_qs
        .values('section_number')
        .annotate(lot_count=Count('id'), filename=Min('source_file'))
        .order_by('section_number')
    )
    sections_qs = list(sections_qs)
    if not sections_qs:
        return JsonResponse({'error': f'Barangay "{barangay_name}" not found.'}, status=404)

    enlargement_base_qs, _ = _filter_by_barangay(PimEnlargement.objects, barangay_name)
    enlargement_sections = set(
        enlargement_base_qs
        .values_list('section_number', flat=True)
        .distinct()
    )

    sections = [
        {
            'number': row['section_number'],
            'lot_count': row['lot_count'],
            'has_enlargement': row['section_number'] in enlargement_sections,
            'filename': row['filename'],
        }
        for row in sections_qs
    ]

    return JsonResponse({
        'barangay': canonical_name,
        'sections': sections,
    })


@csrf_exempt
@api_login_required
@require_http_methods(["POST"])
def pim_lot_adjustment(request):
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        payload = {}

    pin = str(payload.get('pin') or '').strip()
    rate = payload.get('adjustment_rate')
    try:
        rate = float(rate)
    except Exception:
        rate = None

    if not pin:
        return JsonResponse({'error': 'pin is required'}, status=400)
    if rate not in (0.5, 0.75, 1.0):
        return JsonResponse({'error': 'adjustment_rate must be 0.5, 0.75 or 1.0'}, status=400)

    prev = LotAdjustment.objects.filter(pin=pin).first()
    old_rate = float(prev.adjustment_rate) if prev else 1.0

    obj, _ = LotAdjustment.objects.update_or_create(
        pin=pin,
        defaults={'adjustment_rate': rate},
    )

    # Update report cache incrementally for this pin
    try:
        _update_rpt_cache_for_pin(pin, old_rate, rate)
    except Exception:
        pass

    return JsonResponse({'pin': obj.pin, 'adjustment_rate': float(obj.adjustment_rate)})


@api_login_required
@require_http_methods(["GET"])
def pim_lot_search(request):
    """
    Search for a specific lot by barangay and PIN.
    Returns the section number to help navigation.
    """
    barangay_name = (request.GET.get('barangay') or '').strip()
    pin = (request.GET.get('pin') or '').strip()

    if not barangay_name or not pin:
        return JsonResponse({'error': 'Barangay and PIN are required.'}, status=400)

    # Filter queryset by barangay variants
    qs, canonical_name = _filter_by_barangay(PimSection.objects, barangay_name)

    # Exact match search in JSON properties
    lot = qs.filter(Q(properties__pin=pin) | Q(properties__PIN=pin)).first()

    if not lot:
        # Fallback to case-insensitive or partial match if exact fails
        lot = qs.filter(Q(properties__pin__icontains=pin) | Q(properties__PIN__icontains=pin)).first()

    is_enlargement = False
    
    if not lot:
        # Check if the lot is only in PimEnlargement
        en_qs, _ = _filter_by_barangay(PimEnlargement.objects, barangay_name)
        lot = en_qs.filter(Q(properties__pin=pin) | Q(properties__PIN=pin)).first()
        if not lot:
            lot = en_qs.filter(Q(properties__pin__icontains=pin) | Q(properties__PIN__icontains=pin)).first()
        if lot:
            is_enlargement = True

    if not lot:
        return JsonResponse({'error': 'Lot not found in this barangay.'}, status=404)

    return JsonResponse({
        'barangay': canonical_name,
        'section_number': lot.section_number,
        'pin': lot.properties.get('pin') or lot.properties.get('PIN'),
        'is_enlargement': is_enlargement,
    })
