// Verifica que el build compilado apunte al backend del entorno correcto.
//
//   node scripts/verificar-build.mjs test   → exige slas052a:6050 y que NO haya slas052a:5050
//   node scripts/verificar-build.mjs prod   → exige slas052a:5050 y que NO haya slas052a:6050
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
//
// Solo se juzgan los puertos que van pegados a `slas052a`. El `localhost:5050`
// de src/config/env.ts es el valor por omisión de getEnvVar: está en el bundle
// SIEMPRE, también en un build de pruebas correcto, y tomarlo por una señal
// hacía que un paquete bueno se reportara como cruzado. Si el build de verdad
// cayó al fallback, lo que se nota es la AUSENCIA de slas052a:<puerto>, no la
// presencia de localhost.
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

const enServidor = new Set(); // puertos vistos como slas052a:NNNN
const enLocalhost = new Set(); // puertos vistos como localhost:NNNN (informativo)
let marcaPruebas = false; // VITE_APP_NAME de .env.test

for (const f of archivos) {
  const ruta = join(dir, f);
  if (!statSync(ruta).isFile()) continue;
  const txt = readFileSync(ruta, "utf8");
  for (const m of txt.matchAll(/slas052a:(\d{4})/g)) enServidor.add(m[1]);
  for (const m of txt.matchAll(/localhost:(\d{4})/g)) enLocalhost.add(m[1]);
  if (txt.includes("Continental (PRUEBAS)")) marcaPruebas = true;
}

const listar = (s) => [...s].sort().join(", ") || "(ninguno)";
const problemas = [];

if (!enServidor.has(esperado)) {
  problemas.push(
    `no aparece slas052a:${esperado} en ningún bundle` +
      (enServidor.size === 0
        ? ` (no hay ninguna URL de slas052a: el build tomó el fallback localhost, señal de que faltó .env.${
            modo === "test" ? "test" : "production"
          } o el --mode)`
        : "")
  );
}
if (enServidor.has(prohibido)) {
  problemas.push(`aparece slas052a:${prohibido}, que es el backend del otro ambiente`);
}

// Segunda señal, independiente del puerto: .env.test pone
// VITE_APP_NAME="Continental (PRUEBAS)" y .env.production no.
if (modo === "test" && !marcaPruebas) {
  problemas.push('falta el nombre "Continental (PRUEBAS)": el build no tomó .env.test');
}
if (modo === "prod" && marcaPruebas) {
  problemas.push('el bundle trae "Continental (PRUEBAS)": se compiló con .env.test');
}

if (problemas.length > 0) {
  console.error(`✖ Build ${modo.toUpperCase()} INVÁLIDO en ${dir}:`);
  for (const p of problemas) console.error(`  - ${p}`);
  console.error(`  Puertos slas052a hallados: ${listar(enServidor)}`);
  console.error(
    modo === "test"
      ? "  Compila con `npm run build:test` (usa .env.test) y verifica que .env.test exista en esta copia del repo."
      : "  Compila con `npm run build` (usa .env.production) y verifica que .env.production exista en esta copia del repo."
  );
  process.exit(1);
}

console.log(`✔ Build ${modo.toUpperCase()} correcto en ${dir}: API en slas052a:${esperado}.`);
if (enLocalhost.size > 0) {
  console.log(`  (localhost:${listar(enLocalhost)} es el valor por omisión de src/config/env.ts; no se usa.)`);
}
