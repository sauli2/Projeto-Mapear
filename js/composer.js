/**
 * js/composer.js — Compositor de Mapa Temático (Print Layout)
 *
 * Permite ao usuário montar um layout cartográfico com título, subtítulo,
 * legenda automática, barra de escala, seta norte, créditos e exportar
 * como PNG de alta resolução.
 */

// ── Estado do Compositor ────────────────────────────────────────────
const composerState = {
  title:       "Mapa Temático",
  subtitle:    "",
  credits:     "Projeto Mapear · " + new Date().getFullYear(),
  showLegend:  true,
  showScale:   true,
  showNorth:   true,
  showCredits: true,
  orientation: "landscape",   // "landscape" | "portrait"
  paperSize:   "a4",          // "a4" | "letter" | "custom"
  bgColor:     "#ffffff",
};

// Dimensões de papel em pixels @150 DPI
const PAPER_SIZES = {
  a4:        { landscape: { w: 1754, h: 1240 }, portrait: { w: 1240, h: 1754 } },
  letter:    { landscape: { w: 1650, h: 1275 }, portrait: { w: 1275, h: 1650 } },
  custom:    { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 } },
};

// ── Abre o Modal do Compositor ──────────────────────────────────────
function openComposer() {
  const modal = document.getElementById("composer-modal");
  if (!modal) return;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";

  // Preenche campos com estado atual
  const titleIn    = document.getElementById("comp-title");
  const subtitleIn = document.getElementById("comp-subtitle");
  const creditsIn  = document.getElementById("comp-credits");
  const chkLegend  = document.getElementById("comp-chk-legend");
  const chkScale   = document.getElementById("comp-chk-scale");
  const chkNorth   = document.getElementById("comp-chk-north");
  const chkCredits = document.getElementById("comp-chk-credits");

  if (titleIn)    titleIn.value    = composerState.title;
  if (subtitleIn) subtitleIn.value  = composerState.subtitle;
  if (creditsIn)  creditsIn.value   = composerState.credits;
  if (chkLegend)  chkLegend.checked = composerState.showLegend;
  if (chkScale)   chkScale.checked  = composerState.showScale;
  if (chkNorth)   chkNorth.checked  = composerState.showNorth;
  if (chkCredits) chkCredits.checked = composerState.showCredits;

  // Renderiza a pré-visualização
  renderComposerPreview();
}

// ── Fecha o Modal do Compositor ─────────────────────────────────────
function closeComposer() {
  const modal = document.getElementById("composer-modal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

// ── Sincroniza o estado a partir dos campos ─────────────────────────
function syncComposerState() {
  const titleIn    = document.getElementById("comp-title");
  const subtitleIn = document.getElementById("comp-subtitle");
  const creditsIn  = document.getElementById("comp-credits");
  const chkLegend  = document.getElementById("comp-chk-legend");
  const chkScale   = document.getElementById("comp-chk-scale");
  const chkNorth   = document.getElementById("comp-chk-north");
  const chkCredits = document.getElementById("comp-chk-credits");

  if (titleIn)    composerState.title      = titleIn.value;
  if (subtitleIn) composerState.subtitle   = subtitleIn.value;
  if (creditsIn)  composerState.credits    = creditsIn.value;
  if (chkLegend)  composerState.showLegend = chkLegend.checked;
  if (chkScale)   composerState.showScale  = chkScale.checked;
  if (chkNorth)   composerState.showNorth  = chkNorth.checked;
  if (chkCredits) composerState.showCredits = chkCredits.checked;
}

// ── Monta dados de legenda a partir das camadas ativas ──────────────
function buildLegendData() {
  const items = [];
  const shapeIds = Object.keys(loadedShapes || {});

  shapeIds.forEach(id => {
    const s = loadedShapes[id];
    if (!s || !s.visible) return;

    // Detecta tipo de geometria
    let geomLabel = "Polígono";
    if (s.geojson && s.geojson.features) {
      const types = new Set();
      s.geojson.features.forEach(f => { if (f.geometry) types.add(f.geometry.type); });
      const hasP  = [...types].some(t => t.includes("Polygon"));
      const hasL  = [...types].some(t => t.includes("Line"));
      const hasPt = [...types].some(t => t.includes("Point"));
      if (hasL && !hasP && !hasPt) geomLabel = "Linha";
      else if (hasPt && !hasP && !hasL) geomLabel = "Ponto";
      else if ((hasP && hasL) || (hasP && hasPt) || (hasL && hasPt)) geomLabel = "Misto";
    }

    // Detecta se tem gradiente ativo
    const gradCol = document.getElementById(`grad-col-${id}`);
    const gradPal = document.getElementById(`grad-pal-${id}`);
    let gradient = null;
    if (gradCol && gradCol.value && s.numericCols && s.numericCols[gradCol.value]) {
      const colInfo = s.numericCols[gradCol.value];
      const palKey = gradPal ? gradPal.value : "calor";
      const stops = PALETTES[palKey]?.stops || PALETTES.calor.stops;
      gradient = {
        column: gradCol.value,
        min: colInfo.min,
        max: colInfo.max,
        stops: stops
      };
    }

    items.push({
      name: s.name,
      color: s.color,
      geomLabel,
      featureCount: s.geojson?.features?.length || 0,
      gradient
    });
  });

  return items;
}

// ── Calcula a escala real (metros por pixel) ─────────────────────────
function calculateMapScale() {
  if (!map) return { metersPerPx: 1, label: "?" };

  const center = map.getCenter();
  const zoom = map.getZoom();
  // Fórmula simplificada: em zoom 0, 1 pixel ≈ 156543 × cos(lat) metros
  const metersPerPx = (156543.03392 * Math.cos(center.lat * Math.PI / 180)) / Math.pow(2, zoom);

  // Escolhe uma distância agradável para a barra
  const targetBarPx = 200;
  const rawMeters = metersPerPx * targetBarPx;

  // Arredonda para valor bonito
  const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let niceMeters = niceValues[0];
  for (const v of niceValues) {
    if (v <= rawMeters * 1.4) niceMeters = v;
  }

  const barPx = niceMeters / metersPerPx;
  let label;
  if (niceMeters >= 1000) label = (niceMeters / 1000) + " km";
  else label = niceMeters + " m";

  return { metersPerPx, barPx, label, niceMeters };
}

// ── Renderiza a pré-visualização no canvas do modal ─────────────────
async function renderComposerPreview() {
  syncComposerState();

  const previewCanvas = document.getElementById("comp-preview-canvas");
  if (!previewCanvas) return;

  const dims = PAPER_SIZES[composerState.paperSize]?.[composerState.orientation]
    || PAPER_SIZES.a4.landscape;

  // O canvas de preview é menor (para caber no modal), mantendo proporção
  const previewMaxW = 680;
  const previewMaxH = 440;
  const scale = Math.min(previewMaxW / dims.w, previewMaxH / dims.h);
  previewCanvas.width  = Math.round(dims.w * scale);
  previewCanvas.height = Math.round(dims.h * scale);

  const ctx = previewCanvas.getContext("2d");
  await drawComposition(ctx, previewCanvas.width, previewCanvas.height, scale);
}

// ── Desenha a composição no canvas (reutilizável para preview e export)
async function drawComposition(ctx, cw, ch, scaleFactor) {
  const s = composerState;
  const sf = scaleFactor; // para escalar tamanhos de fonte etc.

  // Fundo
  ctx.fillStyle = s.bgColor;
  ctx.fillRect(0, 0, cw, ch);

  // Captura o mapa como imagem
  let mapImage = null;
  try {
    if (map) {
      map.getCanvas().getContext("webgl", { preserveDrawingBuffer: true });
      const dataUrl = map.getCanvas().toDataURL("image/png");
      mapImage = await loadImage(dataUrl);
    }
  } catch (err) {
    console.warn("[Compositor] Falha ao capturar canvas do mapa:", err);
  }

  // Margens
  const margin = Math.round(28 * sf);
  const headerH = Math.round(60 * sf);
  const footerH = s.showCredits ? Math.round(32 * sf) : 0;

  // Área do mapa
  const mapX = margin;
  const mapY = margin + headerH;
  const legendW = s.showLegend ? Math.round(220 * sf) : 0;
  const mapW = cw - margin * 2 - legendW - (legendW ? Math.round(12 * sf) : 0);
  const mapH = ch - margin * 2 - headerH - footerH;

  // ── Desenha Mapa ───────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  const mapRadius = Math.round(6 * sf);
  roundRect(ctx, mapX, mapY, mapW, mapH, mapRadius);
  ctx.clip();

  if (mapImage) {
    // Preenche mantendo aspect ratio via "cover"
    const imgRatio = mapImage.width / mapImage.height;
    const boxRatio = mapW / mapH;
    let sx = 0, sy = 0, sw = mapImage.width, sh = mapImage.height;
    if (imgRatio > boxRatio) {
      sw = mapImage.height * boxRatio;
      sx = (mapImage.width - sw) / 2;
    } else {
      sh = mapImage.width / boxRatio;
      sy = (mapImage.height - sh) / 2;
    }
    ctx.drawImage(mapImage, sx, sy, sw, sh, mapX, mapY, mapW, mapH);
  } else {
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.fillStyle = "#9ca3af";
    ctx.font = `${Math.round(14 * sf)}px 'Exo', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Mapa não disponível", mapX + mapW / 2, mapY + mapH / 2);
  }
  ctx.restore();

  // Borda sutil do mapa
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = Math.max(1, Math.round(1 * sf));
  ctx.beginPath();
  roundRect(ctx, mapX, mapY, mapW, mapH, mapRadius);
  ctx.stroke();

  // ── Header: Título e Subtítulo ─────────────────────────────────────
  ctx.textAlign = "left";
  ctx.fillStyle = "#1c191a";
  ctx.font = `700 ${Math.round(20 * sf)}px 'Exo', sans-serif`;
  ctx.fillText(s.title || "Mapa Temático", margin, margin + Math.round(24 * sf));

  if (s.subtitle) {
    ctx.fillStyle = "#7a6f74";
    ctx.font = `400 ${Math.round(12 * sf)}px 'Exo', sans-serif`;
    ctx.fillText(s.subtitle, margin, margin + Math.round(44 * sf));
  }

  // Linha decorativa do header
  ctx.fillStyle = "#f25188";
  ctx.fillRect(margin, margin + Math.round(52 * sf), Math.round(60 * sf), Math.round(3 * sf));

  // ── Legenda Lateral ────────────────────────────────────────────────
  if (s.showLegend) {
    const legendItems = buildLegendData();
    const legX = cw - margin - legendW;
    const legY = mapY;
    const legH = mapH;

    // Fundo da legenda
    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    roundRect(ctx, legX, legY, legendW, legH, mapRadius);
    ctx.fill();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = Math.max(1, Math.round(1 * sf));
    ctx.beginPath();
    roundRect(ctx, legX, legY, legendW, legH, mapRadius);
    ctx.stroke();

    // Título "Legenda"
    const legPad = Math.round(14 * sf);
    ctx.fillStyle = "#1c191a";
    ctx.font = `600 ${Math.round(11 * sf)}px 'Exo', sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("LEGENDA", legX + legPad, legY + legPad + Math.round(10 * sf));

    // Itens
    let itemY = legY + legPad + Math.round(28 * sf);
    const lineH = Math.round(18 * sf);
    const dotR = Math.round(5 * sf);

    legendItems.forEach(item => {
      if (itemY + lineH > legY + legH - legPad) return; // não ultrapassa

      if (item.gradient) {
        // Desenha legenda com gradiente
        ctx.fillStyle = "#1c191a";
        ctx.font = `500 ${Math.round(10 * sf)}px 'Exo', sans-serif`;
        ctx.fillText(item.name, legX + legPad, itemY + Math.round(4 * sf));
        itemY += Math.round(14 * sf);

        // Barra de gradiente
        const barW = legendW - legPad * 2;
        const barH = Math.round(6 * sf);
        const grad = ctx.createLinearGradient(legX + legPad, 0, legX + legPad + barW, 0);
        item.gradient.stops.forEach((stop, i) => {
          grad.addColorStop(i / (item.gradient.stops.length - 1), stop);
        });
        ctx.fillStyle = grad;
        ctx.beginPath();
        roundRect(ctx, legX + legPad, itemY, barW, barH, Math.round(2 * sf));
        ctx.fill();
        itemY += barH + Math.round(2 * sf);

        // Labels de min/max
        ctx.fillStyle = "#7a6f74";
        ctx.font = `400 ${Math.round(8 * sf)}px 'Exo', sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(formatStatNumber(item.gradient.min), legX + legPad, itemY + Math.round(7 * sf));
        ctx.textAlign = "right";
        ctx.fillText(formatStatNumber(item.gradient.max), legX + legPad + barW, itemY + Math.round(7 * sf));
        ctx.textAlign = "center";
        ctx.fillText(item.gradient.column, legX + legPad + barW / 2, itemY + Math.round(7 * sf));
        ctx.textAlign = "left";
        itemY += Math.round(16 * sf);

      } else {
        // Legenda com cor sólida
        // Ícone de geometria
        ctx.fillStyle = item.color;
        if (item.geomLabel === "Ponto") {
          ctx.beginPath();
          ctx.arc(legX + legPad + dotR, itemY + dotR, dotR, 0, Math.PI * 2);
          ctx.fill();
        } else if (item.geomLabel === "Linha") {
          ctx.strokeStyle = item.color;
          ctx.lineWidth = Math.round(2.5 * sf);
          ctx.beginPath();
          ctx.moveTo(legX + legPad, itemY + dotR);
          ctx.lineTo(legX + legPad + dotR * 2, itemY + dotR);
          ctx.stroke();
        } else {
          ctx.beginPath();
          roundRect(ctx, legX + legPad, itemY, dotR * 2, dotR * 2, Math.round(2 * sf));
          ctx.fill();
        }

        ctx.fillStyle = "#1c191a";
        ctx.font = `500 ${Math.round(10 * sf)}px 'Exo', sans-serif`;
        ctx.fillText(item.name, legX + legPad + dotR * 2 + Math.round(8 * sf), itemY + Math.round(8 * sf));

        // Contagem de feições
        ctx.fillStyle = "#7a6f74";
        ctx.font = `400 ${Math.round(8 * sf)}px 'Exo', sans-serif`;
        ctx.fillText(
          `${item.featureCount.toLocaleString("pt-BR")} feições · ${item.geomLabel}`,
          legX + legPad + dotR * 2 + Math.round(8 * sf),
          itemY + Math.round(18 * sf)
        );

        itemY += Math.round(28 * sf);
      }
    });

    if (legendItems.length === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = `italic ${Math.round(10 * sf)}px 'Exo', sans-serif`;
      ctx.fillText("Nenhuma camada ativa", legX + legPad, itemY + Math.round(4 * sf));
    }
  }

  // ── Barra de Escala ────────────────────────────────────────────────
  if (s.showScale) {
    const scaleInfo = calculateMapScale();
    const scaleBarW = Math.round(scaleInfo.barPx * sf * 0.3); // proporcionado ao canvas
    const scaleBarClamp = Math.max(Math.round(60 * sf), Math.min(Math.round(200 * sf), scaleBarW));
    const scaleBarH = Math.round(5 * sf);
    const sbx = mapX + Math.round(16 * sf);
    const sby = mapY + mapH - Math.round(20 * sf);

    // Fundo semi-transparente
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    roundRect(ctx, sbx - Math.round(6 * sf), sby - Math.round(14 * sf),
              scaleBarClamp + Math.round(12 * sf), Math.round(28 * sf), Math.round(4 * sf));
    ctx.fill();

    // Barra
    ctx.fillStyle = "#1c191a";
    ctx.fillRect(sbx, sby, scaleBarClamp, scaleBarH);

    // Caps
    ctx.fillRect(sbx, sby - Math.round(4 * sf), Math.round(1.5 * sf), scaleBarH + Math.round(4 * sf));
    ctx.fillRect(sbx + scaleBarClamp - Math.round(1.5 * sf), sby - Math.round(4 * sf), Math.round(1.5 * sf), scaleBarH + Math.round(4 * sf));

    // Label
    ctx.fillStyle = "#1c191a";
    ctx.font = `600 ${Math.round(9 * sf)}px 'Exo', sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(scaleInfo.label, sbx, sby - Math.round(5 * sf));
    ctx.textAlign = "left";
  }

  // ── Seta Norte ─────────────────────────────────────────────────────
  if (s.showNorth) {
    const nx = mapX + mapW - Math.round(32 * sf);
    const ny = mapY + Math.round(20 * sf);
    const nSize = Math.round(20 * sf);

    // Fundo circular semi-transparente
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.arc(nx, ny + nSize / 2, nSize * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = Math.max(1, Math.round(0.8 * sf));
    ctx.beginPath();
    ctx.arc(nx, ny + nSize / 2, nSize * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    // Seta
    ctx.fillStyle = "#f25188";
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx + nSize * 0.3, ny + nSize);
    ctx.lineTo(nx, ny + nSize * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1c191a";
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx - nSize * 0.3, ny + nSize);
    ctx.lineTo(nx, ny + nSize * 0.7);
    ctx.closePath();
    ctx.fill();

    // "N"
    ctx.fillStyle = "#1c191a";
    ctx.font = `700 ${Math.round(8 * sf)}px 'Exo', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("N", nx, ny - Math.round(4 * sf));
    ctx.textAlign = "left";
  }

  // ── Rodapé: Créditos ───────────────────────────────────────────────
  if (s.showCredits && s.credits) {
    const fy = ch - margin - Math.round(4 * sf);
    ctx.fillStyle = "#7a6f74";
    ctx.font = `400 ${Math.round(9 * sf)}px 'Exo', sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(s.credits, margin, fy);

    // Data de geração
    ctx.textAlign = "right";
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " · " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    ctx.fillText(dateStr, cw - margin, fy);
    ctx.textAlign = "left";
  }
}

// ── Exporta como PNG de alta resolução ──────────────────────────────
async function exportComposerPNG() {
  syncComposerState();

  const dims = PAPER_SIZES[composerState.paperSize]?.[composerState.orientation]
    || PAPER_SIZES.a4.landscape;

  // Preserva o drawing buffer para captura
  if (map) {
    try {
      map.getCanvas().getContext("webgl", { preserveDrawingBuffer: true });
    } catch (_) {}
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width  = dims.w;
  exportCanvas.height = dims.h;
  const ctx = exportCanvas.getContext("2d");

  showToast("Gerando mapa em alta resolução…", 3000);

  await drawComposition(ctx, dims.w, dims.h, 1);

  // Trigger download
  const link = document.createElement("a");
  link.download = sanitizeFilename(composerState.title || "mapa") + ".png";
  link.href = exportCanvas.toDataURL("image/png");
  link.click();

  showToast("Mapa exportado com sucesso!", 3000);
}

// ── Helpers ─────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function sanitizeFilename(str) {
  return str
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80) || "mapa";
}

// ── Inicializa o Compositor (event listeners) ───────────────────────
function initComposer() {
  // Botão de abrir
  document.getElementById("btn-open-composer")?.addEventListener("click", openComposer);

  // Botão de fechar
  document.getElementById("comp-btn-close")?.addEventListener("click", closeComposer);

  // Fechar ao clicar no backdrop
  document.getElementById("composer-modal")?.addEventListener("click", e => {
    if (e.target.id === "composer-modal") closeComposer();
  });

  // Atualiza preview quando campos mudam
  const liveFields = [
    "comp-title", "comp-subtitle", "comp-credits",
    "comp-chk-legend", "comp-chk-scale", "comp-chk-north", "comp-chk-credits"
  ];
  liveFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(evt, () => {
      clearTimeout(el._previewTimer);
      el._previewTimer = setTimeout(renderComposerPreview, 250);
    });
  });

  // Orientação
  document.querySelectorAll(".comp-orient-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      composerState.orientation = btn.dataset.orient;
      document.querySelectorAll(".comp-orient-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderComposerPreview();
    });
  });

  // Tamanho do papel
  document.getElementById("comp-paper-size")?.addEventListener("change", e => {
    composerState.paperSize = e.target.value;
    renderComposerPreview();
  });

  // Exportar PNG
  document.getElementById("comp-btn-export")?.addEventListener("click", exportComposerPNG);
}
