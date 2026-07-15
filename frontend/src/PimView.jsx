import { useState, useEffect, useMemo, useRef } from 'react';
import { apiGet, apiPost, getAccessToken, clearTokens } from './api';
import MapComponent from './MapComponent';
import { Plus, Minus, Locate } from 'lucide-react';
import L from 'leaflet';

// Complete list of all barangays in San Pascual
const ALL_BARANGAYS = [
    'Alalum', 'Antipolo', 'Balimbing', 'Banaba', 'Bayanan', 'Danglayan',
    'Del Pilar', 'Gelerang Kawayan', 'Ilat North', 'Ilat South', 'Kaingin',
    'Laurel', 'Malaking Pook', 'Mataas na Lupa', 'Natunuan North',
    'Natunuan South', 'Padre Castillo', 'Palsahingin', 'Pila',
    'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Poblacion 4',
    'Pook ni Banal', 'Pook ni Kapitan', 'Resplandor', 'Sambat', 'San Antonio',
    'San Mariano', 'San Mateo', 'Sta. Elena', 'Sto. Nino'
];

const TAX_MAP_CLASS_MAP = {
    'WITH_DATA': { hex: '#3b82f6', label: 'WITH DATA' },
    'UNCLASSIFIED': { hex: '#ff00ff', label: 'UNCLASSIFIED / NO DATA' }
};

function getTaxMapStatus(props) {
    return props?.tax_map_status || (props?.is_unclassified ? 'UNCLASSIFIED' : 'WITH_DATA');
}

export default function PimView({ isStaff, geoData, onHeaderTitleChange, searchBrgy = '', searchPin = '' }) {
    // Navigation State
    const [barangayList, setBarangayList] = useState([]);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [selectedSection, setSelectedSection] = useState(null);
    const [selectedLotPin, setSelectedLotPin] = useState(null);

    // Map Data State
    const [barangayGeoData, setBarangayGeoData] = useState(null);
    const [sectionGeoData, setSectionGeoData] = useState(null);
    const [lotGeoData, setLotGeoData] = useState(null);
    const [enlargementData, setEnlargementData] = useState(null);

    // Lists & Metadata
    const [sectionList, setSectionList] = useState([]);
    const [error, setError] = useState(null);
    const [showEnlargementMap, setShowEnlargementMap] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [refinementLevel, setRefinementLevel] = useState(1.0);
    const [adjustmentStatus, setAdjustmentStatus] = useState(null);
    const [showBarangayPanel, setShowBarangayPanel] = useState(true);
    const [showDetailsPanel, setShowDetailsPanel] = useState(true);
    const [mapInstance, setMapInstance] = useState(null);
    const [showAttrModal, setShowAttrModal] = useState(false);
    const [filterClass, setFilterClass] = useState(null);

    // Caching and Loading States
    const barangayDataCache = useRef({});
    const sectionListCache = useRef({});
    const lotDataCache = useRef({});
    const [isLoadingBarangay, setIsLoadingBarangay] = useState(false);
    const [isLoadingSection, setIsLoadingSection] = useState(false);

    // Load Barangay List on Mount
    useEffect(() => {
        apiGet('/api/pim/barangays/')
            .then(res => {
                if (res.status === 401) throw new Error('Session expired');
                return res.json();
            })
            .then(data => {
                const pimBarangays = data.barangays || [];

                // Create a complete list with all barangays
                const completeList = ALL_BARANGAYS.map(name => {
                    const pimData = pimBarangays.find(b => b.name === name);
                    return {
                        name: name,
                        has_data: pimData ? pimData.has_data : false,
                        section_count: pimData ? pimData.section_count : 0
                    };
                });

                setBarangayList(completeList);
            })
            .catch(err => setError(String(err)));
    }, []);

    const filteredBarangayList = useMemo(() => {
        const query = (searchBrgy || '').trim().toLowerCase();
        if (!query) return barangayList;
        return barangayList.filter(b =>
            (b.name || '').trim().toLowerCase().includes(query)
        );
    }, [barangayList, searchBrgy]);

    useEffect(() => {
        if (!onHeaderTitleChange) return;
        let title = 'Barangay Boundary Index Map';
        if (selectedLotPin) {
            title = 'Parcel Identification Map';
        } else if (selectedSection !== null) {
            title = 'Property Identification Map';
        } else if (selectedBarangay) {
            title = 'Section Index Map';
        }
        onHeaderTitleChange(title);
    }, [selectedBarangay, selectedSection, selectedLotPin, onHeaderTitleChange]);

    // When a Barangay is selected
    useEffect(() => {
        if (!selectedBarangay) {
            setBarangayGeoData(null);
            setSectionList([]);
            setSectionGeoData(null);
            setError(null);
            return;
        }

        setError(null);
        setSectionGeoData(null);
        setLotGeoData(null);
        setShowEnlargementMap(false);

        if (barangayDataCache.current[selectedBarangay]) {
            setBarangayGeoData(barangayDataCache.current[selectedBarangay]);
        } else {
            setBarangayGeoData(null);
            setIsLoadingBarangay(true);
            apiGet(`/api/pim/barangays/${selectedBarangay}/geojson/`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    barangayDataCache.current[selectedBarangay] = data;
                    setBarangayGeoData(data);
                    setIsLoadingBarangay(false);
                })
                .catch(err => {
                    setError(String(err));
                    setIsLoadingBarangay(false);
                });
        }

        if (sectionListCache.current[selectedBarangay]) {
            setSectionList(sectionListCache.current[selectedBarangay]);
        } else {
            apiGet(`/api/pim/barangays/${selectedBarangay}/sections/`)
                .then(res => res.json())
                .then(data => {
                    const sections = data.sections || [];
                    sectionListCache.current[selectedBarangay] = sections;
                    setSectionList(sections);
                })
                .catch(err => console.error(err));
        }
    }, [selectedBarangay]);

    // When a Section is selected
    useEffect(() => {
        if (selectedSection === null || !selectedBarangay) {
            setSectionGeoData(null);
            setLotGeoData(null);
            return;
        }

        setError(null);
        setSelectedLotPin(null);
        setShowEnlargementMap(false);

        const cacheKey = `${selectedBarangay}-${selectedSection}`;

        if (lotDataCache.current[cacheKey]) {
            setLotGeoData(lotDataCache.current[cacheKey]);
        } else {
            setIsLoadingSection(true);
            apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${selectedSection}/lots/`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    lotDataCache.current[cacheKey] = data;
                    setLotGeoData(data);
                    setSelectedLotPin(null);
                    setShowEnlargementMap(false);
                    setIsLoadingSection(false);
                })
                .catch(err => {
                    setError(String(err));
                    setIsLoadingSection(false);
                });
        }
    }, [selectedSection, selectedBarangay]);

    // Unified Search Logic: Barangay switch and Parcel searching
    useEffect(() => {
        const brgyQuery = (searchBrgy || '').trim();
        const pinQuery = (searchPin || '').trim();
        setSearchError(null);

        // If Barangay query is empty, do nothing. 
        // We don't reset navigation state because the user might be 
        // navigating manually while the top search bar is empty.
        if (!brgyQuery) {
            return;
        }

        if (brgyQuery.length < 3) return;

        // Try to find a valid Barangay in the list
        const bMatch = barangayList.find(b =>
            (b.name || '').trim().toLowerCase() === brgyQuery.toLowerCase()
        );

        if (bMatch) {
            // Priority: If PIN is present, perform search
            if (pinQuery.length >= 3) {
                const handler = setTimeout(() => {
                    apiGet(`/api/pim/search/lot/?barangay=${encodeURIComponent(bMatch.name)}&pin=${encodeURIComponent(pinQuery)}`)
                        .then(res => {
                            if (!res.ok) throw new Error("Not found");
                            return res.json();
                        })
                        .then(data => {
                            if (data.is_enlargement && !showEnlargementMap) {
                                setSearchError(`Data is inside Enlargement`);
                                if (bMatch.name !== selectedBarangay) {
                                    setSelectedBarangay(bMatch.name);
                                    setSelectedSection(null);
                                }
                                setSelectedLotPin(null);
                            } else if (data.barangay && data.section_number !== undefined) {
                                setSelectedBarangay(data.barangay);
                                setSelectedSection(data.section_number);
                                setSelectedLotPin(data.pin || pinQuery);
                            }
                        })
                        .catch((err) => {
                            if (pinQuery) {
                                setSearchError(`Data not found. Lot "No. ${pinQuery}" not existing`);
                            }
                            // If PIN search fails, but we've changed barangay, switch to that barangay overview
                            if (bMatch.name !== selectedBarangay) {
                                setSelectedBarangay(bMatch.name);
                                setSelectedSection(null);
                                setSelectedLotPin(null);
                            }
                        });
                }, 500);
                return () => clearTimeout(handler);
            } else {
                // Case: No PIN input (empty or too short)
                // We show the barangay sections overview if:
                // 1. We just switched to this barangay
                // 2. OR we were looking at a specific lot and just cleared/shortened the PIN search
                const isShortPin = pinQuery.length > 0 && pinQuery.length < 3;
                if (bMatch.name !== selectedBarangay || selectedLotPin || isShortPin) {
                    setSelectedBarangay(bMatch.name);
                    setSelectedSection(null);
                    setSelectedLotPin(null);
                }
            }
        }
    }, [searchBrgy, searchPin, barangayList, showEnlargementMap]);

    const normalizePin = (value) => (value ? String(value).trim() : '');
    const getFeaturePin = (feature) => normalizePin(feature?.properties?.pin || feature?.properties?.PIN);

    const selectedLot = useMemo(() => {
        if (!selectedLotPin) return null;
        let found = null;
        if (showEnlargementMap && enlargementData?.features?.length) {
            found = enlargementData.features.find(f => getFeaturePin(f) === selectedLotPin);
        }
        if (!found && lotGeoData?.features?.length) {
            found = lotGeoData.features.find(f => getFeaturePin(f) === selectedLotPin);
        }
        return found || null;
    }, [selectedLotPin, lotGeoData, enlargementData, showEnlargementMap]);

    const sortedLotFeatures = useMemo(() => {
        const features = [];
        const existingPins = new Set();
        
        if (showEnlargementMap && enlargementData?.features) {
            for (const f of enlargementData.features) {
                const pin = getFeaturePin(f);
                if (pin) {
                    features.push(f);
                    existingPins.add(pin);
                }
            }
        }
        if (lotGeoData?.features) {
            for (const f of lotGeoData.features) {
                const pin = getFeaturePin(f);
                if (pin && !existingPins.has(pin)) {
                    features.push(f);
                    existingPins.add(pin);
                }
            }
        }
        return features.sort((a, b) => {
            const valA = String(a.properties.pin || '').split('-').pop() || '';
            const valB = String(b.properties.pin || '').split('-').pop() || '';
            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [lotGeoData, enlargementData, showEnlargementMap]);

    useEffect(() => {
        if (!selectedLot?.properties) return;
        const saved = selectedLot.properties.adjustment_rate;

        // Quick check if the lot is considered RRW to avoid defaulting Standard (1.0)
        let hasRrw = false;
        const lotProp = (key) => {
            if (!key) return undefined;
            if (selectedLot.properties[key] !== undefined) return selectedLot.properties[key];
            const lowerKey = String(key).toLowerCase();
            const matchKey = Object.keys(selectedLot.properties).find(k => String(k).toLowerCase() === lowerKey);
            return matchKey ? selectedLot.properties[matchKey] : undefined;
        };
        const getNumberProp = (keys) => {
            for (const key of keys) {
                const val = lotProp(key);
                if (val !== undefined && val !== null && val !== '') {
                    if (typeof val === 'number') return val;
                    const cleanVal = String(val).replace(/,/g, '').trim();
                    const match = cleanVal.match(/[-+]?\d*\.?\d+/);
                    if (match) {
                        const num = parseFloat(match[0]);
                        if (!isNaN(num)) return num;
                    }
                }
            }
            return 0;
        };
        const areaRrw = getNumberProp(['area_rrw']);
        if (areaRrw > 0) {
            hasRrw = true;
        } else {
            const genericArea = getNumberProp(['area', 'land_area', 'lot_area']);
            const landUse = String(lotProp('land_use') || lotProp('landuse') || lotProp('classification') || '').toLowerCase();
            let totalClassArea = 0;
            totalClassArea += getNumberProp(['area_res', 'area_resi', 'area_residential']);
            totalClassArea += getNumberProp(['area_agri', 'area_agriculture', 'area_agricultural']);
            totalClassArea += getNumberProp(['area_comml', 'area_comm', 'area_commercial']);
            totalClassArea += getNumberProp(['area_indl', 'area_ind', 'area_industrial']);
            totalClassArea += getNumberProp(['area_exempt']);
            if (totalClassArea === 0 && genericArea > 0 && landUse.includes('rrw')) {
                hasRrw = true;
            }
        }

        if (saved === 0.5 || saved === 0.75 || saved === 1.0) {
            setRefinementLevel(saved);
        } else if (hasRrw) {
            setRefinementLevel(null);
        } else {
            setRefinementLevel(1.0);
        }
        setAdjustmentStatus(null);
    }, [selectedLot]);

    const applyLocalAdjustment = (pin, rate) => {
        const normPin = normalizePin(pin);
        if (!normPin) return;
        setLotGeoData(prev => {
            if (!prev?.features) return prev;
            let matched = null;
            const updated = prev.features.map(f => {
                const fPin = normalizePin(f?.properties?.pin || f?.properties?.PIN);
                if (fPin !== normPin) return f;
                const nextFeature = {
                    ...f,
                    properties: { ...f.properties, adjustment_rate: rate }
                };
                matched = nextFeature;
                return nextFeature;
            });
            if (matched) {
                setSelectedLotPin(normPin);
            }
            return { ...prev, features: updated };
        });
    };

    const loadEnlargementForSection = (sectionNum, lotFeature = null) => {
        if (!selectedBarangay || sectionNum === null) return;
        if (lotFeature) {
            const pin = getFeaturePin(lotFeature);
            if (pin) setSelectedLotPin(pin);
        }
        apiGet(`/api/pim/barangays/${selectedBarangay}/sections/${sectionNum}/enlargement/`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setEnlargementData(data);
                setShowEnlargementMap(true);
            })
            .catch(err => alert("Error loading enlargement: " + String(err)));
    };

    const handleLoadEnlargement = () => {
        loadEnlargementForSection(selectedSection, selectedLot);
        setSelectedLotPin(null);
    };

    const handlePopupEnlargement = (feature) => {
        const sectionNum = feature?.properties?.section_number ?? selectedSection;
        loadEnlargementForSection(sectionNum, feature);
    };

    const handleMapFeatureSelect = (feature) => {
        if (!feature || !feature.properties) return;

        if (feature.properties.ADM4_EN && !selectedBarangay) {
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        else if (feature.properties.ADM4_EN && selectedBarangay && feature.properties.ADM4_EN !== selectedBarangay) {
            setSelectedSection(null);
            setSelectedLotPin(null);
            setSelectedBarangay(feature.properties.ADM4_EN);
        }
        else if (feature.properties.hasOwnProperty('section_number') && !feature.properties.hasOwnProperty('PIN') && !feature.properties.hasOwnProperty('pin')) {
            setSelectedLotPin(null);
            setSelectedSection(feature.properties.section_number);
        }
        else if (feature.properties.hasOwnProperty('PIN') || feature.properties.hasOwnProperty('pin') || feature.properties.hasOwnProperty('owner')) {
            const pin = getFeaturePin(feature);
            if (pin) setSelectedLotPin(pin);
        }
    };

    let activeGeoData = null;
    let backgroundGeoData = null;
    let activeLayerKey = 'loading';

    if (!selectedBarangay) {
        activeGeoData = geoData;
        backgroundGeoData = null;
        activeLayerKey = 'municipality';
    } else {
        backgroundGeoData = geoData;
        if (showEnlargementMap && enlargementData) {
            activeGeoData = enlargementData;
            activeLayerKey = 'enlargement';
        } else if (selectedSection !== null && lotGeoData) {
            activeGeoData = lotGeoData;
            activeLayerKey = 'section-' + selectedSection;
        } else if (selectedSection !== null && isLoadingSection) {
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay + '-loading';
        } else if (selectedSection !== null && !lotGeoData) {
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay;
        } else if (barangayGeoData) {
            activeGeoData = barangayGeoData;
            activeLayerKey = 'barangay-' + selectedBarangay;
        } else {
            activeGeoData = null;
            activeLayerKey = 'empty-or-loading';
        }
    }

    const filteredActiveGeoData = useMemo(() => {
        if (!activeGeoData || !filterClass || activeLayerKey.includes('municipality') || activeLayerKey.includes('barangay')) return activeGeoData;
        return {
            ...activeGeoData,
            features: activeGeoData.features.filter(f => {
                const key = getTaxMapStatus(f.properties);
                return key === filterClass;
            })
        };
    }, [activeGeoData, filterClass, activeLayerKey]);

    const selectedBarangayFeature = useMemo(() => {
        if (!selectedBarangay || !geoData?.features?.length) return null;
        return geoData.features.find(feature =>
            String(feature?.properties?.ADM4_EN || '').trim().toLowerCase() === String(selectedBarangay).trim().toLowerCase()
        ) || null;
    }, [geoData, selectedBarangay]);

    const selectedSectionFeature = useMemo(() => {
        if (selectedSection === null || !barangayGeoData?.features?.length) return null;
        return barangayGeoData.features.find(feature => feature?.properties?.section_number === selectedSection) || null;
    }, [barangayGeoData, selectedSection]);

    const activeFeature = selectedLot || selectedSectionFeature || selectedBarangayFeature || null;
    const selectedLotIsUnclassified = getTaxMapStatus(selectedLot?.properties) === 'UNCLASSIFIED';
    const showClassificationCard = Boolean(selectedLot && (activeLayerKey.includes('section') || activeLayerKey === 'enlargement'));

    const handleRecenter = () => {
        if (!mapInstance) return;
        if (activeLayerKey === 'municipality') {
            mapInstance.setView([13.7937, 121.0478], 12);
            return;
        }
        try {
            if (activeGeoData?.features?.length) {
                const bounds = L.geoJSON(activeGeoData).getBounds();
                if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) {
                    mapInstance.fitBounds(bounds, { padding: [10, 10], duration: 0.25 });
                    return;
                }
            }
        } catch (e) { }
        mapInstance.setView([13.7937, 121.0478], 13);
    };

    const safeNum = (val) => {
        if (val === null || val === undefined || isNaN(val)) return 0;
        return Number(val);
    };

    const lotProp = (key) => {
        if (!selectedLot?.properties || !key) return undefined;
        if (selectedLot.properties[key] !== undefined) return selectedLot.properties[key];
        const lowerKey = String(key).toLowerCase();
        const matchKey = Object.keys(selectedLot.properties).find(k => String(k).toLowerCase() === lowerKey);
        return matchKey ? selectedLot.properties[matchKey] : undefined;
    };

    const computedTax = useMemo(() => {
        if (!selectedLot || !selectedLot.properties) return null;
        const p = selectedLot.properties;

        const getNumberProp = (keys) => {
            for (const key of keys) {
                const val = lotProp(key);
                if (val !== undefined && val !== null && val !== '') {
                    if (typeof val === 'number') return val;
                    const cleanVal = String(val).replace(/,/g, '').trim();
                    const match = cleanVal.match(/[-+]?\d*\.?\d+/);
                    if (match) {
                        const num = parseFloat(match[0]);
                        if (!isNaN(num)) return num;
                    }
                }
            }
            return 0;
        };

        const baseAdjustment = (refinementLevel === 0.5 || refinementLevel === 0.75 || refinementLevel === 1.0) ? refinementLevel : 1.0;

        const classes = [
            {
                key: 'res',
                label: 'Residential',
                areaKeys: ['area_res', 'area_resi', 'area_residential'],
                unitKeys: ['unit_value_res', 'unit_value_residential'],
                assessmentLevel: 0.05
            },
            {
                key: 'agri',
                label: 'Agricultural',
                areaKeys: ['area_agri', 'area_agriculture', 'area_agricultural'],
                unitKeys: ['unit_value_agri', 'unit_value_agricultural'],
                assessmentLevel: 0.06
            },
            {
                key: 'comml',
                label: 'Commercial',
                areaKeys: ['area_comml', 'area_comm', 'area_commercial'],
                unitKeys: ['unit_value_comml', 'unit_value_commercial'],
                assessmentLevel: 0.25
            },
            {
                key: 'indl',
                label: 'Industrial',
                areaKeys: ['area_indl', 'area_ind', 'area_industrial'],
                unitKeys: ['unit_value_indl', 'unit_value_industrial'],
                assessmentLevel: 0.45
            },
            {
                key: 'rrw',
                label: 'RRW',
                areaKeys: ['area_rrw'],
                unitKeys: ['unit_value_rrw'],
                assessmentLevel: getNumberProp(['assessment_rrw', 'assessment_level_rrw']) || 0
            },
            {
                key: 'exempt',
                label: 'Exempt',
                areaKeys: ['area_exempt'],
                unitKeys: [],
                assessmentLevel: 0
            }
        ];

        const genericArea = getNumberProp(['area', 'land_area', 'lot_area']);
        const genericUnit = getNumberProp(['unit_value', 'unit_value_sqm', 'unit_val', 'unitvalue', 'unit_value_sq_m', 'unit_value_sq_m.']);
        const landUse = String(lotProp('land_use') || lotProp('landuse') || lotProp('classification') || '').toLowerCase();

        let totalClassArea = 0;
        const perClass = classes.map(cls => {
            const area = getNumberProp(cls.areaKeys);
            totalClassArea += area;
            return { ...cls, area };
        });

        if (totalClassArea === 0 && genericArea > 0) {
            const match = perClass.find(cls => landUse.includes(cls.key) || landUse.includes(cls.label.toLowerCase()));
            if (match) {
                match.area = genericArea;
                totalClassArea = genericArea;
            }
        }

        const baseClasses = perClass.filter(cls => cls.area > 0 && !['rrw', 'exempt'].includes(cls.key));
        const primaryClass = baseClasses.reduce((acc, cls) => {
            if (!acc) return cls;
            return cls.area > acc.area ? cls : acc;
        }, null);
        
        // Find a fallback class that at least provides a unit value in attributes
        const classWithUnitValue = classes.find(c => getNumberProp(c.unitKeys) > 0 && !['rrw', 'exempt'].includes(c.key));
        const rrwAssessmentLevel = primaryClass ? primaryClass.assessmentLevel : (classWithUnitValue ? classWithUnitValue.assessmentLevel : 0);

        const computed = perClass
            .map(cls => {
                if (cls.area <= 0) return null;
                let unitValue = getNumberProp(cls.unitKeys || []);
                if (unitValue <= 0 && genericUnit > 0) unitValue = genericUnit;
                
                // Allow RRW to inherit unit value from a fallback class (like residential) if it lacks its own
                if (cls.key === 'rrw' && unitValue <= 0 && classWithUnitValue) {
                    unitValue = getNumberProp(classWithUnitValue.unitKeys);
                }
                
                const adjustment = cls.key === 'rrw' ? 0.20 : baseAdjustment;
                const marketValue = cls.area * unitValue * adjustment;
                const assessmentLevel = cls.key === 'rrw' ? rrwAssessmentLevel : cls.assessmentLevel;
                const assessedValue = marketValue * assessmentLevel;
                return {
                    key: cls.key,
                    label: cls.label,
                    area: cls.area,
                    unitValue,
                    adjustment,
                    assessmentLevel,
                    marketValue,
                    assessedValue
                };
            })
            .filter(Boolean);

        const totalArea = computed.reduce((sum, c) => sum + c.area, 0);
        const totalMarketValue = computed.reduce((sum, c) => sum + c.marketValue, 0);
        const totalAssessedValue = computed.reduce((sum, c) => sum + c.assessedValue, 0);
        const taxRate = 0.02;
        const rpt = totalAssessedValue * taxRate;

        return {
            perClass: computed,
            totalArea,
            totalMarketValue,
            totalAssessedValue,
            taxRate,
            rpt,
            baseAdjustment
        };
    }, [selectedLot, refinementLevel]);

    const areaBreakdown = useMemo(() => {
        if (!computedTax?.perClass?.length) return [];
        return computedTax.perClass.map(item => ({
            key: item.key,
            label: `${item.label}`,
            value: item.area
        }));
    }, [computedTax]);

    const formatMoney = (val) => {
        const num = safeNum(val);
        return `₱${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    };

    const lotAttributeEntries = useMemo(() => {
        if (!selectedLot?.properties) return [];
        const grouped = new Map();
        for (const [rawKey, rawVal] of Object.entries(selectedLot.properties)) {
            if (!rawKey) continue;
            const lowerKey = String(rawKey).toLowerCase();
            if (lowerKey === 'geom') continue;

            const displayKey = lowerKey === 'pin' ? 'PIN' : String(rawKey);
            const valueStr = (rawVal === null || rawVal === undefined || rawVal === '') ? '' : String(rawVal);

            if (!grouped.has(lowerKey)) {
                grouped.set(lowerKey, { key: displayKey, values: new Set(valueStr ? [valueStr] : []) });
            } else if (valueStr) {
                grouped.get(lowerKey).values.add(valueStr);
            }
        }

        return Array.from(grouped.values())
            .map(item => {
                const values = Array.from(item.values);
                return [item.key, values.length ? values.join(' | ') : 'N/A'];
            })
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }, [selectedLot]);

    return (
        <div className="pim-layout" style={{ height: '100%', display: 'flex', position: 'relative' }}>
            {/* LEFT: Barangay Filter Panel + Classification Card */}
            <div style={{
                width: '24%',
                maxWidth: '24rem',
                position: 'absolute',
                top: '4.5rem',
                left: '0.75rem',
                bottom: '0.75rem',
                zIndex: 950,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                transform: showBarangayPanel ? 'translateX(0)' : 'translateX(-110%)',
                transition: 'transform 0.25s ease'
            }}>
                <div className="pim-filter-panel" style={{
                    background: '#fff',
                    padding: '0.9375rem',
                    borderRadius: '0.75rem',
                    boxShadow: '0 0.5rem 1.5rem rgba(15,23,42,0.18)',
                    overflowY: 'auto',
                    flex: 1,
                    minHeight: 0
                }}>
                    <h3 style={{ marginTop: 0, color: '#0f1d35', borderBottom: '0.125rem solid #e2e8f0', paddingBottom: '0.625rem' }}>Barangays</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        {filteredBarangayList.map(b => (
                            <button
                                key={b.name}
                                onClick={() => {
                                    setSelectedBarangay(b.name);
                                    setSelectedSection(null);
                                    setSelectedLotPin(null);
                                }}
                                style={{
                                    textAlign: 'left', padding: '0.35rem 0.625rem', borderRadius: '0.375rem', border: '0.0625rem solid #e2e8f0',
                                    background: selectedBarangay === b.name ? '#a9dbfaff' : '#fff',
                                    borderColor: selectedBarangay === b.name ? '#3b82f6' : '#e2e8f0',
                                    cursor: 'pointer', opacity: b.has_data ? 1 : 0.5
                                }}
                            >
                                <div style={{ fontWeight: 'bold', color: '#0f1d35', fontSize: '0.85rem', textTransform: 'uppercase' }}>{b.name}</div>
                                {b.has_data ? (
                                    <div style={{ fontSize: '0.75rem', color: '#0f172a', textTransform: 'capitalize', letterSpacing: '0.03rem' }}>{b.section_count} sections</div>
                                ) : (
                                    <div style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic', textTransform: 'capitalize' }}>⚠ No data</div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {showClassificationCard && (
                    <div className="pim-map-legend" style={{
                        background: 'rgba(255, 255, 255, 0.97)',
                        padding: '1rem',
                        borderRadius: '0.75rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            CLASSIFICATION
                            {filterClass && <button onClick={() => setFilterClass(null)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.6rem' }}>RESET</button>}
                        </div>
                        {Object.entries(TAX_MAP_CLASS_MAP).map(([key, cfg]) => (
                            <div
                                key={key}
                                onClick={() => setFilterClass(key === filterClass ? null : key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.65rem', fontWeight: 700, color: '#475569', cursor: 'pointer',
                                    opacity: filterClass && key !== filterClass ? 0.3 : 1,
                                    background: filterClass === key ? '#f1f5f9' : 'transparent',
                                    padding: '2px 4px', borderRadius: '4px'
                                }}
                            >
                                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: cfg.hex }} />
                                {cfg.label}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CENTER: Main Map View */}
            <div className="pim-map-area" style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                    <button onClick={() => setShowBarangayPanel(v => !v)} style={{ background: '#a9dbfaff', color: '#0f172a', border: '0.0625rem solid #a9dbfaff', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'normal', textTransform: 'capitalize', letterSpacing: '0.03rem' }}>
                        {showBarangayPanel ? 'Hide Barangays' : 'Show Barangays'}
                    </button>
                    <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="pim-map-ctrl-btn" onClick={() => mapInstance?.zoomIn()} type="button" style={{ textTransform: 'capitalize' }} disabled={!mapInstance}>
                            <Plus size={16} /><span>Zoom In</span>
                        </button>
                        <button className="pim-map-ctrl-btn" onClick={() => mapInstance?.zoomOut()} type="button" style={{ textTransform: 'capitalize' }} disabled={!mapInstance}>
                            <Minus size={16} /><span>Zoom Out</span>
                        </button>
                        <button className="pim-map-ctrl-btn pim-map-ctrl-btn-primary" onClick={handleRecenter} type="button" style={{ textTransform: 'capitalize' }} disabled={!mapInstance}>
                            <Locate size={16} /><span>Recenter</span>
                        </button>
                        <button onClick={() => setShowDetailsPanel(v => !v)} style={{ background: '#a9dbfaff', color: '#0f172a', border: '0.0625rem solid #a9dbfaff', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'normal', textTransform: 'capitalize', letterSpacing: '0.03rem' }}>
                            {showDetailsPanel ? 'Hide Details' : 'Show Details'}
                        </button>
                    </div>
                </div>

                <div className="map-view" data-blurred={!!selectedBarangay} style={{ flex: 1, borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 0.0625rem 0.375rem rgba(0, 0, 0, 0.06)', position: 'relative', minHeight: 0 }}>
                    {(isLoadingBarangay || isLoadingSection) && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: 'rgba(255,255,255,0.9)', padding: '1.25rem 2.5rem', borderRadius: '0.75rem', boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.15)', fontSize: '1.1em', fontWeight: 'bold', color: '#1e3a5f' }}>
                            Loading map data...
                        </div>
                    )}
                    <MapComponent
                        geoData={filteredActiveGeoData}
                        error={error}
                        onFeatureSelect={handleMapFeatureSelect}
                        onEnlargementRequest={handlePopupEnlargement}
                        selectedFeature={activeFeature}
                        selectedFeaturePin={selectedLotPin || (selectedLot ? getFeaturePin(selectedLot) : null)}
                        backgroundGeoData={backgroundGeoData}
                        isBackgroundInteractive={false}
                        showCustomControls={false}
                        onMapReady={setMapInstance}
                        layerKey={activeLayerKey + (filterClass || '')}
                        selectionHighlight="yellow"
                    />
                </div>
            </div>

            {/* RIGHT: Detail & Lot List Panel */}
            <div className="pim-details" style={{
                width: '30%',
                maxWidth: '28rem',
                background: '#fff',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                overflowY: 'auto',
                boxShadow: '0 0.5rem 1.5rem rgba(15,23,42,0.18)',
                position: 'absolute',
                top: '4.5rem',
                right: '0.75rem',
                bottom: '0.75rem',
                zIndex: 950,
                transform: showDetailsPanel ? 'translateX(0)' : 'translateX(110%)',
                transition: 'transform 0.25s ease'
            }}>
                {searchError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem' }}>⚠ {searchError}</div>
                        <button onClick={() => setSearchError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.2rem' }}>×</button>
                    </div>
                )}

                {selectedSection !== null ? (
                    <>
                        {selectedLot && (lotGeoData?.features || enlargementData?.features) ? (
                            <div className="lot-details">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9375rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, color: '#0f1d35' }}>Lot Details</h3>
                                    <button
                                        onClick={() => {
                                            if (showEnlargementMap) {
                                                setShowEnlargementMap(false);
                                            } else {
                                                setSelectedLotPin(null);
                                            }
                                        }}
                                        style={{
                                            background: showEnlargementMap ? '#fee2e2' : '#a9dbfaff', 
                                            color: showEnlargementMap ? '#991b1b' : '#0f172a', 
                                            border: 'none', padding: '0.45rem 1rem', borderRadius: '0.375rem',
                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'normal', textTransform: 'capitalize', letterSpacing: '0.03rem'
                                        }}
                                    >
                                        {showEnlargementMap ? 'Close Enlargement' : 'Back to Lots'}
                                    </button>
                                </div>
                                <div className="lot-details-grid">
                                    <div className="lot-detail-field full">
                                        <label>Parcel Identification Number</label>
                                        <select value={selectedLotPin || ''} onChange={(e) => {
                                            setSelectedLotPin(e.target.value);
                                        }} className="lot-select">
                                            {sortedLotFeatures.map((f, idx) => {
                                                const pin = getFeaturePin(f);
                                                const label = String(f.properties.pin || '').split('-').pop() || (idx + 1);
                                                return <option key={pin} value={pin}>{label}</option>
                                            })}
                                        </select>
                                    </div>
                                    <div className="lot-detail-field full">
                                        <button
                                            type="button"
                                            className="pim-attr-btn"
                                            onClick={() => setShowAttrModal(true)}
                                        >
                                            View All Attributes
                                        </button>
                                    </div>
                                    {selectedLotIsUnclassified && (
                                        <div className="lot-enlargement-box">
                                            <p className="enlarge-text">
                                                {selectedLot?.properties?.has_enlargement
                                                    ? 'This lot is unclassified / no data, or with enlargement data. To see enlargement details, click see enlargement button.'
                                                    : 'This lot is unclassified / no data. Use the attributes button to inspect the raw lot data.'}
                                            </p>
                                            {selectedLot?.properties?.has_enlargement && (
                                                <button onClick={handleLoadEnlargement} className="enlarge-btn">SEE ENLARGEMENT DATA</button>
                                            )}
                                        </div>
                                    )}
                                    <div className="lot-detail-field full"><label>BARANGAY</label><div className="lot-val-box">{selectedBarangay}</div></div>
                                    <div className="lot-detail-field full"><label>SECTION #</label><div className="lot-val-box">Section {selectedSection}</div></div>
                                    <div className="lot-detail-card full"><label>PIN</label><div className="lot-card-val highlight">{lotProp('pin') || 'N/A'}</div></div>
                                    <div className="lot-detail-row" style={{ display: 'flex', gap: '0.75rem', gridColumn: 'span 1' }}>
                                        <div className="lot-detail-card" style={{ flex: 1 }}><label>ARP NO.</label><div className="lot-card-val">{lotProp('arp_no') || 'N/A'}</div></div>
                                        <div className="lot-detail-card" style={{ flex: 1 }}><label>PREVIOUS ARP NO.</label><div className="lot-card-val">{lotProp('prev_arp_no') || lotProp('previous_arp_no') || lotProp('previous_arp') || 'N/A'}</div></div>
                                    </div>
                                    <div className="lot-detail-card full"><label>NAME OF OWNER/S</label><div className="lot-card-val">{lotProp('owner') || 'N/A'}</div></div>
                                    <div className="lot-detail-card full"><label>ADDRESS OF OWNER</label><div className="lot-card-val">{lotProp('address') || `Lot ${String(lotProp('pin') || '').split('-').pop() || '?'}, Sec. ${selectedSection}, Brgy. ${selectedBarangay}, San Pascual, Batangas`}</div></div>
                                    <div className="lot-detail-card full"><label>AREA (SQM)</label>
                                        <div className="lot-card-val">
                                            {areaBreakdown.length > 0 ? (
                                                <div>
                                                    {areaBreakdown.map(item => (
                                                        <div key={item.key}>{item.label}: {item.value.toFixed(2)} sqm</div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div>{computedTax?.totalArea ? `${computedTax.totalArea.toFixed(2)} sqm` : 'N/A'}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="lot-detail-card full specialty"><label>Dirt Road Access (ADJUSTMENT)</label>
                                        <div className="adj-buttons">
                                            <button
                                                className={refinementLevel === 1.0 ? 'active' : ''}
                                                onClick={() => {
                                                    setRefinementLevel(1.0);
                                                    const pin = selectedLot?.properties?.pin || selectedLot?.properties?.PIN;
                                                    if (pin) {
                                                        setAdjustmentStatus('saving');
                                                        applyLocalAdjustment(pin, 1.0);
                                                        apiPost('/api/pim/lots/adjustment/', { pin, adjustment_rate: 1.0 })
                                                            .then(() => {
                                                                setAdjustmentStatus('saved');
                                                                try { localStorage.setItem('rpt_report_dirty', String(Date.now())); } catch { }
                                                            })
                                                            .catch(() => setAdjustmentStatus('error'));
                                                    }
                                                }}
                                            >
                                                Standard (1.0)
                                            </button>
                                            <button
                                                className={refinementLevel === 0.75 ? 'active' : ''}
                                                onClick={() => {
                                                    setRefinementLevel(0.75);
                                                    const pin = selectedLot?.properties?.pin || selectedLot?.properties?.PIN;
                                                    if (pin) {
                                                        setAdjustmentStatus('saving');
                                                        applyLocalAdjustment(pin, 0.75);
                                                        apiPost('/api/pim/lots/adjustment/', { pin, adjustment_rate: 0.75 })
                                                            .then(() => {
                                                                setAdjustmentStatus('saved');
                                                                try { localStorage.setItem('rpt_report_dirty', String(Date.now())); } catch { }
                                                            })
                                                            .catch(() => setAdjustmentStatus('error'));
                                                    }
                                                }}
                                            >
                                                With Access (0.75)
                                            </button>
                                            <button
                                                className={refinementLevel === 0.50 ? 'active' : ''}
                                                onClick={() => {
                                                    setRefinementLevel(0.50);
                                                    const pin = selectedLot?.properties?.pin || selectedLot?.properties?.PIN;
                                                    if (pin) {
                                                        setAdjustmentStatus('saving');
                                                        applyLocalAdjustment(pin, 0.5);
                                                        apiPost('/api/pim/lots/adjustment/', { pin, adjustment_rate: 0.5 })
                                                            .then(() => {
                                                                setAdjustmentStatus('saved');
                                                                try { localStorage.setItem('rpt_report_dirty', String(Date.now())); } catch { }
                                                            })
                                                            .catch(() => setAdjustmentStatus('error'));
                                                    }
                                                }}
                                            >
                                                No Access (0.50)
                                            </button>
                                        </div>
                                        {adjustmentStatus && (
                                            <div style={{ marginTop: '0.4rem', fontSize: '0.75em', color: adjustmentStatus === 'error' ? '#ef4444' : '#64748b' }}>
                                                {adjustmentStatus === 'saving' && 'Saving adjustment...'}
                                                {adjustmentStatus === 'saved' && 'Saved.'}
                                                {adjustmentStatus === 'error' && 'Save failed. Check backend/migrations.'}
                                            </div>
                                        )}
                                        {computedTax?.perClass?.some(c => c.key === 'rrw') && (
                                            <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: '#0f315e', fontStyle: 'italic', background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '0.25rem', borderLeft: '3px solid #cbd5e1' }}>
                                                * Note: Computations for RRW areas override this selection and strictly default to a 0.20 adjustment modifier.
                                            </div>
                                        )}
                                    </div>
                                    {computedTax?.perClass?.length > 1 && (
                                        <div className="lot-detail-card full" style={{ padding: '1rem', borderRadius: '0.5rem', border: '1px solid #f1f5f9', background: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 400, color: '#334155', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'block' }}>PER-CLASS COMPUTATION</label>
                                            <div className="lot-card-val">
                                                {computedTax.perClass.map((item, idx) => (
                                                    <div key={item.key} style={{ marginBottom: idx === computedTax.perClass.length - 1 ? 0 : '1rem' }}>
                                                        <div style={{ fontWeight: 700, color: '#0f315e', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{item.label}</div>
                                                        <div style={{ color: '#0f315e', fontSize: '0.85rem', fontWeight: 600 }}>Market Value: {formatMoney(item.marketValue)}</div>
                                                        <div style={{ color: '#0f315e', fontSize: '0.85rem', fontWeight: 600 }}>Assessed Value: {formatMoney(item.assessedValue)}</div>
                                                        <div style={{ color: '#0f315e', fontSize: '0.85rem', fontWeight: 600 }}>Assessment Level: {(item.assessmentLevel * 100).toFixed(0)}%</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {computedTax?.perClass?.length <= 1 && (
                                        <div className="lot-detail-card full highlight-tax" style={{ background: '#f4fbf7', border: 'none', borderLeft: '6px solid #10b981', borderRadius: '0.375rem', padding: '0.85rem 1rem' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 400, color: '#334155', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'block' }}>MARKET VALUE</label>
                                            <div className="lot-card-val primary" style={{ color: '#0f315e', fontSize: '1.4rem', fontWeight: 700 }}>{formatMoney(lotProp('market_value') ?? computedTax?.totalMarketValue)}</div>
                                        </div>
                                    )}
                                    <div className="lot-detail-card full highlight-tax" style={{ background: '#f4fbf7', border: 'none', borderLeft: '6px solid #10b981', borderRadius: '0.375rem', padding: '0.85rem 1rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 400, color: '#334155', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'block' }}>TOTAL ASSESSED VALUE</label>
                                        <div className="lot-card-val secondary" style={{ color: '#0f315e', fontSize: '1.4rem', fontWeight: 700 }}>{formatMoney(lotProp('assessed_value') ?? lotProp('assessment_value') ?? computedTax?.totalAssessedValue)}</div>
                                    </div>
                                    <div className="lot-detail-card full highlight-tax" style={{ background: '#f4fbf7', border: 'none', borderLeft: '6px solid #10b981', borderRadius: '0.375rem', padding: '0.85rem 1rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 400, color: '#334155', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'block' }}>REAL PROPERTY TAX (RPT)</label>
                                        <div className="lot-card-val secondary" style={{ color: '#0f315e', fontSize: '1.4rem', fontWeight: 700 }}>{formatMoney(lotProp('rpt') ?? computedTax?.rpt)}</div>
                                    </div>
                                    {selectedLot?.properties?.has_enlargement && !selectedLotIsUnclassified && (
                                        <div className="lot-enlargement-box">
                                            <p className="enlarge-text">This lot is unclassified / no data, or with enlargement data. To see enlargement details, click see enlargement button.</p>
                                            <button onClick={handleLoadEnlargement} className="enlarge-btn">SEE ENLARGEMENT DATA</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="section-lots-list">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9375rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, color: '#0f1d35' }}>Section {selectedSection} Lots</h3>
                                    <button
                                        onClick={() => { setSelectedSection(null); setLotGeoData(null); setSelectedLotPin(null); }}
                                        style={{
                                            background: '#a9dbfaff', color: '#000', border: 'none', padding: '0.45rem 1rem', borderRadius: '0.375rem',
                                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'normal'
                                        }}
                                    >
                                        Back to Sections
                                    </button>
                                </div>
                                {isLoadingSection ? <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1.25rem' }}>Loading lots...</div> : (sortedLotFeatures.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem' }}>
                                        {sortedLotFeatures.map((f, i) => (
                                            <button key={i} onClick={() => {
                                                const pin = getFeaturePin(f);
                                                if (pin) setSelectedLotPin(pin);
                                            }} style={{ textAlign: 'left', padding: '0.5rem', border: '0.0625rem solid #e2e8f0', borderRadius: '0.25rem', background: '#fff', cursor: 'pointer', color: '#1e3a5f', fontWeight: 'normal' }}>
                                                {f.properties?.owner || `PIN: ${f.properties?.pin || 'Unknown'}`}
                                                {f.properties?.arp_no && <div style={{ fontSize: '0.8em', color: '#64748b' }}>ARP: {f.properties.arp_no}</div>}
                                            </button>
                                        ))}
                                    </div>
                                ) : <div style={{ color: '#ef4444', fontStyle: 'italic', textAlign: 'center', padding: '1.25rem' }}>⚠ No lots available</div>)}
                            </div>
                        )}
                    </>
                ) : selectedBarangay ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9375rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, color: '#0f1d35' }}>{selectedBarangay} Sections</h3>
                            <button
                                onClick={() => {
                                    setSelectedBarangay(null);
                                    setBarangayGeoData(null);
                                    setSelectedSection(null);
                                    setSelectedLotPin(null);
                                }}
                                style={{
                                    background: '#a9dbfaff', color: '#0f172a', border: 'none', padding: '0.45rem 1rem', borderRadius: '0.375rem',
                                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'normal', textTransform: 'capitalize', letterSpacing: '0.03rem'
                                }}
                            >
                                Back to Map View
                            </button>
                        </div>
                        {isLoadingBarangay ? <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1.25rem' }}>Loading sections...</div> : (sectionList.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1.25rem', textAlign: 'center', color: '#ef4444' }}>
                                <div style={{ fontSize: '3em', marginBottom: '0.9375rem' }}>⚠️</div>
                                <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '0.5rem' }}>Error</div>
                                <div style={{ fontSize: '0.9em', fontStyle: 'italic' }}>Does not contain data</div>
                            </div>
                        ) : (
                            <>
                                <p style={{ fontSize: '0.85em', color: '#64748b' }}>Click a section on the map to view lots.</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem' }}>
                                    {sectionList.map(s => (
                                        <button key={s.number} onClick={() => setSelectedSection(s.number)} style={{ textAlign: 'left', padding: '0.625rem', border: '0.0625rem solid #e2e8f0', borderRadius: '0.375rem', background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                            <span style={{ fontWeight: 'bold', color: '#0f1d35', fontSize: '0.85rem', textTransform: 'uppercase' }}>Section {s.number}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#0f172a', background: '#f1f5f9', padding: '0.125rem 0.375rem', borderRadius: '0.625rem', textTransform: 'uppercase' }}>{s.lot_count} lots</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        ))}
                    </>
                ) : (
                    <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3em', marginBottom: '0.625rem' }}>🗺️</div><p>Select a barangay to view</p>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .lot-details-grid { display: grid; grid-template-columns: 1fr; gap: 0.75rem; padding-top: 0.625rem; }
        .lot-detail-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .lot-detail-field.full { grid-column: span 1; }
        .lot-detail-field-half { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0; }
        .lot-detail-field label, .lot-detail-field-half label { font-size: 0.75rem; font-weight: normal; color: #0f172a; text-transform: uppercase; letter-spacing: 0.03rem; margin-bottom: 0.125rem; }
        .lot-val-box { background: #f8fafc; border: 0.0625rem solid #e2e8f0; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-weight: bold; color: #0f1d35; font-size: 0.75rem; width: 100%; box-sizing: border-box; text-transform: uppercase; }
        .lot-select { width: 100%; padding: 0.625rem; border-radius: 0.5rem; border: 0.125rem solid #3b82f6; font-weight: bold; color: #1e3a5f; background: #fff; cursor: pointer; grid-column: span 1; font-size: 0.75rem; text-transform: uppercase; }
        .lot-detail-card { background: #fff; border: 0.0625rem solid #f1f5f9; padding: 0.75rem; border-radius: 0.5rem; box-shadow: 0 0.0625rem 0.18rem rgba(0,0,0,0.02); display: flex; flex-direction: column; width: 100%; box-sizing: border-box; }
        .lot-detail-card.full { grid-column: span 1; }
        .lot-detail-card.specialty { grid-column: span 1; }
        .lot-detail-card label { font-size: 0.75rem; font-weight: normal; color: #0f172a; display: block; margin-bottom: 0.25rem; text-transform: uppercase; }
        .lot-card-val { font-weight: 700; color: #1e3a5f; font-size: 0.85rem; word-break: break-word; }
        .lot-card-val.highlight { color: #dc2626; }
        .lot-card-val.small { font-size: 0.82em; line-height: 1.4; color: #475569; }
        .lot-card-val.landuse { color: #059669; }
        .lot-card-val.primary { color: #dc2626; font-size: 1.15rem; }
        .lot-card-val.secondary { color: #1e3a5f; font-size: 1.15rem; }
        .highlight-tax { border-left: 0.25rem solid #10b981; background: #f0fdf4 !important; }
        .adj-buttons { display: flex; gap: 0.37rem; margin-top: 0.5rem; }
        .adj-buttons button { flex: 1; padding: 0.5rem 0.25rem; font-size: 0.75rem; font-weight: normal; text-transform: uppercase; letter-spacing: 0.03rem; border: 0.0625rem solid #cbd5e1; background: #fff; border-radius: 0.375rem; cursor: pointer; transition: all 0.2s; color: #64748b; }
        .adj-buttons button:hover { background: #c2e8ffff; border-color: #94a3b8; color: #000; }
        .adj-buttons button.active { background: #a9dbfaff; border-color: #3b82f6; color: #000; }
        .lot-enlargement-box { margin-top: 0.5rem; padding: 0.93rem; background: #fffbeb; border: 0.0625rem dashed #f59e0b; border-radius: 0.75rem; text-align: center; }
        .enlarge-text { color: #b45309; font-size: 0.85em; font-weight: 600; margin-bottom: 0.62rem; }
        .pim-layout button { transition: all 0.2s ease !important; }
        .pim-layout button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.03); }
        .pim-layout .section-lots-list button:hover, .pim-layout .pim-filter-panel button:hover { background: #f8fbff !important; border-color: #a9dbfaff !important; }
        .enlarge-btn { width: 100%; background: #a9dbfaff; color: #0f172a; border: none; padding: 0.62rem; border-radius: 0.5rem; font-weight: normal; text-transform: uppercase; letter-spacing: 0.03rem; font-size: 0.75rem; cursor: pointer; }
        .enlarge-btn:hover { background: #c2e8ffff; }
      `
            }} />

            {showAttrModal && selectedLot && (
                <div className="pim-attr-overlay" onClick={() => setShowAttrModal(false)}>
                    <div className="pim-attr-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pim-attr-header">
                            <div className="pim-attr-title">Lot Attributes</div>
                            <button className="pim-attr-close" onClick={() => setShowAttrModal(false)} style={{ background: '#a9dbfaff', color: '#0f172a', border: 'none', padding: '0.3rem 0.7rem', borderRadius: '0.3rem', fontWeight: 'normal', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03rem', cursor: 'pointer' }} type="button">Close</button>
                        </div>
                        <div className="pim-attr-subtitle">
                            {selectedLot?.properties?.pin ? `PIN: ${selectedLot.properties.pin}` : 'Selected Lot'}
                        </div>
                        <div className="pim-attr-list">
                            {lotAttributeEntries.length === 0 && (
                                <div className="pim-attr-empty" style={{ color: '#ef4444' }}>⚠ No attributes available.</div>
                            )}
                            {lotAttributeEntries.map(([key, value]) => {
                                let displayValue = value;
                                if (displayValue === null || displayValue === undefined || displayValue === '') {
                                    displayValue = 'N/A';
                                } else if (typeof displayValue === 'object') {
                                    displayValue = JSON.stringify(displayValue);
                                }
                                return (
                                    <div className="pim-attr-row" key={key}>
                                        <div className="pim-attr-key">{String(key)}</div>
                                        <div className="pim-attr-val">{String(displayValue)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
