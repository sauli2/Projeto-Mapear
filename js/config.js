/**
 * js/config.js - Configurações centrais do Projeto Mapear
 */

// ── Token Mapbox (Configurado para o GitHub) ────────────────────────
const MAPBOX_TOKEN = "pk.eyJ1Ijoic2F1bG9maHkiLCJhIjoiY213MmFwcWlqMDE4NjM1cHhrdXk0enk4dSJ9.d0h3fbdYBaUdqbUjUCDvag";

// ── Parâmetros de Navegação e Visualização ──────────────────────────
// minZoom reduzido para 2 e maxBounds liberado para permitir zoom out amplo e navegação global
const CONFIG = {
  center:    [-38.5267, -3.7319],
  zoom:      15,
  minZoom:   2,
  maxZoom:   22,
  pitch:     60,
  bearing:   -20,
  style:     "mapbox://styles/mapbox/light-v11"
};

// ── Paletas de gradiente cartográfico (limpas e acessíveis) ──────────
const PALETTES = {
  mapear:   { label: "Mapear (Paleta Oficial)",stops: ["#dedede", "#f7dada", "#f25188"] },
  calor:    { label: "Calor / Densidade",      stops: ["#06d6a0", "#ffd166", "#ef476f"] },
  viridis:  { label: "Viridis (Perceptual)",   stops: ["#440154", "#21918c", "#fde725"] },
  magma:    { label: "Magma (Térmico)",        stops: ["#180f3d", "#b73779", "#fcfdbf"] },
  oceano:   { label: "Oceano (Azul)",          stops: ["#caf0f8", "#0077b6", "#03045e"] },
  verde:    { label: "Vegetação (Verde)",      stops: ["#d8f3dc", "#2d6a4f", "#081c15"] },
  espectral:{ label: "Espectral (Divergente)", stops: ["#2b83ba", "#ffffbf", "#d7191c"] },
  neon:     { label: "Contraste (Alto)",       stops: ["#f72585", "#7209b7", "#4361ee"] }
};

// ── Cores sequenciais para camadas importadas ───────────────────────
const SHAPE_COLORS = [
  "#f25188", "#db3d72", "#a855f7", "#6366f1",
  "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#64748b"
];
