# Original User Request

## Initial Request — 2026-10-13T03:43:03Z

Desarrollar una aplicación multimedia completa y autónoma para televisor Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56) que reproduzca películas, videos familiares, fotos y música directamente desde una carpeta privada de Google Drive mediante Service Account, con enriquecimiento selectivo de metadatos desde TMDB, soporte para subtítulos (integrados y externos .srt), transmisión fluida por fragmentos (HTTP Range 206) en la nube sin requerir una PC encendida, y accesible tanto por el navegador web del televisor como mediante un paquete nativo `.wgt`.

Working directory: c:\Users\musan\Documents\Proyectos\Multimedia_Drive
Integrity mode: development

## Requirements

### R1. Conector Cloud y Streaming Privado de Google Drive (Serverless)
- Autenticación segura mediante Google Cloud Service Account (`credentials.json`) para acceder únicamente a la carpeta compartida en Drive.
- Exploración recursiva de subcarpetas (`Películas`, `Series`, `Videos familiares`, `Fotos`, `Música`).
- Proxy de streaming en la nube con soporte estricto de `HTTP Range 206` para reproducción fluida de video y música pesados con capacidad de pausar, adelantar y retroceder sin demoras ni bloqueos de cuota.
- Detección y conversión automática de subtítulos externos (`.srt` / `.vtt`) con el mismo nombre de la película a formato estándar WebVTT, además de soporte para subtítulos incrustados en contenedores MKV/MP4.

### R2. Extracción Inteligente y Enriquecimiento de Metadatos (TMDB)
- Algoritmo de limpieza de nombres de archivos para aislar título y año (eliminando etiquetas técnicas como 1080p, x264, BluRay, etc.).
- Búsqueda en TMDB en español exclusivamente para contenido cinematográfico (`Películas`, `Series`), obteniendo carátula HD, fondo (backdrop), reparto de actores, director, sinopsis y calificación.
- Aislamiento explícito de carpetas como `Videos familiares` para no consultar TMDB y mostrar metadatos nativos de Drive (miniatura original, fecha, duración y título legible).

### R3. Interfaz de Usuario 10-Foot UI para Smart TV (Chromium M56 / Tizen 4.0)
- Frontend optimizado para pantalla 4K/1080p y distancia de visión de 3 metros, compatible con el motor Chromium M56 de Samsung Tizen 4.0.
- Motor de Navegación Espacial bidireccional (D-pad) compatible con el control remoto físico de Samsung (Flechas, Enter código 13, Return código 10009, Play/Pause).
- Vistas especializadas:
  - Catálogo principal con carruseles y foco luminoso.
  - Modal de película con póster, sinopsis, reparto y botón Reproducir.
  - Ficha de video familiar con fecha, detalles y reproducción directa.
  - Reproductor de video con barra de control temporal, selector de subtítulos y controles que se ocultan automáticamente.
  - Visor de fotos a pantalla completa con soporte de pase de diapositivas (*slideshow*).
  - Reproductor de audio con lista de pistas y carátula.

### R4. Doble Despliegue en TV Samsung (Navegador y Paquete Nativo .wgt)
- Configuración y assets para despliegue serverless gratuito en la nube (Vercel / Cloudflare) para acceso inmediato desde el navegador web del televisor.
- Manifiesto `config.xml`, icono de 117x117 y scripts para compilar el paquete nativo `.wgt` instalable en la memoria interna de la TV vía Modo Desarrollador (código 12345).

## Acceptance Criteria

### Funcionamiento de Streaming y Drive
- [ ] La API lista correctamente los archivos de subcarpetas privadas autenticadas con Service Account.
- [ ] La reproducción de video responde con cabecera `Accept-Ranges: bytes` y estado `206 Partial Content` ante peticiones parciales.
- [ ] Los subtítulos externos `.srt` son servidos como WebVTT válido accesible por el reproductor.

### Enriquecimiento de Metadatos
- [ ] Nombres complejos de películas son parseados extrayendo título y año correctos.
- [ ] Los archivos en la carpeta de cine muestran póster oficial, sinopsis en español y reparto de actores.
- [ ] Los archivos en la carpeta de videos familiares no disparan búsquedas en TMDB.

### Compatibilidad y Control Remoto
- [ ] El código frontend se compila sin sintaxis incompatible con Chromium 56 (ES5/ES6 compatible).
- [ ] Toda la navegación es 100% operable mediante teclado/D-pad con teclas de dirección, Enter y botón Return (10009).
- [ ] Se incluye el paquete Tizen con `config.xml` configurado con privilegios de red y teclado de TV.
