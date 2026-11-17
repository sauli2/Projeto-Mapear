/**
 * js/main.js - Ponto de entrada do Projeto Mapear
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Inicializa o motor do mapa (Mapbox GL JS)
  initMap();

  // 2. Inicializa os elementos de UI (Barra lateral, Drawer, Drag & Drop e Controles)
  initUI();

  // 3. Inicializa drag-and-drop para reordenação de camadas
  if (typeof initShapeListDragDrop === "function") {
    initShapeListDragDrop();
  }

  // 4. Inicializa os filtros de camadas
  if (typeof initFiltersUI === "function") {
    initFiltersUI();
  }

  // 5. Inicializa o compositor de mapa (Print Layout)
  if (typeof initComposer === "function") {
    initComposer();
  }
});
