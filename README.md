# Projeto Mapear 🗺️ *(Versão de Testes / Protótipo)*

Plataforma web de geoprocessamento e visualização cartográfica interativa para análise e manipulação de dados urbanos e geoespaciais em 2D e 3D diretamente no navegador.

> ⚠️ **Aviso:** Esta é uma **versão de testes/protótipo** em desenvolvimento ativo.

---

## 🚀 Funcionalidades Principais

- **Visualização Cartográfica 2D / 3D:**
  - Navegação suave com controle de pitch, bearing e zoom via **Mapbox GL JS**.
  - Camadas base dinâmicas: volumetria 3D de edificações, áreas verdes (OSM) e corpos d'água.
- **Importação de Dados Geoespaciais:**
  - Suporte a Shapefile (`.zip` ou `.shp` + `.dbf`), GeoPackage (`.gpkg`) e GeoJSON (`.geojson`).
  - Suporte automático a geometrias de ponto, linha e polígono.
- **Gerenciamento e Estilização de Camadas:**
  - Reordenação da sobreposição de camadas via **drag-and-drop**.
  - Controle de visibilidade individual e controle deslizante de opacidade.
  - Simbologia com cores sólidas ou mapas temáticos **coropléticos** (gradientes baseados em colunas numéricas dos atributos com paletas personalizadas).
- **Filtros Urbanos Dinâmicos:**
  - Filtragem por atributos tabulares de qualquer camada carregada.
  - Suporte a filtros numéricos (intervalo mín/máx) e categóricos/texto (seleção de valores únicos).
- **Pesquisa e Geocodificação:**
  - Localização rápida de bairros, ruas e cidades com Mapbox Geocoding.
- **Compositor de Mapa Temático (Print Layout):**
  - Montagem de prancha cartográfica com título, subtítulo, legenda automática das camadas, barra de escala métrica, seta norte e créditos.
  - Exportação direta do mapa em imagem PNG de alta resolução.

---

## 📁 Estrutura do Projeto

```text
mini-ospa-place/
├── index.html            # Estrutura principal da aplicação
├── css/
│   └── style.css         # Design system (paleta oficial Mapear, tipografia Exo)
├── js/
│   ├── config.js         # Tokens, coordenadas padrão e paletas de cores
│   ├── map.js            # Inicialização e controle do Mapbox GL JS
│   ├── data-processor.js # Leitura e parsing de .shp, .zip, .gpkg e .geojson
│   ├── shapes.js         # Renderização, simbologia e ordenação de camadas
│   ├── choropleth.js     # Interpolação e expressões de gradientes
│   ├── filters.js        # Motor de filtros tabulares urbanos
│   ├── composer.js       # Compositor e exportador de mapa para impressão
│   ├── ui.js             # Gestão de abas laterais, busca e eventos de UI
│   └── main.js           # Ponto de entrada do sistema
└── README.md
```

---

## 💻 Como Executar Localmente

Como a aplicação processa arquivos geoespaciais e recursos via fetch, execute através de um servidor estático local (para evitar restrições de CORS ao abrir via `file://`):

### Opção 1 — Com Python (já nativo na maioria dos sistemas):
```bash
python -m http.server 8080
```
Em seguida, abra: [http://localhost:8080](http://localhost:8080)

### Opção 2 — Com Node.js:
```bash
npx serve .
```

---

## 🔑 Configuração do Mapbox Token

O token público de acesso está centralizado em `js/config.js`:

```javascript
const MAPBOX_TOKEN = "pk.eyJ1Ijoic2F1bG9maHkiLCJhIjoiY213MmFwcWlqMDE4NjM1cHhrdXk0enk4dSJ9.d0h3fbdYBaUdqbUjUCDvag";
```

Para produção ou GitHub Pages, lembre-se de configurar a restrição de domínio (*URL Restrictions*) no painel do [Mapbox](https://account.mapbox.com/access-tokens/) para o domínio correspondente.
