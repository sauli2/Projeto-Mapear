/**
 * js/filters.js - Filtros de feições das camadas carregadas (numérico e categórico/texto)
 */

let currentFilteredShapeId = null;
let currentFilteredColumn = null;

// ── Extrai todas as colunas e analisa seus tipos e valores ───────────
function inspectLayerColumns(geojson) {
  const columns = {};
  if (!geojson || !geojson.features || geojson.features.length === 0) return columns;

  const features = geojson.features;
  const sampleKeys = new Set();

  for (const f of features) {
    if (f.properties) {
      for (const k of Object.keys(f.properties)) {
        if (k !== "_table") sampleKeys.add(k);
      }
    }
  }

  for (const key of sampleKeys) {
    let numCount = 0;
    let strCount = 0;
    let min = Infinity;
    let max = -Infinity;
    const valueCounts = {};

    for (const f of features) {
      const rawVal = f.properties?.[key];
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        valueCounts["(Vazio)"] = (valueCounts["(Vazio)"] || 0) + 1;
        continue;
      }

      const numVal = parseNumericValue(rawVal);
      if (!isNaN(numVal) && isFinite(numVal)) {
        numCount++;
        if (numVal < min) min = numVal;
        if (numVal > max) max = numVal;
      } else {
        strCount++;
      }

      const strRep = String(rawVal);
      valueCounts[strRep] = (valueCounts[strRep] || 0) + 1;
    }

    // Se mais de 70% dos valores preenchidos forem numéricos, considera numérica
    const isNumeric = numCount > 0 && numCount >= strCount && isFinite(min) && isFinite(max);

    columns[key] = {
      name: key,
      type: isNumeric ? "numeric" : "string",
      min: isNumeric ? min : null,
      max: isNumeric ? max : null,
      numCount,
      uniqueValues: valueCounts,
      totalValues: features.length
    };
  }

  return columns;
}

// ── Aplica ou Limpa o Filtro no Mapbox GL JS ──────────────────────────
function applyLayerFilterToMap(shapeId, customFilterExpr) {
  const shape = loadedShapes[shapeId];
  if (!shape || !map) return;

  shape.layerIds.forEach(lId => {
    if (!map.getLayer(lId)) return;

    let baseGeomFilter;
    if (lId.endsWith("-fill") || lId.endsWith("-outline")) {
      baseGeomFilter = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];
    } else if (lId.endsWith("-line")) {
      baseGeomFilter = ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]];
    } else if (lId.endsWith("-circle")) {
      baseGeomFilter = ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]];
    }

    if (customFilterExpr) {
      map.setFilter(lId, ["all", baseGeomFilter, customFilterExpr]);
    } else {
      map.setFilter(lId, baseGeomFilter);
    }
  });
}

// ── Atualiza o Dropdown de Camadas Carregadas na Aba de Filtros ───────
function updateFiltersLayerList() {
  const container = document.getElementById("filters-container");
  if (!container) return;

  const shapeIds = Object.keys(loadedShapes);

  if (shapeIds.length === 0) {
    currentFilteredShapeId = null;
    currentFilteredColumn = null;
    container.innerHTML = `
      <div class="filters-empty-state">
        <div class="filters-empty-icon">
          <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        </div>
        <div class="filters-empty-title">Nenhuma camada carregada</div>
        <div class="filters-empty-desc">
          Importe arquivos na aba <strong>Dados & Shapes</strong> para habilitar os filtros urbanos por colunas e atributos.
        </div>
        <button class="filters-goto-btn" id="btn-filters-goto-shapes">Importar Arquivos</button>
      </div>
    `;

    document.getElementById("btn-filters-goto-shapes")?.addEventListener("click", () => {
      const shapesRailBtn = document.querySelector('.rail-btn[data-tab="shapes"]');
      if (shapesRailBtn) shapesRailBtn.click();
    });
    return;
  }

  // Se a camada atualmente selecionada não existir mais, escolhe a primeira disponível
  if (!currentFilteredShapeId || !loadedShapes[currentFilteredShapeId]) {
    currentFilteredShapeId = shapeIds[0];
    currentFilteredColumn = null;
  }

  renderFiltersMainUI();
}

// ── Renderiza a Estrutura Principal dos Filtros ───────────────────────
function renderFiltersMainUI() {
  const container = document.getElementById("filters-container");
  if (!container) return;

  const shape = loadedShapes[currentFilteredShapeId];
  if (!shape) return;

  const shapeIds = Object.keys(loadedShapes);

  // Opções de camadas
  let layerOptionsHtml = "";
  shapeIds.forEach(sId => {
    const s = loadedShapes[sId];
    const featCount = s.geojson?.features ? s.geojson.features.length : 0;
    const isSelected = sId === currentFilteredShapeId ? "selected" : "";
    layerOptionsHtml += `<option value="${sId}" ${isSelected}>${s.name} (${featCount.toLocaleString("pt-BR")} feições)</option>`;
  });

  // Analisa colunas da camada atual
  const columnsInfo = inspectLayerColumns(shape.geojson);
  shape._columnsInfo = columnsInfo;
  const colKeys = Object.keys(columnsInfo);

  // Opções de colunas
  let colOptionsHtml = '<option value="">Selecione uma coluna para filtrar…</option>';
  colKeys.forEach(k => {
    const col = columnsInfo[k];
    const isSelected = k === currentFilteredColumn ? "selected" : "";
    const typeLabel = col.type === "numeric" ? "#" : "Aa";
    colOptionsHtml += `<option value="${k}" ${isSelected}>${typeLabel} ${k}</option>`;
  });

  container.innerHTML = `
    <!-- Seletor de Camada -->
    <div class="filter-field-group">
      <label class="filter-field-label">Camada Ativa</label>
      <select class="gradient-select filter-select" id="filter-layer-select">
        ${layerOptionsHtml}
      </select>
    </div>

    <!-- Seletor de Coluna -->
    <div class="filter-field-group">
      <label class="filter-field-label">Coluna para Filtrar</label>
      <select class="gradient-select filter-select" id="filter-column-select">
        ${colOptionsHtml}
      </select>
    </div>

    <!-- Painel de Configuração do Filtro -->
    <div id="filter-config-panel"></div>

    <!-- Rodapé de Status e Limpeza -->
    <div id="filter-footer" class="filter-footer" style="display:none;">
      <div class="filter-status-row">
        <span class="filter-status-dot"></span>
        <span class="filter-status-text" id="filter-status-text">Exibindo todas as feições</span>
      </div>
      <button class="filter-clear-btn" id="btn-clear-layer-filter" title="Restaurar visualização original">
        <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        Limpar Filtro
      </button>
    </div>
  `;

  // Evento ao mudar de camada
  const layerSelect = document.getElementById("filter-layer-select");
  layerSelect?.addEventListener("change", e => {
    currentFilteredShapeId = e.target.value;
    currentFilteredColumn = null;
    renderFiltersMainUI();
  });

  // Evento ao mudar de coluna
  const colSelect = document.getElementById("filter-column-select");
  colSelect?.addEventListener("change", e => {
    currentFilteredColumn = e.target.value;
    renderColumnFilterConfig();
  });

  // Evento do botão limpar filtro
  const btnClear = document.getElementById("btn-clear-layer-filter");
  btnClear?.addEventListener("click", () => {
    clearActiveLayerFilter(currentFilteredShapeId);
  });

  // Se já houver uma coluna selecionada ou filtro pré-existente
  if (shape.activeFilter && !currentFilteredColumn) {
    currentFilteredColumn = shape.activeFilter.column;
    if (colSelect) colSelect.value = currentFilteredColumn;
  }

  if (currentFilteredColumn) {
    renderColumnFilterConfig();
  } else {
    updateFilterStatusBadge(shape);
  }
}

// ── Renderiza o Painel Específico da Coluna (Numérico ou Categórico) ───
function renderColumnFilterConfig() {
  const panel = document.getElementById("filter-config-panel");
  const shape = loadedShapes[currentFilteredShapeId];
  if (!panel || !shape) return;

  if (!currentFilteredColumn) {
    panel.innerHTML = "";
    updateFilterStatusBadge(shape);
    return;
  }

  const colInfo = shape._columnsInfo?.[currentFilteredColumn];
  if (!colInfo) {
    panel.innerHTML = '<div style="font-size:11.5px;color:var(--muted);padding:8px 0;">Coluna sem dados.</div>';
    return;
  }

  if (colInfo.type === "numeric") {
    renderNumericFilterUI(panel, shape, colInfo);
  } else {
    renderCategoricalFilterUI(panel, shape, colInfo);
  }

  updateFilterStatusBadge(shape);
}

// ── Filtro Numérico ──────────────────────────────────────────────────
function renderNumericFilterUI(panel, shape, colInfo) {
  const saved = (shape.activeFilter && shape.activeFilter.column === colInfo.name)
    ? shape.activeFilter
    : {
        operator: "range",
        min: colInfo.min,
        max: colInfo.max,
        val: colInfo.min
      };

  panel.innerHTML = `
    <div class="filter-config-box">
      <div class="filter-config-header">
        <span class="filter-badge numeric">Numérica</span>
        <span class="filter-range-info">Mín: <strong>${formatStatNumber(colInfo.min)}</strong> · Máx: <strong>${formatStatNumber(colInfo.max)}</strong></span>
      </div>

      <div class="filter-subgroup">
        <label class="filter-sublabel">Condição</label>
        <select class="gradient-select filter-select-sm" id="num-filter-operator">
          <option value="range" ${saved.operator === "range" ? "selected" : ""}>Entre (Intervalo)</option>
          <option value="gte"   ${saved.operator === "gte" ? "selected" : ""}>Maior ou igual (&gt;=)</option>
          <option value="lte"   ${saved.operator === "lte" ? "selected" : ""}>Menor ou igual (&lt;=)</option>
          <option value="eq"    ${saved.operator === "eq" ? "selected" : ""}>Igual a (==)</option>
        </select>
      </div>

      <!-- Inputs de Intervalo [De ... Até ...] -->
      <div id="num-wrap-range" class="num-inputs-row" style="${saved.operator === "range" ? "display:flex;" : "display:none;"}">
        <div class="num-input-wrap">
          <label>Mínimo</label>
          <input type="number" class="filter-num-input" id="num-input-min" value="${saved.min ?? colInfo.min}" step="any" />
        </div>
        <div class="num-input-wrap">
          <label>Máximo</label>
          <input type="number" class="filter-num-input" id="num-input-max" value="${saved.max ?? colInfo.max}" step="any" />
        </div>
      </div>

      <!-- Input de Valor Único para >=, <= ou == -->
      <div id="num-wrap-single" class="num-inputs-row" style="${saved.operator !== "range" ? "display:flex;" : "display:none;"}">
        <div class="num-input-wrap" style="flex:1;">
          <label id="num-single-label">Valor de Referência</label>
          <input type="number" class="filter-num-input" id="num-input-val" value="${saved.val ?? colInfo.min}" step="any" />
        </div>
      </div>
    </div>
  `;

  const opSelect  = panel.querySelector("#num-filter-operator");
  const wrapRange = panel.querySelector("#num-wrap-range");
  const wrapSingle= panel.querySelector("#num-wrap-single");
  const inputMin  = panel.querySelector("#num-input-min");
  const inputMax  = panel.querySelector("#num-input-max");
  const inputVal  = panel.querySelector("#num-input-val");

  function triggerNumericApply() {
    const operator = opSelect.value;
    let minVal = parseFloat(inputMin.value);
    let maxVal = parseFloat(inputMax.value);
    let singleVal = parseFloat(inputVal.value);

    let expr = null;

    if (operator === "range") {
      if (isNaN(minVal)) minVal = -Infinity;
      if (isNaN(maxVal)) maxVal = Infinity;
      expr = [
        "all",
        [">=", ["to-number", ["get", colInfo.name], -Infinity], minVal],
        ["<=", ["to-number", ["get", colInfo.name], Infinity], maxVal]
      ];
    } else if (operator === "gte") {
      if (!isNaN(singleVal)) {
        expr = [">=", ["to-number", ["get", colInfo.name], -Infinity], singleVal];
      }
    } else if (operator === "lte") {
      if (!isNaN(singleVal)) {
        expr = ["<=", ["to-number", ["get", colInfo.name], Infinity], singleVal];
      }
    } else if (operator === "eq") {
      if (!isNaN(singleVal)) {
        expr = ["==", ["to-number", ["get", colInfo.name], null], singleVal];
      }
    }

    // Salva o estado do filtro
    shape.activeFilter = {
      column: colInfo.name,
      type: "numeric",
      operator,
      min: minVal,
      max: maxVal,
      val: singleVal,
      expr
    };

    applyLayerFilterToMap(currentFilteredShapeId, expr);
    updateFilterStatusBadge(shape);
  }

  opSelect?.addEventListener("change", () => {
    const isRange = opSelect.value === "range";
    wrapRange.style.display = isRange ? "flex" : "none";
    wrapSingle.style.display = isRange ? "none" : "flex";
    triggerNumericApply();
  });

  inputMin?.addEventListener("input", triggerNumericApply);
  inputMax?.addEventListener("input", triggerNumericApply);
  inputVal?.addEventListener("input", triggerNumericApply);

  // Aplica inicialmente se já havia configuração salva
  if (shape.activeFilter && shape.activeFilter.column === colInfo.name) {
    triggerNumericApply();
  }
}

// ── Filtro Categórico / Texto ─────────────────────────────────────────
function renderCategoricalFilterUI(panel, shape, colInfo) {
  const uniqueEntries = Object.entries(colInfo.uniqueValues).sort((a, b) => b[1] - a[1]);
  const totalUnique = uniqueEntries.length;

  // Carrega seleção salva ou seleciona todos por padrão
  let selectedSet = new Set(uniqueEntries.map(e => e[0]));
  if (shape.activeFilter && shape.activeFilter.column === colInfo.name && Array.isArray(shape.activeFilter.selectedValues)) {
    selectedSet = new Set(shape.activeFilter.selectedValues);
  }

  panel.innerHTML = `
    <div class="filter-config-box">
      <div class="filter-config-header">
        <span class="filter-badge text">Texto / Categoria</span>
        <span class="filter-range-info">${totalUnique} valores distintos</span>
      </div>

      <div class="cat-search-row">
        <div class="cat-search-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" class="cat-search-input" id="cat-search-input" placeholder="Buscar valor…" />
        </div>
        <button class="cat-quick-btn" id="btn-cat-select-all" title="Selecionar todos os valores">Todos</button>
        <button class="cat-quick-btn" id="btn-cat-clear-all" title="Desmarcar todos os valores">Nenhum</button>
      </div>

      <div class="cat-values-list" id="cat-values-list"></div>
    </div>
  `;

  const listEl     = panel.querySelector("#cat-values-list");
  const searchInput= panel.querySelector("#cat-search-input");
  const btnAll     = panel.querySelector("#btn-cat-select-all");
  const btnNone    = panel.querySelector("#btn-cat-clear-all");

  function renderCheckboxes(filterText = "") {
    if (!listEl) return;
    const cleanSearch = filterText.trim().toLowerCase();

    const filteredEntries = uniqueEntries.filter(([val]) => {
      if (!cleanSearch) return true;
      return val.toLowerCase().includes(cleanSearch);
    });

    if (filteredEntries.length === 0) {
      listEl.innerHTML = '<div class="cat-item-empty">Nenhum valor encontrado</div>';
      return;
    }

    let html = "";
    filteredEntries.forEach(([val, count]) => {
      const isChecked = selectedSet.has(val) ? "checked" : "";
      const escapedVal = val.replace(/"/g, "&quot;");
      html += `
        <label class="cat-item-row" title="${escapedVal}">
          <input type="checkbox" class="cat-checkbox" data-val="${escapedVal}" ${isChecked} />
          <span class="cat-item-label">${val}</span>
          <span class="cat-item-count">${count}</span>
        </label>
      `;
    });

    listEl.innerHTML = html;

    // Conecta eventos de clique em cada checkbox
    listEl.querySelectorAll(".cat-checkbox").forEach(cb => {
      cb.addEventListener("change", e => {
        const itemVal = e.target.dataset.val;
        if (e.target.checked) {
          selectedSet.add(itemVal);
        } else {
          selectedSet.delete(itemVal);
        }
        triggerCategoricalApply();
      });
    });
  }

  function triggerCategoricalApply() {
    const selectedArr = Array.from(selectedSet);
    let expr = null;

    if (selectedArr.length === 0) {
      // Nenhuma feição deve ser exibida
      expr = ["literal", false];
    } else if (selectedArr.length === totalUnique) {
      // Todos selecionados: sem restrição
      expr = null;
    } else {
      // Subconjunto selecionado
      const hasEmpty = selectedArr.includes("(Vazio)");
      const realVals = selectedArr.filter(v => v !== "(Vazio)");

      if (hasEmpty && realVals.length > 0) {
        expr = [
          "any",
          ["in", ["to-string", ["get", colInfo.name]], ["literal", realVals]],
          ["==", ["get", colInfo.name], null],
          ["==", ["to-string", ["get", colInfo.name]], ""]
        ];
      } else if (hasEmpty) {
        expr = [
          "any",
          ["==", ["get", colInfo.name], null],
          ["==", ["to-string", ["get", colInfo.name]], ""]
        ];
      } else {
        expr = ["in", ["to-string", ["get", colInfo.name]], ["literal", realVals]];
      }
    }

    shape.activeFilter = {
      column: colInfo.name,
      type: "categorical",
      selectedValues: selectedArr,
      expr
    };

    applyLayerFilterToMap(currentFilteredShapeId, expr);
    updateFilterStatusBadge(shape);
  }

  searchInput?.addEventListener("input", e => {
    renderCheckboxes(e.target.value);
  });

  btnAll?.addEventListener("click", () => {
    uniqueEntries.forEach(([val]) => selectedSet.add(val));
    renderCheckboxes(searchInput?.value || "");
    triggerCategoricalApply();
  });

  btnNone?.addEventListener("click", () => {
    selectedSet.clear();
    renderCheckboxes(searchInput?.value || "");
    triggerCategoricalApply();
  });

  renderCheckboxes();

  if (shape.activeFilter && shape.activeFilter.column === colInfo.name) {
    triggerCategoricalApply();
  }
}

// ── Atualiza o Contador de Feições Visíveis ───────────────────────────
function updateFilterStatusBadge(shape) {
  const footer = document.getElementById("filter-footer");
  const statusText = document.getElementById("filter-status-text");
  if (!footer || !shape) return;

  const total = shape.geojson?.features ? shape.geojson.features.length : 0;
  if (total === 0) {
    footer.style.display = "none";
    return;
  }

  footer.style.display = "flex";

  if (!shape.activeFilter || !shape.activeFilter.expr) {
    if (statusText) statusText.textContent = `Exibindo todas as ${total.toLocaleString("pt-BR")} feições`;
    return;
  }

  // Calcula feições visíveis baseado no filtro
  const visibleCount = countFeaturesMatchingFilter(shape.geojson.features, shape.activeFilter);
  const pct = total > 0 ? Math.round((visibleCount / total) * 100) : 0;

  if (statusText) {
    statusText.textContent = `Exibindo ${visibleCount.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} (${pct}%)`;
  }
}

// ── Conta feições que atendem ao filtro ativo no cliente ─────────────
function countFeaturesMatchingFilter(features, filterConfig) {
  if (!features || !filterConfig || !filterConfig.column) return features?.length || 0;

  const { column, type, operator, min, max, val, selectedValues } = filterConfig;
  let count = 0;

  for (const f of features) {
    const rawVal = f.properties?.[column];

    if (type === "numeric") {
      const num = parseNumericValue(rawVal);
      if (isNaN(num)) continue;

      if (operator === "range") {
        if (num >= min && num <= max) count++;
      } else if (operator === "gte") {
        if (num >= val) count++;
      } else if (operator === "lte") {
        if (num <= val) count++;
      } else if (operator === "eq") {
        if (num === val) count++;
      }
    } else {
      const str = (rawVal === undefined || rawVal === null || rawVal === "") ? "(Vazio)" : String(rawVal);
      if (selectedValues && selectedValues.includes(str)) {
        count++;
      }
    }
  }

  return count;
}

// ── Limpa o Filtro da Camada Ativa ───────────────────────────────────
function clearActiveLayerFilter(shapeId) {
  const shape = loadedShapes[shapeId];
  if (!shape) return;

  delete shape.activeFilter;
  applyLayerFilterToMap(shapeId, null);
  renderFiltersMainUI();
  showToast(`Filtros da camada "${shape.name}" removidos`, 2000);
}

// ── Inicializa a Interface de Filtros ─────────────────────────────────
function initFiltersUI() {
  updateFiltersLayerList();
}
