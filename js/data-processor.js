/**
 * js/data-processor.js - Leitura, parsing e reprojeção de dados geoespaciais
 * Suporta: Shapefile (.shp, .dbf, .prj), GeoPackage (.gpkg), GeoJSON (.geojson, .json), e .zip
 */

// ── Lazy-loaders de bibliotecas ─────────────────────────────────────
let _sqlJsPromise = null;
function getSqlJs() {
  if (_sqlJsPromise) return _sqlJsPromise;
  _sqlJsPromise = new Promise((resolve, reject) => {
    if (window.initSqlJs) { resolve(window.initSqlJs); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js";
    s.onload  = () => resolve(window.initSqlJs);
    s.onerror = () => reject(new Error("Falha ao carregar sql.js"));
    document.head.appendChild(s);
  }).then(fn => fn({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
  }));
  return _sqlJsPromise;
}

let _proj4Promise = null;
function getProj4() {
  if (_proj4Promise) return _proj4Promise;
  _proj4Promise = new Promise((resolve, reject) => {
    if (window.proj4) { resolve(window.proj4); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.2/proj4.js";
    s.onload  = () => resolve(window.proj4);
    s.onerror = () => reject(new Error("Falha ao carregar proj4js"));
    document.head.appendChild(s);
  });
  return _proj4Promise;
}

let _jszipPromise = null;
function getJSZip() {
  if (_jszipPromise) return _jszipPromise;
  _jszipPromise = new Promise((resolve, reject) => {
    if (window.JSZip) { resolve(window.JSZip); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload  = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error("Falha ao carregar JSZip"));
    document.head.appendChild(s);
  });
  return _jszipPromise;
}

// ── Definições de Projeções Brasileiras Mais Comuns (proj4) ──────────
const COMMON_PROJECTIONS = {
  31984: "+proj=utm +zone=24 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", // SIRGAS 2000 / UTM 24S (Fortaleza/CE)
  31983: "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", // SIRGAS 2000 / UTM 23S (SP, RJ, MG)
  31982: "+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", // SIRGAS 2000 / UTM 22S (Sul, PR, SC, RS)
  31985: "+proj=utm +zone=25 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", // SIRGAS 2000 / UTM 25S (NE leste)
  31981: "+proj=utm +zone=21 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", // SIRGAS 2000 / UTM 21S (Centro-Oeste)
  29194: "+proj=utm +zone=24 +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs", // SAD69 / UTM 24S
  29193: "+proj=utm +zone=23 +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs",
  29192: "+proj=utm +zone=22 +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs",
  4674:  "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",                       // SIRGAS 2000 geográfico
  4291:  "+proj=longlat +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +no_defs",       // SAD69 geográfico
  4326:  "+proj=longlat +datum=WGS84 +no_defs"                                              // WGS 84
};

// ── Reprojeção & Detecção de Projeção ────────────────────────────────
function isWGS84(coords) {
  function check(c) {
    if (typeof c[0] === "number") {
      const [x, y] = c;
      return x >= -180 && x <= 180 && y >= -90 && y <= 90;
    }
    return check(c[0]);
  }
  return check(coords);
}

function detectUTMZoneFromCoords(x, y) {
  if (x > 100000 && x < 900000 && y > 1000000 && y < 10000000) {
    return 31984; // Padrão Brasil Nordeste/CE
  }
  return null;
}

function parsePrj(prjText) {
  if (!prjText) return null;
  const t = prjText.toUpperCase();
  const utmMatch = t.match(/UTM[_\s]+ZONE[_\s]+(\d+)([NS]?)/i) ||
                   t.match(/(\d{1,2})[_\s]*[S|SOUTH]/i);
  if (t.includes("SIRGAS") || t.includes("2000")) {
    if (t.includes("24S") || (utmMatch && utmMatch[1] === "24")) return 31984;
    if (t.includes("23S") || (utmMatch && utmMatch[1] === "23")) return 31983;
    if (t.includes("22S") || (utmMatch && utmMatch[1] === "22")) return 31982;
    if (t.includes("25S") || (utmMatch && utmMatch[1] === "25")) return 31985;
    if (t.includes("21S") || (utmMatch && utmMatch[1] === "21")) return 31981;
    return 4674;
  }
  if (t.includes("SAD") && (t.includes("69") || t.includes("1969"))) {
    if (t.includes("24S")) return 29194;
    if (t.includes("23S")) return 29193;
    if (t.includes("22S")) return 29192;
    return 4291;
  }
  if (t.includes("WGS") && t.includes("84")) {
    if (t.includes("UTM") && t.includes("24S")) return 32724;
    return 4326;
  }
  return null;
}

async function reprojectGeoJSON(geojson, srcSrid, prjText) {
  const firstCoord = getFirstCoord(geojson);
  if (!firstCoord) return geojson;

  if (isWGS84(firstCoord)) {
    return geojson;
  }

  const proj4 = await getProj4();

  let srcDef = null;
  if (srcSrid && COMMON_PROJECTIONS[srcSrid]) {
    srcDef = COMMON_PROJECTIONS[srcSrid];
  } else if (srcSrid && srcSrid !== 4326 && srcSrid !== 0 && srcSrid !== -1) {
    try {
      const res = await fetch(`https://epsg.io/${srcSrid}.proj4`);
      if (res.ok) srcDef = await res.text();
    } catch (_) {}
  }

  if (!srcDef && prjText) {
    try {
      srcDef = proj4(prjText);
    } catch (_) {
      const detectedSrid = parsePrj(prjText);
      if (detectedSrid && COMMON_PROJECTIONS[detectedSrid]) {
        srcDef = COMMON_PROJECTIONS[detectedSrid];
      }
    }
  }

  if (!srcDef) {
    const guess = detectUTMZoneFromCoords(firstCoord[0], firstCoord[1]);
    if (guess && COMMON_PROJECTIONS[guess]) {
      srcDef = COMMON_PROJECTIONS[guess];
      showToast("Projeção inferida: SIRGAS 2000 / UTM zone 24S", 3000);
    }
  }

  if (!srcDef) {
    showToast("Não foi possível identificar a projeção das coordenadas.", 4000);
    return geojson;
  }

  const transformCoord = (coord) => {
    if (typeof coord[0] === "number") {
      try {
        const [lng, lat] = proj4(srcDef, "EPSG:4326", [coord[0], coord[1]]);
        return isFinite(lng) && isFinite(lat) ? [lng, lat] : coord;
      } catch (_) {
        return coord;
      }
    }
    return coord.map(transformCoord);
  };

  const reprojectGeom = (geom) => {
    if (!geom) return geom;
    if (geom.type === "GeometryCollection") {
      return { ...geom, geometries: geom.geometries.map(reprojectGeom) };
    }
    return { ...geom, coordinates: transformCoord(geom.coordinates) };
  };

  return {
    ...geojson,
    features: geojson.features.map(f => ({
      ...f,
      geometry: reprojectGeom(f.geometry)
    }))
  };
}

function getFirstCoord(geojson) {
  for (const f of geojson.features || []) {
    if (!f.geometry) continue;
    let c = f.geometry.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    if (Array.isArray(c) && typeof c[0] === "number") return c;
  }
  return null;
}

// ── WKB Reader (2D, 3D, 4D, ISO WKB e EWKB) ─────────────────────────
class WKBReader {
  constructor(buffer) {
    this.view   = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.offset = 0;
  }
  readByte() { return this.view.getUint8(this.offset++); }
  readInt(le) { const v = this.view.getUint32(this.offset, le); this.offset += 4; return v; }
  readDouble(le) { const v = this.view.getFloat64(this.offset, le); this.offset += 8; return v; }

  readGeometry() {
    if (this.offset >= this.view.byteLength) return null;
    const le = this.readByte() === 1;
    let rawType = this.readInt(le);

    const hasZ_EWKB = (rawType & 0x80000000) !== 0;
    const hasM_EWKB = (rawType & 0x40000000) !== 0;
    const hasSRID   = (rawType & 0x20000000) !== 0;
    if (hasSRID) this.readInt(le); // pula SRID EWKB

    let baseType = rawType & 0x1FFFFFFF;
    let dims = 2;
    if (baseType >= 1000 && baseType < 2000) { dims = 3; baseType -= 1000; }
    else if (baseType >= 2000 && baseType < 3000) { dims = 3; baseType -= 2000; }
    else if (baseType >= 3000 && baseType < 4000) { dims = 4; baseType -= 3000; }
    else if (hasZ_EWKB && hasM_EWKB) dims = 4;
    else if (hasZ_EWKB || hasM_EWKB) dims = 3;

    const readPoint = () => {
      const x = this.readDouble(le);
      const y = this.readDouble(le);
      if (dims >= 3) this.readDouble(le);
      if (dims >= 4) this.readDouble(le);
      return [x, y];
    };

    const readRing = () => {
      const n = this.readInt(le);
      const ring = [];
      for (let i = 0; i < n; i++) ring.push(readPoint());
      return ring;
    };

    switch (baseType) {
      case 1: return { type: "Point", coordinates: readPoint() };
      case 2: {
        const n = this.readInt(le);
        const coords = [];
        for (let i = 0; i < n; i++) coords.push(readPoint());
        return { type: "LineString", coordinates: coords };
      }
      case 3: {
        const nRings = this.readInt(le);
        const rings = [];
        for (let i = 0; i < nRings; i++) rings.push(readRing());
        return { type: "Polygon", coordinates: rings };
      }
      case 4: {
        const n = this.readInt(le);
        const coords = [];
        for (let i = 0; i < n; i++) { this.readByte(); this.readInt(le); coords.push(readPoint()); }
        return { type: "MultiPoint", coordinates: coords };
      }
      case 5: {
        const n = this.readInt(le);
        const coords = [];
        for (let i = 0; i < n; i++) coords.push(this.readGeometry().coordinates);
        return { type: "MultiLineString", coordinates: coords };
      }
      case 6: {
        const n = this.readInt(le);
        const coords = [];
        for (let i = 0; i < n; i++) coords.push(this.readGeometry().coordinates);
        return { type: "MultiPolygon", coordinates: coords };
      }
      case 7: {
        const n = this.readInt(le);
        const geoms = [];
        for (let i = 0; i < n; i++) geoms.push(this.readGeometry());
        return { type: "GeometryCollection", geometries: geoms };
      }
      default:
        return null;
    }
  }
}

// ── Extração de Geometria de BLOB (GeoPackage / SpatiaLite / WKB) ─────
function parseBlobGeometry(blob) {
  if (!blob || blob.length < 5) return null;
  const u8 = blob instanceof Uint8Array ? blob : new Uint8Array(blob);

  // GeoPackage Binary Header: 'GP' (0x47, 0x50)
  if (u8[0] === 0x47 && u8[1] === 0x50) {
    const flags = u8[3];
    const envelopeType = (flags >> 1) & 0x07;
    let headerLen = 8;
    if (envelopeType === 1) headerLen += 32;
    else if (envelopeType === 2 || envelopeType === 3) headerLen += 48;
    else if (envelopeType === 4) headerLen += 64;
    try {
      const reader = new WKBReader(u8.subarray(headerLen));
      return reader.readGeometry();
    } catch (_) { return null; }
  }

  // SpatiaLite BLOB: 0x00 seguido de 0x01 (little) ou 0x00 (big)
  if (u8[0] === 0x00 && (u8[1] === 0x01 || u8[1] === 0x00)) {
    try {
      const reader = new WKBReader(u8.subarray(39));
      return reader.readGeometry();
    } catch (_) {}
  }

  // WKB padrão: 0x01 (little-endian) ou 0x00 (big-endian)
  if (u8[0] === 0x00 || u8[0] === 0x01) {
    try {
      const reader = new WKBReader(u8);
      return reader.readGeometry();
    } catch (_) {}
  }

  return null;
}

// ── Parser GeoPackage (.gpkg) via sql.js ──────────────────────────────
async function parseGeoPackage(arrayBuffer) {
  const SQL = await getSqlJs();
  const db  = new SQL.Database(new Uint8Array(arrayBuffer));

  // Mapa de SRS definidos no próprio GeoPackage
  const srsMap = {};
  try {
    const srsRes = db.exec(`SELECT srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys`);
    if (srsRes.length > 0) {
      for (const row of srsRes[0].values) {
        const id = row[0];
        const orgId = row[2];
        const def = row[3];
        srsMap[id] = { orgId, def };
      }
    }
  } catch (_) {}

  let geomCols = [];
  try {
    const res = db.exec(`
      SELECT table_name, column_name, geometry_type_name, srs_id
      FROM gpkg_geometry_columns
    `);
    if (res.length > 0) {
      geomCols = res[0].values.map(row => ({
        tableName: row[0],
        geomCol:   row[1],
        geomType:  row[2],
        srid:      row[3]
      }));
    }
  } catch (_) {}

  if (geomCols.length === 0) {
    const userTables = db.exec(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'gpkg_%' AND name NOT LIKE 'sqlite_%'
    `);
    if (userTables.length > 0) {
      for (const [tName] of userTables[0].values) {
        const info = db.exec(`PRAGMA table_info("${tName}")`);
        if (info.length > 0) {
          for (const col of info[0].values) {
            const colName = col[1];
            const colType = (col[2] || "").toUpperCase();
            if (colType.includes("GEOM") || colName.toLowerCase() === "geom" || colName.toLowerCase() === "geometry") {
              geomCols.push({ tableName: tName, geomCol: colName, geomType: "GEOMETRY", srid: 4326 });
              break;
            }
          }
        }
      }
    }
  }

  if (geomCols.length === 0) {
    db.close();
    throw new Error("Nenhuma camada vetorial com geometria encontrada no GeoPackage.");
  }

  const features = [];
  let srid = 4326;
  let prjText = null;

  for (const gc of geomCols) {
    srid = gc.srid || 4326;
    if (srsMap[srid]) {
      if (srsMap[srid].def) prjText = srsMap[srid].def;
      if (srsMap[srid].orgId && srsMap[srid].orgId !== srid) {
        srid = srsMap[srid].orgId;
      }
    }

    let rows;
    try {
      rows = db.exec(`SELECT * FROM "${gc.tableName}" LIMIT 50000`);
    } catch (err) {
      console.warn(`[GPKG] Erro ao ler tabela ${gc.tableName}:`, err);
      continue;
    }
    if (rows.length === 0) continue;

    const colNames = rows[0].columns;
    const geomIdx  = colNames.indexOf(gc.geomCol);

    for (const row of rows[0].values) {
      const geomBlob = row[geomIdx];
      const geom     = parseBlobGeometry(geomBlob);
      if (!geom) continue;

      const props = {};
      colNames.forEach((name, i) => {
        if (i !== geomIdx) props[name] = row[i];
      });
      props._table = gc.tableName;

      features.push({
        type: "Feature",
        geometry: geom,
        properties: props
      });
    }
  }

  db.close();

  if (features.length === 0) {
    throw new Error("GeoPackage não contém feições com geometrias válidas.");
  }

  return reprojectGeoJSON({ type: "FeatureCollection", features }, srid, prjText);
}

// ── Leitura de Shapefiles (.shp, .dbf, .prj) ─────────────────────────
async function parseShapefile(shpBuf, dbfBuf, prjText) {
  if (typeof shapefile === "undefined") {
    throw new Error("shapefile.js não carregado. Verifique a conexão.");
  }

  const features = [];
  const source   = await shapefile.open(shpBuf, dbfBuf, { encoding: "utf-8" });

  while (true) {
    const result = await source.read();
    if (result.done) break;
    if (result.value && result.value.geometry) {
      features.push(result.value);
    }
  }

  if (features.length === 0) {
    throw new Error("O shapefile não contém feições com geometria válida.");
  }

  const geojson = { type: "FeatureCollection", features };
  const srid    = parsePrj(prjText);
  return reprojectGeoJSON(geojson, srid, prjText);
}

// ── Extração de arquivos ZIP ──────────────────────────────────────────
async function parseZipFile(arrayBuffer) {
  const JSZip = await getJSZip();
  const zip   = await JSZip.loadAsync(arrayBuffer);

  const files = {};
  for (const [filename, fileObj] of Object.entries(zip.files)) {
    if (fileObj.dir) continue;
    const ext = filename.split(".").pop().toLowerCase();
    files[ext] = files[ext] || [];
    files[ext].push({ name: filename, obj: fileObj });
  }

  if (files.geojson || files.json) {
    const target = (files.geojson || files.json)[0];
    const text   = await target.obj.async("text");
    return JSON.parse(text);
  }

  if (files.gpkg) {
    const buf = await files.gpkg[0].obj.async("arraybuffer");
    return parseGeoPackage(buf);
  }

  if (files.shp) {
    const shpFile = files.shp[0];
    const base    = shpFile.name.slice(0, shpFile.name.lastIndexOf("."));
    const shpBuf  = await shpFile.obj.async("arraybuffer");

    let dbfBuf = null;
    const dbfCandidate = zip.file(base + ".dbf") || zip.file(base + ".DBF") || (files.dbf && files.dbf[0].obj);
    if (dbfCandidate) {
      dbfBuf = await dbfCandidate.async("arraybuffer");
    }

    let prjText = null;
    const prjCandidate = zip.file(base + ".prj") || zip.file(base + ".PRJ") || (files.prj && files.prj[0].obj);
    if (prjCandidate) {
      prjText = await prjCandidate.async("text");
    }

    return parseShapefile(shpBuf, dbfBuf, prjText);
  }

  throw new Error("ZIP não contém arquivos válidos (.shp, .gpkg ou .geojson).");
}

// ── Dispatcher de Arquivos ────────────────────────────────────────────
async function processFiles(fileList) {
  const filesByName = {};
  for (const f of fileList) filesByName[f.name.toLowerCase()] = f;

  for (const f of fileList) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "zip") {
      const buf = await f.arrayBuffer();
      const geojson = await parseZipFile(buf);
      return { geojson, name: f.name.replace(/\.zip$/i, "") };
    }
  }

  for (const f of fileList) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "gpkg") {
      const buf = await f.arrayBuffer();
      const geojson = await parseGeoPackage(buf);
      return { geojson, name: f.name.replace(/\.gpkg$/i, "") };
    }
  }

  for (const f of fileList) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "geojson" || ext === "json") {
      const text = await f.text();
      const raw  = JSON.parse(text);
      const geojson = await reprojectGeoJSON(raw, null, null);
      return { geojson, name: f.name.replace(/\.(geo)?json$/i, "") };
    }
  }

  for (const f of fileList) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "shp") {
      const base   = f.name.slice(0, f.name.lastIndexOf(".")).toLowerCase();
      const shpBuf = await f.arrayBuffer();

      let dbfBuf = null;
      for (const [k, file] of Object.entries(filesByName)) {
        if (k === base + ".dbf" || (k.endsWith(".dbf") && Object.keys(filesByName).filter(x => x.endsWith(".shp")).length === 1)) {
          dbfBuf = await file.arrayBuffer();
          break;
        }
      }

      let prjText = null;
      for (const [k, file] of Object.entries(filesByName)) {
        if (k === base + ".prj" || (k.endsWith(".prj") && Object.keys(filesByName).filter(x => x.endsWith(".shp")).length === 1)) {
          prjText = await file.text();
          break;
        }
      }

      const geojson = await parseShapefile(shpBuf, dbfBuf, prjText);
      return { geojson, name: f.name.replace(/\.shp$/i, "") };
    }
  }

  throw new Error("Nenhum arquivo geográfico reconhecido. Envie .shp, .gpkg, .geojson ou .zip");
}

// ── Cálculo Seguro de Bounding Box (sem limite de call-stack) ─────────
function calculateSafeBounds(features) {
  let minLng = Infinity, minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;
  let found = false;

  function traverse(coords) {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (isFinite(lng) && isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
        found = true;
      }
      return;
    }
    for (let i = 0; i < coords.length; i++) traverse(coords[i]);
  }

  for (const f of features) {
    if (f.geometry && f.geometry.coordinates) {
      traverse(f.geometry.coordinates);
    }
  }

  if (!found) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

// ── Conversor robusto para números (aceita inteiros, floats e formato BR) ──
function parseNumericValue(raw) {
  if (raw == null) return NaN;
  if (typeof raw === "number") return isFinite(raw) ? raw : NaN;
  if (typeof raw === "boolean") return NaN;
  let s = String(raw).trim();
  if (s === "" || s === "null" || s === "NaN" || s === "N/A" || s === "-") return NaN;
  // Formato BR milhar+decimal: "1.234,56" → "1234.56"
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Vírgula decimal simples: "3,14" → "3.14"
  else if (/^-?\d+,\d+$/.test(s)) {
    s = s.replace(",", ".");
  }
  const v = Number(s);
  return isFinite(v) ? v : NaN;
}

// ── Detecta colunas numéricas e calcula min/max do GeoJSON ────────────
function extractNumericColumns(geojson) {
  const numericCols = {};
  if (!geojson.features || geojson.features.length === 0) return numericCols;

  const allKeysSet = new Set();
  for (const f of geojson.features) {
    if (f.properties) {
      for (const k of Object.keys(f.properties)) allKeysSet.add(k);
    }
  }

  for (const key of allKeysSet) {
    if (key === "_table") continue;
    let min = Infinity, max = -Infinity, numCount = 0;
    for (const f of geojson.features) {
      const v = parseNumericValue(f.properties?.[key]);
      if (isNaN(v)) continue;
      numCount++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (numCount > 0 && isFinite(min) && isFinite(max)) {
      numericCols[key] = { min, max, count: numCount };
    }
  }
  return numericCols;
}
