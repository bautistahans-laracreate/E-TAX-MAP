import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, Minus, Maximize, Locate } from 'lucide-react';

const LGU_CENTER = [13.7937, 121.0478]; // San Pascual, Batangas center

// Safer GeoJSON wrapper to catch errors during feature processing
function MapContent({ geoData, error, onFeatureSelect, onEnlargementRequest, selectedFeature, selectedFeaturePin, selectedBarangay, isCad, isolated, legend, backgroundGeoData, layerKey, isStatic, isBackgroundInteractive = true, showCustomControls = true, onMapReady, selectionHighlight = 'default' }) {
  const map = useMap()
  const geoJsonRef = useRef(null)
  const selectedFeatureRef = useRef(null)
  const lastFlyPinRef = useRef(null)

  // Ensure high-priority pane for lots
  useEffect(() => {
    if (map && !map.getPane('parcels-pane')) {
      const pane = map.createPane('parcels-pane');
      pane.style.zIndex = '450';
      pane.style.pointerEvents = 'none'; // We'll manage events at layer level
    }
  }, [map])

  const formatPinShort = (pinValue) => {
    if (pinValue === null || pinValue === undefined) return 'N/A';
    const raw = String(pinValue).trim();
    if (!raw) return 'N/A';
    const lastPart = raw.split('-').pop() || raw;
    const cleaned = lastPart.trim();
    if (!cleaned) return 'N/A';
    return cleaned.length > 4 ? cleaned.slice(-4) : cleaned;
  };

  const getPin = (feature) => {
    const props = feature?.properties || {};
    return String(props.pin || props.PIN || '').trim();
  };

  const isValidGeometry = (feature) => {
    const geom = feature?.geometry;
    if (!geom || !geom.type || !Array.isArray(geom.coordinates)) return false;
    const coords = geom.coordinates;
    if (geom.type === 'Point') return coords.length >= 2;
    if (geom.type === 'LineString') return coords.length > 1;
    if (geom.type === 'Polygon') return coords.length > 0 && Array.isArray(coords[0]) && coords[0].length > 2;
    if (geom.type === 'MultiLineString') return coords.length > 0 && coords.some(line => Array.isArray(line) && line.length > 1);
    if (geom.type === 'MultiPolygon') return coords.length > 0 && coords.some(poly => Array.isArray(poly) && poly.length > 0 && Array.isArray(poly[0]) && poly[0].length > 2);
    return false;
  };

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature
  }, [selectedFeature])

  // Fit bounds when data changes
  // We keep fitKey stable (not including selectedFeaturePin) to prevent 
  // the map from jumping back/re-fitting bounds every time a single lot is selected.
  const fitKey = layerKey || `fit-${geoData?.features?.length || 0}`;

  useEffect(() => {
    if (geoData && geoJsonRef.current) {
      // Small timeout to ensure Leaflet has initialized the layers
      const timer = setTimeout(() => {
        try {
          if (layerKey && layerKey.includes('municipal')) {
            map.setView(LGU_CENTER, 12, { animate: true });
          } else {
            const bounds = geoJsonRef.current.getBounds();
            if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
              map.fitBounds(bounds, { duration: 1, padding: [10, 10] });
            }
          }
        } catch (e) {
          console.warn("Leaflet fitBounds error:", e);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [fitKey, map, geoData])

  // Clear zoom control and watch for container resize
  useEffect(() => {
    if (map.zoomControl) {
      map.zoomControl.remove()
    }
    // Force Leaflet to re-calculate its size on mount
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    // Watch for container size changes (sidebar open/close)
    const container = map.getContainer();
    let resizeTimer = null;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        map.invalidateSize();
        // Re-fit bounds after resize so map stays centered
        if (geoJsonRef.current) {
          try {
            const bounds = geoJsonRef.current.getBounds();
            if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
              map.fitBounds(bounds, { duration: 0, padding: [10, 10] });
            }
          } catch (e) { }
        }
      }, 200);
    });
    observer.observe(container);

    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [map])

  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  useEffect(() => {
    const handleZoom = () => {
      setZoomLevel(map.getZoom());
    };
    map.on('zoomend', handleZoom);

    // Initial zoom class
    const container = map.getContainer();
    container.classList.add(`zoom-${Math.floor(map.getZoom())}`);

    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map]);

  useEffect(() => {
    const container = map.getContainer();
    // Remove existing zoom classes
    const classes = Array.from(container.classList);
    classes.forEach(c => {
      if (c.startsWith('zoom-')) container.classList.remove(c);
    });
    // Add current zoom class
    container.classList.add(`zoom-${Math.floor(zoomLevel)}`);
  }, [zoomLevel, map]);

  useEffect(() => {
    if (onMapReady) onMapReady(map);
    return () => {
      if (onMapReady) onMapReady(null);
    };
  }, [map, onMapReady]);

  // Zoom to selected feature
  useEffect(() => {
    if ((selectedFeature || selectedFeaturePin) && geoJsonRef.current && !isStatic) {
      const currentPin = selectedFeaturePin || getPin(selectedFeature);
      if (currentPin && lastFlyPinRef.current === currentPin) {
        return;
      }
      lastFlyPinRef.current = currentPin || null;
      try {
        let found = false;

        // Helper to check layers
        const checkLayers = (ref) => {
          if (!ref?.current) return;
          ref.current.eachLayer((layer) => {
            if (found) return;
            const layerPin = getPin(layer.feature);
            const isMatch = selectedFeaturePin ? layerPin === selectedFeaturePin : layer.feature === selectedFeature;
            if (isMatch) {
              found = true;
              if (layer.getBounds) {
                const b = layer.getBounds();
                if (b && typeof b.isValid === 'function' && b.isValid()) {
                  map.flyToBounds(b, { padding: isCad ? [5, 5] : [20, 20], duration: 1 });
                }
              } else if (layer.getLatLng) {
                map.flyTo(layer.getLatLng(), isCad ? 18 : 16, { duration: 1 });
              }
            }
          });
        };

        checkLayers(geoJsonRef);
        // Important: If not found in primary (lots), check background (barangay boundaries)
        if (!found) {
          // we'd need a ref for backgroundGeoData's GeoJSON too, 
          // but we can also just fit bounds to the primary geoData if it's the overlay
          if (isCad && selectedBarangay && geoJsonRef.current) {
            const bounds = geoJsonRef.current.getBounds();
            if (bounds && bounds.isValid()) {
              map.flyToBounds(bounds, { padding: [10, 10], duration: 1 });
            }
          }
        }
      } catch (e) {
        console.warn("Feature zoom error:", e);
      }
    }
  }, [selectedFeature, selectedFeaturePin, isCad, isStatic, map]);

  const handleCenter = () => {
    if (layerKey && layerKey.includes('municipal')) {
      map.setView(LGU_CENTER, 12, { animate: true });
      return;
    }
    if (geoJsonRef.current) {
      try {
        const bounds = geoJsonRef.current.getBounds();
        if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
          map.fitBounds(bounds, { duration: 0.5, padding: [20, 20] });
        }
      } catch (e) { }
    } else {
      map.setView(LGU_CENTER, 12, { animate: true });
    }
  };

  const isSelected = (feature) => {
    if (!feature) return false;
    const currentPin = selectedFeaturePin || getPin(selectedFeature);
    if (!currentPin) return feature === selectedFeature;
    return getPin(feature) === currentPin;
  };

  const getBaseFeatureColor = (feature) => {
    const props = feature?.properties || {};
    return props.color || props.section_color || '#3b82f6';
  };

  const getSelectionStyle = (feature) => {
    const baseColor = getBaseFeatureColor(feature);
    const yellowFill = '#fde047';

    if (selectionHighlight === 'yellow') {
      return {
        weight: 8,
        color: '#ffff00', // Bright pure yellow outline
        opacity: 1,
        fillOpacity: 1,
        fillColor: '#ffff00', // Bright pure yellow fill
        className: 'selected-feature-pulse',
        dashArray: ''
      };
    }

    return {
      weight: 4,
      color: '#3b82f6',
      opacity: 1,
      fillOpacity: isCad ? 0.0 : 0.4,
      fillColor: isCad ? 'transparent' : '#3b82f6',
      className: 'selected-feature-pulse',
      dashArray: ''
    };
  };

  const onEachFeature = (feature, layer) => {
    if (!feature) return;
    const props = feature.properties || {};
    const pin = getPin(feature);
    const pinShort = formatPinShort(pin);

    // Click handler
    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e)
      if (onFeatureSelect) onFeatureSelect(feature)
    })

    // Double click for enlargement if exists
    layer.on('dblclick', (e) => {
      L.DomEvent.stopPropagation(e)
      if (onEnlargementRequest && props.enlargement_id) {
        onEnlargementRequest(props.enlargement_id)
      }
    })

    // Hover effect 
    layer.on('mouseover', () => {
      if (!isStatic) {
        layer.setStyle({ weight: isCad ? 3 : 2, color: '#3b82f6', opacity: 1 });
        if (layer.bringToFront) layer.bringToFront();
      }
    });
    layer.on('mouseout', () => {
      if (!isStatic) {
        const isSel = isSelected(feature);
        if (isSel) {
          layer.setStyle(getSelectionStyle(feature));
        } else {
          layer.setStyle({
            weight: 1.5,
            color: '#ffffff',
            opacity: 1
          });
        }
      }
    });

    // Tooltip - parcel labels show just the Lot Number part (stripped of "LOT" prefix)
    if (props.pin || props.PIN) {
      let lotPart = (pin.split('-').pop() || pin).replace(/LOT\s+/i, '');
      if (props.is_unidentified) {
        lotPart = 'N/A';
      }
      layer.bindTooltip(`${lotPart}`, {
        permanent: true,
        direction: 'center',
        className: 'lot-tooltip'
      });
    } else if (props.section_number && !isCad) {
      layer.bindTooltip(`SEC ${props.section_number}`, {
        permanent: true,
        direction: 'center',
        className: 'section-tooltip'
      });
    }
  };

  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer) => {
        const isSel = isSelected(layer.feature);
        if (isSel) {
          layer.setStyle(getSelectionStyle(layer.feature));
          if (layer.bringToFront) layer.bringToFront();
        }
      });
    }
  }, [selectedFeature, selectedFeaturePin, isCad, isolated, legend, selectionHighlight])

  // Create a more robust key that DOES NOT include selection to avoid full re-mounts.
  // We only change the key when the foundational data or map type changes.
  const geojsonLayerKey = `${layerKey || 'layer'}-${isCad ? 'cad' : 'pim'}`;

  return (
    <>
      <TileLayer
        url="http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
        attribution="&copy; Google"
      />

      {backgroundGeoData && (
        <GeoJSON
          key={`bg-overlay-${backgroundGeoData?.metadata?.barangay || 'none'}`}
          data={backgroundGeoData}
          onEachFeature={(feature, layer) => {
            try {
              const props = feature.properties || {};
              const isLot = props.pin || props.PIN || props.color;
              const isAnySelected = !!(selectedFeature || selectedFeaturePin);

              const isCurrentBrgy = isAnySelected && props.ADM4_EN && selectedBarangay &&
                (props.ADM4_EN.toLowerCase() === selectedBarangay.toLowerCase());

              if (isLot && isCad) {
                const color = props.color || '#ff00ff';
                layer.setStyle({
                  fillOpacity: 0.8,
                  weight: 1.5,
                  color: '#ffffff',
                  fillColor: color,
                  className: 'lot-popup-anim',
                  pane: 'parcels-pane'
                });
              } else {
                layer.setStyle({
                  fillOpacity: isCurrentBrgy ? 0 : (isolated ? 0.01 : 0.05),
                  weight: isCurrentBrgy ? 3 : 1.0,
                  color: isCurrentBrgy ? '#3b82f6' : '#475569',
                  fillColor: isCurrentBrgy ? 'transparent' : (isolated ? '#020617' : '#94a3b8')
                });
              }

              if (isBackgroundInteractive) {
                layer.on('click', (e) => {
                  L.DomEvent.stopPropagation(e);
                  onFeatureSelect(feature);
                });
              }
            } catch (e) { }
          }}
        />
      )}

      {geoData && (
        <GeoJSON
          key={geojsonLayerKey}
          ref={geoJsonRef}
          data={geoData}
          style={(feature) => {
            const props = feature.properties || {};
            const isLot = props.pin || props.PIN;
            const isAnySelected = !!(selectedFeature || selectedFeaturePin);

            if (isSelected(feature)) {
              return getSelectionStyle(feature);
            }

            if (isLot && isCad) {
              const color = props.color || '#ff00ff';
              return {
                fillOpacity: 0.8,
                weight: 1.5,
                color: '#ffffff',
                fillColor: color,
                pane: 'parcels-pane'
              };
            } else if (isCad) {
              return {
                fillOpacity: isAnySelected ? (isolated ? 0.01 : 0.05) : 0.5,
                weight: 1.5,
                opacity: isAnySelected ? (isolated ? 0.1 : 0.4) : 0.8,
                color: isAnySelected ? '#94a3b8' : '#ffffff',
                fillColor: isAnySelected ? (isolated ? '#020617' : '#475569') : '#3b82f6'
              };
            } else {
              const featureColor = props.color || props.section_color || '#3388ff';
              return {
                fillOpacity: 0.75,
                weight: 1.5,
                color: '#ffffff',
                fillColor: featureColor
              };
            }
          }}
          onEachFeature={onEachFeature}
          filter={isValidGeometry}
        />
      )}

      {!isStatic && showCustomControls && (
        <>
          <div className="map-zoom-controls">
            <button className="map-control-btn" onClick={() => map.zoomIn()} title="Zoom In"><Plus size={20} /></button>
            <button className="map-control-btn" onClick={() => map.zoomOut()} title="Zoom Out"><Minus size={20} /></button>
            <button className="map-control-btn" onClick={handleCenter} title="Recenter Map"><Locate size={20} /></button>
          </div>
        </>
      )}

      {error && (
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000, background: 'rgba(255,0,0,0.8)', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px' }}>
          {error}
        </div>
      )}
    </>
  )
}

export default function MapComponent({ geoData, error, onFeatureSelect, onEnlargementRequest, selectedFeature, selectedFeaturePin, selectedBarangay, isCad, isolated, legend, backgroundGeoData, layerKey, isStatic, isBackgroundInteractive = true, showCustomControls = true, onMapReady, selectionHighlight = 'default' }) {
  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={LGU_CENTER}
        zoom={12}
        style={{ height: '100%', width: '100%', background: isolated ? '#020617' : undefined }}
        zoomControl={false}
      >
        <MapContent
          geoData={geoData}
          error={error}
          onFeatureSelect={onFeatureSelect}
          onEnlargementRequest={onEnlargementRequest}
          selectedFeature={selectedFeature}
          selectedFeaturePin={selectedFeaturePin}
          selectedBarangay={selectedBarangay}
          isCad={isCad}
          isolated={isolated}
          legend={legend}
          backgroundGeoData={backgroundGeoData}
          layerKey={layerKey}
          isStatic={isStatic}
          isBackgroundInteractive={isBackgroundInteractive}
          showCustomControls={showCustomControls}
          onMapReady={onMapReady}
          selectionHighlight={selectionHighlight}
        />
      </MapContainer>
    </div>
  );
}
