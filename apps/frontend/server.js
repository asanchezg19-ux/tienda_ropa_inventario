"use strict";

const express = require("express");
require("dotenv").config();

const app         = express();
const PORT        = process.env.PORT        || 3000;
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:4000";

// Límite ampliado para poder reenviar imágenes de producto en base64
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => data += chunk);
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function reenviarAPI(req, res, rutaBackend) {
  try {
    const body = ["GET", "HEAD"].includes(req.method)
      ? undefined
      : (req.body !== undefined ? JSON.stringify(req.body) : await leerCuerpo(req));

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value && !["host", "connection", "content-length"].includes(key)) {
        headers[key] = Array.isArray(value) ? value.join(",") : value;
      }
    }

    if (!headers["content-type"] && body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${BACKEND_URL}${rutaBackend}`, {
      method: req.method,
      headers,
      body: body !== undefined ? body : undefined
    });

    const payload = await response.text();
    res.status(response.status);
    res.setHeader("content-type", response.headers.get("content-type") || "application/json");
    res.send(payload);
  } catch (err) {
    console.error("Error de proxy hacia backend:", err.message);
    res.status(502).json({ error: "No se puede conectar con el servidor" });
  }
}

app.post("/api/auth/login", (req, res) => reenviarAPI(req, res, "/api/auth/login"));
app.get("/api/inventario", (req, res) => reenviarAPI(req, res, "/api/inventario"));
app.get("/api/inventario/:id", (req, res) => reenviarAPI(req, res, `/api/inventario/${req.params.id}`));
app.post("/api/inventario", (req, res) => reenviarAPI(req, res, "/api/inventario"));
app.post("/api/inventario/imagenes", (req, res) => reenviarAPI(req, res, "/api/inventario/imagenes"));
app.put("/api/inventario/:id", (req, res) => reenviarAPI(req, res, `/api/inventario/${req.params.id}`));
app.delete("/api/inventario/:id", (req, res) => reenviarAPI(req, res, `/api/inventario/${req.params.id}`));
app.post("/api/ventas", (req, res) => reenviarAPI(req, res, "/api/ventas"));
app.get("/api/ventas", (req, res) => reenviarAPI(req, res, "/api/ventas"));
app.get("/api/ventas/mis-ventas", (req, res) => reenviarAPI(req, res, "/api/ventas/mis-ventas"));
app.get("/api/reportes/resumen", (req, res) => reenviarAPI(req, res, "/api/reportes/resumen"));
app.get("/api/health", (req, res) => reenviarAPI(req, res, "/api/health"));

// ─────────────────────────────────────────────
//  HTML PRINCIPAL — toda la UI en un template
// ─────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tienda de Ropa — Sistema de Inventario</title>
  <style>
    /* ── Reset y variables ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primario:   #2c3e50;
      --acento:     #e74c3c;
      --exito:      #27ae60;
      --advertencia:#f39c12;
      --fondo:      #f5f6fa;
      --blanco:     #ffffff;
      --texto:      #2d3436;
      --borde:      #dfe6e9;
      --sombra:     0 2px 8px rgba(0,0,0,0.1);
    }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: var(--fondo);
      color: var(--texto);
      min-height: 100vh;
    }

    /* ── Barra de estado de conexión — RNF-06 ── */
    #banner-conexion {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0;
      background: var(--advertencia);
      color: white;
      text-align: center;
      padding: 10px;
      font-weight: bold;
      z-index: 9999;
    }
    #banner-conexion.visible { display: block; }

    /* ── Login ── */
    #pantalla-login {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, var(--primario) 0%, #34495e 100%);
    }
    .login-card {
      background: var(--blanco);
      border-radius: 12px;
      padding: 40px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }
    .login-card h1 {
      color: var(--primario);
      font-size: 1.5rem;
      margin-bottom: 6px;
    }
    .login-card p {
      color: #636e72;
      font-size: 0.9rem;
      margin-bottom: 28px;
    }

    /* ── Formularios ── */
    .campo { margin-bottom: 16px; }
    .campo label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--primario);
      margin-bottom: 6px;
    }
    .campo input, .campo select {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--borde);
      border-radius: 8px;
      font-size: 0.95rem;
      transition: border-color 0.2s;
    }
    .campo input:focus, .campo select:focus {
      outline: none;
      border-color: var(--primario);
    }

    /* ── Botones ── */
    .btn {
      display: inline-block;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primario  { background: var(--primario); color: white; }
    .btn-exito     { background: var(--exito); color: white; }
    .btn-peligro   { background: var(--acento); color: white; }
    .btn-advertencia { background: var(--advertencia); color: white; }
    .btn-bloque    { width: 100%; }
    .btn:hover:not(:disabled) { opacity: 0.88; }

    /* ── Mensajes ── */
    .mensaje {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.88rem;
      margin-top: 12px;
      display: none;
    }
    .mensaje.visible { display: block; }
    .mensaje.error   { background: #ffeaea; color: var(--acento); border: 1px solid #fab0b0; }
    .mensaje.exito   { background: #eafaf1; color: var(--exito); border: 1px solid #a9dfbf; }
    .mensaje.info    { background: #eaf4fb; color: #2980b9; border: 1px solid #aed6f1; }

    /* ── Layout principal ── */
    #pantalla-app { display: none; }
    .topbar {
      background: var(--primario);
      color: white;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: var(--sombra);
    }
    .topbar h2 { font-size: 1.1rem; }
    .topbar-info { font-size: 0.85rem; opacity: 0.85; }
    .nav {
      background: var(--blanco);
      border-bottom: 1px solid var(--borde);
      display: flex;
      gap: 4px;
      padding: 0 24px;
      overflow-x: auto;
    }
    .nav-btn {
      padding: 14px 18px;
      border: none;
      background: none;
      font-size: 0.9rem;
      font-weight: 600;
      color: #636e72;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .nav-btn.activo {
      color: var(--primario);
      border-bottom-color: var(--primario);
    }
    .contenido { padding: 24px; max-width: 1100px; margin: 0 auto; }

    /* ── Secciones ── */
    .seccion { display: none; }
    .seccion.activa { display: block; }
    .seccion h3 {
      font-size: 1.2rem;
      color: var(--primario);
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--borde);
    }

    /* ── Cards de resumen (dueño) ── */
    .resumen-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .resumen-card {
      background: var(--blanco);
      border-radius: 10px;
      padding: 20px;
      box-shadow: var(--sombra);
      text-align: center;
    }
    .resumen-card .numero {
      font-size: 2rem;
      font-weight: 700;
      color: var(--primario);
    }
    .resumen-card .etiqueta {
      font-size: 0.82rem;
      color: #636e72;
      margin-top: 4px;
    }
    .resumen-card.alerta .numero { color: var(--acento); }

    /* ── Grilla de catálogo ── */
    .catalogo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .producto-card {
      background: var(--blanco);
      border-radius: 10px;
      box-shadow: var(--sombra);
      overflow: hidden;
      transition: transform 0.2s;
      position: relative;
    }
    .producto-card:hover { transform: translateY(-2px); }
    .producto-card .img-placeholder {
      width: 100%;
      height: 140px;
      background: linear-gradient(135deg, #dfe6e9, #b2bec3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
    }
    .producto-card .info { padding: 14px; }
    .producto-card .nombre { font-weight: 700; font-size: 0.95rem; }
    .producto-card .detalle {
      font-size: 0.82rem;
      color: #636e72;
      margin: 4px 0;
    }
    .producto-card .precio {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--primario);
      margin-top: 6px;
    }
    .badge-stock {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 4px;
    }
    .badge-stock.ok       { background: #d5f5e3; color: var(--exito); }
    .badge-stock.critico  { background: #fdebd0; color: var(--advertencia); }
    .badge-stock.agotado  { background: #fdecea; color: var(--acento); }
    .btn-vender {
      width: 100%;
      margin-top: 10px;
      padding: 8px;
      border-radius: 6px;
    }
    .acciones-dueno {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .acciones-dueno .btn { flex: 1; padding: 6px 8px; font-size: 0.8rem; }

    /* ── Tabla de ventas ── */
    .tabla-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--blanco);
      border-radius: 10px;
      box-shadow: var(--sombra);
      overflow: hidden;
    }
    th {
      background: var(--primario);
      color: white;
      padding: 12px 16px;
      text-align: left;
      font-size: 0.85rem;
    }
    td {
      padding: 11px 16px;
      border-bottom: 1px solid var(--borde);
      font-size: 0.88rem;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8f9fa; }

    /* ── Modal ── */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.visible { display: flex; }
    .modal {
      background: var(--blanco);
      border-radius: 12px;
      padding: 28px;
      width: 100%;
      max-width: 460px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 16px 48px rgba(0,0,0,0.2);
    }
    .modal h4 {
      color: var(--primario);
      font-size: 1.1rem;
      margin-bottom: 20px;
    }
    .modal-footer {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-end;
    }

    /* ── Alertas stock crítico ── */
    .alertas-lista { display: flex; flex-direction: column; gap: 10px; }
    .alerta-item {
      background: #fef9e7;
      border-left: 4px solid var(--advertencia);
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .alerta-item strong { color: var(--advertencia); }

    .spinner {
      display: inline-block;
      width: 18px; height: 18px;
      border: 2px solid #ddd;
      border-top-color: var(--primario);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 600px) {
      .topbar { padding: 12px 16px; }
      .contenido { padding: 16px; }
      .catalogo-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>

<!-- ── Banner de desconexión — RNF-06 ────────────────────────── -->
<div id="banner-conexion">
  ⚠️ Sin conexión al servidor. Reintentando automáticamente...
</div>

<!-- ══════════════════════════════════════════════════════════ -->
<!--  PANTALLA DE LOGIN                                        -->
<!-- ══════════════════════════════════════════════════════════ -->
<div id="pantalla-login">
  <div class="login-card">
    <h1>🛍️ Tienda de Ropa</h1>
    <p>Sistema de Gestión de Inventario</p>
    <div class="campo">
      <label for="inp-usuario">Usuario</label>
      <input type="text" id="inp-usuario" placeholder="dueno o vendedor1" autocomplete="username" />
    </div>
    <div class="campo">
      <label for="inp-password">Contraseña</label>
      <input type="password" id="inp-password" placeholder="••••••••" autocomplete="current-password" />
    </div>
    <button class="btn btn-primario btn-bloque" id="btn-login" onclick="hacerLogin()">
      Ingresar
    </button>
    <div class="mensaje" id="msg-login"></div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════ -->
<!--  PANTALLA PRINCIPAL                                       -->
<!-- ══════════════════════════════════════════════════════════ -->
<div id="pantalla-app">
  <div class="topbar">
    <div>
      <h2>🛍️ Tienda de Ropa — Inventario</h2>
      <div class="topbar-info" id="info-usuario"></div>
    </div>
    <button class="btn btn-peligro" onclick="cerrarSesion()">Cerrar sesión</button>
  </div>

  <nav class="nav" id="nav-principal"></nav>

  <div class="contenido">

    <!-- ── CATÁLOGO (ambos roles) ─────────────────────────── -->
    <div class="seccion" id="sec-catalogo">
      <h3>📦 Catálogo de Prendas</h3>
      <div id="catalogo-grid" class="catalogo-grid"></div>
    </div>

    <!-- ── REGISTRAR VENTA (ambos roles) ─────────────────── -->
    <div class="seccion" id="sec-venta">
      <h3>🧾 Registrar Venta</h3>
      <p style="margin-bottom:16px; color:#636e72; font-size:0.9rem;">
        Selecciona los productos del catálogo y haz clic en "Agregar a venta".
      </p>
      <div id="items-venta" style="margin-bottom:16px;"></div>
      <div id="resumen-venta" style="display:none; background:white; padding:16px; border-radius:10px; box-shadow:var(--sombra); margin-bottom:16px;">
        <strong>Total: S/. <span id="total-venta">0.00</span></strong>
      </div>
      <button class="btn btn-exito" id="btn-confirmar-venta"
              onclick="confirmarVenta()" style="display:none;">
        ✓ Confirmar Venta
      </button>
      <div class="mensaje" id="msg-venta"></div>
      <hr style="margin:24px 0; border:none; border-top:1px solid var(--borde);">
      <h3 style="margin-bottom:16px;">📋 Mis Ventas de Hoy</h3>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Productos</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="tabla-mis-ventas"></tbody>
        </table>
      </div>
    </div>

    <!-- ── PANEL DUEÑO: Resumen financiero ───────────────── -->
    <div class="seccion" id="sec-resumen">
      <h3>📊 Resumen Financiero del Día</h3>
      <div class="resumen-grid" id="resumen-cards"></div>
      <h3 style="margin-bottom:16px;">⚠️ Alertas de Stock Crítico</h3>
      <div class="alertas-lista" id="alertas-stock"></div>
    </div>

    <!-- ── PANEL DUEÑO: Historial de ventas ──────────────── -->
    <div class="seccion" id="sec-historial">
      <h3>📋 Historial de Ventas (últimos 90 días)</h3>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Vendedor</th>
              <th>Productos</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="tabla-historial"></tbody>
        </table>
      </div>
    </div>

    <!-- ── PANEL DUEÑO: Gestión de inventario ────────────── -->
    <div class="seccion" id="sec-inventario">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="margin:0; border:none; padding:0;">🏷️ Gestión de Inventario</h3>
        <button class="btn btn-exito" onclick="abrirModalProducto()">+ Agregar Producto</button>
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Talla</th>
              <th>Color</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="tabla-inventario"></tbody>
        </table>
      </div>
    </div>

  </div><!-- /contenido -->
</div><!-- /pantalla-app -->

<!-- ══════════════════════════════════════════════════════════ -->
<!--  MODAL: Agregar / Editar Producto                         -->
<!-- ══════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="modal-producto">
  <div class="modal">
    <h4 id="modal-titulo">Agregar Producto</h4>
    <input type="hidden" id="mp-id" />
    <input type="hidden" id="mp-imagen-url" />
    <div class="campo">
      <label>Imagen del producto</label>
      <input type="file" id="mp-imagen-input" accept="image/*" onchange="previsualizarImagen(event)" />
      <div id="mp-imagen-preview-wrap" style="margin-top:10px; display:none;">
        <img id="mp-imagen-preview" alt="Vista previa" style="max-width:100%; max-height:160px; border-radius:8px; display:block; object-fit:contain;" />
      </div>
    </div>
    <div class="campo">
      <label>Nombre *</label>
      <input type="text" id="mp-nombre" placeholder="Ej: Polo Básica" />
    </div>
    <div class="campo">
      <label>Categoría *</label>
      <select id="mp-categoria">
        <option value="">Seleccionar...</option>
        <option>Tops</option>
        <option>Pantalones</option>
        <option>Faldas</option>
        <option>Vestidos</option>
        <option>Abrigos</option>
        <option>Accesorios</option>
      </select>
    </div>
    <!-- Modo EDICIÓN: el producto ya es una talla/color puntual -->
    <div id="mp-bloque-simple">
      <div class="campo">
        <label>Talla *</label>
        <select id="mp-talla">
          <option value="">Seleccionar...</option>
          <option>XS</option><option>S</option><option>M</option>
          <option>L</option><option>XL</option><option>XXL</option>
          <option>28</option><option>30</option><option>32</option>
          <option>34</option><option>36</option><option>38</option>
          <option>Única</option>
        </select>
      </div>
      <div class="campo">
        <label>Color</label>
        <input type="text" id="mp-color" placeholder="Ej: Azul marino" />
      </div>
      <div class="campo">
        <label>Stock *</label>
        <input type="number" id="mp-stock" min="0" placeholder="0" />
      </div>
    </div>

    <!-- Modo AGREGAR: se puede crear una talla/color a la vez, o varias combinaciones de una sola vez -->
    <div id="mp-bloque-variantes">
      <div class="campo">
        <label>Tallas disponibles *</label>
        <div id="mp-tallas-check" style="display:flex; flex-wrap:wrap; gap:10px;">
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="XS" onchange="renderCombinaciones()"> XS</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="S" onchange="renderCombinaciones()"> S</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="M" onchange="renderCombinaciones()"> M</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="L" onchange="renderCombinaciones()"> L</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="XL" onchange="renderCombinaciones()"> XL</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="XXL" onchange="renderCombinaciones()"> XXL</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="28" onchange="renderCombinaciones()"> 28</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="30" onchange="renderCombinaciones()"> 30</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="32" onchange="renderCombinaciones()"> 32</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="34" onchange="renderCombinaciones()"> 34</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="36" onchange="renderCombinaciones()"> 36</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="38" onchange="renderCombinaciones()"> 38</label>
          <label style="display:flex; align-items:center; gap:4px; font-weight:400;"><input type="checkbox" value="Única" onchange="renderCombinaciones()"> Única</label>
        </div>
      </div>
      <div class="campo">
        <label>Colores (opcional — agrega uno o varios)</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="mp-color-nuevo" placeholder="Ej: Azul marino" />
          <button type="button" class="btn btn-primario" onclick="agregarColor()">+ Agregar</button>
        </div>
        <div id="mp-colores-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;"></div>
      </div>
      <div class="campo">
        <label>Stock por combinación *</label>
        <div id="mp-combinaciones-tabla" style="font-size:0.88rem; color:#636e72;">
          Selecciona al menos una talla para definir el stock.
        </div>
      </div>
    </div>

    <div class="campo">
      <label>Precio (S/.) *</label>
      <input type="number" id="mp-precio" min="0" step="0.1" placeholder="0.00" />
    </div>
    <div class="mensaje" id="msg-modal"></div>
    <div class="modal-footer">
      <button class="btn btn-primario" onclick="cerrarModal('modal-producto')" style="background:#636e72;">
        Cancelar
      </button>
      <button class="btn btn-exito" onclick="guardarProducto()">Guardar</button>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════ -->
<!--  MODAL: Agregar a venta                                   -->
<!-- ══════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="modal-venta-item">
  <div class="modal">
    <h4>Agregar a la venta</h4>
    <p id="mv-nombre" style="font-weight:600; margin-bottom:12px; color:var(--primario);"></p>
    <p id="mv-stock-info" style="font-size:0.88rem; color:#636e72; margin-bottom:16px;"></p>
    <div class="campo">
      <label>Cantidad</label>
      <input type="number" id="mv-cantidad" min="1" value="1" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="cerrarModal('modal-venta-item')" style="background:#636e72; color:white;">
        Cancelar
      </button>
      <button class="btn btn-exito" onclick="agregarItemVenta()">Agregar</button>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════ -->
<!--  JAVASCRIPT                                               -->
<!-- ══════════════════════════════════════════════════════════ -->
<script>
// ── Estado global ────────────────────────────────────────────
let TOKEN       = null;
let USUARIO     = null;
let carrito     = [];      // Items acumulados para la venta actual
let productoSeleccionado = null;
let modoEdicion = false;
let imagenBase64Pendiente = null; // Foto recién seleccionada, aún sin subir
let coloresSeleccionados = [];    // Colores agregados en modo "Agregar Producto"
let stockCombinaciones = {};      // Stock ingresado por combinación talla|color, para no perderlo al re-renderizar

// ── Monitoreo de conexión — RNF-06 ──────────────────────────
// Verifica cada 10 segundos si el backend responde.
// Si no responde, muestra el banner de advertencia.
let bannerConexion = false;

function apiUrl(path) {
  // En AWS la app vive bajo un prefijo de stage (ej. /dev/); en local
  // Docker vive en la raíz. Se antepone el primer segmento de la URL
  // actual para que las rutas /api/... no pierdan ese prefijo.
  const segmentos = window.location.pathname.split("/").filter(Boolean);
  const prefijo = segmentos.length > 0 ? "/" + segmentos[0] : "";
  return prefijo + path;
}

function verificarConexion() {
  fetch(apiUrl("/api/health"))
    .then(r => {
      if (r.ok && bannerConexion) {
        document.getElementById("banner-conexion").classList.remove("visible");
        bannerConexion = false;
      }
    })
    .catch(() => {
      if (!bannerConexion) {
        document.getElementById("banner-conexion").classList.add("visible");
        bannerConexion = true;
      }
    });
}
setInterval(verificarConexion, 10000);

// ── Utilidades ───────────────────────────────────────────────
function mostrarMensaje(idEl, texto, tipo) {
  const el = document.getElementById(idEl);
  el.textContent = texto;
  el.className = "mensaje visible " + tipo;
  setTimeout(() => el.classList.remove("visible"), 4000);
}

function abrirModal(id) {
  document.getElementById(id).classList.add("visible");
}
function cerrarModal(id) {
  document.getElementById(id).classList.remove("visible");
}

function iconoCategoria(cat) {
  const m = { Tops:"👕", Pantalones:"👖", Faldas:"🩱", Vestidos:"👗", Abrigos:"🧥", Accesorios:"👜" };
  return m[cat] || "🏷️";
}

// Si el producto tiene una imagen real, se muestra; si no (o si falla
// la carga), se cae de vuelta al ícono de categoría como respaldo.
function bloqueImagen(p) {
  if (!p.imagen) {
    return \`<div class="img-placeholder">\${iconoCategoria(p.categoria)}</div>\`;
  }
  return \`<div class="img-placeholder" style="padding:0; background:#f1f2f6;">
    <img src="\${p.imagen}" alt="\${p.nombre}" style="width:100%; height:100%; object-fit:contain;"
         onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'img-placeholder', textContent:'\${iconoCategoria(p.categoria)}'}))" />
  </div>\`;
}

// ── LOGIN ────────────────────────────────────────────────────
document.getElementById("inp-password").addEventListener("keydown", e => {
  if (e.key === "Enter") hacerLogin();
});

async function hacerLogin() {
  const usuario  = document.getElementById("inp-usuario").value.trim();
  const password = document.getElementById("inp-password").value;
  const btn      = document.getElementById("btn-login");

  if (!usuario || !password) {
    mostrarMensaje("msg-login", "Ingresa usuario y contraseña", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Ingresando...';

  try {
    const resp = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password })
    });
    const data = await resp.json();

    if (!resp.ok) {
      mostrarMensaje("msg-login", data.error || "Credenciales incorrectas", "error");
      return;
    }

    TOKEN   = data.token;
    USUARIO = data.usuario;
    iniciarApp();

  } catch (err) {
    mostrarMensaje("msg-login", "Sin conexión al servidor. Reintentando...", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
}

// ── INICIO DE LA APP ─────────────────────────────────────────
function iniciarApp() {
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("pantalla-app").style.display   = "block";
  document.getElementById("info-usuario").textContent =
    USUARIO.nombre + " · " + (USUARIO.rol === "dueno" ? "🔑 Dueño" : "👤 Vendedor");

  construirNav();
  navegarA("sec-catalogo");
}

function construirNav() {
  const nav = document.getElementById("nav-principal");
  nav.innerHTML = "";

  const items = [
    { id: "sec-catalogo", label: "📦 Catálogo" },
    { id: "sec-venta",    label: "🧾 Registrar Venta" }
  ];

  // Solo el dueño ve estas secciones (RF-07)
  if (USUARIO.rol === "dueno") {
    items.push(
      { id: "sec-resumen",    label: "📊 Resumen" },
      { id: "sec-historial",  label: "📋 Historial" },
      { id: "sec-inventario", label: "🏷️ Inventario" }
    );
  }

  items.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "nav-btn";
    btn.textContent = item.label;
    btn.onclick = () => navegarA(item.id);
    btn.dataset.seccion = item.id;
    nav.appendChild(btn);
  });
}

function navegarA(seccionId) {
  document.querySelectorAll(".seccion").forEach(s => s.classList.remove("activa"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("activo"));

  document.getElementById(seccionId).classList.add("activa");
  const btn = document.querySelector("[data-seccion='" + seccionId + "']");
  if (btn) btn.classList.add("activo");

  // Cargar datos de la sección
  if (seccionId === "sec-catalogo")   cargarCatalogo();
  if (seccionId === "sec-venta")      { cargarCatalogo(); cargarMisVentas(); }
  if (seccionId === "sec-resumen")    cargarResumen();
  if (seccionId === "sec-historial")  cargarHistorial();
  if (seccionId === "sec-inventario") cargarTablaInventario();
}

// ── CATÁLOGO ─────────────────────────────────────────────────
async function cargarCatalogo() {
  const grid = document.getElementById("catalogo-grid");
  grid.innerHTML = '<p><span class="spinner"></span>Cargando catálogo...</p>';

  try {
    const resp = await fetch(apiUrl("/api/inventario"), {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    const productos = await resp.json();

    if (productos.length === 0) {
      grid.innerHTML = "<p style='color:#636e72;'>No hay productos en el catálogo.</p>";
      return;
    }

    grid.innerHTML = productos.map(p => {
      const stockBadge = p.stock === 0
        ? '<span class="badge-stock agotado">Agotado</span>'
        : p.stock <= 3
          ? '<span class="badge-stock critico">⚠️ Stock bajo: ' + p.stock + '</span>'
          : '<span class="badge-stock ok">Stock: ' + p.stock + '</span>';

      const accionesDueno = USUARIO.rol === "dueno"
        ? \`<div class="acciones-dueno">
             <button class="btn btn-advertencia" onclick='abrirModalProducto(\${JSON.stringify(p)})'>✏️ Editar</button>
             <button class="btn btn-peligro" onclick="eliminarProducto('\${p.id}', '\${p.nombre}')">🗑️</button>
           </div>\`
        : "";

      const btnVender = p.stock > 0
        ? \`<button class="btn btn-exito btn-vender" onclick='seleccionarParaVenta(\${JSON.stringify(p)})'>
             + Agregar a venta
           </button>\`
        : \`<button class="btn btn-vender" disabled style="background:#ddd;color:#999;">Agotado</button>\`;

      return \`
        <div class="producto-card">
          \${bloqueImagen(p)}
          <div class="info">
            <div class="nombre">\${p.nombre}</div>
            <div class="detalle">\${p.categoria} · Talla \${p.talla}</div>
            <div class="detalle">\${p.color || ""}</div>
            <div class="precio">S/. \${p.precio.toFixed(2)}</div>
            \${stockBadge}
            \${btnVender}
            \${accionesDueno}
          </div>
        </div>\`;
    }).join("");

  } catch (err) {
    grid.innerHTML = "<p style='color:var(--acento);'>Error al cargar el catálogo.</p>";
  }
}

// ── FLUJO DE VENTA ───────────────────────────────────────────
function seleccionarParaVenta(producto) {
  navegarA("sec-venta");
  productoSeleccionado = producto;
  document.getElementById("mv-nombre").textContent = producto.nombre + " — S/. " + producto.precio.toFixed(2);
  document.getElementById("mv-stock-info").textContent = "Stock disponible: " + producto.stock + " unidades";
  document.getElementById("mv-cantidad").value = 1;
  document.getElementById("mv-cantidad").max   = producto.stock;
  abrirModal("modal-venta-item");
}

function agregarItemVenta() {
  const cantidad = parseInt(document.getElementById("mv-cantidad").value, 10);
  if (!cantidad || cantidad < 1) return;
  if (cantidad > productoSeleccionado.stock) {
    alert("Cantidad supera el stock disponible (" + productoSeleccionado.stock + ")");
    return;
  }

  // Si ya está en el carrito, sumar
  const existente = carrito.find(i => i.productoId === productoSeleccionado.id);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    carrito.push({
      productoId: productoSeleccionado.id,
      nombre: productoSeleccionado.nombre,
      precio: productoSeleccionado.precio,
      cantidad
    });
  }

  cerrarModal("modal-venta-item");
  renderizarCarrito();
}

function renderizarCarrito() {
  const cont   = document.getElementById("items-venta");
  const resumen = document.getElementById("resumen-venta");
  const btnConf = document.getElementById("btn-confirmar-venta");

  if (carrito.length === 0) {
    cont.innerHTML = "<p style='color:#636e72;'>No hay productos en la venta actual.</p>";
    resumen.style.display  = "none";
    btnConf.style.display  = "none";
    return;
  }

  let total = 0;
  cont.innerHTML = carrito.map((item, idx) => {
    const sub = item.precio * item.cantidad;
    total += sub;
    return \`
      <div style="background:white; padding:12px 16px; border-radius:8px; margin-bottom:8px; box-shadow:var(--sombra); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>\${item.nombre}</strong>
          <div style="font-size:0.85rem; color:#636e72;">\${item.cantidad} × S/. \${item.precio.toFixed(2)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <strong>S/. \${sub.toFixed(2)}</strong>
          <button onclick="quitarItemCarrito(\${idx})" style="background:var(--acento); color:white; border:none; border-radius:6px; padding:4px 10px; cursor:pointer;">✕</button>
        </div>
      </div>\`;
  }).join("");

  document.getElementById("total-venta").textContent = total.toFixed(2);
  resumen.style.display = "block";
  btnConf.style.display = "inline-block";
}

function quitarItemCarrito(idx) {
  carrito.splice(idx, 1);
  renderizarCarrito();
}

async function confirmarVenta() {
  if (carrito.length === 0) return;
  const btn = document.getElementById("btn-confirmar-venta");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Procesando...';

  try {
    const resp = await fetch(apiUrl("/api/ventas"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + TOKEN
      },
      body: JSON.stringify({ items: carrito.map(i => ({ productoId: i.productoId, cantidad: i.cantidad })) })
    });
    const data = await resp.json();

    if (resp.status === 201) {
      mostrarMensaje("msg-venta", "✓ Venta registrada correctamente. Total: S/. " + data.total.toFixed(2), "exito");
      carrito = [];
      renderizarCarrito();
      cargarMisVentas();
    } else if (resp.status === 202) {
      mostrarMensaje("msg-venta", "⏳ " + data.mensaje, "info");
      carrito = [];
      renderizarCarrito();
    } else {
      mostrarMensaje("msg-venta", data.error || "Error al registrar la venta", "error");
    }
  } catch (err) {
    mostrarMensaje("msg-venta", "Error de conexión. La venta se procesará cuando se restablezca.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "✓ Confirmar Venta";
  }
}

async function cargarMisVentas() {
  const tbody = document.getElementById("tabla-mis-ventas");
  try {
    const resp   = await fetch(apiUrl("/api/ventas/mis-ventas"), { headers: { Authorization: "Bearer " + TOKEN } });
    const ventas = await resp.json();

    if (ventas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#636e72;">Sin ventas hoy</td></tr>';
      return;
    }

    tbody.innerHTML = ventas.reverse().map(v => \`
      <tr>
        <td>\${new Date(v.fechaHora).toLocaleTimeString("es-PE")}</td>
        <td>\${v.items.map(i => i.nombre + " x" + i.cantidad).join(", ")}</td>
        <td><strong>S/. \${v.total.toFixed(2)}</strong></td>
      </tr>\`).join("");
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="3">Error al cargar</td></tr>';
  }
}

// ── RESUMEN DUEÑO ────────────────────────────────────────────
async function cargarResumen() {
  const cards   = document.getElementById("resumen-cards");
  const alertas = document.getElementById("alertas-stock");
  cards.innerHTML   = '<span class="spinner"></span>';
  alertas.innerHTML = '<span class="spinner"></span>';

  try {
    const resp = await fetch(apiUrl("/api/reportes/resumen"), { headers: { Authorization: "Bearer " + TOKEN } });
    const data = await resp.json();

    cards.innerHTML = \`
      <div class="resumen-card">
        <div class="numero">\${data.ventasHoy}</div>
        <div class="etiqueta">Ventas del día</div>
      </div>
      <div class="resumen-card">
        <div class="numero">S/. \${data.ingresosTotalesHoy.toFixed(2)}</div>
        <div class="etiqueta">Ingresos de hoy</div>
      </div>
      <div class="resumen-card">
        <div class="numero">\${data.totalProductos}</div>
        <div class="etiqueta">Productos en catálogo</div>
      </div>
      <div class="resumen-card \${data.productosStockCritico.length > 0 ? "alerta" : ""}">
        <div class="numero">\${data.productosStockCritico.length}</div>
        <div class="etiqueta">Productos stock crítico</div>
      </div>\`;

    if (data.productosStockCritico.length === 0) {
      alertas.innerHTML = '<p style="color:var(--exito);">✓ Todos los productos tienen stock suficiente.</p>';
    } else {
      alertas.innerHTML = data.productosStockCritico.map(p => \`
        <div class="alerta-item">
          <strong>⚠️ \${p.nombre}</strong> · Talla \${p.talla}
          <br><span>Stock actual: <strong>\${p.stock} unidades</strong> (mínimo: 3)</span>
        </div>\`).join("");
    }
  } catch (err) {
    cards.innerHTML = '<p style="color:var(--acento);">Error al cargar resumen.</p>';
  }
}

// ── HISTORIAL DUEÑO ──────────────────────────────────────────
async function cargarHistorial() {
  const tbody = document.getElementById("tabla-historial");
  tbody.innerHTML = '<tr><td colspan="4"><span class="spinner"></span>Cargando...</td></tr>';

  try {
    const resp   = await fetch(apiUrl("/api/ventas"), { headers: { Authorization: "Bearer " + TOKEN } });
    const ventas = await resp.json();

    if (ventas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#636e72;">Sin ventas en los últimos 90 días</td></tr>';
      return;
    }

    tbody.innerHTML = ventas.reverse().map(v => \`
      <tr>
        <td>\${new Date(v.fechaHora).toLocaleString("es-PE")}</td>
        <td>\${v.vendedor}</td>
        <td>\${v.items.map(i => i.nombre + " x" + i.cantidad).join(", ")}</td>
        <td><strong>S/. \${v.total.toFixed(2)}</strong></td>
      </tr>\`).join("");
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4">Error al cargar historial.</td></tr>';
  }
}

// ── GESTIÓN INVENTARIO (dueño) ───────────────────────────────
async function cargarTablaInventario() {
  const tbody = document.getElementById("tabla-inventario");
  tbody.innerHTML = '<tr><td colspan="7"><span class="spinner"></span>Cargando...</td></tr>';

  try {
    const resp       = await fetch(apiUrl("/api/inventario"), { headers: { Authorization: "Bearer " + TOKEN } });
    const productos  = await resp.json();

    tbody.innerHTML = productos.map(p => {
      const stockColor = p.stock <= 3
        ? "color:var(--advertencia); font-weight:700;"
        : "color:var(--exito);";
      return \`
        <tr>
          <td>\${p.nombre}</td>
          <td>\${p.categoria}</td>
          <td>\${p.talla}</td>
          <td>\${p.color || "—"}</td>
          <td>S/. \${p.precio.toFixed(2)}</td>
          <td style="\${stockColor}">\${p.stock}</td>
          <td>
            <button class="btn btn-advertencia" style="padding:5px 10px; font-size:0.8rem; margin-right:4px;"
              onclick='abrirModalProducto(\${JSON.stringify(p)})'>✏️</button>
            <button class="btn btn-peligro" style="padding:5px 10px; font-size:0.8rem;"
              onclick="eliminarProducto('\${p.id}', '\${p.nombre}')">🗑️</button>
          </td>
        </tr>\`;
    }).join("");
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7">Error al cargar.</td></tr>';
  }
}

function abrirModalProducto(producto) {
  modoEdicion = !!producto;
  imagenBase64Pendiente = null;
  coloresSeleccionados = [];
  stockCombinaciones = {};
  document.getElementById("modal-titulo").textContent = modoEdicion ? "Editar Producto" : "Agregar Producto";
  document.getElementById("mp-id").value       = producto?.id       || "";
  document.getElementById("mp-imagen-url").value = producto?.imagen || "";
  document.getElementById("mp-imagen-input").value = "";
  document.getElementById("mp-nombre").value   = producto?.nombre   || "";
  document.getElementById("mp-categoria").value= producto?.categoria|| "";
  document.getElementById("mp-precio").value   = producto?.precio   || "";
  document.getElementById("msg-modal").className = "mensaje";

  // Modo edición: talla/color/stock puntuales. Modo alta: selección múltiple.
  document.getElementById("mp-bloque-simple").style.display     = modoEdicion ? "block" : "none";
  document.getElementById("mp-bloque-variantes").style.display  = modoEdicion ? "none"  : "block";
  document.getElementById("mp-talla").value = producto?.talla || "";
  document.getElementById("mp-color").value = producto?.color || "";
  document.getElementById("mp-stock").value = producto?.stock ?? "";

  document.querySelectorAll("#mp-tallas-check input[type=checkbox]").forEach(chk => chk.checked = false);
  document.getElementById("mp-color-nuevo").value = "";
  renderColoresChips();
  renderCombinaciones();

  const previewWrap = document.getElementById("mp-imagen-preview-wrap");
  if (producto?.imagen) {
    document.getElementById("mp-imagen-preview").src = producto.imagen;
    previewWrap.style.display = "block";
  } else {
    previewWrap.style.display = "none";
  }
  abrirModal("modal-producto");
}

// ── Selección de tallas y colores múltiples (modo "Agregar Producto") ──
function obtenerTallasSeleccionadas() {
  return Array.from(document.querySelectorAll("#mp-tallas-check input[type=checkbox]:checked")).map(c => c.value);
}

function agregarColor() {
  const input = document.getElementById("mp-color-nuevo");
  const color = input.value.trim();
  if (!color || coloresSeleccionados.includes(color)) {
    input.value = "";
    return;
  }
  coloresSeleccionados.push(color);
  input.value = "";
  renderColoresChips();
  renderCombinaciones();
}

function quitarColor(color) {
  coloresSeleccionados = coloresSeleccionados.filter(c => c !== color);
  renderColoresChips();
  renderCombinaciones();
}

function renderColoresChips() {
  const cont = document.getElementById("mp-colores-chips");
  if (coloresSeleccionados.length === 0) {
    cont.innerHTML = '<span style="font-size:0.85rem; color:#636e72;">Sin colores agregados (el producto se creará sin color específico)</span>';
    return;
  }
  cont.innerHTML = coloresSeleccionados.map(color => \`
    <span style="background:#eaf4fb; color:#2980b9; padding:4px 10px; border-radius:20px; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
      \${color}
      <button type="button" onclick="quitarColor('\${color}')" style="border:none; background:none; color:#2980b9; cursor:pointer; font-weight:700;">✕</button>
    </span>\`).join("");
}

function renderCombinaciones() {
  const cont    = document.getElementById("mp-combinaciones-tabla");
  const tallas  = obtenerTallasSeleccionadas();
  const colores = coloresSeleccionados.length > 0 ? coloresSeleccionados : [""];

  // Guarda lo ya escrito antes de reconstruir la tabla
  document.querySelectorAll(".mp-combo-stock").forEach(inp => {
    stockCombinaciones[inp.dataset.clave] = inp.value;
  });

  if (tallas.length === 0) {
    cont.innerHTML = "Selecciona al menos una talla para definir el stock.";
    return;
  }

  const filas = [];
  for (const talla of tallas) {
    for (const color of colores) {
      const clave = talla + "|" + color;
      const etiqueta = color ? \`Talla \${talla} · \${color}\` : \`Talla \${talla}\`;
      const valorPrevio = stockCombinaciones[clave] || "";
      filas.push(\`
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
          <span>\${etiqueta}</span>
          <input type="number" min="0" class="mp-combo-stock" data-clave="\${clave}" data-talla="\${talla}" data-color="\${color}"
                 value="\${valorPrevio}" placeholder="Stock" style="width:110px; padding:6px 10px; border:1.5px solid var(--borde); border-radius:6px;" />
        </div>\`);
    }
  }
  cont.innerHTML = filas.join("");
}

function previsualizarImagen(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    imagenBase64Pendiente = lector.result; // data URL en base64
    document.getElementById("mp-imagen-preview").src = lector.result;
    document.getElementById("mp-imagen-preview-wrap").style.display = "block";
  };
  lector.readAsDataURL(archivo);
}

async function subirImagenSiHaceFalta() {
  if (!imagenBase64Pendiente) {
    return document.getElementById("mp-imagen-url").value || "";
  }
  const resp = await fetch(apiUrl("/api/inventario/imagenes"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify({ imagenBase64: imagenBase64Pendiente })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "No se pudo subir la imagen");
  }
  return data.url;
}

async function guardarUnProducto(url, metodo, datos) {
  const resp = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(datos)
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Error al guardar " + (datos.talla ? "talla " + datos.talla : ""));
  }
  return data;
}

async function guardarProducto() {
  const id       = document.getElementById("mp-id").value;
  const nombre   = document.getElementById("mp-nombre").value.trim();
  const categoria= document.getElementById("mp-categoria").value;
  const precio   = parseFloat(document.getElementById("mp-precio").value);

  if (!nombre || !categoria || isNaN(precio)) {
    mostrarMensaje("msg-modal", "Completa todos los campos obligatorios (*)", "error");
    return;
  }

  // ── Modo edición: un solo producto puntual ──
  let combinaciones = null;
  if (modoEdicion) {
    const talla = document.getElementById("mp-talla").value;
    const color = document.getElementById("mp-color").value.trim();
    const stock = parseInt(document.getElementById("mp-stock").value, 10);
    if (!talla || isNaN(stock)) {
      mostrarMensaje("msg-modal", "Completa todos los campos obligatorios (*)", "error");
      return;
    }
    combinaciones = [{ talla, color, stock }];
  } else {
    // ── Modo alta: una o varias combinaciones de talla/color ──
    document.querySelectorAll(".mp-combo-stock").forEach(inp => {
      stockCombinaciones[inp.dataset.clave] = inp.value;
    });
    const tallas  = obtenerTallasSeleccionadas();
    const colores = coloresSeleccionados.length > 0 ? coloresSeleccionados : [""];
    if (tallas.length === 0) {
      mostrarMensaje("msg-modal", "Selecciona al menos una talla", "error");
      return;
    }
    combinaciones = [];
    for (const talla of tallas) {
      for (const color of colores) {
        const stockTexto = stockCombinaciones[talla + "|" + color];
        const stock = parseInt(stockTexto, 10);
        if (stockTexto === undefined || stockTexto === "" || isNaN(stock) || stock < 0) {
          mostrarMensaje("msg-modal", "Completa el stock de todas las combinaciones (talla " + talla + (color ? " · " + color : "") + ")", "error");
          return;
        }
        combinaciones.push({ talla, color, stock });
      }
    }
  }

  const btnGuardar = document.querySelector("#modal-producto .btn-exito");
  const textoOriginalBtn = btnGuardar.textContent;

  try {
    if (imagenBase64Pendiente) {
      btnGuardar.disabled = true;
      btnGuardar.textContent = "Subiendo imagen...";
    }
    const imagen = await subirImagenSiHaceFalta();

    if (modoEdicion) {
      btnGuardar.textContent = "Guardando...";
      await guardarUnProducto(apiUrl("/api/inventario/" + id), "PUT",
        { nombre, categoria, precio, imagen, ...combinaciones[0] });
    } else {
      for (let i = 0; i < combinaciones.length; i++) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = \`Guardando \${i + 1} de \${combinaciones.length}...\`;
        await guardarUnProducto(apiUrl("/api/inventario"), "POST",
          { nombre, categoria, precio, imagen, ...combinaciones[i] });
      }
    }

    cerrarModal("modal-producto");
    cargarTablaInventario();
    cargarCatalogo();
  } catch (err) {
    mostrarMensaje("msg-modal", err.message || "Error de conexión", "error");
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginalBtn;
  }
}

async function eliminarProducto(id, nombre) {
  if (!confirm("¿Eliminar '" + nombre + "' del inventario?")) return;

  try {
    const resp = await fetch(apiUrl("/api/inventario/" + id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + TOKEN }
    });
    if (resp.ok) {
      cargarTablaInventario();
      cargarCatalogo();
    } else {
      alert("Error al eliminar el producto.");
    }
  } catch (err) {
    alert("Error de conexión.");
  }
}

// ── CERRAR SESIÓN ────────────────────────────────────────────
function cerrarSesion() {
  TOKEN   = null;
  USUARIO = null;
  carrito = [];
  document.getElementById("pantalla-app").style.display   = "none";
  document.getElementById("pantalla-login").style.display = "flex";
  document.getElementById("inp-usuario").value  = "";
  document.getElementById("inp-password").value = "";
}
</script>
</body>
</html>`;

// Servir la SPA solo en la ruta raíz; las rutas /api deben pasar al backend.
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Si estamos en la nube, forzamos un formato estructurado para API Gateway
  if (process.env.LAMBDA_TASK_ROOT) {
    return res.status(200).send(HTML);
  }
  res.send(HTML);
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (process.env.LAMBDA_TASK_ROOT) {
    return res.status(200).send(HTML);
  }
  res.send(HTML);
});

const IS_LOCAL_FRONTEND = process.env.BACKEND_URL && process.env.BACKEND_URL.includes("backend:4000") || !process.env.LAMBDA_TASK_ROOT;

if (IS_LOCAL_FRONTEND) {
  // Se ejecuta de manera tradicional si usas Docker Desktop
  app.listen(PORT, "0.0.0.0", () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      nivel: "info",
      servicio: "tienda-frontend",
      mensaje: "Frontend iniciado en Docker Local",
      puerto: PORT,
      backendUrl: BACKEND_URL
    }));
  });
} else {
  // Configuración y exportación especial obligatoria para AWS Lambda
  const serverless = require("serverless-http");
  module.exports.handler = serverless(app);
}
