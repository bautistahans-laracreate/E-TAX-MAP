import { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from './Sidebar';
import LoginModal from './LoginModal';
import MainDashboard from './MainDashboard';
import AdminDashboard from './AdminDashboard';
import FAQs from './FAQs';
import AboutCredits from './AboutCredits';
import MapComponent from './MapComponent';
import PimView from './PimView';
import { Search } from 'lucide-react';
import { apiGet, apiPost, clearTokens, getAccessToken, getRefreshToken } from './api';
import './App.css';
import ErrorBoundary from './ErrorBoundary';

const CAD_BARANGAYS = [
  'Alalum', 'Antipolo', 'Balimbing', 'Banaba', 'Bayanan', 'Danglayan',
  'Del Pilar', 'Gelerang Kawayan', 'Ilat North', 'Ilat South', 'Kaingin',
  'Laurel', 'Malaking Pook', 'Mataas na Lupa', 'Natunuan North', 'Natunuan South',
  'Padre Castillo', 'Palsahingin', 'Pila', 'Poblacion', 'Pook ni Banal',
  'Pook ni Kapitan', 'Resplandor', 'Sambat', 'San Antonio', 'San Mariano',
  'San Mateo', 'Sta. Elena', 'Sto. Nino'
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null)
  const [user, setUser] = useState(null)
  const [fullName, setFullName] = useState(null)
  const [isStaff, setIsStaff] = useState(false)
  const [activePage, setActivePage] = useState('dashboard')
  const [pimHeaderTitle, setPimHeaderTitle] = useState('Barangay Boundary Index Map')
  const [cadHeaderTitle, setCadHeaderTitle] = useState('Cadastral Map')
  // Global Search
  const [searchBrgy, setSearchBrgy] = useState('');
  const [searchPin, setSearchPin] = useState('');
  const [dashboardLotIndex, setDashboardLotIndex] = useState({});
  const [isPinSearchFocused, setIsPinSearchFocused] = useState(false);
  const pinBlurTimeoutRef = useRef(null);
  const hasLoadedDashboardLotIndex = useRef(false);

  // Map state (for PIM view)
  const [geoData, setGeoData] = useState(null)
  const [cadGeoData, setCadGeoData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!getAccessToken()) {
      setIsAuthenticated(false)
      return
    }
    apiGet('/api/auth/check/')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setIsAuthenticated(true)
          setUser(data.username)
          setFullName(data.full_name)
          setIsStaff(data.is_staff)
        } else {
          clearTokens()
          setIsAuthenticated(false)
        }
      })
      .catch(() => {
        clearTokens()
        setIsAuthenticated(false)
      })
  }, [])

  useEffect(() => {
    if (!isAuthenticated || hasLoadedDashboardLotIndex.current) return
    hasLoadedDashboardLotIndex.current = true

    apiGet('/api/dashboard/lots-geojson/')
      .then(res => res.json())
      .then(data => {
        const index = {}
        ;(data?.features || []).forEach((feature) => {
          const props = feature?.properties || {}
          const barangayName = String(props.barangay || props.barangay_name || '').trim()
          const pin = String(props.pin || props.PIN || '').trim()
          if (!barangayName || !pin) return

          const key = barangayName.toLowerCase()
          if (!index[key]) {
            index[key] = { name: barangayName, pins: [] }
          }
          if (!index[key].pins.includes(pin)) {
            index[key].pins.push(pin)
          }
        })

        Object.values(index).forEach((entry) => {
          entry.pins.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        })

        setDashboardLotIndex(index)
      })
      .catch(err => {
        hasLoadedDashboardLotIndex.current = false
        console.error('Failed to load dashboard lot index:', err)
      })
  }, [isAuthenticated])

  // Fetch GeoJSON when navigating to PIM
  useEffect(() => {
    if (!isAuthenticated || activePage !== 'map-pim') return
    if (geoData) return // already loaded

    apiGet('/api/geojson/')
      .then(res => {
        if (res.status === 401) {
          clearTokens()
          setIsAuthenticated(false)
          setUser(null)
          throw new Error('Session expired.')
        }
        return res.json()
      })
      .then(data => setGeoData(data))
      .catch(err => {
        console.error('Failed to load geojson:', err)
        setError(err.message || String(err))
      })
  }, [isAuthenticated, activePage, geoData])

  // Fetch CAD GeoJSON when navigating to CAD
  useEffect(() => {
    if (!isAuthenticated || activePage !== 'map-cad') return
    if (cadGeoData) return

    apiGet('/api/cad/geojson/')
      .then(res => {
        if (res.status === 401) {
          clearTokens()
          setIsAuthenticated(false)
          setUser(null)
          throw new Error('Session expired.')
        }
        if (!res.ok) throw new Error(`Server responded ${res.status}`)
        return res.json()
      })
      .then(data => {
        setCadGeoData(data)
      })
      .catch(err => {
        console.error('Failed to load CAD geojson:', err)
        setError(err.message || String(err))
      })
  }, [isAuthenticated, activePage, cadGeoData])

  const handleLoginSuccess = (username, staffFlag, fullNameProp) => {
    setIsAuthenticated(true)
    setUser(username)
    setFullName(fullNameProp)
    setIsStaff(!!staffFlag)
    setActivePage('dashboard')
  }

  const handleLogout = async () => {
    try {
      if (getRefreshToken()) {
        await apiPost('/api/auth/logout/', { refresh: getRefreshToken() })
      }
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      localStorage.setItem('last_role', isStaff ? 'admin' : 'user')
      clearTokens()
      setIsAuthenticated(false)
      setUser(null)
      setFullName(null)
      setIsStaff(false)
      setGeoData(null)
      setDashboardLotIndex({})
      hasLoadedDashboardLotIndex.current = false
      setError(null)
      setActivePage('dashboard')
    }
  }

  // ── Loading ──
  const matchedDashboardBarangay = useMemo(() => {
    if (activePage !== 'dashboard') return null
    const query = String(searchBrgy || '').trim().toLowerCase()
    if (!query) return null

    return dashboardLotIndex[query]
      || Object.values(dashboardLotIndex).find(entry => entry.name.toLowerCase() === query)
      || Object.values(dashboardLotIndex).find(entry => entry.name.toLowerCase().startsWith(query))
      || Object.values(dashboardLotIndex).find(entry => entry.name.toLowerCase().includes(query))
      || null
  }, [activePage, dashboardLotIndex, searchBrgy])

  const pinSuggestions = useMemo(() => {
    if (activePage !== 'dashboard' || !matchedDashboardBarangay) return []

    const pins = matchedDashboardBarangay.pins || []
    const rawQuery = String(searchPin || '').trim().toUpperCase()

    if (rawQuery.includes('-')) {
      return pins
        .filter(pin => pin.toUpperCase().startsWith(rawQuery))
        .slice(0, 8)
        .map(value => ({ type: 'pin', value }))
    }

    const prefixQuery = rawQuery.replace(/[^0-9]/g, '')
    const prefixes = Array.from(new Set(
      pins
        .map(pin => String(pin).split('-')[0]?.trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    return prefixes
      .filter(prefix => !prefixQuery || prefix.startsWith(prefixQuery))
      .slice(0, 8)
      .map(value => ({ type: 'prefix', value }))
  }, [activePage, matchedDashboardBarangay, searchPin])

  const showPinSuggestions = activePage === 'dashboard'
    && !!matchedDashboardBarangay
    && (isPinSearchFocused || !!searchPin)
    && pinSuggestions.length > 0

  const handlePinSuggestionSelect = (suggestion) => {
    if (suggestion.type === 'prefix') {
      setSearchPin(`${suggestion.value}-`)
      setIsPinSearchFocused(true)
      return
    }

    setSearchPin(suggestion.value)
    setIsPinSearchFocused(false)
  }

  if (isAuthenticated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', backgroundColor: '#f0f4f8', color: '#1e3a5f',
        fontSize: '1em', fontFamily: 'inherit',
      }}>
        Loading...
      </div>
    )
  }

  // ── Not logged in ──
  if (!isAuthenticated) {
    const lastRole = localStorage.getItem('last_role') || 'user'
    return <LoginModal onLoginSuccess={handleLoginSuccess} initialRole={lastRole} />
  }

  // ── Logged-in layout ──
  const displayUser = fullName || user || 'User'
  const avatarLetter = displayUser ? displayUser[0].toUpperCase() : 'U'
  const pageTitle = {
    'dashboard': 'Dashboard',
    'map-cad': cadHeaderTitle,
    'map-pim': pimHeaderTitle,
    'faqs': 'FAQs',
    'about': 'About & Credits',
  }[activePage] || 'Dashboard'

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <MainDashboard isStaff={isStaff} searchBrgy={searchBrgy} searchPin={searchPin} />
      case 'map-pim':
        return <PimView isStaff={isStaff} geoData={geoData} onHeaderTitleChange={setPimHeaderTitle} searchBrgy={searchBrgy} searchPin={searchPin} />
      case 'map-cad':
        return (
          <CadMap
            geoData={cadGeoData}
            error={error}
            isStaff={isStaff}
            searchBrgy={searchBrgy}
            searchLot={searchPin}
            onTitleChange={setCadHeaderTitle}
          />
        )
      case 'faqs':
        return <FAQs />
      case 'about':
        return <AboutCredits />
      default:
        return <MainDashboard isStaff={isStaff} searchBrgy={searchBrgy} searchPin={searchPin} />
    }
  }

  return (
    <div className="app-root">
      <Sidebar
        isStaff={isStaff}
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={handleLogout}
      />
      <div className="main-layout">
        {/* Header */}
        <div className="app-header">
          <div className="header-left">
            <div className="header-page-title">{pageTitle}</div>
          </div>
          <div className="header-search-nav">
            <div className="header-search-field">
              <Search size={14} className="h-search-icon" />
              <input
                type="text"
                placeholder="Brgy..."
                value={searchBrgy}
                onChange={e => setSearchBrgy(e.target.value)}
                className="h-search-input"
              />
            </div>
            <div className="header-search-divider" />
            <div className="header-search-field header-search-field-pin">
              <input
                type="text"
                placeholder={activePage === 'map-cad' ? "Lot..." : "PIN..."}
                value={searchPin}
                onChange={e => setSearchPin(e.target.value)}
                onFocus={() => {
                  if (pinBlurTimeoutRef.current) clearTimeout(pinBlurTimeoutRef.current)
                  setIsPinSearchFocused(true)
                }}
                onBlur={() => {
                  pinBlurTimeoutRef.current = setTimeout(() => setIsPinSearchFocused(false), 120)
                }}
                className="h-search-input"
              />
              {showPinSuggestions && (
                <div className="h-search-dropdown">
                  {pinSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.type}-${suggestion.value}`}
                      type="button"
                      className="h-search-suggestion"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePinSuggestionSelect(suggestion)}
                    >
                      {suggestion.value}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="ad-user-pill">
              <div className="ad-avatar">{avatarLetter}</div>
              <div>
                <div className="ad-username-text">{displayUser}</div>
                <div className="ad-role-label">{isStaff ? 'Administrator' : 'User'}</div>
              </div>
            </div>
          </div>
        </div>
        {/* Content */}
        <div className={`content-container${activePage === 'dashboard' ? ' content-container-dashboard' : ''}`} style={{ overflowY: 'auto' }}>
          <ErrorBoundary>
            {renderPage()}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// ── CAD Map Side Components ──

const COMBO_MAP = {
  'AGRI': { hex: '#22c55e', label: 'AGRICULTURE' },
  'COMM': { hex: '#fbbf24', label: 'COMMERCIAL' },
  'INDUSTRIAL': { hex: '#3b82f6', label: 'INDUSTRIAL' },
  'RES': { hex: '#ef4444', label: 'RESIDENTIAL' },
  'AGRI_RES': { hex: '#a855f7', label: 'AGRI + RES' },
  'AGRI_COMM': { hex: '#a3e635', label: 'AGRI + COMM' },
  'AGRI_INDUSTRIAL': { hex: '#06b6d4', label: 'AGRI + INDUSTRIAL' },
  'COMM_RES': { hex: '#f97316', label: 'COMM + RES' },
  'COMM_INDUSTRIAL': { hex: '#ec4899', label: 'COMM + INDUSTRIAL' },
  'INDUSTRIAL_RES': { hex: '#94a3b8', label: 'INDUSTRIAL + RES' },
  'AGRI_COMM_RES': { hex: '#92400e', label: 'AGRI + COMM + RES' },
  'AGRI_COMM_INDUSTRIAL': { hex: '#0d9488', label: 'AGRI + COMM + INDUSTRIAL' },
  'AGRI_INDUSTRIAL_RES': { hex: '#7f1d1d', label: 'AGRI + INDUSTRIAL + RES' },
  'COMM_INDUSTRIAL_RES': { hex: '#eab308', label: 'COMM + INDUSTRIAL + RES' },
  'AGRI_COMM_INDUSTRIAL_RES': { hex: '#000000', label: 'MULTIPLE CLASSIFICATION' },
  'UNCLASSIFIED': { hex: '#ff00ff', label: 'UNCLASSIFIED / NO DATA' } 
};

function CadMap({ geoData, error, isStaff, searchBrgy = '', searchLot = '', onTitleChange }) {
  const [selectedBarangay, setSelectedBarangay] = useState(null)
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [selectedLotFeature, setSelectedLotFeature] = useState(null)
  const [overlayGeoData, setOverlayGeoData] = useState(null)
  const [isLoadingOverlay, setIsLoadingOverlay] = useState(false)

  // Auto-search for lot when overlay data is loaded or searchLot changes
  useEffect(() => {
    if (!overlayGeoData || !searchLot || searchLot.length < 1) return;

    const query = searchLot.trim().toLowerCase();
    const match = overlayGeoData.features.find(f => {
      const lotNo = String(f.properties.lot_no || '').toLowerCase();
      const pin = String(f.properties.pin || f.properties.PIN || '').toLowerCase();
      // Match full lot number or the lot part of the PIN
      return lotNo === query || pin === query || pin.endsWith('-' + query) || pin.endsWith(query);
    });

    if (match) {
      setSelectedLotFeature(match);
    }
  }, [overlayGeoData, searchLot]);

  useEffect(() => {
    if (!onTitleChange) return;
    onTitleChange('Cadastral Map');
  }, [selectedBarangay, selectedLotFeature, onTitleChange]);
  useEffect(() => {
    const query = (searchBrgy || '').trim().toLowerCase();
    if (!query) return;
    const match = CAD_BARANGAYS.find(b => b.toLowerCase() === query);
    if (match && match !== selectedBarangay) {
      handleListClick(match);
    }
  }, [searchBrgy]);


  const handleSelect = (feature) => {
    const props = feature?.properties || {};
    
    // Check if it's a lot clicking (from overlay)
    if (props.pin || props.PIN || props.owner) {
      setSelectedLotFeature(feature);
      return;
    }

    const rawName = (props.ADM4_EN || '').toLowerCase().trim();
    if (!rawName) return;

    // Prioritize exact match first to avoid "Pila" matching "Del Pilar"
    let match = CAD_BARANGAYS.find(n => n.toLowerCase().trim() === rawName);
    if (!match) {
      match = CAD_BARANGAYS.find(n => {
        const ln = n.toLowerCase().trim();
        return ln.includes(rawName) || rawName.includes(ln);
      });
    }

    const finalName = match || props.ADM4_EN;
    
    setSelectedBarangay(finalName);
    setSelectedFeature(feature);
    setSelectedLotFeature(null);

    // Fetch overlay lots for the selected barangay
    if (finalName) {
      setOverlayGeoData(null);
      setIsLoadingOverlay(true);
      apiGet(`/api/pim/barangays/${encodeURIComponent(finalName)}/lots/`)
        .then(res => res.json())
        .then(data => {
          if (data.features) {
            setOverlayGeoData(data);
          }
          setIsLoadingOverlay(false);
        })
        .catch(err => {
          console.error("Failed to load overlay lots:", err);
          setIsLoadingOverlay(false);
        });
    }
  };

  const handleListClick = (name) => {
    if (!geoData) return;
    const ln = (name || '').toLowerCase().trim();
    // Prioritize exact match
    let feature = geoData.features.find(f => (f.properties?.ADM4_EN || '').toLowerCase().trim() === ln);
    if (!feature) {
      feature = geoData.features.find(f => {
        const fn = (f.properties?.ADM4_EN || '').toLowerCase().trim();
        return fn.includes(ln) || ln.includes(fn);
      });
    }
    if (feature) handleSelect(feature);
  };
  
  const handleBack = () => {
    setSelectedBarangay(null);
    setSelectedFeature(null);
    setSelectedLotFeature(null);
    setOverlayGeoData(null);
  };

  return (
    <div className="cad-page">
      <div className="cad-layout" style={{ gridTemplateColumns: '1fr 30rem', height: '100%', position: 'relative' }}>
        <div className="cad-map-area">
          <div className="map-view" data-blurred={!!selectedBarangay}>
            {isLoadingOverlay && (
              <div style={{ position: 'absolute', top: '50%', left: '40%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: 'rgba(255,255,255,0.9)', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', fontWeight: 'bold' }}>
                Loading parcels...
              </div>
            )}
            
            {/* Simplified Lot Details Popup */}
            {selectedLotFeature && (
              <div style={{ 
                position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 1100, 
                background: 'rgba(255, 255, 255, 0.98)', padding: '1.25rem', borderRadius: '1rem', 
                boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)', border: '1px solid #e2e8f0', 
                width: '240px', backdropFilter: 'blur(10px)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Lot Details</div>
                  <button onClick={() => setSelectedLotFeature(null)} style={{ background: '#f1f5f9', border: 'none', color: '#94a3b8', cursor: 'pointer', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem', color: '#1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', width: '80px', flexShrink: 0 }}>Lot:</span>
                    <span style={{ fontWeight: 700 }}>{(!selectedLotFeature.properties.is_unidentified && selectedLotFeature.properties.pin) ? String(selectedLotFeature.properties.pin).replace(/LOT\s+/i, '') : 'N/A'}</span>
                  </div>
                   <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', width: '80px', flexShrink: 0 }}>Barangay:</span>
                    <span style={{ fontWeight: 700 }}>{selectedLotFeature.properties.barangay || selectedBarangay || 'N/A'}</span>
                  </div>
                  {/* Keep PIN as a subtle foot note or hidden if truly not wanted, but usually it's helpful. I'll hide it for now as per minimal request. */}
                </div>
              </div>
            )}

            <MapComponent
              geoData={selectedBarangay ? overlayGeoData : geoData}
              error={error}
              onFeatureSelect={handleSelect}
              selectedFeature={selectedLotFeature || selectedFeature}
              selectedFeaturePin={selectedLotFeature?.properties?.pin || selectedLotFeature?.properties?.PIN}
              selectedBarangay={selectedBarangay}
              isCad={true}
              isolated={!!selectedBarangay}
              legend={CAD_BARANGAYS}
              backgroundGeoData={selectedBarangay ? geoData : null}
              layerKey={selectedBarangay ? `cad-overlay-${selectedBarangay}` : 'cad-municipal-index'}
              isBackgroundInteractive={true}
              selectionHighlight="yellow"
            />
          </div>
        </div>
        <div className="cad-legend">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #3b82f633', paddingBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>BARANGAYS</h3>
            {selectedBarangay && (
              <button 
                onClick={handleBack} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  padding: '0.4rem 0.8rem', 
                  borderRadius: '0.5rem', 
                  background: '#f1f5f9', 
                  border: '1px solid #e2e8f0', 
                  color: '#1e3a5f', 
                  fontSize: '0.82rem', 
                  fontWeight: '700', 
                  cursor: 'pointer', 
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Map
              </button>
            )}
          </div>
          <div className="cad-legend-grid">
            {CAD_BARANGAYS
              .filter(b => b.trim().toLowerCase().includes(searchBrgy.trim().toLowerCase()))
              .map(b => (
                <div
                  key={b}
                  onClick={() => handleListClick(b)}
                  className={`cad-legend-item ${selectedBarangay === b ? 'active' : ''}`}
                  style={{
                    fontWeight: selectedBarangay === b ? '800' : 'normal',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: '3px',
                    background: selectedBarangay === b ? '#e0e7ff' : 'transparent',
                    color: selectedBarangay === b ? '#1e3a5f' : undefined,
                  }}
                >
                  <span>{b}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
