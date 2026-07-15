import { useEffect, useState } from 'react'
import { Bar, Pie } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from 'chart.js'
import { apiGet } from './api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement)

const CAT_COLORS = {
  AGRICULTURAL: '#4caf50',
  RESIDENTIAL: '#2196f3',
  COMMERCIAL: '#ffc107',
  INDUSTRIAL: '#9c27b0',
}
const FALLBACK_COLORS = ['#4caf50', '#2196f3', '#ffc107', '#9c27b0', '#94a3b8']

const color = (label, index) => CAT_COLORS[label?.toUpperCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]

const fmtFull = (value) => {
  const num = Number(value || 0)
  const neg = num < 0
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
      {neg ? '- \u20b1' : '\u20b1'}
      {Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  .dash-root {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: #eef2f7;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    color: #0f1d35;
    box-sizing: border-box;
    margin: -0.75rem -2rem;
    width: calc(100% + 4rem);
    scrollbar-width: thin;
    scrollbar-color: #b0bec5 transparent;
  }
  .dash-root * { box-sizing: border-box; }
  .dash-root::-webkit-scrollbar { width: 5px; }
  .dash-root::-webkit-scrollbar-track { background: transparent; }
  .dash-root::-webkit-scrollbar-thumb {
    background-color: #b0bec5;
    border-radius: 10px;
    border: none;
  }
  .dash-root::-webkit-scrollbar-thumb:hover { background-color: #90a4ae; }
  .dash-root::-webkit-scrollbar-corner { background: transparent; }

  .dash-fold {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 0.75rem 2rem 0.8rem;
    min-height: 100%;
  }

  .dash-title-block {
    text-align: center;
    flex-shrink: 0;
  }
  .dash-title-block h1 {
    font-family: 'Playfair Display', serif;
    font-size: 2.1rem;
    font-weight: 900;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #0f1d35;
    margin: 0 0 0.25rem;
    line-height: 1;
  }
  .dash-title-block p {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0;
  }

  .dash-stale {
    background: #fef9c3;
    border: 1px solid #fde68a;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: #92400e;
  }
  .dash-stale button {
    margin-left: auto;
    background: #0f1d35;
    color: #fff;
    border: none;
    padding: 0.28rem 0.75rem;
    border-radius: 0.35rem;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }

  .dash-charts-row {
    display: flex;
    gap: 1.1rem;
    flex: 1;
    min-height: 0;
  }

  .dash-card {
    background: #ffffff;
    border-radius: 0.8rem;
    box-shadow: 0 4px 12px rgba(15,29,53,0.1);
    border: 1px solid #e4eaf2;
    padding: 1rem 1.1rem 0.9rem;
  }
  .dash-card-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0 0 0.75rem;
  }

  .dash-bar-card {
    flex: 1.55;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .dash-bar-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .dash-right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    min-width: 0;
  }

  .dash-pie-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .dash-pie-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .dash-cat-card {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-top: 0.5rem;
  }
  .dash-cat-table {
    width: 100%;
    border-collapse: collapse;
  }
  .dash-cat-table thead th {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: #94a3b8;
    text-transform: uppercase;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid #e2e8f0;
  }
  .dash-cat-table thead th:last-child { text-align: right; }
  .dash-cat-table tbody tr { border-bottom: 1px solid #f1f5f9; }
  .dash-cat-table tbody tr:last-child { border-bottom: none; }
  .dash-cat-table tbody td {
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: 0.65rem 0;
    font-size: 0.77rem;
    font-weight: 600;
    color: #0f1d35;
    vertical-align: middle;
  }
  .dash-cat-table tbody td:last-child {
    text-align: right;
    font-family: 'DM Mono', monospace;
    font-size: 0.76rem;
  }
  .dash-cat-name {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .dash-cat-swatch {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .dash-assess-section { padding: 0 2rem 2.5rem; }
  .dash-assess-header {
    text-align: center;
    padding: 1.2rem 0 1rem;
  }
  .dash-assess-header h2 {
    font-family: 'Playfair Display', serif;
    font-size: 1.45rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #0f1d35;
    margin: 0 0 0.2rem;
  }
  .dash-assess-header p {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0;
  }
  .dash-table-wrap {
    background: #fff;
    border-radius: 0.9rem;
    box-shadow: 0 4px 12px rgba(15,29,53,0.1);
    border: 1px solid #e4eaf2;
    overflow: hidden;
  }
  .dash-table-scroll { overflow-x: auto; }
  .dash-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .dash-table thead tr:first-child th {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: #a9dbfaff;
    color: #000000ff;
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 0.65rem 0.85rem;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.18);
  }
  .dash-table thead tr:first-child th:first-child { text-align: left; }
  .dash-table thead tr:last-child th {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: #71bff0ff;
    color: #000000ff;
    font-weight: 700;
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.5rem 0.85rem;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.18);
  }
  .dash-table tbody tr { border-bottom: 1px solid #e2e8f0; }
  .dash-table tbody tr:last-child { border-bottom: none; }
  .dash-table tbody tr:hover { background: #f8fafc; }
  .dash-table td {
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: 0.55rem 0.85rem;
    color: #0f1d35;
    font-size: 0.8rem;
  }
  .dash-table td:first-child { font-weight: 600; color: #1e3a5f; }
  .dash-table td:not(:first-child) { text-align: center; }
  .dash-table td:nth-last-child(-n+2) {
    text-align: right;
    font-weight: 600;
    font-family: 'DM Mono', monospace;
    font-size: 0.77rem;
  }
  .dash-total-row td {
    background: #b4ddf7ff !important;
    font-weight: 800 !important;
    font-size: 0.95rem !important;
    padding: 0.85rem 0.85rem !important;
    border-top: 2px solid #1e3a5f;
  }
  .dash-note {
    margin-top: 0.8rem;
    font-size: 0.72rem;
    color: #40405cff;
  }
  .dash-note span { font-weight: 700; color: #960404ff; }
  .dash-empty {
    text-align: center;
    padding: 2.5rem 1rem;
    color: #94a3b8;
    font-size: 0.85rem;
  }
`

export default function MainDashboardMerged({ isStaff, searchBrgy = '', searchPin = '' }) {
  const [report, setReport] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [reportDirty, setReportDirty] = useState(false)

  const loadReport = (forceSync = false) => {
    const url = forceSync ? '/api/dashboard/rpt-report/?sync=1' : '/api/dashboard/rpt-report/'
    return apiGet(url).then((response) => response.json()).then((data) => {
      setReport(data)
      return data
    })
  }

  useEffect(() => {
    const dirty = typeof window !== 'undefined' ? !!localStorage.getItem('rpt_report_dirty') : false
    setReportDirty(dirty)
    loadReport(dirty).finally(() => {
      if (dirty) {
        try { localStorage.removeItem('rpt_report_dirty') } catch {}
        setReportDirty(false)
      }
    })
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const dirty = typeof window !== 'undefined' ? localStorage.getItem('rpt_report_dirty') : null
      if (!dirty) return

      setReportDirty(true)
      loadReport(true).finally(() => {
        try { localStorage.removeItem('rpt_report_dirty') } catch {}
        setReportDirty(false)
      })
    }, 1500)

    return () => clearInterval(timer)
  }, [])

  const refreshReport = () => {
    setIsRefreshing(true)
    loadReport(true).finally(() => {
      setIsRefreshing(false)
      try { localStorage.removeItem('rpt_report_dirty') } catch {}
      setReportDirty(false)
    })
  }

  const categories = Array.isArray(report?.rpt_by_class) ? report.rpt_by_class : []
  const barangayRows = report?.assessment_table?.rows || []
  const filteredRows = barangayRows.filter((row) =>
    (row.barangay || '').trim().toLowerCase().includes((searchBrgy || '').trim().toLowerCase())
  )
  const colors = categories.map((item, index) => color(item.label, index))

  const barData = categories.length ? {
    labels: categories.map((item) => item.label),
    datasets: [{
      label: 'Real Property Tax',
      data: categories.map((item) => item.amount),
      backgroundColor: colors,
      borderRadius: 6,
      borderSkipped: false,
    }],
  } : null

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` \u20b1${Number(context.parsed.y).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#e8edf5' },
        ticks: {
          font: { size: 10, family: 'DM Mono, monospace' },
          color: '#64748b',
          callback: (value) => '\u20b1' + (
            value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + 'M'
              : value >= 1_000 ? (value / 1_000).toFixed(0) + 'K'
                : value
          ),
        },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, weight: '600', family: 'Inter, sans-serif' }, color: '#475569' },
      },
    },
  }

  const pieData = categories.length ? {
    labels: categories.map((item) => item.label),
    datasets: [{
      data: categories.map((item) => item.amount),
      backgroundColor: colors,
      borderWidth: 3,
      borderColor: '#ffffff',
    }],
  } : null

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: false,
          boxWidth: 15,
          boxHeight: 15,
          font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
          color: '#334155',
          padding: 14,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((sum, value) => sum + value, 0)
            const pct = total ? ((context.parsed / total) * 100).toFixed(1) : '0.0'
            return ` ${context.label}: ${pct}%`
          },
        },
      },
    },
  }

  return (
    <div className="dash-root">
      <style>{STYLES}</style>
      <div className="dash-fold">
        {reportDirty && (
          <div className="dash-stale">
            Report values may be outdated.
            <button onClick={refreshReport} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
            </button>
          </div>
        )}

        <div className="dash-title-block">
          <h1>Real Property Tax</h1>
          <p>as of {report?.as_of_year || new Date().getFullYear()}</p>
        </div>

        <div className="dash-charts-row">
          <div className="dash-card dash-bar-card">
            <p className="dash-card-title">Tax Revenue by Category</p>
            <div className="dash-bar-area">
              {barData
                ? <Bar data={barData} options={barOptions} />
                : <div className="dash-empty">{report?.error ?? 'Loading data...'}</div>}
            </div>
          </div>

          <div className="dash-right-panel">
            <div className="dash-card dash-pie-card">
              <p className="dash-card-title">Proportional Revenue</p>
              <div className="dash-pie-area">
                {pieData
                  ? <Pie data={pieData} options={pieOptions} />
                  : <div className="dash-empty">{report?.error ?? 'Loading data...'}</div>}
              </div>
            </div>

            <div className="dash-card dash-cat-card">
              <table className="dash-cat-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Category</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length ? categories.map((item, index) => (
                    <tr key={item.key || item.label}>
                      <td>
                        <div className="dash-cat-name">
                          <span className="dash-cat-swatch" style={{ background: color(item.label, index) }} />
                          {item.label.toUpperCase()}
                        </div>
                      </td>
                      <td>{fmtFull(item.amount)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={2} className="dash-empty">Loading...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-assess-section">
        <div className="dash-assess-header">
          <h2>Assessment</h2>
          <p>as of {report?.as_of_year || new Date().getFullYear()}</p>
        </div>

        <div className="dash-table-wrap">
          <div className="dash-table-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Barangay</th>
                  <th colSpan={4}>Number of Parcels</th>
                  <th rowSpan={2}>Market Value</th>
                  <th rowSpan={2}>Assessed Value</th>
                </tr>
                <tr>
                  <th>Agricultural</th>
                  <th>Residential</th>
                  <th>Industrial</th>
                  <th>Commercial</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.barangay}>
                    <td>{row.barangay}</td>
                    <td>{row.counts.agri}</td>
                    <td>{row.counts.res}</td>
                    <td>{row.counts.indl}</td>
                    <td>{row.counts.comml}</td>
                    <td>{fmtFull(row.market_value)}</td>
                    <td>{fmtFull(row.assessed_value)}</td>
                  </tr>
                ))}
                {report?.assessment_table?.totals && (
                  <tr className="dash-total-row">
                    <td>{report.assessment_table.totals.barangay}</td>
                    <td>{report.assessment_table.totals.counts.agri}</td>
                    <td>{report.assessment_table.totals.counts.res}</td>
                    <td>{report.assessment_table.totals.counts.indl}</td>
                    <td>{report.assessment_table.totals.counts.comml}</td>
                    <td>{fmtFull(report.assessment_table.totals.market_value)}</td>
                    <td>{fmtFull(report.assessment_table.totals.assessed_value)}</td>
                  </tr>
                )}
                {!report?.assessment_table?.rows?.length && (
                  <tr>
                    <td colSpan={7} className="dash-empty">Loading assessment data...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {report?.notes && (
          <p className="dash-note"><span>Note:</span> {report.notes}</p>
        )}
      </div>
    </div>
  )
}
