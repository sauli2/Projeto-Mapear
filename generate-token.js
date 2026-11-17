#!/usr/bin/env node
/**
 * generate-token.js
 * Gera a versão ofuscada do token Mapbox via XOR cipher.
 *
 * Uso:
 *   node generate-token.js <seu-token-mapbox>
 *
 * O resultado é um bloco JS pronto para colar em index.html.
 * ⚠️  Isso é OFUSCAÇÃO, não criptografia real.
 *     A solução definitiva é um servidor proxy que injete o token.
 */

const token = process.argv[2];
if (!token || !token.startsWith("pk.")) {
  console.error("❌  Uso: node generate-token.js <seu-token-mapbox>");
  console.error("    Exemplo: node generate-token.js pk.eyJ1Ijoie...");
  process.exit(1);
}

// Chave de ofuscação (mude se quiser)
const KEY = "M!n10SPA_26@ce";
const keyBytes = [...KEY].map(c => c.charCodeAt(0));

// XOR de cada caractere do token com a chave ciclicamente
const data = [...token].map((c, i) => c.charCodeAt(0) ^ keyBytes[i % keyBytes.length]);

console.log("\n// ─── Cole o bloco abaixo em index.html ───────────────────────────");
console.log(`const _k=[${keyBytes.join(",")}];`);
console.log(`const _d=[${data.join(",")}];`);
console.log(`const _t=_d.map((c,i)=>String.fromCharCode(c^_k[i%_k.length])).join("");`);
console.log("// ──────────────────────────────────────────────────────────────────\n");

// Verificação automática
const reconstructed = data.map((c, i) => String.fromCharCode(c ^ keyBytes[i % keyBytes.length])).join("");
if (reconstructed === token) {
  console.log("✅  Verificação OK — token reconstituído corretamente.");
} else {
  console.error("❌  Erro na verificação! Token não bate.");
  process.exit(1);
}
