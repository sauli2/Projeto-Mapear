/**
 * js/shapes.js - Gerenciamento de camadas importadas, adição ao mapa e legendas
 */

let shapeCounter = 0;
const loadedShapes = {}; // id -> { name, color, layerIds, sourceId, visible, numericCols, geojson }
const shapeOrder = [];   // Array de shapeIds em ordem do topo para a base [top, ..., bottom]

// ── Sincroniza a Ordem de Sobreposição das Camadas no Mapbox GL JS ───
function syncLayerZOrder() {
  if (!map) return;
  // shapeOrder armazena da camada superior (topo) para a inferior (fundo).
  // Iteramos do fundo para o topo: o último a chamar moveLayer() fica no topo final.
  for (let i = shapeOrder.length - 1; i >= 0; i--) {
    const sId = shapeOrder[i];
    const s = loadedShapes[sId];
    if (!s) continue;
    s.layerIds.forEach(lId => {
      if (map.getLayer(lId)) {
        map.moveLayer(lId); // sem segundo argumento: move para o topo da pilha Mapbox
      }
    });
  }
}

// ── Adição do GeoJSON ao Mapa com Suporte Multi-Geometria ────────────
function addGeoJSONToMap(geojson, name) {
  const shapeId = "shape-" + (++shapeCounter);
  const color   = SHAPE_COLORS[(shapeCounter - 1) % SHAPE_COLORS.length];
  const count   = geojson.features ? geojson.features.length : 0;
  const types   = new Set();

  (geojson.features || []).forEach(f => {
    if (f.geometry) types.add(f.geometry.type);
  });

  map.addSource(shapeId, {
    type: "geojson",
    data: geojson
  });

  const layerIds = [];
  const hasPoly  = [...types].some(t => t.includes("Polygon"));
  const hasLine  = [...types].some(t => t.includes("Line"));
  const hasPoint = [...types].some(t => t.includes("Point"));

  // Polígonos: Preenchimento + Linha de Borda
  if (hasPoly || (!hasLine && !hasPoint)) {
    const fillId = `${shapeId}-fill`;
    map.addLayer({
      id: fillId,
      type: "fill",
      source: shapeId,
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      paint: {
        "fill-color": color,
        "fill-opacity": 0.45
      }
    });
    layerIds.push(fillId);

    const outlineId = `${shapeId}-outline`;
    map.addLayer({
      id: outlineId,
      type: "line",
      source: shapeId,
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      paint: {
        "line-color": color,
        "line-width": 1.5,
        "line-opacity": 0.95
      }
    });
    layerIds.push(outlineId);
  }

  // Linhas
  if (hasLine) {
    const lineId = `${shapeId}-line`;
    map.addLayer({
      id: lineId,
      type: "line",
      source: shapeId,
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
      paint: {
        "line-color": color,
        "line-width": 2.5,
        "line-opacity": 0.95
      }
    });
    layerIds.push(lineId);
  }

  // Pontos
  if (hasPoint) {
    const pointId = `${shapeId}-circle`;
    map.addLayer({
      id: pointId,
      type: "circle",
      source: shapeId,
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-color": color,
        "circle-radius": 5.5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95
      }
    });
    layerIds.push(pointId);
  }

  // Popups ao clicar nos elementos
  layerIds.forEach(lId => {
    map.on("click", lId, e => {
      if (!e.features || !e.features[0]) return;
      const props = e.features[0].properties || {};
      const entries = Object.entries(props).filter(([k]) => k !== "_table").slice(0, 10);

      let html = `<div class="popup-title">${name}</div>`;
      if (entries.length === 0) {
        html += `<div class="popup-row"><em>Sem atributos tabulares</em></div>`;
      } else {
        entries.forEach(([k, v]) => {
          html += `<div class="popup-row"><span>${k}</span><strong>${v ?? "-"}</strong></div>`;
        });
      }

      new mapboxgl.Popup({ maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on("mouseenter", lId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", lId, () => { map.getCanvas().style.cursor = ""; });
  });

  // Ajusta visão da câmera para o shape carregado
  const bounds = calculateSafeBounds(geojson.features);
  if (bounds) {
    map.fitBounds(bounds, { padding: 60, maxZoom: 16.5, duration: 850 });
  }

  // Extrai colunas numéricas para o gradiente
  const numericCols = extractNumericColumns(geojson);

  // Registra no estado local e adiciona ao topo da ordem de camadas
  loadedShapes[shapeId] = {
    name,
    color,
    layerIds,
    sourceId: shapeId,
    visible: true,
    numericCols,
    geojson
  };
  shapeOrder.unshift(shapeId); // Nova camada entra no topo

  // Renderiza o item na barra de Dados & Shapes
  renderShapeCard(shapeId, name, color, count, numericCols);
  syncLayerZOrder();
  if (typeof updateFiltersLayerList === "function") {
    updateFiltersLayerList();
  }
  if (typeof updateGlobalStats === "function") {
    updateGlobalStats();
  }

  return shapeId;
}

// ── Renderiza o Cartão do Shapefile no Painel Lateral ────────────────
function renderShapeCard(shapeId, name, color, count, numericCols) {
  const container = document.getElementById("shapes-list");
  if (!container) return;

  const item = document.createElement("div");
  item.className = "shape-item";
  item.id = `item-${shapeId}`;
  item.setAttribute("draggable", "true");

  // Identificação do tipo de geometria predominante
  const shape = loadedShapes[shapeId];
  let geomLabel = "Polígonos";
  let geomClass = "poly";
  if (shape && shape.geojson && shape.geojson.features) {
    const types = new Set();
    shape.geojson.features.forEach(f => { if (f.geometry) types.add(f.geometry.type); });
    const hasP = [...types].some(t => t.includes("Polygon"));
    const hasL = [...types].some(t => t.includes("Line"));
    const hasPt = [...types].some(t => t.includes("Point"));
    if (hasP && !hasL && !hasPt) { geomLabel = "Polígonos"; geomClass = "poly"; }
    else if (hasL && !hasP && !hasPt) { geomLabel = "Linhas"; geomClass = "line"; }
    else if (hasPt && !hasP && !hasL) { geomLabel = "Pontos"; geomClass = "point"; }
    else { geomLabel = "Misto"; geomClass = "mixed"; }
  }

  const numKeys = Object.keys(numericCols);
  const hasNumeric = numKeys.length > 0;

  let colOptions = '<option value="">Sem gradiente (cor única)</option>';
  numKeys.forEach(k => {
    const colInfo = numericCols[k];
    colOptions += `<option value="${k}">${k} (${formatStatNumber(colInfo.min)} a ${formatStatNumber(colInfo.max)})</option>`;
  });

  let palOptions = "";
  Object.entries(PALETTES).forEach(([k, v]) => {
    palOptions += `<option value="${k}">${v.label}</option>`;
  });

  // Monta swatches de cores sólidas padrão
  let solidSwatchesHtml = "";
  SHAPE_COLORS.forEach(c => {
    const isAct = c.toLowerCase() === color.toLowerCase() ? "active" : "";
    solidSwatchesHtml += `<button class="color-swatch-btn ${isAct}" data-color="${c}" style="background:${c};" title="${c}"></button>`;
  });

  item.innerHTML = `
    <div class="shape-item-header">
      <div class="shape-drag-handle" title="Arrastar para reordenar a sobreposição">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.2"/><circle cx="15" cy="5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="15" cy="19" r="1.2"/></svg>
      </div>
      <div class="shape-dot" id="dot-${shapeId}" style="background:${color};" title="Cor da camada"></div>
      <div class="shape-info">
        <div class="shape-title-row">
          <div class="shape-name" title="${name}">${name}</div>
          <span class="shape-geom-tag ${geomClass}">${geomLabel}</span>
        </div>
        <div class="shape-meta">${count.toLocaleString("pt-BR")} feições ${hasNumeric ? `· ${numKeys.length} cols numéricas` : "· sem dados numéricos"}</div>
      </div>
      <div class="shape-actions">
        <button class="shape-btn btn-style-toggle" id="btn-style-toggle-${shapeId}" title="Configurações de Estilo e Atributos">
          <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </button>
        <button class="shape-btn" id="btn-vis-${shapeId}" title="Ocultar/Exibir camada">
          <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button class="shape-btn danger" id="btn-del-${shapeId}" title="Remover camada">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>

    <!-- Seção de estilo e ferramentas colapsável -->
    <div class="style-section" id="style-section-${shapeId}">
      <!-- Ações rápidas contextuais -->
      <div class="shape-context-actions">
        <button class="shape-context-btn" id="btn-zoom-${shapeId}" title="Centralizar visualização nesta camada">
          <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          Zoom na Camada
        </button>
        <button class="shape-context-btn" id="btn-filter-jump-${shapeId}" title="Abrir esta camada nos Filtros Urbanos">
          <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          Filtrar Dados
        </button>
      </div>

      <!-- Opacidade -->
      <div style="display:flex;align-items:center;gap:8px;padding-top:4px;">
        <span style="font-size:11px;color:var(--muted);min-width:55px;">Opacidade</span>
        <input type="range" class="opacity-slider" id="opac-${shapeId}" min="5" max="100" value="50" style="flex:1;">
        <span style="font-size:11px;color:var(--muted);width:28px;text-align:right;" id="opac-val-${shapeId}">50%</span>
      </div>

      <!-- Cores Sólidas da Camada -->
      <div class="gradient-section" id="solid-color-section-${shapeId}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="gradient-label">Simbologia & Cor Sólida</span>
          <input type="color" class="custom-color-input" id="color-picker-${shapeId}" value="${color}" title="Personalizar cor livre" />
        </div>
        <div class="color-swatches-grid" id="swatches-${shapeId}">
          ${solidSwatchesHtml}
        </div>
      </div>

      <!-- Gradiente Coroplético por Coluna (se houver dados tabulares numéricos) -->
      ${hasNumeric ? `
        <div class="gradient-section">
          <div class="gradient-label">Gradiente por Coluna Tabular</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
            <select class="gradient-select" id="grad-col-${shapeId}">
              ${colOptions}
            </select>
            <div id="grad-palette-wrap-${shapeId}" style="display:none;flex-direction:column;gap:6px;">
              <select class="gradient-select" id="grad-pal-${shapeId}">
                ${palOptions}
              </select>
              <div class="legend-bar" id="legend-bar-${shapeId}"></div>
              <div class="legend-labels">
                <span id="leg-min-${shapeId}">0</span>
                <span id="leg-mid-${shapeId}">-</span>
                <span id="leg-max-${shapeId}">100</span>
              </div>
            </div>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  container.prepend(item);

  // ── Toggle Colapso da Seção de Estilos ────────────────────────────
  const btnStyleToggle = item.querySelector(`#btn-style-toggle-${shapeId}`);
  const styleSection   = item.querySelector(`#style-section-${shapeId}`);

  btnStyleToggle?.addEventListener("click", () => {
    const isCollapsed = styleSection.classList.toggle("collapsed");
    btnStyleToggle.classList.toggle("collapsed", isCollapsed);
  });

  // ── Ações Rápidas Contextuais (Zoom na Camada e Pular para Filtros) ─
  item.querySelector(`#btn-zoom-${shapeId}`)?.addEventListener("click", () => {
    const s = loadedShapes[shapeId];
    if (s && s.geojson && s.geojson.features && map) {
      const b = calculateSafeBounds(s.geojson.features);
      if (b) {
        map.fitBounds(b, { padding: 60, maxZoom: 16.5, duration: 800 });
        showToast(`Enquadrando "${name}" no mapa`, 2000);
      }
    }
  });

  item.querySelector(`#btn-filter-jump-${shapeId}`)?.addEventListener("click", () => {
    if (window.openDrawerTab) {
      window.openDrawerTab("filters");
    }
    const layerSel = document.getElementById("filter-layer-select");
    if (layerSel) {
      layerSel.value = shapeId;
      layerSel.dispatchEvent(new Event("change"));
    }
    showToast(`Filtros focados na camada "${name}"`, 2000);
  });

  // ── Eventos dos Controles ─────────────────────────────────────────

  // Opacidade
  const opacSlider = item.querySelector(`#opac-${shapeId}`);
  const opacVal    = item.querySelector(`#opac-val-${shapeId}`);
  opacSlider?.addEventListener("input", e => {
    const val = Number(e.target.value);
    if (opacVal) opacVal.textContent = val + "%";
    const shape = loadedShapes[shapeId];
    if (!shape) return;
    shape.layerIds.forEach(lId => {
      if (!map.getLayer(lId)) return;
      if (lId.endsWith("-fill")) {
        map.setPaintProperty(lId, "fill-opacity", val / 100);
      } else if (lId.endsWith("-line") || lId.endsWith("-outline")) {
        map.setPaintProperty(lId, "line-opacity", Math.min(1, (val / 100) * 1.5));
      } else if (lId.endsWith("-circle")) {
        map.setPaintProperty(lId, "circle-opacity", val / 100);
      }
    });
  });

  // ── Controle de Cor Sólida ────────────────────────────────────────
  const dotEl        = item.querySelector(`#dot-${shapeId}`);
  const colorPicker  = item.querySelector(`#color-picker-${shapeId}`);
  const swatchBtns   = item.querySelectorAll(`#swatches-${shapeId} .color-swatch-btn`);
  const selCol       = item.querySelector(`#grad-col-${shapeId}`);

  function applySolidColor(newColor) {
    const shape = loadedShapes[shapeId];
    if (!shape) return;
    shape.color = newColor;

    if (dotEl) dotEl.style.background = newColor;
    if (colorPicker) colorPicker.value = newColor;

    swatchBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.color.toLowerCase() === newColor.toLowerCase());
    });

    // Se não houver gradiente ativo, aplica imediatamente no mapa
    if (!selCol || !selCol.value) {
      shape.layerIds.forEach(lId => {
        if (!map.getLayer(lId)) return;
        if (lId.endsWith("-fill")) map.setPaintProperty(lId, "fill-color", newColor);
        if (lId.endsWith("-line") || lId.endsWith("-outline")) map.setPaintProperty(lId, "line-color", newColor);
        if (lId.endsWith("-circle")) map.setPaintProperty(lId, "circle-color", newColor);
      });
    }
  }

  swatchBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      applySolidColor(btn.dataset.color);
    });
  });

  colorPicker?.addEventListener("input", e => {
    applySolidColor(e.target.value);
  });

  // ── Gradiente Coroplético ─────────────────────────────────────────
  if (hasNumeric) {
    const selColG = item.querySelector(`#grad-col-${shapeId}`);
    const selPal  = item.querySelector(`#grad-pal-${shapeId}`);
    const palWrap = item.querySelector(`#grad-palette-wrap-${shapeId}`);
    const legBar  = item.querySelector(`#legend-bar-${shapeId}`);
    const legMin  = item.querySelector(`#leg-min-${shapeId}`);
    const legMid  = item.querySelector(`#leg-mid-${shapeId}`);
    const legMax  = item.querySelector(`#leg-max-${shapeId}`);
    const dot     = item.querySelector(`#dot-${shapeId}`);

    function applyGradient() {
      const col = selColG.value;
      const palKey = selPal.value;
      const shape = loadedShapes[shapeId];
      if (!shape) return;

      if (!col) {
        palWrap.style.display = "none";
        dot.style.background = shape.color;
        shape.layerIds.forEach(lId => {
          if (!map.getLayer(lId)) return;
          if (lId.endsWith("-fill")) map.setPaintProperty(lId, "fill-color", shape.color);
          if (lId.endsWith("-line") || lId.endsWith("-outline")) map.setPaintProperty(lId, "line-color", shape.color);
          if (lId.endsWith("-circle")) map.setPaintProperty(lId, "circle-color", shape.color);
        });
        return;
      }

      palWrap.style.display = "flex";
      const info = shape.numericCols[col];
      if (!info) return;

      const stops = PALETTES[palKey]?.stops || PALETTES.calor.stops;
      legBar.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
      legMin.textContent = formatStatNumber(info.min);
      legMid.textContent = formatStatNumber((info.min + info.max) / 2);
      legMax.textContent = formatStatNumber(info.max);
      dot.style.background = stops[stops.length - 1];

      const expr = buildMapboxColorExpression(col, info.min, info.max, palKey, shape.color);

      shape.layerIds.forEach(lId => {
        if (!map.getLayer(lId)) return;
        if (lId.endsWith("-fill")) map.setPaintProperty(lId, "fill-color", expr);
        if (lId.endsWith("-line") || lId.endsWith("-outline")) map.setPaintProperty(lId, "line-color", expr);
        if (lId.endsWith("-circle")) map.setPaintProperty(lId, "circle-color", expr);
      });
    }

    selColG.addEventListener("change", applyGradient);
    selPal.addEventListener("change", applyGradient);
  }

  // ── Drag-and-Drop para Reordenação de Camadas ─────────────────────
  setupCardDragAndDrop(item, shapeId);

  // Alternar Visibilidade
  const btnVis = item.querySelector(`#btn-vis-${shapeId}`);
  btnVis?.addEventListener("click", () => {
    const shape = loadedShapes[shapeId];
    if (!shape) return;
    shape.visible = !shape.visible;
    shape.layerIds.forEach(lId => {
      if (map.getLayer(lId)) {
        map.setLayoutProperty(lId, "visibility", shape.visible ? "visible" : "none");
      }
    });
    btnVis.classList.toggle("active", !shape.visible);
    btnVis.style.opacity = shape.visible ? "1" : "0.4";
  });

  // Remover Shape
  const btnDel = item.querySelector(`#btn-del-${shapeId}`);
  btnDel?.addEventListener("click", () => {
    const shape = loadedShapes[shapeId];
    if (!shape) return;
    shape.layerIds.forEach(lId => {
      if (map.getLayer(lId)) map.removeLayer(lId);
    });
    if (map.getSource(shape.sourceId)) {
      map.removeSource(shape.sourceId);
    }
    delete loadedShapes[shapeId];
    const orderIdx = shapeOrder.indexOf(shapeId);
    if (orderIdx !== -1) shapeOrder.splice(orderIdx, 1);
    item.remove();
    if (typeof updateFiltersLayerList === "function") {
      updateFiltersLayerList();
    }
    if (typeof updateGlobalStats === "function") {
      updateGlobalStats();
    }
    showToast(`Camada "${name}" removida.`, 2500);
  });
}

// ── Drag-and-Drop: Configuração por Cartão ───────────────────────────
function setupCardDragAndDrop(item, shapeId) {
  const container = document.getElementById("shapes-list");
  if (!container) return;

  // Inicia o drag: registra qual shape está sendo movido
  item.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", shapeId);
    e.dataTransfer.effectAllowed = "move";
    // Delay de um frame para o browser renderizar o ghost antes de aplicar o estilo
    requestAnimationFrame(() => item.classList.add("dragging"));
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    // Remove qualquer indicador de posição residual
    document.querySelectorAll(".drop-indicator").forEach(el => el.remove());
  });
}

// ── Drag-and-Drop: Eventos no Contêiner (delegados) ──────────────────
// Inicializado uma única vez, pois os cards são inseridos dinamicamente
function initShapeListDragDrop() {
  const container = document.getElementById("shapes-list");
  if (!container) return;

  let dropIndicator = null;

  function getDropTarget(e) {
    // Encontra o card mais próximo do cursor (excluindo o que está sendo arrastado)
    const draggingEl = container.querySelector(".dragging");
    const cards = [...container.querySelectorAll(".shape-item:not(.dragging)")];
    if (!cards.length) return { el: null, before: false };

    let closest = null;
    let closestOffset = Infinity;

    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const offset = Math.abs(e.clientY - midY);
      if (offset < closestOffset) {
        closestOffset = offset;
        closest = { el: card, before: e.clientY < midY };
      }
    });

    return closest || { el: null, before: false };
  }

  function showDropIndicator(target) {
    if (!dropIndicator) {
      dropIndicator = document.createElement("div");
      dropIndicator.className = "drop-indicator";
    }
    if (target.el) {
      if (target.before) {
        container.insertBefore(dropIndicator, target.el);
      } else {
        container.insertBefore(dropIndicator, target.el.nextSibling);
      }
    }
  }

  container.addEventListener("dragover", e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const target = getDropTarget(e);
    showDropIndicator(target);
  });

  container.addEventListener("dragleave", e => {
    // Só remove o indicador se o mouse saiu realmente do contêiner
    if (!container.contains(e.relatedTarget)) {
      if (dropIndicator) dropIndicator.remove();
      dropIndicator = null;
    }
  });

  container.addEventListener("drop", e => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;

    const draggedEl = document.getElementById(`item-${draggedId}`);
    const target    = getDropTarget(e);

    // Remove o indicador visual
    if (dropIndicator) { dropIndicator.remove(); dropIndicator = null; }

    if (!draggedEl || !target.el) return;
    if (draggedEl === target.el) return;

    // Reordena o DOM
    if (target.before) {
      container.insertBefore(draggedEl, target.el);
    } else {
      container.insertBefore(draggedEl, target.el.nextSibling);
    }

    // Reconstrói shapeOrder com base na nova ordem DOM
    const newOrder = [];
    container.querySelectorAll(".shape-item").forEach(el => {
      const id = el.id.replace("item-", "");
      if (loadedShapes[id]) newOrder.push(id);
    });
    shapeOrder.length = 0;
    newOrder.forEach(id => shapeOrder.push(id));

    // Sincroniza a ordem das camadas no Mapbox
    syncLayerZOrder();

    const movedName = loadedShapes[draggedId]?.name || draggedId;
    showToast(`Camada "${movedName}" reordenada`, 2000);
  });
}
