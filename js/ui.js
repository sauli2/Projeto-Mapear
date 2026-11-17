/**
 * js/ui.js - Gerenciamento de interface, abas, drawer, modais e drag-and-drop
 */

// ── Toast de Feedback ───────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 3800) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

// ── Inicializa a Interface de Usuário ────────────────────────────────
function initUI() {
  const railBtns = document.querySelectorAll(".rail-btn");
  const drawer = document.getElementById("drawer");
  const drawerTitle = document.getElementById("drawer-title");
  const btnCloseDrawer = document.getElementById("btn-close-drawer");

  const tabTitles = {
    project: "Painel do Projeto",
    layers:  "Camadas Base do Mapa",
    shapes:  "Dados & Shapes",
    filters: "Filtros Urbanos"
  };

  let activeTab = "layers";

  function openTab(tabId) {
    if (activeTab === tabId && !drawer.classList.contains("closed")) {
      drawer.classList.add("closed");
      railBtns.forEach(b => b.classList.remove("active"));
      return;
    }
    activeTab = tabId;
    drawer.classList.remove("closed");
    if (drawerTitle) drawerTitle.textContent = tabTitles[tabId] || "Painel";
    railBtns.forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    document.querySelectorAll(".drawer-tab").forEach(tab => {
      tab.classList.toggle("active", tab.id === "tab-" + tabId);
    });

    if (tabId === "filters" && typeof updateFiltersLayerList === "function") {
      updateFiltersLayerList();
    }
    if (tabId === "project") {
      updateGlobalStats();
    }
  }

  // Torna openTab acessível globalmente para navegação rápida entre painéis
  window.openDrawerTab = openTab;

  railBtns.forEach(btn => {
    btn.addEventListener("click", () => openTab(btn.dataset.tab));
  });

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener("click", () => {
      drawer.classList.add("closed");
      railBtns.forEach(b => b.classList.remove("active"));
    });
  }

  // ── Ações da Aba Projeto ──────────────────────────────────────────
  document.getElementById("btn-fit-all-layers")?.addEventListener("click", () => {
    const shapeIds = Object.keys(loadedShapes || {});
    if (shapeIds.length === 0) {
      showToast("Nenhuma camada importada no projeto.", 2500);
      return;
    }
    const allFeatures = [];
    shapeIds.forEach(id => {
      const feats = loadedShapes[id]?.geojson?.features || [];
      allFeatures.push(...feats);
    });
    const bounds = calculateSafeBounds(allFeatures);
    if (bounds && map) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 16.5, duration: 900 });
      showToast("Visualização ajustada para todas as camadas ativas.", 2000);
    }
  });

  document.getElementById("btn-copy-coordinates")?.addEventListener("click", () => {
    if (!map) return;
    const center = map.getCenter();
    const str = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(str).then(() => {
        showToast(`Coordenadas copiadas: ${str}`, 2500);
      }).catch(() => {
        showToast(`Centro: ${str}`, 3000);
      });
    } else {
      showToast(`Centro: ${str}`, 3000);
    }
  });

  // ── Toggles de Camadas Base ───────────────────────────────────────
  document.getElementById("chk-buildings")?.addEventListener("change", e => {
    toggleLayersVisibility(["3d-buildings"], e.target.checked);
  });

  document.getElementById("chk-green")?.addEventListener("change", e => {
    if (!_greenLoaded) return;
    toggleLayersVisibility(["osm-green-fill", "osm-green-outline"], e.target.checked);
  });

  document.getElementById("chk-water")?.addEventListener("change", e => {
    toggleLayersVisibility(_waterLayerIds, e.target.checked);
  });

  // ── Controles 2D / 3D ─────────────────────────────────────────────
  const btn2D = document.getElementById("btn-toggle-2d");
  const btn3D = document.getElementById("btn-toggle-3d");
  const chk3D = document.getElementById("chk-3d");

  function set3DMode(is3D) {
    setMap3DMode(is3D);
    if (chk3D) chk3D.checked = is3D;
    if (btn2D && btn3D) {
      btn2D.classList.toggle("active", !is3D);
      btn3D.classList.toggle("active", is3D);
    }
    const chip = document.getElementById("chip-mode");
    if (chip) chip.textContent = is3D ? "Modo 3D" : "Modo 2D";
  }

  if (btn2D) btn2D.addEventListener("click", () => set3DMode(false));
  if (btn3D) btn3D.addEventListener("click", () => set3DMode(true));
  if (chk3D) chk3D.addEventListener("change", e => set3DMode(e.target.checked));

  // ── Controles Flutuantes de Navegação ─────────────────────────────
  document.getElementById("btn-zoom-in")?.addEventListener("click", () => map.zoomIn());
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => map.zoomOut());
  document.getElementById("btn-reset-pitch")?.addEventListener("click", () => map.resetNorthPitch());

  // ── Setup de Drag & Drop e Upload de Arquivos ─────────────────────
  setupFileDropAndPicker(openTab);

  // ── Setup da Busca de Localidades (Mapbox Geocoding) ──────────────
  setupGeocodingSearch();
}

// ── Busca de Bairros, Ruas e Cidades via Mapbox Geocoding API ────────
function setupGeocodingSearch() {
  const searchInput    = document.getElementById("search-input");
  const searchDropdown = document.getElementById("search-dropdown");
  const searchClear    = document.getElementById("search-clear");
  const cityPillText   = document.getElementById("city-pill-text");

  if (!searchInput || !searchDropdown) return;

  let debounceTimer = null;
  let activeMarker  = null;

  async function performSearch(query) {
    if (!query || query.trim().length < 2) {
      searchDropdown.innerHTML = "";
      searchDropdown.classList.remove("show");
      return;
    }

    searchDropdown.innerHTML = '<div class="search-loading">Buscando localidades…</div>';
    searchDropdown.classList.add("show");

    try {
      // Prioriza proximidade ao centro atual do mapa
      const center = map ? map.getCenter() : { lng: CONFIG.center[0], lat: CONFIG.center[1] };
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${MAPBOX_TOKEN}&proximity=${center.lng},${center.lat}&language=pt&types=place,locality,neighborhood,address,poi&limit=6`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Erro na busca de locais");
      const data = await res.json();

      if (!data.features || data.features.length === 0) {
        searchDropdown.innerHTML = '<div class="search-empty">Nenhum resultado encontrado</div>';
        return;
      }

      searchDropdown.innerHTML = "";
      data.features.forEach(feat => {
        const item = document.createElement("div");
        item.className = "search-item";

        // Título principal e subtítulo (contexto geográfico)
        const text = feat.text || feat.place_name;
        const sub = feat.place_name.replace(text + ",", "").replace(text, "").trim();

        item.innerHTML = `
          <div class="search-item-title">${text}</div>
          <div class="search-item-sub">${sub || feat.place_name}</div>
        `;

        item.addEventListener("click", () => {
          selectSearchResult(feat);
        });

        searchDropdown.appendChild(item);
      });
    } catch (err) {
      console.warn("[Busca]", err);
      searchDropdown.innerHTML = '<div class="search-empty">Falha ao buscar localidade</div>';
    }
  }

  function selectSearchResult(feat) {
    searchDropdown.classList.remove("show");
    searchInput.value = feat.text || feat.place_name;
    if (searchClear) searchClear.style.display = "flex";

    // Atualiza a pílula de cidade se o local encontrado tiver contexto municipal/estadual
    if (cityPillText) {
      const cityContext = (feat.context || []).find(c => c.id.startsWith("place") || c.id.startsWith("region"));
      if (cityContext) {
        cityPillText.textContent = feat.text;
      }
    }

    // Move a câmera com zoom apropriado dependendo do tipo (bairro, rua, cidade)
    if (feat.bbox) {
      map.fitBounds([[feat.bbox[0], feat.bbox[1]], [feat.bbox[2], feat.bbox[3]]], {
        padding: 50,
        maxZoom: 16.5,
        duration: 1200
      });
    } else if (feat.center) {
      let targetZoom = 15.5;
      const types = feat.place_type || [];
      if (types.includes("place") || types.includes("region")) targetZoom = 12;
      else if (types.includes("neighborhood") || types.includes("locality")) targetZoom = 14.5;
      else if (types.includes("address") || types.includes("poi")) targetZoom = 16.5;

      map.flyTo({
        center: feat.center,
        zoom: targetZoom,
        duration: 1200,
        essential: true
      });
    }

    // Adiciona marcador sutil de destaque no ponto
    if (feat.center) {
      if (activeMarker) activeMarker.remove();
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#f25188";
      el.style.border = "2.5px solid #ffffff";
      el.style.boxShadow = "0 2px 10px rgba(242, 81, 136, 0.4)";

      activeMarker = new mapboxgl.Marker(el)
        .setLngLat(feat.center)
        .addTo(map);

      // Remove marcador após 12 segundos ou no próximo clique
      setTimeout(() => {
        if (activeMarker) { activeMarker.remove(); activeMarker = null; }
      }, 12000);
    }

    showToast(`Navegando para: ${feat.text}`, 2500);
  }

  // Eventos do campo de busca
  searchInput.addEventListener("input", e => {
    const val = e.target.value;
    if (searchClear) searchClear.style.display = val ? "flex" : "none";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(val), 320);
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim().length >= 2) {
      performSearch(searchInput.value);
    }
  });

  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      clearTimeout(debounceTimer);
      const firstItem = searchDropdown.querySelector(".search-item");
      if (firstItem) firstItem.click();
      else performSearch(searchInput.value);
    } else if (e.key === "Escape") {
      searchDropdown.classList.remove("show");
    }
  });

  if (searchClear) {
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchClear.style.display = "none";
      searchDropdown.innerHTML = "";
      searchDropdown.classList.remove("show");
      if (activeMarker) { activeMarker.remove(); activeMarker = null; }
    });
  }

  // Fecha dropdown ao clicar fora
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrapper")) {
      searchDropdown.classList.remove("show");
    }
  });
}

// ── Drag & Drop Global e File Picker ────────────────────────────────
function setupFileDropAndPicker(openTabFn) {
  const dropOverlay = document.getElementById("drop-overlay");
  const dropHint    = document.getElementById("drop-hint");
  const fileInput   = document.getElementById("file-input");
  let _dragDepth    = 0;

  async function handleDroppedFiles(files) {
    if (!files || files.length === 0) return;
    showToast("Processando arquivos espaciais…", 4000);
    try {
      const result = await processFiles(files);
      addGeoJSONToMap(result.geojson, result.name);
      openTabFn("shapes");
      showToast(`Camada "${result.name}" carregada com sucesso!`, 3000);
    } catch (err) {
      console.error("[Importação]", err);
      showToast(`Erro ao carregar: ${err.message}`, 5000);
    }
  }

  // Drag & drop na janela inteira
  document.addEventListener("dragenter", e => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      _dragDepth++;
      dropOverlay.classList.add("visible");
    }
  });

  document.addEventListener("dragleave", () => {
    _dragDepth--;
    if (_dragDepth <= 0) {
      _dragDepth = 0;
      dropOverlay.classList.remove("visible");
    }
  });

  document.addEventListener("dragover", e => e.preventDefault());

  document.addEventListener("drop", async e => {
    e.preventDefault();
    _dragDepth = 0;
    dropOverlay.classList.remove("visible");
    dropHint?.classList.remove("drag-over");
    await handleDroppedFiles(e.dataTransfer.files);
  });

  // Drop específico na área da sidebar
  if (dropHint) {
    dropHint.addEventListener("dragover", e => {
      e.preventDefault();
      dropHint.classList.add("drag-over");
    });
    dropHint.addEventListener("dragleave", () => dropHint.classList.remove("drag-over"));
    dropHint.addEventListener("drop", async e => {
      e.preventDefault();
      e.stopPropagation();
      dropHint.classList.remove("drag-over");
      _dragDepth = 0;
      dropOverlay.classList.remove("visible");
      await handleDroppedFiles(e.dataTransfer.files);
    });

    dropHint.addEventListener("click", () => {
      if (fileInput) fileInput.click();
    });
  }

  // File Picker
  if (fileInput) {
    fileInput.addEventListener("change", async e => {
      if (e.target.files?.length) {
        await handleDroppedFiles(e.target.files);
        fileInput.value = "";
      }
    });
  }
}

// ── Atualização das Estatísticas da Sessão / Projeto ────────────────
function updateGlobalStats() {
  const shapeIds = Object.keys(loadedShapes || {});
  const layerCount = shapeIds.length;
  let totalFeats = 0;
  shapeIds.forEach(id => {
    totalFeats += loadedShapes[id]?.geojson?.features?.length || 0;
  });

  const statLayers = document.getElementById("proj-stat-layers");
  const statFeats = document.getElementById("proj-stat-features");
  const chipLayers = document.getElementById("chip-layers-count");

  if (statLayers) statLayers.textContent = layerCount;
  if (statFeats) statFeats.textContent = totalFeats.toLocaleString("pt-BR");

  if (chipLayers) {
    if (layerCount > 0) {
      chipLayers.style.display = "block";
      chipLayers.textContent = `${layerCount} ${layerCount === 1 ? "camada ativa" : "camadas ativas"}`;
    } else {
      chipLayers.style.display = "none";
    }
  }

  if (map) {
    const statZoom = document.getElementById("proj-stat-zoom");
    const statMode = document.getElementById("proj-stat-mode");
    if (statZoom) statZoom.textContent = map.getZoom().toFixed(1);
    if (statMode) statMode.textContent = map.getPitch() > 10 ? "3D" : "2D";
  }
}

window.updateGlobalStats = updateGlobalStats;
