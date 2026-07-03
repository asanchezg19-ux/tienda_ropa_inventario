"use strict";

// ═══════════════════════════════════════════════════════════════
//  IMPORTS Y CONFIGURACIÓN INICIAL
// ═══════════════════════════════════════════════════════════════
const express      = require("express");
const cors         = require("cors");
const bcrypt       = require("bcryptjs");
const jwt          = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const fs           = require("fs");
const path         = require("path");
const rateLimit    = require("express-rate-limit");
const winston      = require("winston");
const promClient   = require("prom-client");

require("dotenv").config();

const app         = express();
const PORT        = process.env.PORT        || 4000;
const JWT_SECRET  = process.env.JWT_SECRET  || "tienda_ropa_secret_2026";
const STOCK_MIN   = parseInt(process.env.STOCK_MINIMO || "3", 10);

// Carpeta donde se guardan los datos JSON (volumen Docker)
const DATA_DIR        = path.join(__dirname, "data");
const INVENTARIO_FILE = path.join(DATA_DIR, "inventario.json");
const VENTAS_FILE     = path.join(DATA_DIR, "ventas.json");
const COLA_FILE       = path.join(DATA_DIR, "cola_pendiente.json");

// ═══════════════════════════════════════════════════════════════
//  LOGGER WINSTON — RNF-09 (logs estructurados en JSON)
//  Winston escribe a stdout en formato JSON.
//  Alloy recoge stdout del contenedor y lo envía a Loki.
//  Grafana lee de Loki → toda la cadena queda conectada.
// ═══════════════════════════════════════════════════════════════
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()          // Alloy parsea JSON nativo
  ),
  defaultMeta: { servicio: "tienda-backend" },
  transports: [
    new winston.transports.Console()
  ]
});

// ═══════════════════════════════════════════════════════════════
//  MÉTRICAS PROMETHEUS — RNF-09 (observabilidad)
//  prom-client expone /metrics que Prometheus recolecta cada 15s
// ═══════════════════════════════════════════════════════════════
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Contador de ventas registradas exitosamente
const contadorVentas = new promClient.Counter({
  name: "tienda_ventas_total",
  help: "Total de ventas registradas exitosamente",
  labelNames: ["vendedor"],
  registers: [register]
});

// Histograma de tiempo de respuesta de la API (RNF-02: <3 seg)
const histogramaRespuesta = new promClient.Histogram({
  name: "tienda_api_duracion_segundos",
  help: "Tiempo de respuesta de la API en segundos",
  labelNames: ["metodo", "ruta", "estado"],
  buckets: [0.1, 0.5, 1, 2, 3, 5],   // 3s es el límite del RNF-02
  registers: [register]
});

// Gauge de productos con stock crítico (<= STOCK_MIN)
const gaugeStockCritico = new promClient.Gauge({
  name: "tienda_productos_stock_critico",
  help: "Cantidad de productos con stock en nivel critico",
  registers: [register]
});

// Contador de errores internos
const contadorErrores = new promClient.Counter({
  name: "tienda_errores_total",
  help: "Total de errores internos del sistema",
  labelNames: ["tipo"],
  registers: [register]
});

// Contador de intentos de login fallidos (RNF-08)
const contadorLoginFallidos = new promClient.Counter({
  name: "tienda_login_fallidos_total",
  help: "Total de intentos de login fallidos",
  registers: [register]
});

// ═══════════════════════════════════════════════════════════════
//  PERSISTENCIA JSON — datos de la tienda en archivos locales
//  Se usa archivo en lugar de base de datos externa para
//  optimizar recursos en laptops con RAM limitada.
//  El volumen Docker "backend-data" asegura que persistan.
// ═══════════════════════════════════════════════════════════════
function asegurarDirectorio() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    logger.info("Directorio de datos creado", { ruta: DATA_DIR });
  }
}

function leerJSON(archivo, valorPorDefecto) {
  try {
    if (!fs.existsSync(archivo)) return valorPorDefecto;
    return JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch (err) {
    logger.error("Error leyendo archivo JSON", { archivo, error: err.message });
    contadorErrores.inc({ tipo: "lectura_datos" });
    return valorPorDefecto;
  }
}

function escribirJSON(archivo, datos) {
  try {
    fs.writeFileSync(archivo, JSON.stringify(datos, null, 2), "utf8");
  } catch (err) {
    logger.error("Error escribiendo archivo JSON", { archivo, error: err.message });
    contadorErrores.inc({ tipo: "escritura_datos" });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATOS INICIALES
//  Si los archivos no existen (primer arranque), se crean
//  con datos de ejemplo para demostración.
// ═══════════════════════════════════════════════════════════════

// Usuarios del sistema (contraseñas hasheadas con bcrypt)
// En producción real esto vendría de Cognito/base de datos
const USUARIOS = [
  {
    id: "usr-001",
    nombre: "Dueño Tienda",
    usuario: "dueno",
    // Contraseña: admin123
    passwordHash: bcrypt.hashSync("admin123", 10),
    rol: "dueno"
  },
  {
    id: "usr-002",
    nombre: "Vendedor 1",
    usuario: "vendedor1",
    // Contraseña: venta123
    passwordHash: bcrypt.hashSync("venta123", 10),
    rol: "vendedor"
  }
];

function inicializarDatos() {
  asegurarDirectorio();

  // Inventario inicial si no existe
  if (!fs.existsSync(INVENTARIO_FILE)) {
    const inventarioInicial = [
      {
        id: uuidv4(),
        nombre: "Polo Básica",
        categoria: "Tops",
        talla: "M",
        color: "Blanco",
        precio: 35.00,
        stock: 10,
        imagen: "/img/polo-basica.jpg",
        creadoEn: new Date().toISOString()
      },
      {
        id: uuidv4(),
        nombre: "Jeans Clásico",
        categoria: "Pantalones",
        talla: "32",
        color: "Azul",
        precio: 89.90,
        stock: 5,
        imagen: "/img/jeans-clasico.jpg",
        creadoEn: new Date().toISOString()
      },
      {
        id: uuidv4(),
        nombre: "Blusa Floral",
        categoria: "Tops",
        talla: "S",
        color: "Multicolor",
        precio: 45.00,
        stock: 2,    // Stock crítico de ejemplo (<=3 unidades)
        imagen: "/img/blusa-floral.jpg",
        creadoEn: new Date().toISOString()
      },
      {
        id: uuidv4(),
        nombre: "Casaca Deportiva",
        categoria: "Abrigos",
        talla: "L",
        color: "Negro",
        precio: 120.00,
        stock: 8,
        imagen: "/img/casaca-deportiva.jpg",
        creadoEn: new Date().toISOString()
      },
      {
        id: uuidv4(),
        nombre: "Falda Midi",
        categoria: "Faldas",
        talla: "M",
        color: "Beige",
        precio: 55.00,
        stock: 3,    // Exactamente en el límite crítico
        imagen: "/img/falda-midi.jpg",
        creadoEn: new Date().toISOString()
      }
    ];
    escribirJSON(INVENTARIO_FILE, inventarioInicial);
    logger.info("Inventario inicial creado", { productos: inventarioInicial.length });
  }

  // Historial de ventas vacío si no existe
  if (!fs.existsSync(VENTAS_FILE)) {
    escribirJSON(VENTAS_FILE, []);
    logger.info("Archivo de ventas inicializado");
  }

  // Cola de ventas pendientes vacía si no existe (RNF-05)
  if (!fs.existsSync(COLA_FILE)) {
    escribirJSON(COLA_FILE, []);
    logger.info("Cola de ventas pendientes inicializada");
  }
}

// ═══════════════════════════════════════════════════════════════
//  COLA DE VENTAS PENDIENTES — RNF-05
//  Simula el comportamiento de Amazon SQS localmente.
//  Si una venta falla al guardarse, se pone en cola y se reintenta.
//  El procesador revisa la cola cada 30 segundos.
// ═══════════════════════════════════════════════════════════════
function encolarVenta(ventaData) {
  const cola = leerJSON(COLA_FILE, []);
  cola.push({
    id: uuidv4(),
    datos: ventaData,
    intentos: 0,
    creadoEn: new Date().toISOString()
  });
  escribirJSON(COLA_FILE, cola);
  logger.warn("Venta encolada para reintento", { ventaId: ventaData.id });
}

function procesarColaPendiente() {
  const cola = leerJSON(COLA_FILE, []);
  if (cola.length === 0) return;

  logger.info("Procesando cola de ventas pendientes", { pendientes: cola.length });
  const pendientes = [];

  for (const item of cola) {
    try {
      const ventas = leerJSON(VENTAS_FILE, []);
      // Evitar duplicados (si ya fue procesada en un reintento anterior)
      const yaExiste = ventas.find(v => v.id === item.datos.id);
      if (!yaExiste) {
        ventas.push(item.datos);
        escribirJSON(VENTAS_FILE, ventas);
        logger.info("Venta pendiente procesada exitosamente", {
          ventaId: item.datos.id,
          intentos: item.intentos + 1
        });
      }
    } catch (err) {
      item.intentos += 1;
      // Máximo 3 intentos (como SQS DLQ del informe)
      if (item.intentos < 3) {
        pendientes.push(item);
        logger.warn("Reintento de venta fallido, se volverá a intentar", {
          ventaId: item.datos.id,
          intento: item.intentos
        });
      } else {
        // Después de 3 intentos: log de error crítico para revisión manual
        logger.error("VENTA FALLIDA TRAS 3 INTENTOS — requiere revisión manual", {
          ventaId: item.datos.id,
          datos: item.datos
        });
        contadorErrores.inc({ tipo: "venta_dlq" });
      }
    }
  }

  escribirJSON(COLA_FILE, pendientes);
}

// Procesa la cola cada 30 segundos
setInterval(procesarColaPendiente, 30000);

// ═══════════════════════════════════════════════════════════════
//  ALERTA DE STOCK CRÍTICO — RNF-10 / RF
//  Cuando el stock baja de STOCK_MIN (3 unidades),
//  se emite un log de nivel "warn" con tipo "ALERTA_STOCK".
//  Grafana/Loki puede mostrar estas alertas en un panel.
//  En AWS real esto dispararía SNS → email al dueño.
// ═══════════════════════════════════════════════════════════════
function verificarStockCritico(producto) {
  if (producto.stock <= STOCK_MIN) {
    logger.warn("ALERTA_STOCK: producto bajo nivel mínimo", {
      tipo: "ALERTA_STOCK",
      productoId: producto.id,
      nombre: producto.nombre,
      talla: producto.talla,
      stockActual: producto.stock,
      stockMinimo: STOCK_MIN,
      timestamp: new Date().toISOString()
    });
  }
}

function actualizarGaugeStockCritico() {
  const inventario = leerJSON(INVENTARIO_FILE, []);
  const criticos = inventario.filter(p => p.stock <= STOCK_MIN).length;
  gaugeStockCritico.set(criticos);
}

// ═══════════════════════════════════════════════════════════════
//  MIDDLEWARES GLOBALES
// ═══════════════════════════════════════════════════════════════
app.use(cors({
  origin: ["http://localhost:3000", "http://tienda-frontend:3000"],
  credentials: true
}));

app.use(express.json({ limit: "1mb" }));

// Middleware para medir tiempo de respuesta (RNF-02 / Prometheus)
app.use((req, res, next) => {
  const fin = histogramaRespuesta.startTimer({
    metodo: req.method,
    ruta: req.path
  });
  res.on("finish", () => {
    fin({ estado: res.statusCode });
  });
  next();
});

// Log de cada petición entrante (RNF-09)
app.use((req, res, next) => {
  logger.info("Petición recibida", {
    metodo: req.method,
    ruta: req.path,
    ip: req.ip
  });
  next();
});

// ─── Rate Limiter para login — RNF-08 ─────────────────────────
// Máximo 5 intentos de login por IP en 15 minutos.
// Si se superan, bloquea temporalmente (HTTP 429).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 5,
  message: {
    error: "Demasiados intentos de acceso. Cuenta bloqueada temporalmente. Intente en 15 minutos."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    contadorLoginFallidos.inc();
    logger.warn("BLOQUEO_ACCESO: límite de intentos superado", {
      tipo: "BLOQUEO_ACCESO",
      ip: req.ip
    });
    res.status(429).json(options.message);
  }
});

// ═══════════════════════════════════════════════════════════════
//  MIDDLEWARE DE AUTENTICACIÓN
//  Verifica el token JWT en el header Authorization
// ═══════════════════════════════════════════════════════════════
function autenticar(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de acceso requerido" });
  }
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// ═══════════════════════════════════════════════════════════════
//  MIDDLEWARE DE AUTORIZACIÓN POR ROL — RF-07
//  Reemplaza al antiguo RNF-07. Define qué puede hacer
//  cada perfil: dueño tiene acceso total, vendedor solo ventas.
// ═══════════════════════════════════════════════════════════════
function solodueno(req, res, next) {
  if (req.usuario.rol !== "dueno") {
    logger.warn("Intento de acceso no autorizado", {
      tipo: "ACCESO_DENEGADO",
      usuario: req.usuario.usuario,
      rol: req.usuario.rol,
      ruta: req.path
    });
    return res.status(403).json({
      error: "Acceso restringido. Solo el dueño puede realizar esta acción."
    });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════
//  RUTAS PÚBLICAS
// ═══════════════════════════════════════════════════════════════

// Health check — usado por Docker Compose para saber si el
// backend está listo antes de arrancar frontend y prometheus
app.get("/api/health", (req, res) => {
  res.json({
    estado: "ok",
    servicio: "tienda-backend",
    timestamp: new Date().toISOString()
  });
});

// Métricas para Prometheus (RNF-09 observabilidad)
app.get("/metrics", async (req, res) => {
  actualizarGaugeStockCritico();
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ─── LOGIN — RNF-08 ────────────────────────────────────────────
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  }

  const user = USUARIOS.find(u => u.usuario === usuario);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    contadorLoginFallidos.inc();
    logger.warn("Intento de login fallido", {
      tipo: "LOGIN_FALLIDO",
      usuario
    });
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const token = jwt.sign(
    { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol },
    JWT_SECRET,
    { expiresIn: "8h" }   // Duración = horario comercial de la tienda
  );

  logger.info("Login exitoso", { usuario: user.usuario, rol: user.rol });

  res.json({
    token,
    usuario: {
      id: user.id,
      nombre: user.nombre,
      usuario: user.usuario,
      rol: user.rol
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  RUTAS DE INVENTARIO (protegidas)
// ═══════════════════════════════════════════════════════════════

// GET /api/inventario — ambos roles pueden ver el catálogo
app.get("/api/inventario", autenticar, (req, res) => {
  const inventario = leerJSON(INVENTARIO_FILE, []);
  res.json(inventario);
});

// GET /api/inventario/:id — detalle de un producto
app.get("/api/inventario/:id", autenticar, (req, res) => {
  const inventario = leerJSON(INVENTARIO_FILE, []);
  const producto = inventario.find(p => p.id === req.params.id);
  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }
  res.json(producto);
});

// POST /api/inventario — solo dueño puede agregar productos
app.post("/api/inventario", autenticar, solodueno, (req, res) => {
  const { nombre, categoria, talla, color, precio, stock, imagen } = req.body;

  if (!nombre || !categoria || !talla || precio == null || stock == null) {
    return res.status(400).json({
      error: "Campos requeridos: nombre, categoria, talla, precio, stock"
    });
  }

  const inventario = leerJSON(INVENTARIO_FILE, []);
  const nuevo = {
    id: uuidv4(),
    nombre,
    categoria,
    talla,
    color: color || "",
    precio: parseFloat(precio),
    stock: parseInt(stock, 10),
    imagen: imagen || "",
    creadoEn: new Date().toISOString(),
    creadoPor: req.usuario.usuario
  };

  inventario.push(nuevo);
  escribirJSON(INVENTARIO_FILE, inventario);

  verificarStockCritico(nuevo);

  logger.info("Producto agregado al inventario", {
    productoId: nuevo.id,
    nombre: nuevo.nombre,
    por: req.usuario.usuario
  });

  res.status(201).json(nuevo);
});

// PUT /api/inventario/:id — solo dueño puede modificar precio/stock
app.put("/api/inventario/:id", autenticar, solodueno, (req, res) => {
  const inventario = leerJSON(INVENTARIO_FILE, []);
  const idx = inventario.findIndex(p => p.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  const actualizado = {
    ...inventario[idx],
    ...req.body,
    id: inventario[idx].id,           // ID no se puede cambiar
    modificadoEn: new Date().toISOString(),
    modificadoPor: req.usuario.usuario
  };

  inventario[idx] = actualizado;
  escribirJSON(INVENTARIO_FILE, inventario);

  verificarStockCritico(actualizado);

  logger.info("Producto actualizado", {
    productoId: actualizado.id,
    nombre: actualizado.nombre,
    por: req.usuario.usuario
  });

  res.json(actualizado);
});

// DELETE /api/inventario/:id — solo dueño puede eliminar
app.delete("/api/inventario/:id", autenticar, solodueno, (req, res) => {
  const inventario = leerJSON(INVENTARIO_FILE, []);
  const idx = inventario.findIndex(p => p.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  const eliminado = inventario.splice(idx, 1)[0];
  escribirJSON(INVENTARIO_FILE, inventario);

  logger.info("Producto eliminado del inventario", {
    productoId: eliminado.id,
    nombre: eliminado.nombre,
    por: req.usuario.usuario
  });

  res.json({ mensaje: "Producto eliminado correctamente", producto: eliminado });
});

// ═══════════════════════════════════════════════════════════════
//  RUTAS DE VENTAS
// ═══════════════════════════════════════════════════════════════

// POST /api/ventas — ambos roles pueden registrar ventas
// Esta es la ruta más crítica: implementa RNF-02 (<3s),
// RNF-05 (cola si falla), RNF-10 (alerta de stock)
app.post("/api/ventas", autenticar, (req, res) => {
  const { items } = req.body;
  // items = [{ productoId, cantidad }, ...]

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Se requiere al menos un producto en la venta" });
  }

  const inventario = leerJSON(INVENTARIO_FILE, []);

  // Validar stock disponible para todos los items antes de procesar
  for (const item of items) {
    const producto = inventario.find(p => p.id === item.productoId);
    if (!producto) {
      return res.status(404).json({
        error: `Producto no encontrado: ${item.productoId}`
      });
    }
    if (producto.stock < item.cantidad) {
      return res.status(400).json({
        error: `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}`
      });
    }
  }

  // Construir la venta
  const venta = {
    id: uuidv4(),
    items: [],
    total: 0,
    vendedor: req.usuario.usuario,
    fechaHora: new Date().toISOString()
  };

  // Descontar stock y construir detalle de la venta
  for (const item of items) {
    const idx = inventario.findIndex(p => p.id === item.productoId);
    const producto = inventario[idx];
    const subtotal = producto.precio * item.cantidad;

    venta.items.push({
      productoId: producto.id,
      nombre: producto.nombre,
      talla: producto.talla,
      precioUnitario: producto.precio,
      cantidad: item.cantidad,
      subtotal
    });

    venta.total += subtotal;
    inventario[idx].stock -= item.cantidad;

    // Verificar si el nuevo stock es crítico (RNF-10)
    verificarStockCritico(inventario[idx]);
  }

  venta.total = parseFloat(venta.total.toFixed(2));

  // Intentar guardar la venta y el inventario actualizado
  try {
    escribirJSON(INVENTARIO_FILE, inventario);
    const ventas = leerJSON(VENTAS_FILE, []);
    ventas.push(venta);
    escribirJSON(VENTAS_FILE, ventas);

    contadorVentas.inc({ vendedor: req.usuario.usuario });
    actualizarGaugeStockCritico();

    logger.info("Venta registrada exitosamente", {
      ventaId: venta.id,
      total: venta.total,
      vendedor: venta.vendedor,
      items: venta.items.length
    });

    res.status(201).json(venta);

  } catch (err) {
    // Si falla el guardado, encolar para reintento (RNF-05)
    encolarVenta(venta);
    contadorErrores.inc({ tipo: "venta_encolada" });

    logger.error("Error al guardar venta, encolada para reintento", {
      ventaId: venta.id,
      error: err.message
    });

    // Responder al vendedor que la venta está siendo procesada
    res.status(202).json({
      mensaje: "Venta recibida y en proceso. Será confirmada en breve.",
      ventaId: venta.id
    });
  }
});

// GET /api/ventas — solo dueño ve el historial completo (RF-07)
// Los últimos 90 días disponibles (RNF-12)
app.get("/api/ventas", autenticar, solodueno, (req, res) => {
  const ventas = leerJSON(VENTAS_FILE, []);

  // Filtrar por los últimos 90 días (RNF-12)
  const hace90Dias = new Date();
  hace90Dias.setDate(hace90Dias.getDate() - 90);

  const ventasFiltradas = ventas.filter(v =>
    new Date(v.fechaHora) >= hace90Dias
  );

  res.json(ventasFiltradas);
});

// GET /api/ventas/mis-ventas — vendedor solo ve sus propias ventas del día
app.get("/api/ventas/mis-ventas", autenticar, (req, res) => {
  const ventas = leerJSON(VENTAS_FILE, []);
  const hoy = new Date().toISOString().split("T")[0];

  const misVentas = ventas.filter(v =>
    v.vendedor === req.usuario.usuario &&
    v.fechaHora.startsWith(hoy)
  );

  res.json(misVentas);
});

// ═══════════════════════════════════════════════════════════════
//  RUTAS DE REPORTES — solo dueño (RF-07)
// ═══════════════════════════════════════════════════════════════

// GET /api/reportes/resumen — resumen financiero del día
app.get("/api/reportes/resumen", autenticar, solodueno, (req, res) => {
  const ventas = leerJSON(VENTAS_FILE, []);
  const inventario = leerJSON(INVENTARIO_FILE, []);
  const hoy = new Date().toISOString().split("T")[0];

  const ventasHoy = ventas.filter(v => v.fechaHora.startsWith(hoy));
  const totalHoy = ventasHoy.reduce((sum, v) => sum + v.total, 0);
  const productosStockCritico = inventario.filter(p => p.stock <= STOCK_MIN);

  res.json({
    fecha: hoy,
    ventasHoy: ventasHoy.length,
    ingresosTotalesHoy: parseFloat(totalHoy.toFixed(2)),
    totalProductos: inventario.length,
    productosStockCritico: productosStockCritico.map(p => ({
      id: p.id,
      nombre: p.nombre,
      talla: p.talla,
      stock: p.stock
    }))
  });
});

// ═══════════════════════════════════════════════════════════════
//  MANEJO GLOBAL DE ERRORES — RNF-09
//  Cualquier error no capturado llega aquí.
//  Se registra con contexto completo para diagnóstico.
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  contadorErrores.inc({ tipo: "error_interno" });
  logger.error("Error interno del sistema", {
    tipo: "ERROR_INTERNO",
    mensaje: err.message,
    stack: err.stack,
    ruta: req.path,
    metodo: req.method,
    timestamp: new Date().toISOString()
  });
  res.status(500).json({ error: "Error interno del sistema. El incidente ha sido registrado." });
});

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ═══════════════════════════════════════════════════════════════
//  INICIO DEL SERVIDOR
// ═══════════════════════════════════════════════════════════════
inicializarDatos();

app.listen(PORT, "::", () => {
  logger.info("Backend iniciado correctamente", {
    puerto: PORT,
    entorno: process.env.NODE_ENV || "development",
    stockMinimo: STOCK_MIN
  });
  // Primer cálculo del gauge de stock crítico al arrancar
  actualizarGaugeStockCritico();
  // Primer procesamiento de la cola al arrancar (por si quedaron pendientes)
  procesarColaPendiente();
});