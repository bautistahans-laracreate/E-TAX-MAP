CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS cad_maps (
    id BIGSERIAL PRIMARY KEY,
    barangay_name TEXT NOT NULL,
    source_file TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS pim_barangay_boundaries (
    id BIGSERIAL PRIMARY KEY,
    barangay_name TEXT NOT NULL,
    source_file TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS pim_sections (
    id BIGSERIAL PRIMARY KEY,
    barangay_name TEXT NOT NULL,
    section_number INTEGER NOT NULL,
    source_file TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS pim_enlargements (
    id BIGSERIAL PRIMARY KEY,
    barangay_name TEXT NOT NULL,
    section_number INTEGER NOT NULL,
    source_file TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS cad_maps_geom_gix
    ON cad_maps USING GIST (geom);
CREATE INDEX IF NOT EXISTS cad_maps_barangay_idx
    ON cad_maps (barangay_name);

CREATE INDEX IF NOT EXISTS pim_barangay_boundaries_geom_gix
    ON pim_barangay_boundaries USING GIST (geom);
CREATE INDEX IF NOT EXISTS pim_barangay_boundaries_barangay_idx
    ON pim_barangay_boundaries (barangay_name);

CREATE INDEX IF NOT EXISTS pim_sections_geom_gix
    ON pim_sections USING GIST (geom);
CREATE INDEX IF NOT EXISTS pim_sections_barangay_section_idx
    ON pim_sections (barangay_name, section_number);

CREATE INDEX IF NOT EXISTS pim_enlargements_geom_gix
    ON pim_enlargements USING GIST (geom);
CREATE INDEX IF NOT EXISTS pim_enlargements_barangay_section_idx
    ON pim_enlargements (barangay_name, section_number);

-- JSONB Indices for Search performance
CREATE INDEX IF NOT EXISTS pim_sections_properties_gin_idx ON pim_sections USING GIN (properties);
CREATE INDEX IF NOT EXISTS pim_sections_pin_idx ON pim_sections ((properties->>'pin'));
CREATE INDEX IF NOT EXISTS pim_sections_PIN_upper_idx ON pim_sections ((properties->>'PIN'));
CREATE INDEX IF NOT EXISTS pim_enlargements_properties_gin_idx ON pim_enlargements USING GIN (properties);
