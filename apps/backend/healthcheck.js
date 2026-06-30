// ═══════════════════════════════════════════════════════════════
//  HEALTHCHECK.JS
//  Script independiente usado por Docker para verificar
//  que el backend está respondiendo correctamente.
//
//  Se ejecuta con: node healthcheck.js
//  Sale con código 0 si el backend responde 200, 1 en caso contrario.
//  Se usa un archivo separado (en vez de un script inline en el
//  docker-compose.yml) porque el formato CMD exec-array de Docker
//  no parsea bien comillas anidadas dentro de un solo argumento.
// ═══════════════════════════════════════════════════════════════

const http = require("http");

const opciones = {
  host: "localhost",
  port: process.env.PORT || 4000,
  path: "/health",
  timeout: 4000
};

const peticion = http.get(opciones, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

peticion.on("error", () => {
  process.exit(1);
});

peticion.on("timeout", () => {
  peticion.destroy();
  process.exit(1);
});
