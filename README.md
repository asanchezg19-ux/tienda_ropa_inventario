# Sistema de Monitoreo y Observabilidad - Gestión de Inventario

Este módulo implementa el stack de observabilidad para nuestro Sistema de Gestión de Inventario de Tienda de Ropa. Donde el stock, los pedidos y las actualizaciones de catálogo ocurren en tiempo real, no basta con desplegar la aplicación; es obligatorio garantizar que toda la infraestructura sea reproducible y monitoreable a través de código.

## Alumna
* Sanchez Guzman Ana Cristina

---

## 1. Explicación de los Componentes del Stack

* **Prometheus:** Es el motor encargado de recolectar, almacenar y procesar métricas numéricas basadas en series temporales. Funciona mediante un modelo *pull*, haciendo consultas periódicas a los endpoints de la aplicación.
* **Loki:** Es un sistema de almacenamiento de logs optimizado horizontalmente y diseñado para ser altamente eficiente. A diferencia de otros sistemas, no indexa el contenido completo de los logs, sino las etiquetas, vinculando eficientemente las líneas de texto con las métricas de Prometheus.
* **Grafana Alloy:** Actúa como el agente recolector de datos y logs de última generación. Se encarga de capturar en tiempo real las salidas estándar y los logs formateados en JSON de nuestros contenedores para enviarlos de forma centralizada a Loki.
* **Grafana:** Es la capa unificada de visualización, análisis y alertas. Se conecta directamente a Prometheus y Loki como fuentes de datos para construir dashboards dinámicos y gestionar el ciclo de notificaciones cuando el sistema experimenta anomalías.

---

## 2. Instrucciones para Validar y Levantar el Trabajo

Para desplegar y verificar el stack completo de observabilidad de forma local, ejecute los siguientes pasos:

### Prerrequisitos
* Tener instalado **Docker** y **Docker Compose**.
* Verificar disponibilidad de los puertos correspondientes (`3000`, `3001`, `8080`, `9090`).

### Paso 1: Clonar y Desplegar
```bash
# Clonar el repositorio
git clone https://github.com/asanchezg19-ux/tienda_ropa_inventario
cd tienda_ropa_inventario

# Levantar el stack completo aprovisionado
docker compose up -d --build
```

### Paso 2: Verificar Contenedores Activos
Asegurarnos de que todos los servicios estén en estado ejecutando (`Up`):
```bash
docker compose ps
```

### Paso 3: URLs de Acceso Local
* **Frontend de Simulación:** [http://localhost:8080](http://localhost:8080)
* **Consola de Grafana:** [http://localhost:3000](http://localhost:3000) (Credenciales: `admin` / `admin`)
* **Servidor de Prometheus:** [http://localhost:9090](http://localhost:9090)

---

## 3. Respuestas al Cuestionario del Laboratorio

### 1. ¿Por qué necesitamos Loki además de Prometheus si ya tenemos `/metrics`?
Prometheus está estrictamente optimizado para **métricas de series temporales**. Sin embargo, las métricas no dicen por qué falló una transacción específica. **Loki es indispensable para almacenar logs**. Ambos se complementan: Prometheus detecta cuándo ocurre el problema y Loki te ayuda a diagnosticar qué lo causó.

### 2. ¿Qué ventaja aporta que las fuentes de datos de Grafana estén aprovisionadas como código y no creadas a mano?
Aporta consistencia, repetibilidad y elimina el error humano, principios fundamentales de la Infraestructura como Código. Si las fuentes se configuran manualmente desde la interfaz web, el entorno se vuelve propenso a fallas si el servidor se destruye o si necesitamos desplegar el sistema en entornos de Staging o Producción. 

### 3. El panel "CPU contenedor" y el panel "CPU host" pueden mostrar valores muy distintos. ¿Por qué? ¿Cuál usarías para alertar sobre una aplicación concreta?
Muestran valores distintos porque miden alcances diferentes:
* El **CPU del Contenedor** mide únicamente los recursos consumidos por el proceso aislado del backend dentro de sus límites asignados por Docker.
* El **CPU del Host** mide el consumo global de toda la máquina virtual o física.
* **Para alertar sobre una aplicación concreta (como nuestro sistema de inventario), usaría el CPU del Contenedor.** Si el contenedor se satura y se congela debido a una consulta pesada al catálogo de ropa, el CPU del Host podría marcar apenas un 15% si la máquina es grande, ocultando por completo el fallo crítico del servicio.

### 4. ¿Qué diferencia hay entre el `evaluation interval` y el `pending period` de una alarma?
* **Evaluation interval (Intervalo de evaluación):** Es la frecuencia con la que Grafana ejecuta la consulta de la regla contra la base de datos.
* **Pending period (Periodo de espera):** Es el tiempo de gracia continuo que la condición debe mantenerse activa antes de cambiar el estado de la alarma a disparada (`Firing`). Si el CPU supera el 50% por un pico de 5 segundos y luego baja, la alarma se descarta; pero si se mantiene alta durante los 30 segundos configurados en el periodo de espera, se confirma que es un problema real y se gatilla la notificación. Esto mitiga falsas alarmas provocadas por picos naturales de procesamiento.
