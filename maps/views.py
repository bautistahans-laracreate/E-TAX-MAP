from django.http import JsonResponse
from django.utils import timezone
import json
import os
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from collections import Counter
from django.contrib.gis.db.models.aggregates import Union
from django.contrib.gis.geos import Polygon
from .models import Barangay, Section, Lot, Issue, CadMap, PimBarangayBoundary, PimSection, LotAdjustment


BARANGAY_NAME_MAP = {
    'sta. elena': 'Sta. Elena',
    'sta elena': 'Sta. Elena',
    'santa elena': 'Sta. Elena',
    'sto. nino': 'Sto. Nino',
    'sto nino': 'Sto. Nino',
    'sto niño': 'Sto. Nino',
    'sto. niño': 'Sto. Nino',
    'sto nio': 'Sto. Nino',
    'sto. nio': 'Sto. Nino',
    'santo nino': 'Sto. Nino',
    'santo niño': 'Sto. Nino',
    'ilat': 'Ilat North',
    'natunuan': 'Natunuan South',
    'poblacion': 'Poblacion',
    'poblacion 1': 'Poblacion 1',
    'poblacion 2': 'Poblacion 2',
    'poblacion 3': 'Poblacion 3',
    'poblacion 4': 'Poblacion 4',
}


def _canonical_barangay_name(name: str) -> str:
    key = " ".join((name or '').strip().lower().split())
    return BARANGAY_NAME_MAP.get(key, (name or '').strip())


# Defensive map extent filter: keeps only San Pascual / nearby Batangas data
# so malformed outlier geometries do not break fitBounds in the frontend.
SAN_PASCUAL_BBOX = Polygon.from_bbox((120.0, 13.0, 122.0, 14.5))
SAN_PASCUAL_BBOX.srid = 4326

# Simple in-memory cache for heavy dashboard report
_RPT_REPORT_CACHE = {
    'data': None,
    'ts': None,
}
_RPT_REPORT_TTL_SECONDS = 600
_RPT_REPORT_IN_PROGRESS = False

_RPT_REPORT_CACHE_FILE = os.path.join(
    os.path.dirname(__file__),
    'static',
    'rpt_report_cache.json'
)


def api_login_required(view_func):
    """
    JWT-based authentication decorator.
    Returns JSON 401 if no valid Bearer token is provided.
    """
    from functools import wraps
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        try:
            auth = JWTAuthentication()
            result = auth.authenticate(request)
            if result:
                request.user = result[0]
                return view_func(request, *args, **kwargs)
        except Exception:
            pass
        return JsonResponse({'error': 'Authentication required.'}, status=401)
    return wrapper


@api_login_required
def geojson_data(request):
    """
    Serves municipality-level PIM boundaries from PostGIS.
    """
    try:
        rows = list(
            PimBarangayBoundary.objects.filter(geom__intersects=SAN_PASCUAL_BBOX)
            .values('barangay_name')
            .annotate(geom=Union('geom'))
            .order_by('barangay_name')
        )
        if len(rows) < 10:
            rows = (
                PimSection.objects.filter(geom__intersects=SAN_PASCUAL_BBOX)
                .values('barangay_name')
                .annotate(geom=Union('geom'))
                .order_by('barangay_name')
            )
            rows = list(rows)
        if not rows:
            return JsonResponse({'error': 'No PIM boundaries found.'}, status=404)

        brgy_colors = {b.name.lower(): b.color for b in Barangay.objects.all()}
        by_name = {}
        for row in rows:
            raw_name = row['barangay_name']
            canonical = _canonical_barangay_name(raw_name)
            geom = row.get('geom')
            if geom is None:
                continue
            if canonical in by_name:
                by_name[canonical] = by_name[canonical].union(geom)
            else:
                by_name[canonical] = geom

        features = []
        for canonical_name, geom in by_name.items():
            features.append({
                'type': 'Feature',
                'properties': {
                    'ADM4_EN': canonical_name,
                    'color': brgy_colors.get(canonical_name.lower(), '#3388ff'),
                },
                'geometry': json.loads(geom.geojson),
            })

        return JsonResponse({'type': 'FeatureCollection', 'features': features})
    except Exception as e:
        return JsonResponse({'error': f'Failed to load PIM map: {str(e)}'}, status=500)


@api_login_required
def cad_geojson_data(request):
    """
    Returns CAD overview geometry from PostGIS table cad_maps.
    """
    try:
        rows = (
            CadMap.objects.filter(geom__intersects=SAN_PASCUAL_BBOX)
            .values('barangay_name')
            .annotate(geom=Union('geom'))
            .order_by('barangay_name')
        )
        rows = list(rows)
        if not rows:
            return JsonResponse({'error': 'No CAD data found in PostGIS table cad_maps.'}, status=404)

        brgy_colors = {b.name.lower(): b.color for b in Barangay.objects.all()}
        by_name = {}
        for row in rows:
            raw_name = row['barangay_name']
            canonical = _canonical_barangay_name(raw_name)
            geom = row.get('geom')
            if geom is None:
                continue
            if canonical in by_name:
                by_name[canonical] = by_name[canonical].union(geom)
            else:
                by_name[canonical] = geom

        features = []
        for canonical_name, geom in by_name.items():
            features.append({
                'type': 'Feature',
                'properties': {
                    'ADM4_EN': canonical_name,
                    'color': brgy_colors.get(canonical_name.lower(), '#3388ff'),
                },
                'geometry': json.loads(geom.geojson),
            })

        return JsonResponse({'type': 'FeatureCollection', 'features': features})
    except Exception as e:
        return JsonResponse({'error': f'CAD processing failed: {str(e)}'}, status=500)


@api_login_required
def dashboard_lots_geojson(request):
    """
    Serves lot-level geometry and assessment-based classification for the dashboard.
    The output uses the same class-inclusion logic as the assessment table:
    positive area plus a matching SMV unit value for that lot/class.
    """
    try:
        from .pim_views import (
            _prepare_lot_data,
            _canonical_barangay_name as pim_canonical_barangay_name
        )
        from .models import PimEnlargement, LotAdjustment
        
        lots = list(
            PimSection.objects
            .filter(geom__intersects=SAN_PASCUAL_BBOX)
            .only('properties', 'geom', 'barangay_name', 'section_number')
        )
        
        enlargements = PimEnlargement.objects.filter(geom__intersects=SAN_PASCUAL_BBOX).only('properties')
        enlargement_map = {}
        for en in enlargements.iterator():
            p = en.properties or {}
            pin = p.get('pin') or p.get('PIN')
            if pin:
                enlargement_map[str(pin).strip()] = p

        pins = []
        for lot in lots:
            p = lot.properties or {}
            pin = p.get('pin') or p.get('PIN')
            if pin:
                pins.append(str(pin).strip())
        adj_map = {a.pin: float(a.adjustment_rate) for a in LotAdjustment.objects.filter(pin__in=pins)}

        features = []
        for lot in lots:
            raw_props = lot.properties or {}
            pin = str(raw_props.get('pin') or raw_props.get('PIN') or '').strip()
            barangay = pim_canonical_barangay_name(lot.barangay_name)

            cleaned_props = _prepare_lot_data(
                raw_props,
                enlargement_properties=enlargement_map.get(pin),
                adj_rate=adj_map.get(pin),
                barangay_name=barangay,
                use_assessment_classification=False,
                color_mode='dashboard',
            )

            cleaned_props['barangay'] = barangay
            cleaned_props['section_number'] = lot.section_number

            features.append({
                'type': 'Feature',
                'properties': cleaned_props,
                'geometry': json.loads(lot.geom.geojson),
            })

        return JsonResponse({'type': 'FeatureCollection', 'features': features})
    except Exception as e:
        return JsonResponse({'error': f'Failed to load lot geometries: {str(e)}'}, status=500)




# ── Dashboard API Views ────────────────────────────────────────────────────


@api_login_required
@require_http_methods(["GET"])
def dashboard_stats(request):
    """Return totals for barangays, sections, lots, and issues (if staff)."""
    total_barangays = Barangay.objects.count()
    total_sections = Section.objects.count()
    total_lots = Lot.objects.count()

    data = {
        'total_barangays': total_barangays,
        'total_sections': total_sections,
        'total_lots': total_lots,
    }

    # Only include issue count for staff
    if request.user.is_staff:
        total_issues = Issue.objects.filter(status='unsolved').count()
        data['total_issues'] = total_issues

    return JsonResponse(data)


@api_login_required
@require_http_methods(["GET"])
def dashboard_landuse(request):
    """Return land-use distribution data for charts."""
    lots = Lot.objects.all()

    # Count each unique land-use combination
    use_counter = Counter()
    for lot in lots:
        uses = lot.land_use if lot.land_use else []
        key = " + ".join(sorted(uses)) if uses else "Unclassified"
        use_counter[key] += 1

    # Sort by count descending
    labels: list[str] = []
    values: list[int] = []
    for label, count in use_counter.most_common():
        labels.append(label)
        values.append(count)

    return JsonResponse({
        'labels': labels,
        'values': values,
    })


@api_login_required
@require_http_methods(["GET"])
def dashboard_issues(request):
    """Admin only: return list of issues."""
    if not request.user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    # Filter out solved issues older than 1 minute
    one_min_ago = timezone.now() - timezone.timedelta(minutes=1)
    Issue.objects.filter(status='solved', solved_at__lte=one_min_ago).delete()

    issues = Issue.objects.all().values('id', 'description', 'status', 'solved_at', 'created_at')
    return JsonResponse({'issues': list(issues)})


@require_http_methods(["GET"])
def dashboard_rpt_report(request):
    """
    Report-style dashboard data:
    - RPT totals by land classification
    - Per-barangay assessment summary table
    """
    from .pim_views import _normalise_properties, _load_smv_cache, _canonical_barangay_name as pim_canonical_barangay_name

    global _RPT_REPORT_IN_PROGRESS

    # Always return disk cache immediately if it exists (fast path)
    if os.path.exists(_RPT_REPORT_CACHE_FILE):
        try:
            with open(_RPT_REPORT_CACHE_FILE, 'r', encoding='utf-8') as f:
                cached_payload = json.load(f)
            if cached_payload:
                return JsonResponse(cached_payload)
        except Exception:
            pass


    def compute_payload():
        # Default adjustment (no dirt-road attribute in dataset)
        default_adjustment = 1.0
        tax_rate = 0.02

        # Serve cached result when fresh
        now_local = timezone.now()
        if _RPT_REPORT_CACHE['data'] and _RPT_REPORT_CACHE['ts']:
            age = (now_local - _RPT_REPORT_CACHE['ts']).total_seconds()
            if age < _RPT_REPORT_TTL_SECONDS:
                return _RPT_REPORT_CACHE['data']

        class_meta = {
            'res': {'label': 'Residential', 'area_key': 'area_res', 'assessment_level': 0.05},
            'agri': {'label': 'Agriculture', 'area_key': 'area_agri', 'assessment_level': 0.06},

            'comml': {'label': 'Commercial', 'area_key': 'area_comml', 'assessment_level': 0.25},
            'indl': {'label': 'Industrial', 'area_key': 'area_indl', 'assessment_level': 0.45},
        }

        # Aggregates
        rpt_by_class = {k: 0.0 for k in class_meta.keys()}
        barangay_rows = {}
        adj_map = {a.pin: float(a.adjustment_rate) for a in LotAdjustment.objects.all()}

        def safe_num(value):
            try:
                if value is None:
                    return 0.0
                return float(value)
            except Exception:
                return 0.0

        # Iterate lots from PIM table (authoritative attributes)
        qs = PimSection.objects.values('barangay_name', 'properties')
        for row in qs.iterator():
            props = _normalise_properties(row.get('properties') or {})
            pin = props.get('pin') or props.get('PIN')
            if not pin:
                continue
            pin = str(pin).strip()
            if not pin:
                continue

            barangay = pim_canonical_barangay_name(row.get('barangay_name') or '')
            if not barangay:
                continue

            # Prep barangay accumulator
            if barangay not in barangay_rows:
                barangay_rows[barangay] = {
                    'barangay': barangay,
                    'counts': {'agri': 0, 'res': 0, 'indl': 0, 'comml': 0},
                    'market_value': 0.0,
                    'assessed_value': 0.0,
                    'tax_due': 0.0,
                }

            # Compute per-class values for this lot
            per_lot_market = 0.0
            per_lot_assessed = 0.0

            lot_adjustment = adj_map.get(pin, default_adjustment)

            for class_key, meta in class_meta.items():
                area = safe_num(props.get(meta['area_key']))
                if area <= 0:
                    continue
                smv = _load_smv_cache(barangay, class_key)
                unit_val = safe_num(smv.get(pin, {}).get('unit_value'))
                if unit_val <= 0:
                    continue
                market = area * unit_val * lot_adjustment
                assessed = market * meta['assessment_level']

                per_lot_market += market
                per_lot_assessed += assessed

                rpt_by_class[class_key] += assessed * tax_rate
                barangay_rows[barangay]['counts'][class_key] += 1

            if per_lot_market > 0 or per_lot_assessed > 0:
                barangay_rows[barangay]['market_value'] += per_lot_market
                barangay_rows[barangay]['assessed_value'] += per_lot_assessed
                barangay_rows[barangay]['tax_due'] += (per_lot_assessed * tax_rate)

        # Build response
        order = ['indl', 'comml', 'res', 'agri']
        rpt_list = [
            {
                'key': key,
                'label': class_meta[key]['label'].upper(),
                'amount': round(rpt_by_class[key], 2),
            }
            for key in order
        ]

        rows = sorted(barangay_rows.values(), key=lambda r: r['barangay'])
        totals = {
            'barangay': 'Total',
            'counts': {
                'agri': sum(r['counts']['agri'] for r in rows),
                'res': sum(r['counts']['res'] for r in rows),
                'indl': sum(r['counts']['indl'] for r in rows),
                'comml': sum(r['counts']['comml'] for r in rows),
            },
            'market_value': round(sum(r['market_value'] for r in rows), 2),
            'assessed_value': round(sum(r['assessed_value'] for r in rows), 2),
            'tax_due': round(sum(r['tax_due'] for r in rows), 2),
        }

        payload_local = {
            'as_of_year': timezone.now().year,
            'rpt_by_class': rpt_list,
            'assessment_table': {
                'rows': rows,
                'totals': totals,
            },
            'notes': 'Only parcels with complete data are included.',
        }

        _RPT_REPORT_CACHE['data'] = payload_local
        _RPT_REPORT_CACHE['ts'] = now_local
        try:
            os.makedirs(os.path.dirname(_RPT_REPORT_CACHE_FILE), exist_ok=True)
            with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(payload_local, f)
        except Exception:
            pass

        return payload_local

    def build_rpt_report_payload():
        return compute_payload()

    if request.GET.get('sync') == '1':
        payload = build_rpt_report_payload()
        return JsonResponse(payload)

    if not _RPT_REPORT_IN_PROGRESS:
        _RPT_REPORT_IN_PROGRESS = True
        try:
            import threading
            def _build_report_async():
                try:
                    build_rpt_report_payload()
                except Exception as e:
                    try:
                        error_payload = {
                            'as_of_year': timezone.now().year,
                            'rpt_by_class': [],
                            'assessment_table': { 'rows': [], 'totals': None },
                            'notes': 'Report generation failed. Please refresh or try sync mode.',
                            'status': 'error',
                            'error': str(e),
                        }
                        os.makedirs(os.path.dirname(_RPT_REPORT_CACHE_FILE), exist_ok=True)
                        with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
                            json.dump(error_payload, f)
                        _RPT_REPORT_CACHE['data'] = error_payload
                        _RPT_REPORT_CACHE['ts'] = timezone.now()
                    except Exception:
                        pass
                finally:
                    global _RPT_REPORT_IN_PROGRESS
                    _RPT_REPORT_IN_PROGRESS = False
            threading.Thread(target=_build_report_async, daemon=True).start()
        except Exception:
            _RPT_REPORT_IN_PROGRESS = False

    return JsonResponse({
        'as_of_year': timezone.now().year,
        'rpt_by_class': [],
        'assessment_table': { 'rows': [], 'totals': None },
        'notes': 'Report is generating. Please refresh in a moment.',
        'status': 'generating',
    })


def build_rpt_report_cache():
    """
    Precompute and persist the RPT report cache to disk.
    """
    from .pim_views import _normalise_properties, _load_smv_cache, _canonical_barangay_name as pim_canonical_barangay_name

    # Reuse the report builder logic from dashboard_rpt_report
    default_adjustment = 1.0
    tax_rate = 0.02

    class_meta = {
        'res': {'label': 'Residential', 'area_key': 'area_res', 'assessment_level': 0.05},
        'agri': {'label': 'Agricultural', 'area_key': 'area_agri', 'assessment_level': 0.06},
        'comml': {'label': 'Commercial', 'area_key': 'area_comml', 'assessment_level': 0.25},
        'indl': {'label': 'Industrial', 'area_key': 'area_indl', 'assessment_level': 0.45},
    }

    rpt_by_class = {k: 0.0 for k in class_meta.keys()}
    barangay_rows = {}

    def safe_num(value):
        try:
            if value is None:
                return 0.0
            return float(value)
        except Exception:
            return 0.0

    qs = PimSection.objects.values('barangay_name', 'properties')
    for row in qs.iterator():
        props = _normalise_properties(row.get('properties') or {})
        pin = props.get('pin') or props.get('PIN')
        if not pin:
            continue
        pin = str(pin).strip()
        if not pin:
            continue

        barangay = pim_canonical_barangay_name(row.get('barangay_name') or '')
        if not barangay:
            continue

        if barangay not in barangay_rows:
            barangay_rows[barangay] = {
                'barangay': barangay,
                'counts': {'agri': 0, 'res': 0, 'indl': 0, 'comml': 0},
                'market_value': 0.0,
                'assessed_value': 0.0,
                'tax_due': 0.0,
            }

        per_lot_market = 0.0
        per_lot_assessed = 0.0

        for class_key, meta in class_meta.items():
            area = safe_num(props.get(meta['area_key']))
            if area <= 0:
                continue
            smv = _load_smv_cache(barangay, class_key)
            unit_val = safe_num(smv.get(pin, {}).get('unit_value'))
            if unit_val <= 0:
                continue

            market = area * unit_val * default_adjustment
            assessed = market * meta['assessment_level']

            per_lot_market += market
            per_lot_assessed += assessed

            rpt_by_class[class_key] += assessed * tax_rate
            barangay_rows[barangay]['counts'][class_key] += 1

        if per_lot_market > 0 or per_lot_assessed > 0:
            barangay_rows[barangay]['market_value'] += per_lot_market
            barangay_rows[barangay]['assessed_value'] += per_lot_assessed
            barangay_rows[barangay]['tax_due'] += (per_lot_assessed * tax_rate)

    order = ['indl', 'comml', 'res', 'agri']
    rpt_list = [
        {
            'key': key,
            'label': class_meta[key]['label'].upper(),
            'amount': round(rpt_by_class[key], 2),
        }
        for key in order
    ]

    rows = sorted(barangay_rows.values(), key=lambda r: r['barangay'])
    totals = {
        'barangay': 'Total',
        'counts': {
            'agri': sum(r['counts']['agri'] for r in rows),
            'res': sum(r['counts']['res'] for r in rows),
            'indl': sum(r['counts']['indl'] for r in rows),
            'comml': sum(r['counts']['comml'] for r in rows),
        },
        'market_value': round(sum(r['market_value'] for r in rows), 2),
        'assessed_value': round(sum(r['assessed_value'] for r in rows), 2),
        'tax_due': round(sum(r['tax_due'] for r in rows), 2),
    }

    payload = {
        'as_of_year': timezone.now().year,
        'rpt_by_class': rpt_list,
        'assessment_table': {
            'rows': rows,
            'totals': totals,
        },
        'notes': 'Only parcels with complete data are included.',
    }

    _RPT_REPORT_CACHE['data'] = payload
    _RPT_REPORT_CACHE['ts'] = timezone.now()
    try:
        os.makedirs(os.path.dirname(_RPT_REPORT_CACHE_FILE), exist_ok=True)
        with open(_RPT_REPORT_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(payload, f)
    except Exception:
        pass

    return payload


@csrf_exempt
@api_login_required
@require_http_methods(["POST"])
def mark_issue_solved(request, issue_id):
    """Admin only: mark an issue as solved."""
    if not request.user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    try:
        issue = Issue.objects.get(id=issue_id)
    except Issue.DoesNotExist:
        return JsonResponse({'error': 'Issue not found.'}, status=404)

    issue.status = 'solved'
    issue.solved_at = timezone.now()
    issue.save()
    return JsonResponse({'success': True, 'id': issue.id, 'status': 'solved'})


@api_login_required
@require_http_methods(["GET"])
def barangay_list(request):
    """Return list of all barangays with their colors (for CAD legend)."""
    barangays = list(Barangay.objects.values('id', 'name', 'color'))
    return JsonResponse({'barangays': barangays})


@api_login_required
@require_http_methods(["GET"])
def barangay_sections(request, barangay_id):
    """Return sections for a barangay."""
    try:
        brgy = Barangay.objects.get(id=barangay_id)
    except Barangay.DoesNotExist:
        return JsonResponse({'error': 'Barangay not found.'}, status=404)

    sections = list(Section.objects.filter(barangay=brgy).values('id', 'number'))
    return JsonResponse({
        'barangay': brgy.name,
        'sections': sections,
    })


@api_login_required
@require_http_methods(["GET"])
def section_lots(request, section_id):
    """Return lots for a section. Admin sees full details, user sees limited."""
    try:
        section = Section.objects.select_related('barangay').get(id=section_id)
    except Section.DoesNotExist:
        return JsonResponse({'error': 'Section not found.'}, status=404)

    lots_qs = Lot.objects.filter(section=section)

    if request.user.is_staff:
        lots = list(lots_qs.values(
            'id', 'lot_number', 'owner', 'address', 'pin',
            'market_value', 'assessment_value', 'rpt', 'land_use', 'area_sqm'
        ))
    else:
        # Users only see PIN, Area, Landuse
        lots = list(lots_qs.values('id', 'lot_number', 'pin', 'land_use', 'area_sqm'))

    return JsonResponse({
        'municipality': 'San Pascual, Batangas',
        'barangay': section.barangay.name,
        'section_number': section.number,
        'lots': lots,
    })


@api_login_required
@require_http_methods(["GET"])
def lot_details_by_pin(request, pin):
    """
    Returns full normalized properties for a lot by its PIN.
    """
    try:
        from .pim_views import _normalise_properties, _has_enlargement_marker
        from django.db.models import Q
        
        # Search in PimSection by PIN
        lot = PimSection.objects.filter(Q(properties__pin=pin) | Q(properties__PIN=pin)).first()
        if not lot:
            return JsonResponse({'error': 'Lot not found.'}, status=404)
        
        props = _normalise_properties(lot.properties)
        props['barangay'] = lot.barangay_name
        props['section_number'] = lot.section_number
        props['has_enlargement'] = _has_enlargement_marker(lot.properties)
        
        return JsonResponse(props)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


