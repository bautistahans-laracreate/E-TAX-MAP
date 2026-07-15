import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { apiGet } from './api';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MAIN_COLORS = {
  agri: '#22c55e',
  comml: '#fbbf24',
  indl: '#3b82f6',
  res: '#ef4444',
};

function getMapFitOptions(mapSize) {
  if (typeof window !== 'undefined' && window.innerWidth <= 760) {
    return {
      paddingTopLeft: [28, 28],
      paddingBottomRight: [28, 28],
      maxZoom: 15,
    };
  }

  const width = mapSize?.x || 0;
  const height = mapSize?.y || 0;
  const leftInset = Math.max(170, Math.round(width * 0.2));
  const rightInset = Math.max(32, Math.round(width * 0.04));
  const topInset = Math.max(26, Math.round(height * 0.03));
  const bottomInset = Math.max(96, Math.round(height * 0.13));

  return {
    paddingTopLeft: [leftInset, topInset],
    paddingBottomRight: [rightInset, bottomInset],
    maxZoom: 16,
  };
}

const pieCalloutPlugin = {
  id: 'pieCalloutPlugin',
  afterDatasetsDraw(chart) {
    if (chart.config.type !== 'pie') return;

    const dataset = chart.data.datasets?.[0];
    const meta = chart.getDatasetMeta(0);
    if (!dataset || !meta?.data?.length) return;

    const total = dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
    if (!total) return;

    const { ctx, width } = chart;
    const baseFont = ChartJS.defaults.font.family || "'Plus Jakarta Sans', sans-serif";
    const decimalPlaces = chart?.options?.plugins?.pieCalloutPlugin?.decimalPlaces ?? 2;

    ctx.save();
    ctx.font = `800 12px ${baseFont}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2.5;

    // Collect all callout info for conflict resolution
    const callouts = [];
    meta.data.forEach((arc, index) => {
      const value = Number(dataset.data[index] || 0);
      if (!value) return;

      const p = (value / total) * 100;
      const percentageText = p.toFixed(decimalPlaces) + '%';
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const color = (Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index] : dataset.backgroundColor);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      const startX = arc.x + dirX * (arc.outerRadius - 1);
      const startY = arc.y + dirY * (arc.outerRadius - 1);
      const elbowX = arc.x + dirX * (arc.outerRadius + 14);
      const elbowY = arc.y + dirY * (arc.outerRadius + 14);

      const textWidth = ctx.measureText(percentageText).width;
      const boxWidth = textWidth + 18;
      const boxHeight = 26;

      callouts.push({
        angle, dirX, dirY, startX, startY, elbowX, elbowY,
        percentageText, color, boxWidth, boxHeight,
        isRight: dirX >= 0,
        sortY: elbowY
      });
    });

    // Sort by Y and resolve overlaps
    callouts.sort((a, b) => a.sortY - b.sortY);
    const minGap = 28;
    for (let i = 1; i < callouts.length; i++) {
      if (callouts[i].elbowY - callouts[i - 1].elbowY < minGap) {
        callouts[i].elbowY = callouts[i - 1].elbowY + minGap;
      }
    }

    callouts.forEach((c) => {
      const { startX, startY, elbowX, elbowY, percentageText, color, boxWidth, boxHeight, isRight } = c;
      const rawEndX = elbowX + (isRight ? 20 : -20);
      const unclampedBoxX = isRight ? rawEndX : rawEndX - boxWidth;
      const boxX = Math.min(Math.max(16, unclampedBoxX), width - boxWidth - 16);
      const boxY = elbowY - boxHeight / 2;
      const lineEndX = isRight ? boxX : boxX + boxWidth;

      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(lineEndX, elbowY);
      ctx.stroke();

      // Draw the box
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 4;
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.shadowBlur = 0;

      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

      // Arrow head
      ctx.fillStyle = color;
      ctx.beginPath();
      if (isRight) {
        ctx.moveTo(lineEndX + 4, elbowY);
        ctx.lineTo(lineEndX - 4, elbowY - 3);
        ctx.lineTo(lineEndX - 4, elbowY + 3);
      } else {
        ctx.moveTo(lineEndX - 4, elbowY);
        ctx.lineTo(lineEndX + 4, elbowY - 3);
        ctx.lineTo(lineEndX + 4, elbowY + 3);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = color;
      ctx.fillText(percentageText, boxX + boxWidth / 2, elbowY);
    });

    ctx.restore();
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels,
  pieCalloutPlugin
);

const fmtMoney = (value) =>
  `P${Math.abs(Number(value || 0)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const safeNum = (value) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

function getLotAreaValues(props = {}) {
  return {
    agri: safeNum(props.area_agri),
    comml: safeNum(props.area_comml ?? props.area_commml),
    indl: safeNum(props.area_indl ?? props.area_ind),
    res: safeNum(props.area_res),
  };
}

function getDominantLotClass(props = {}) {
  const areaValues = getLotAreaValues(props);
  return ['agri', 'res', 'indl', 'comml'].reduce((best, key) => {
    const bestValue = areaValues[best] || 0;
    const nextValue = areaValues[key] || 0;
    return nextValue > bestValue ? key : best;
  }, 'agri');
}

function getLotStyle(props, hoveredPin, selectedPin) {
  const areaValues = getLotAreaValues(props);
  const dominantClass = getDominantLotClass(props);
  const dominantValue = areaValues[dominantClass] || 0;
  const pin = String(props?.pin || '');
  const isHovered = hoveredPin && hoveredPin === pin;
  const isSelected = selectedPin && selectedPin === pin;
  const fillColor = props?.color || (dominantValue > 0 ? MAIN_COLORS[dominantClass] : '#ff00ff');
  const hasExplicitColor = Boolean(props?.color) || dominantValue > 0;
  const yellowFill = '#fde047';

  return {
    fillColor: isSelected ? yellowFill : fillColor,
    fillOpacity: isSelected ? 0.95 : (hasExplicitColor ? (isHovered ? 0.95 : 0.85) : (isHovered ? 0.45 : 0.25)),
    color: isSelected ? fillColor : (isHovered ? '#ffffff' : '#f8fafc'),
    weight: isSelected ? 6 : (isHovered ? 2.2 : 0.8),
    opacity: 1,
  };
}

function getSpecialLotMeaning(props = {}) {
  const colorKey = String(props.color_key || props.dashboard_color_key || '').toUpperCase();
  if (colorKey === 'UNCLASSIFIED') {
    return { tone: 'pink', text: 'Pink means this parcel has no usable land classification data yet.' };
  }
  if (colorKey === 'EXEMPT') {
    return { tone: 'gray', text: 'Gray means this parcel is tagged as exempt.' };
  }
  return null;
}

function formatArea(value) {
  return safeNum(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function normalizeBarangay(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePin(value) {
  return String(value || '').trim().toLowerCase();
}

function MapControls({ onCenter }) {
  const map = useMap();

  return (
    <div className="custom-map-controls">
      <div className="zoom-group">
        <button className="map-btn" onClick={() => map.zoomIn()}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="3" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className="map-btn" onClick={() => map.zoomOut()}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="3" fill="none">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <button className="map-btn center-btn" onClick={onCenter}>
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function LotMapContent({
  geoData,
  hoveredLotPin,
  selectedLotPin,
  onHoverLot,
  onSelectLot,
  geoRef,
}) {
  const map = useMap();

  const fitToVisibleMap = () => {
    if (!geoData?.features?.length) return;
    const bounds = geoRef.current?.getBounds?.();
    if (bounds?.isValid?.()) {
      map.fitBounds(bounds, getMapFitOptions(map.getSize()));
    }
  };

  useEffect(() => {
    if (map.zoomControl) map.zoomControl.remove();
    setTimeout(() => map.invalidateSize(), 200);
  }, [map]);

  useEffect(() => {
    fitToVisibleMap();
  }, [geoData, map, geoRef]);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
      fitToVisibleMap();
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        map.invalidateSize();
        fitToVisibleMap();
      })
      : null;

    const mapContainer = map.getContainer();
    if (resizeObserver && mapContainer?.parentElement) {
      resizeObserver.observe(mapContainer.parentElement);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [map, geoData]);

  const onEachFeature = (feature, layer) => {
    const props = feature.properties || {};
    const pin = String(props.pin || '').trim();

    layer.bindTooltip(pin ? `Lot ${pin}` : 'Lot', { sticky: true, opacity: 0.95 });
    layer.on('mouseover', () => {
      onHoverLot(props);
      layer.setStyle(getLotStyle(props, pin, selectedLotPin));
    });
    layer.on('mouseout', () => {
      onHoverLot(null);
      layer.setStyle(getLotStyle(props, null, selectedLotPin));
    });
    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      onSelectLot(props);
      const bounds = layer.getBounds();
      if (bounds?.isValid()) {
        map.flyToBounds(bounds, { padding: [80, 80], duration: 1.2, maxZoom: 18 });
      }
    });
  };

  const style = (feature) => getLotStyle(feature.properties || {}, hoveredLotPin, selectedLotPin);

  return geoData ? (
    <>
      <TileLayer url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" subdomains={['mt0', 'mt1', 'mt2', 'mt3']} />
      <GeoJSON
        key="lots-layer"
        ref={geoRef}
        data={geoData}
        onEachFeature={onEachFeature}
        style={style}
        renderer={L.canvas()}
      />
    </>
  ) : null;
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  .dash-root { font-family: 'Plus Jakarta Sans', sans-serif; background: #f1f5f9; display: flex; flex-direction: column; height: 100%; overflow-y: auto; color: #0f172a; padding: 2rem 0 2rem 0; position: relative; scrollbar-gutter: stable; }
  .dash-title-block { text-align: center; margin-bottom: 1rem; }
  .dash-title-block h1 { font-family: 'Playfair Display', serif; font-size: 2.22rem; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; margin: 0; }
  .dash-title-block p { font-size: 0.85rem; font-weight: 700; color: #64748b; letter-spacing: 0.1em; margin-top: 0.25rem; }
  .dash-main-container { display: flex; flex-direction: column; gap: 1.4rem; width: 100%; max-width: 1600px; margin: 0 auto; padding-right: 2rem; box-sizing: border-box; }
  .dash-upper-section { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(22rem, 0.8fr); gap: 1.4rem; align-items: stretch; }
  .dash-map-stage { display: flex; flex-grow: 1; }
  .dash-map-panel { position: relative; background: #fff; border-radius: 1rem; border: 1px solid #dce7f4; overflow: hidden; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); flex-grow: 1; min-height: 44rem; }
  .dash-left-overlays {
    position: absolute;
    top: 0.8rem;
    left: 0.8rem;
    bottom: 0.8rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: 18.5rem;
    pointer-events: none;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 0.4rem;
  }
  .dash-left-overlays::-webkit-scrollbar { width: 4px; }
  .dash-left-overlays::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
  .dash-left-overlays > * {
    pointer-events: auto;
    flex-shrink: 0;
  }
  .dash-map-summary,
  .dash-floating-chart,
  .dash-left-floating-chart {
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(8px);
    border-radius: 0.8rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid #dce7f4;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
    width: 100%;
    box-sizing: border-box;
    position: relative;
  }
  .dash-map-summary h3 { margin: 0; font-size: 0.9rem; font-weight: 800; color: #16345c; line-height: 1.2; }
  .dash-map-summary p { margin: 0.25rem 0 0.5rem; font-size: 0.65rem; color: #6b7f99; line-height: 1.3; }
  .dash-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.4rem; }
  .dash-summary-pill { background: #ffffff; border: 2px solid #dde8f3; border-radius: 0.6rem; padding: 0.4rem 0.5rem; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
  .dash-summary-pill:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12); }
  .dash-summary-pill label { display: block; font-size: 0.54rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.15rem; line-height: 1.1; white-space: normal; overflow: visible; text-overflow: clip; min-height: 1.2rem; }
  .dash-summary-pill strong { font-size: 0.8rem; word-break: normal; line-height: 1; display: block; margin-top: 0.1rem; }
  .dash-summary-value { border-top: 1px solid #e5eef6; padding-top: 0.65rem; margin-top: 0.65rem; display: grid; gap: 0.5rem; }
  .dash-summary-row { display: flex; justify-content: space-between; gap: 0.9rem; align-items: center; }
  .dash-summary-row span { font-size: 0.54rem; font-weight: 800; color: #71839a; letter-spacing: 0.08em; text-transform: uppercase; }
  .dash-summary-row strong { font-size: 0.68rem; color: #102c53; text-align: right; }
  .dash-chart-caption { font-size: 0.64rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.4rem; }
  .dash-side-panel { display: flex; flex-direction: column; gap: 1rem; }
  .dash-card { background: #fff; border-radius: 1rem; border: 1px solid #dce7f4; padding: 1rem; display: flex; flex-direction: column; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
  .dash-card-title { font-size: 0.74rem; font-weight: 800; color: #526783; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.8rem; }
  .dash-pie-area { position: relative; min-height: 15rem; }
  .dash-signifies { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #ecf2f8; }
  .dash-signifies-title { font-size: 0.7rem; font-weight: 800; color: #526783; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.7rem; }
  .dash-signifies-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem 1rem; }
  .dash-signifies-item { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  .dash-signifies-swatch { width: 0.8rem; height: 0.8rem; border-radius: 0.24rem; flex-shrink: 0; }
  .dash-signifies-name { font-size: 0.82rem; font-weight: 700; color: #133661; }
  .dash-breakdown-list { display: grid; gap: 0.65rem; }
  .dash-breakdown-item { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-bottom: 0.65rem; border-bottom: 1px solid #ecf2f8; }
  .dash-breakdown-item:last-child { border-bottom: none; padding-bottom: 0; }
  .dash-breakdown-label { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
  .dash-breakdown-dot { width: 0.64rem; height: 0.64rem; border-radius: 0.2rem; flex-shrink: 0; }
  .dash-breakdown-name { font-size: 0.88rem; font-weight: 800; color: #133661; }
  .dash-breakdown-amount { font-size: 0.9rem; font-weight: 800; color: #133661; text-align: right; white-space: nowrap; }
  .dash-assessment-section { background: transparent; border-radius: 1rem; overflow: visible; box-shadow: none; }
  .dash-assessment-header { text-align: center; padding: 0.5rem 1.5rem 1.5rem; }
  .dash-assessment-header h2 { margin: 0; font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 900; letter-spacing: 0.06em; color: #17386b; text-transform: uppercase; }
  .dash-assessment-header p { margin: 0.35rem 0 0; font-size: 0.88rem; font-weight: 700; letter-spacing: 0.12em; color: #526785; text-transform: uppercase; }
  .dash-table-shell { background: #ffffff; border-radius: 1rem; overflow: hidden; border: 1px solid #d8e6f5; box-shadow: 0 12px 30px rgba(30, 58, 95, 0.08); }
  .dash-table-scroll { overflow-x: auto; }
  .dash-full-table { width: 100%; min-width: 980px; border-collapse: collapse; }
  .dash-full-table thead th { text-transform: uppercase; letter-spacing: 0.08em; }
  .dash-full-table thead tr:first-child th { background: #93c8ed; color: #051b3c; font-size: 0.82rem; font-weight: 800; padding: 0.9rem 0.95rem; border: 1px solid rgba(255,255,255,0.18); }
  .dash-full-table thead tr:nth-child(2) th { background: #63aee0; color: #051b3c; font-size: 0.76rem; font-weight: 800; padding: 0.75rem 0.8rem; border: 1px solid rgba(255,255,255,0.18); }
  .dash-full-table thead th:first-child { text-align: left; }
  .dash-full-table td { padding: 0.95rem 0.9rem; font-size: 0.95rem; border-bottom: 1px solid #d5e2ef; color: #0f2a52; }
  .dash-full-table tbody tr:last-child td { border-bottom: none; }
  .dash-full-table tbody td:first-child { font-weight: 700; }
  .dash-full-table tbody tr.selected-row { background: #eef7ff; }
  .dash-full-table tbody td.numeric, .dash-full-table tfoot td.numeric { text-align: center; }
  .dash-full-table tbody td.money, .dash-full-table tfoot td.money { text-align: right; font-weight: 700; }
  .dash-full-table tbody tr:hover { background: #f6fbff; }
  .dash-full-table tfoot td { background: #9ecdee; color: #06224c; font-size: 1rem; font-weight: 800; padding: 1rem 0.95rem; border-top: 2px solid #27588a; }
  .dash-full-table tfoot td:first-child { font-size: 1.08rem; }
  .dash-assessment-note { margin-top: 0.9rem; color: #1f3b63; font-size: 0.92rem; }
  .dash-assessment-note span { color: #c62828; font-weight: 800; }
  .custom-map-controls { position: absolute; top: 1.2rem; right: 1.2rem; display: flex; flex-direction: column; gap: 1rem; z-index: 1000; }
  .zoom-group { background: #ffffff; border-radius: 1rem; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 8px 30px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; }
  .map-btn { width: 3.25rem; height: 3.25rem; background: #ffffff; color: #1e293b; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .zoom-group .map-btn:first-child { border-bottom: 1px solid #f1f5f9; }
  .map-btn:hover { background: #f8fafc; color: #3b82f6; }
  .center-btn { background: #ffffff; border-radius: 1rem; box-shadow: 0 8px 30px rgba(0,0,0,0.12); border: 1px solid #e2e8f0; }
  @media (max-width: 1180px) {
    .dash-root { padding: 1.2rem 0 1.4rem 1rem; }
    .dash-main-container { width: calc(100% - 1rem); padding-right: 1rem; }
    .dash-upper-section { grid-template-columns: 1fr; }
    .dash-map-panel { min-height: 34rem; height: 34rem; }
  }
  @media (max-width: 760px) {
    .dash-left-overlays { position: static; width: auto; margin: 1rem; display: block; overflow-y: visible; }
    .dash-map-summary { position: static; width: auto; margin-bottom: 1rem; }
    .dash-floating-chart { position: static; width: auto; margin-bottom: 1rem; }
    .dash-left-floating-chart { position: static; width: auto; margin-bottom: 1rem; }
    .custom-map-controls { top: auto; bottom: 1rem; transform: none; }
    .dash-assessment-header h2 { font-size: 1.55rem; }
    .dash-pie-area { min-height: 17rem; }
    .dash-signifies-list { grid-template-columns: 1fr; }
  }
  .dash-no-data-msg {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    color: #94a3b8;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    text-align: center;
  }
`;

export default function MainDashboard({ searchBrgy = '', searchPin = '' }) {
  const [report, setReport] = useState(null);
  const [lotGeo, setLotGeo] = useState(null);
  const [selectedBarangay, setSelectedBarangay] = useState(null);
  const [hoveredLot, setHoveredLot] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const geoRef = useRef(null);

  useEffect(() => {
    apiGet('/api/dashboard/rpt-report/').then((r) => r.json()).then(setReport);
    apiGet('/api/dashboard/lots-geojson/').then((r) => r.json()).then(setLotGeo);
  }, []);

  const rows = report?.assessment_table?.rows || [];

  useEffect(() => {
    if (!selectedBarangay && rows.length) {
      setSelectedBarangay(rows[0]);
    }
  }, [rows, selectedBarangay]);

  useEffect(() => {
    if (!lotGeo?.features?.length || !geoRef.current?._map) return;

    const brgyQuery = normalizeBarangay(searchBrgy);
    const pinQuery = normalizePin(searchPin);
    if (!brgyQuery && !pinQuery) return;

    const barangayMatches = lotGeo.features.filter((feature) => {
      const props = feature?.properties || {};
      const featureBarangay = normalizeBarangay(props.barangay);
      return !brgyQuery || featureBarangay === brgyQuery;
    });

    const map = geoRef.current._map;

    if (pinQuery) {
      const exactMatch = barangayMatches.find((feature) => {
        const featurePin = normalizePin(feature?.properties?.pin || feature?.properties?.PIN);
        const lotPart = featurePin.split('-').pop() || featurePin;
        return featurePin === pinQuery || lotPart === pinQuery;
      });

      const partialMatch = barangayMatches.find((feature) => {
        const featurePin = normalizePin(feature?.properties?.pin || feature?.properties?.PIN);
        const lotPart = featurePin.split('-').pop() || featurePin;
        return featurePin.startsWith(pinQuery) || featurePin.includes(pinQuery) || lotPart.startsWith(pinQuery);
      });

      const matchedFeature = exactMatch || partialMatch || null;
      if (!matchedFeature) return;

      setSelectedLot(matchedFeature.properties || null);

      const bounds = L.geoJSON(matchedFeature).getBounds();
      if (bounds?.isValid?.()) {
        map.flyToBounds(bounds, { padding: [80, 80], duration: 1.2, maxZoom: 18 });
      }
      return;
    }

    if (!barangayMatches.length) return;

    setSelectedLot(null);
    const bounds = L.geoJSON({
      type: 'FeatureCollection',
      features: barangayMatches,
    }).getBounds();
    if (bounds?.isValid?.()) {
      map.flyToBounds(bounds, getMapFitOptions(map.getSize()));
    }
  }, [searchBrgy, searchPin, lotGeo]);

  const revenueData = useMemo(() => {
    if (!report?.rpt_by_class) return null;
    return {
      labels: report.rpt_by_class.map((item) => item.label.charAt(0) + item.label.slice(1).toLowerCase()),
      datasets: [
        {
          data: report.rpt_by_class.map((item) => item.amount),
          backgroundColor: report.rpt_by_class.map((item) => MAIN_COLORS[item.key] || '#64748b'),
          borderColor: '#ffffff',
          borderWidth: 3,
        },
      ],
    };
  }, [report]);

  const barData = useMemo(() => {
    if (!report?.rpt_by_class) return null;
    return {
      labels: report.rpt_by_class.map((item) => item.label.charAt(0) + item.label.slice(1).toLowerCase()),
      datasets: [
        {
          data: report.rpt_by_class.map((item) => item.amount),
          backgroundColor: report.rpt_by_class.map((item) => MAIN_COLORS[item.key] || '#64748b'),
          borderRadius: 6,
        },
      ],
    };
  }, [report]);

  const lotAreaPieOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 36, right: 48, bottom: 36, left: 48 } },
    plugins: {
      pieCalloutPlugin: { decimalPlaces: 2 },
      legend: { display: false },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#0f172a',
        bodyColor: '#334155',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        titleFont: { size: 12, weight: '800' },
        bodyFont: { size: 11, weight: '600' },
        padding: 10,
        displayColors: true,
        cornerRadius: 8,
        callbacks: {
          labelVerticalAlignment: 'center',
          title(context) {
            return context[0].label.toUpperCase();
          },
          label(context) {
            const total = context.dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
            const value = Number(context.parsed || 0);
            const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
            const formattedValue = formatArea(value);
            const formattedTotal = formatArea(total);

            return [
              `Area: ${formattedValue} sqm`,
              `Formula: (${formattedValue} / ${formattedTotal}) × 100`,
              `Result: ${percent}%`
            ];
          },
        },
      },
      datalabels: { display: false },
    },
  }), []);

  const totalAreaStats = useMemo(() => {
    if (!lotGeo?.features) return null;
    let agri = 0, comml = 0, indl = 0, res = 0;
    lotGeo.features.forEach(f => {
      const a = getLotAreaValues(f.properties);
      agri += a.agri;
      comml += a.comml;
      indl += a.indl;
      res += a.res;
    });
    const total = agri + comml + indl + res;
    if (total === 0) return null;

    const data = [agri, comml, res, indl];
    const labels = ['Agricultural', 'Commercial', 'Residential', 'Industrial'];

    let maxVal = -1;
    let maxIdx = 0;
    data.forEach((v, i) => {
      if (v > maxVal) { maxVal = v; maxIdx = i; }
    });

    return {
      agri, comml, indl, res,
      total,
      data,
      labels,
      dominant: {
        label: labels[maxIdx],
        percent: ((maxVal / total) * 100).toFixed(1),
        color: [MAIN_COLORS.agri, MAIN_COLORS.comml, MAIN_COLORS.res, MAIN_COLORS.indl][maxIdx]
      }
    };
  }, [lotGeo]);

  const currentAreaInfo = useMemo(() => {
    if (selectedLot) {
      const a = getLotAreaValues(selectedLot);
      const total = a.agri + a.comml + a.indl + a.res;
      if (total === 0) return null;

      const data = [a.agri, a.comml, a.res, a.indl];
      const labels = ['Agricultural', 'Commercial', 'Residential', 'Industrial'];

      let maxVal = -1;
      let maxIdx = 0;
      data.forEach((v, i) => {
        if (v > maxVal) { maxVal = v; maxIdx = i; }
      });

      return {
        isLot: true,
        data,
        labels,
        total,
        dominant: {
          label: labels[maxIdx],
          percent: ((maxVal / total) * 100).toFixed(1),
          color: [MAIN_COLORS.agri, MAIN_COLORS.comml, MAIN_COLORS.res, MAIN_COLORS.indl][maxIdx]
        }
      };
    }
    return totalAreaStats ? { ...totalAreaStats, isLot: false } : null;
  }, [selectedLot, totalAreaStats]);

  const lotAreaPieData = useMemo(() => {
    if (!currentAreaInfo) return null;
    return {
      labels: currentAreaInfo.labels,
      datasets: [
        {
          data: currentAreaInfo.data,
          backgroundColor: [MAIN_COLORS.agri, MAIN_COLORS.comml, MAIN_COLORS.res, MAIN_COLORS.indl],
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }, [currentAreaInfo]);

  const pieOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 30, right: 54, bottom: 30, left: 54 } },
    plugins: {
      pieCalloutPlugin: { decimalPlaces: 0 },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context) {
            const total = context.dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
            const value = Number(context.parsed || 0);
            const percent = total ? ((value / total) * 100).toFixed(0) : '0';
            return `${percent}%`;
          },
          title() {
            return '';
          },
        },
      },
      datalabels: { display: false },
    },
  }), []);

  const barOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context) {
            return fmtMoney(context.parsed.y);
          },
        },
      },
      datalabels: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
      },
      x: {
        ticks: { font: { size: 9, weight: '700' } },
        grid: { display: false },
      },
    },
  }), []);

  const handleCenter = () => {
    setSelectedLot(null);
    if (!geoRef.current) return;
    const bounds = geoRef.current.getBounds();
    const map = geoRef.current._map;
    if (bounds?.isValid?.() && map) {
      map.fitBounds(bounds, getMapFitOptions(map.getSize()));
    }
  };

  const selectedLotBarangay = selectedLot?.barangay || selectedLot?.barangay_name || 'San Pascual';
  const overviewTitle = selectedLot?.pin
    ? `Lot Overview of ${selectedLotBarangay}: Lot ${selectedLot.pin}`
    : 'Lot Overview of San Pascual, Batangas';
  const areaCaption = currentAreaInfo?.isLot
    ? `Area Classification (${selectedLotBarangay} - Lot ${selectedLot?.pin})`
    : 'Area Classification (Municipal)';
  const selectedLotMeaning = selectedLot ? getSpecialLotMeaning(selectedLot) : null;

  return (
    <div className="dash-root">
      <style>{STYLES}</style>
      <div className="dash-title-block">
        <h1>Real Property Tax</h1>
        <p>As of 2026</p>
      </div>

      <div className="dash-main-container">
        <div className="dash-upper-section">
          <div className="dash-map-stage">
            <div className="dash-map-panel">
              <MapContainer style={{ height: '100%', width: '100%' }} center={[13.79, 121.0]} zoom={13} preferCanvas>
                <LotMapContent
                  geoData={lotGeo}
                  hoveredLotPin={hoveredLot?.pin || null}
                  selectedLotPin={selectedLot?.pin || null}
                  onHoverLot={setHoveredLot}
                  onSelectLot={setSelectedLot}
                  geoRef={geoRef}
                />
                <MapControls onCenter={handleCenter} />
              </MapContainer>

              <div className="dash-left-overlays">
                <div className="dash-map-summary">
                  <h3>{overviewTitle}</h3>
                  <p>
                    Based on land area type classification (sqm).
                    {selectedLot
                      ? ` Showing the recorded area values for Lot ${selectedLot.pin} in ${selectedLotBarangay}.`
                      : ' Showing the total aggregate area for all properties.'}
                  </p>
                  {selectedLotMeaning && (
                    <div style={{
                      marginBottom: '0.6rem',
                      padding: '0.55rem 0.65rem',
                      borderRadius: '0.65rem',
                      background: selectedLotMeaning.tone === 'pink' ? '#fdf2f8' : '#f8fafc',
                      border: `1px solid ${selectedLotMeaning.tone === 'pink' ? '#f9a8d4' : '#cbd5e1'}`,
                      color: '#475569',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      lineHeight: 1.4
                    }}>
                      {selectedLotMeaning.text}
                    </div>
                  )}
                  <div className="dash-summary-grid">
                    <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.agri }}>
                      <label style={{ color: MAIN_COLORS.agri }}>{selectedLot ? 'Area Agricultural' : 'Total Agricultural'}</label>
                      <strong style={{ color: MAIN_COLORS.agri }}>{formatArea(selectedLot ? selectedLot.area_agri : totalAreaStats?.agri)}</strong>
                    </div>
                    <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.res }}>
                      <label style={{ color: MAIN_COLORS.res }}>{selectedLot ? 'Area Residential' : 'Total Residential'}</label>
                      <strong style={{ color: MAIN_COLORS.res }}>{formatArea(selectedLot ? selectedLot.area_res : totalAreaStats?.res)}</strong>
                    </div>
                    <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.indl }}>
                      <label style={{ color: MAIN_COLORS.indl }}>{selectedLot ? 'Area Industrial' : 'Total Industrial'}</label>
                      <strong style={{ color: MAIN_COLORS.indl }}>{formatArea(selectedLot ? (selectedLot.area_indl ?? selectedLot.area_ind) : totalAreaStats?.indl)}</strong>
                    </div>
                    <div className="dash-summary-pill" style={{ borderColor: MAIN_COLORS.comml }}>
                      <label style={{ color: MAIN_COLORS.comml }}>{selectedLot ? 'Area Commercial' : 'Total Commercial'}</label>
                      <strong style={{ color: MAIN_COLORS.comml }}>{formatArea(selectedLot ? (selectedLot.area_comml ?? selectedLot.area_commml) : totalAreaStats?.comml)}</strong>
                    </div>
                  </div>
                </div>

                <div className="dash-left-floating-chart" data-has-lot={!!selectedLot} style={{ display: 'flex', flexDirection: 'column', flex: 1.8 }}>
                  <div className="dash-chart-caption">
                    {areaCaption}
                  </div>
                  <div style={{ flex: 1, minHeight: '9rem', position: 'relative' }}>
                    {lotAreaPieData ? (
                      <Pie data={lotAreaPieData} options={lotAreaPieOptions} />
                    ) : (
                      <div className="dash-no-data-msg">
                        {selectedLot ? 'No Area Data for this lot' : 'Calculating land use...'}
                      </div>
                    )}
                  </div>
                  {currentAreaInfo && (
                    <div style={{ marginTop: '0.4rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.4rem' }}>
                      <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                        Highest Classification
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: currentAreaInfo.dominant.color }}>
                          {currentAreaInfo.dominant.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b' }}>
                          {currentAreaInfo.dominant.percent}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="dash-floating-chart" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div className="dash-chart-caption">Tax Revenue By Category</div>
                  <div style={{ flex: 1, minHeight: '6rem', position: 'relative' }}>
                    {barData && <Bar data={barData} options={barOptions} />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-side-panel">
            <div className="dash-card" style={{ flex: 1 }}>
              <div className="dash-card-title">Proportional Revenue</div>
              <div className="dash-pie-area" style={{ flex: 1, minHeight: 0 }}>
                {revenueData && <Pie data={revenueData} options={pieOptions} />}
              </div>
              <div className="dash-signifies">
                <div className="dash-signifies-title">Signifies</div>
                <div className="dash-signifies-list">
                  {report?.rpt_by_class?.map((item) => (
                    <div className="dash-signifies-item" key={item.key}>
                      <span
                        className="dash-signifies-swatch"
                        style={{ background: MAIN_COLORS[item.key] || '#64748b' }}
                      />
                      <span className="dash-signifies-name">
                        {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-title">Revenue Breakdown</div>
              <div className="dash-breakdown-list">
                {report?.rpt_by_class?.map((item) => (
                  <div className="dash-breakdown-item" key={item.key}>
                    <div className="dash-breakdown-label">
                      <span className="dash-breakdown-dot" style={{ background: MAIN_COLORS[item.key] || '#64748b' }} />
                      <span className="dash-breakdown-name">{item.label.charAt(0) + item.label.slice(1).toLowerCase()}</span>
                    </div>
                    <div className="dash-breakdown-amount">{fmtMoney(item.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="dash-assessment-section">
          <div className="dash-assessment-header">
            <h2>Assessment</h2>
            <p>As of 2026</p>
          </div>
          <div className="dash-table-shell">
            <div className="dash-table-scroll">
              <table className="dash-full-table">
                <thead>
                  <tr>
                    <th rowSpan="2">Barangay</th>
                    <th colSpan="4" style={{ textAlign: 'center' }}>Number of Parcels</th>
                    <th rowSpan="2" style={{ textAlign: 'center' }}>Market Value</th>
                    <th rowSpan="2" style={{ textAlign: 'center' }}>Assessed Value</th>
                  </tr>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Agricultural</th>
                    <th style={{ textAlign: 'center' }}>Residential</th>
                    <th style={{ textAlign: 'center' }}>Industrial</th>
                    <th style={{ textAlign: 'center' }}>Commercial</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.barangay}
                      className={selectedBarangay?.barangay === row.barangay ? 'selected-row' : ''}
                      onClick={() => setSelectedBarangay(row)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{row.barangay}</td>
                      <td className="numeric">{row.counts.agri}</td>
                      <td className="numeric">{row.counts.res}</td>
                      <td className="numeric">{row.counts.indl}</td>
                      <td className="numeric">{row.counts.comml}</td>
                      <td className="money">{fmtMoney(row.market_value)}</td>
                      <td className="money">{fmtMoney(row.assessed_value)}</td>
                    </tr>
                  ))}
                </tbody>
                {report?.assessment_table?.totals && (
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="numeric">{report.assessment_table.totals.counts.agri}</td>
                      <td className="numeric">{report.assessment_table.totals.counts.res}</td>
                      <td className="numeric">{report.assessment_table.totals.counts.indl}</td>
                      <td className="numeric">{report.assessment_table.totals.counts.comml}</td>
                      <td className="money">{fmtMoney(report.assessment_table.totals.market_value)}</td>
                      <td className="money">{fmtMoney(report.assessment_table.totals.assessed_value)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <div className="dash-assessment-note">
            <span>Note:</span> Only parcels with complete data are included.
          </div>
        </div>
      </div>
    </div>
  );
}
