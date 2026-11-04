# Mini OSPA Place 🏙️

Explorador urbano 3D com Mapbox GL JS. Visualiza prédios em 3D, áreas verdes e corpos d'água de Fortaleza (CE) com dados OpenStreetMap.

## Arquivos

```
mini-ospa-place/
├── index.html          ← Aplicação principal
├── generate-token.js   ← Script de ofuscação do token
└── README.md
```

## Rodando localmente

```bash
# Opção 1 — sem instalação
python -m http.server 8080
# acesse http://localhost:8080

# Opção 2 — com Node
npx serve .
```

> Abrir `index.html` diretamente pelo explorador de arquivos pode bloquear
> algumas features por restrições de CORS. Prefira um servidor local.

---

## Atualizando o token Mapbox

O token está ofuscado via XOR cipher. Para trocar:

```bash
node generate-token.js "pk.eyJ1IjoiSEVVVE9LRU4i..."
```

Copie o bloco gerado e substitua as linhas `_k`, `_d` e `_t` em `index.html`.

### ⚠️ Aviso de segurança

A ofuscação **não é criptografia real**. Um usuário determinado ainda pode
extrair o token inspecionando o código. Para produção:

- Restrinja o token **por domínio** no [painel Mapbox](https://account.mapbox.com/access-tokens/)
- Use um **servidor proxy** que injete o token server-side
- Ou use variáveis de ambiente + build step (Vite, Webpack, etc.)

---

## Camadas

| Camada          | Fonte OSM         | Descrição                        |
|----------------|-------------------|----------------------------------|
| Prédios 3D     | `building`        | Extrusão com altura real ou 10 m |
| Áreas verdes   | `landuse`         | Parques, jardins, reservas       |
| Cobertura vegetal | `landcover`    | Gramado, árvores, arbustos       |
| Água           | `water`           | Rios, lagos, lagoas              |
