# Sistema de Gestión de Inventario - Tienda de Ropa Local
#### Curso de Infraestructura como Código

## Integrantes
* **Sanchez Guzman Ana Cristina** 
* **Mendoza Bacilio Brayan** 

---

## Visión General de la Solución
Nuestro proyecto implementa una aplicación web orientada a la nube diseñada para mitigar las problemáticas de control de stock, descuadres de inventario y ventas manuales en una tienda de ropa local. 

La solución aprovecha una **Arquitectura Serverless en AWS** para garantizar alta disponibilidad y automatización, eliminando errores humanos en el conteo de prendas. Cuenta con un módulo seguro para que el dueño modifique precios y revise indicadores financieros, aislando el acceso del personal de tienda, quienes únicamente registran ventas mediante un catálogo ágil y optimizado.

## Arquitectura
El entorno cuenta con un Stack completo de Observabilidad desplegado de forma declarativa mediante Docker Compose:
* **Backend & Frontend:** Microservicios elásticos para la gestión operativa.
* **SonarQube & PostgreSQL:** Pipeline local para el análisis estático de calidad de código.
* **Prometheus & Grafana:** Monitoreo en tiempo real de métricas, latencia de catálogo y alertas automáticas ante stock crítico (< 3 unidades).
* **Loki & Alloy:** Centralización de logs para auditoría y diagnóstico rápido ante fallos del sistema.

## Comandos de Despliegue Local
Para levantar todo el ecosistema de la tienda de ropa y monitoreo en segundo plano, ejecutamos:
```bash
docker compose up -d --build
```