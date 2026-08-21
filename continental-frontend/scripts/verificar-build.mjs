// Verifica que el build compilado apunte al backend del entorno correcto.
//
//   node scripts/verificar-build.mjs test   → exige 6050 (pruebas) y que NO haya 5050
//   node scripts/verificar-build.mjs prod   → exige 5050 (producción) y que NO haya 6050
//
// Con un segundo argumento revisa OTRA carpeta en vez de .\build — sirve para
// comprobar lo que ya está desplegado o lo que estás por enviar al servidor:
//   node scripts/verificar-build.mjs test C:\envios\front-test
//   node scripts/verificar-build.mjs prod \\slas052a\c$\inetpub\vacaciones-frontend
//
// Existe porque un build hecho sin el --mode correcto (o en una copia del repo
// sin los .env.*) toma el fallback http://localhost:5050 de src/config/env.ts,
// y el "sitio de pruebas" termina pegándole a la base de PRODUCCIÓN sin que
// nada lo avise. Con esto, `npm run build:test` aborta en vez de dejar un
// bundle cruzado.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const modo = (process.argv[2] || "").toLowerCase();
if (modo !== "test" && modo !== "prod") {
  console.error("Uso: node scripts/verificar-build.mjs <test|prod>");
  process.exit(2);
}

const esperado = modo === "test" ? "6050" : "5050";
const prohibido = modo === "test" ? "5050" : "6050";

// Acepta tanto la carpeta del sitio (que contiene assets\) como la carpeta
// assets\ directamente, para no tener que recordar cuál se pasa.
const base = process.argv[3] ? resolve(process.argv[3]) : resolve("build");
const dir = existsSync(join(base, "assets")) ? join(base, "assets") : base;

let archivos;
try {
  archivos = readdirSync(dir).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`✖ No existe ${dir}. ¿Corrió vite build, o la ruta es la correcta?`);
  process.exit(1);
}
if (archivos.length === 0) {
  console.error(`✖ ${dir} no tiene archivos .js. ¿Es la carpeta del sitio compilado?`);
  process.exit(1);
}

const hallados = new Set();
for (const f of archivos) {
  const ruta = join(dir, f);
  if (!statSync(ruta).isFile()) continue;
  const txt = readFileSync(ruta, "utf8");
  for (const m of txt.matchAll(/(?:slas052a|localhost):(\d{4})/g)) hallados.add(m[1]);
}

const lista = [...hallados].sort().join(", ") || "(ninguno)";
if (!hallados.has(esperado) || hallados.has(prohibido)) {
  console.error(`✖ Build ${modo.toUpperCase()} INVÁLIDO en ${dir}: puertos de API en el bundle = ${lista}`);
  console.error(`  Se esperaba ${esperado} y NO ${prohibido}.`);
  console.error(
    modo === "test"
      ? "  Compila con `npm run build:test` (usa .env.test) y verifica que .env.test exista en esta copia del repo."
      : "  Compila con `npm run build` (usa .env.production) y verifica que .env.production exista en esta copia del repo."
  );
  process.exit(1);
}
console.log(`✔ Build ${modo.toUpperCase()} correcto en ${dir}: API en puerto ${esperado} (puertos hallados: ${lista}).`);
