/**
 * js/choropleth.js - Mapeamento e interpolação de cores por atributo tabular
 */

// ── Interpolação Hexadecimal RGB ────────────────────────────────────
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16)
  ];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

function interpolateColor(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  return rgbToHex(
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t
  );
}

// ── Gera gradiente de N passos a partir de paradas de cor ────────────
function generateColorSteps(paletteKey, numSteps = 5) {
  const pal = PALETTES[paletteKey] || PALETTES.calor;
  const stops = pal.stops;
  if (numSteps <= stops.length) return stops.slice(0, numSteps);

  const result = [];
  const segments = stops.length - 1;
  for (let i = 0; i < numSteps; i++) {
    const globalT = i / (numSteps - 1);
    const seg = Math.min(Math.floor(globalT * segments), segments - 1);
    const localT = (globalT - seg / segments) * segments;
    result.push(interpolateColor(stops[seg], stops[seg + 1], localT));
  }
  return result;
}

// ── Constrói a expressão de cor do Mapbox GL JS ──────────────────────
function buildMapboxColorExpression(columnKey, min, max, paletteKey, fallbackColor) {
  const steps = generateColorSteps(paletteKey, 5);
  const range = max - min;

  // Se todos os valores forem iguais ou range zero
  if (range <= 0 || !isFinite(range)) {
    return steps[0];
  }

  // Prepara expressão Mapbox step ou interpolate
  const valStep0 = min;
  const valStep1 = min + range * 0.25;
  const valStep2 = min + range * 0.50;
  const valStep3 = min + range * 0.75;
  const valStep4 = max;

  // Expressão com coalesce e cast para número
  return [
    "interpolate",
    ["linear"],
    ["to-number", ["get", columnKey], min],
    valStep0, steps[0],
    valStep1, steps[1],
    valStep2, steps[2],
    valStep3, steps[3],
    valStep4, steps[4]
  ];
}

// ── Formatação humanizada de números ─────────────────────────────────
function formatStatNumber(val) {
  if (val == null || isNaN(val)) return "-";
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + "M";
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "k";
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(2);
}
