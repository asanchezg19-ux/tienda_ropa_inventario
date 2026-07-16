// ═══════════════════════════════════════════════════════════════
//  HEALTHCHECK.JS
//  Script independiente usado por Docker para verificar
//  que el frontend está respondiendo correctamente.
//
//  Se ejecuta con: node healthcheck.js
//  Sale con código 0 si el frontend responde 200, 1 en caso contrario.
// ═══════════════════════════════════════════════════════════════

const http = require("http");

const opciones = {
  host: "127.0.0.1",
  port: process.env.PORT || 3000,
  path: "/",
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
