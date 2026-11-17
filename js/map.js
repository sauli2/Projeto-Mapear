/**
 * js/map.js - Inicialização e controle do mapa Mapbox GL JS
 */

let map = null;
let _waterLayerIds = [];
let _greenLoaded   = false;

// ── Inicializa o Mapa ───────────────────────────────────────────────
function initMap() {
  mapboxgl.accessToken = MAPBOX_TOKEN;

  // Detecta se o dispositivo possui GPU integrada fraca para ajustar antialias
  const _cv = document.createElement("canvas");
  const _gl = _cv.getContext("webgl") || _cv.getContext("experimental-webgl");
  const _ext = _gl ? (_gl.getExtension("WEBGL_debug_renderer_info") || {}) : {};
  const _gpu = _ext.UNMASKED_RENDERER_WEBGL ? _gl.getParameter(_ext.UNMASKED_RENDERER_WEBGL) : "";
  const isWeakGPU = /intel|llvm|swiftshader|software/i.test(_gpu);

  map = new mapboxgl.Map({
    container: "map",
    style:     CONFIG.style,
    center:    CONFIG.center,
    zoom:      CONFIG.zoom,
    minZoom:   CONFIG.minZoom,
    maxZoom:   CONFIG.maxZoom,
    pitch:     CONFIG.pitch,
    bearing:   CONFIG.bearing,
    antialias: !isWeakGPU,
    preserveDrawingBuffer: true   // Necessário para captura de canvas (Compositor de Mapa)
  });

  // Escala métrica no canto inferior esquerdo
  map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

  map.on("error", e => console.error("[Mapbox]", e.error));

  // Ponto de entrada das camadas base
  map.on("load", async () => {
    try {
      setupWaterLayers();
      setup3DBuildings();
      await setupGreenAreas();
    } catch (err) {
      console.warn("[Camadas] Aviso ao configurar camadas:", err);
    } finally {
      const loading = document.getElementById("loading");
      if (loading) loading.classList.add("hidden");
      if (window.updateGlobalStats) window.updateGlobalStats();
    }
  });

  map.on("moveend", () => {
    if (window.updateGlobalStats) window.updateGlobalStats();
  });

  return map;
}

// ── 1. Camadas de Água do Estilo Mapbox Light-v11 ────────────────────
function setupWaterLayers() {
  const allLayers = map.getStyle().layers || [];
  _waterLayerIds = allLayers
    .filter(l => l.type === "fill" && /water|ocean|river|lake|stream/i.test(l.id))
    .map(l => l.id);

  _waterLayerIds.forEach(id => {
    try {
      map.setPaintProperty(id, "fill-color", "#b0d3e5");
      map.setPaintProperty(id, "fill-opacity", 0.85);
    } catch (_) {}
  });
}

// ── 2. Prédios 3D (volumetria arquitetônica minimalista) ─────────────
function setup3DBuildings() {
  const layers = map.getStyle().layers;
  const labelLayerId = layers.find(l => l.type === "symbol" && l.layout && l.layout["text-field"])?.id;

  if (map.getLayer("3d-buildings")) return;

  map.addLayer({
    id: "3d-buildings",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "true"],
    type: "fill-extrusion",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": [
        "interpolate", ["linear"], ["get", "height"],
        0,   "#f4f5f7",
        20,  "#eaedf0",
        60,  "#d8dce2",
        120, "#c4c8d0"
      ],
      "fill-extrusion-height": [
        "interpolate", ["linear"], ["zoom"],
        14, 0,
        14.5, ["get", "height"]
      ],
      "fill-extrusion-base": [
        "interpolate", ["linear"], ["zoom"],
        14, 0,
        14.5, ["get", "min_height"]
      ],
      "fill-extrusion-opacity": 0.92,
      "fill-extrusion-ambient-occlusion-intensity": 0.35,
      "fill-extrusion-ambient-occlusion-radius": 3.0
    }
  }, labelLayerId);
}

// ── 3. Áreas Verdes via Overpass API (OSM real) ──────────────────────
async function setupGreenAreas() {
  const loadingMsg = document.getElementById("loading-msg");
  if (loadingMsg) loadingMsg.textContent = "Carregando parques e vegetação…";

  const bbox = "-3.77,-38.56,-3.69,-38.48";
  const query = `[out:json][timeout:15];(way["leisure"="park"](${bbox});way["landuse"="recreation_ground"](${bbox});way["leisure"="garden"](${bbox});relation["leisure"="park"](${bbox}););out body;>;out skel qt;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);

  let osmData = null;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.ok) osmData = await res.json();
  } catch (_) {
    // Falha silenciosa de rede/timeout sem quebrar o mapa
  } finally {
    clearTimeout(timer);
  }

  if (!osmData || !osmData.elements) return;

  const nodes = {};
  osmData.elements.filter(e => e.type === "node").forEach(n => {
    nodes[n.id] = [n.lon, n.lat];
  });

  const features = [];
  osmData.elements.filter(e => e.type === "way" && e.nodes).forEach(w => {
    const coords = w.nodes.map(nid => nodes[nid]).filter(Boolean);
    if (coords.length >= 4 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: w.tags || {}
      });
    }
  });

  if (features.length === 0) return;

  map.addSource("osm-green", {
    type: "geojson",
    data: { type: "FeatureCollection", features }
  });

  map.addLayer({
    id: "osm-green-fill",
    type: "fill",
    source: "osm-green",
    paint: { "fill-color": "#c4e6c3", "fill-opacity": 0.65 }
  }, "3d-buildings");

  map.addLayer({
    id: "osm-green-outline",
    type: "line",
    source: "osm-green",
    paint: { "line-color": "#97cb99", "line-width": 1, "line-opacity": 0.7 }
  }, "3d-buildings");

  _greenLoaded = true;
}

// ── Controle de Visibilidade de Camadas ──────────────────────────────
function toggleLayersVisibility(layerIds, visible) {
  if (!map) return;
  layerIds.forEach(id => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  });
}

// ── Alternância 2D / 3D ──────────────────────────────────────────────
function setMap3DMode(is3D) {
  if (!map) return;
  map.easeTo({
    pitch:    is3D ? CONFIG.pitch   : 0,
    bearing:  is3D ? CONFIG.bearing : 0,
    duration: 700
  });
}
