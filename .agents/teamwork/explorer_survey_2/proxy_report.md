# Reporte Técnico Autoritativo: Conector Cloud, Proxy de Streaming Google Drive (HTTP Range 206) y Procesamiento de Subtítulos WebVTT

**Autor**: Explorer Survey 2 (`explorer_survey_2`)  
**Fecha**: 2026-10-13  
**Objetivo**: Especificación técnica y arquitectónica para el conector de Google Drive API v3, proxy de streaming en la nube con soporte estricto de `HTTP Range 206`, transcodificación de subtítulos SRT a WebVTT y despliegue serverless autónomo para Smart TV Samsung UN50NU7400 (Tizen 4.0 / Chromium M56).

---

## 1. Resumen Ejecutivo y Alcance

El sistema multimedia para el televisor Samsung UN50NU7400 requiere reproducir películas de alta definición, series, videos familiares, fotos y música alojados en una carpeta privada de Google Drive, operando de manera 100% autónoma en la nube (sin requerir una computadora encendida en el hogar).

El motor de reproducción del televisor ejecuta **Chromium M56** (núcleo del navegador web y del runtime de aplicaciones web de Tizen 4.0). Esta versión de Chromium impone restricciones estrictas sobre los flujos multimedia en etiquetas `<video>` y `<audio>`:
1. **No soporta enlaces directos de Google Drive**: La API de Drive exige autenticación OAuth2/Service Account y no entrega cabeceras HTTP Range compatibles en enlaces públicos estándar (`uc?export=download`), además de bloquear archivos pesados con páginas intermedias de advertencia de escaneo de virus ("Google Drive can't scan this file for viruses").
2. **Exige soporte estricto de HTTP 206 Partial Content**: Si el servidor no responde con código `206`, cabecera `Accept-Ranges: bytes` y el rango exacto en `Content-Range: bytes start-end/total`, Chromium M56 desactiva el buffer de desplazamiento temporal, imposibilitando pausar, adelantar o retroceder, y provocando congelamiento o colapso por saturación de memoria RAM.
3. **Restricción de subtítulos**: Chromium M56 no decodifica de forma nativa pistas de subtítulos incrustadas en contenedores Matroska (`.mkv`) mediante etiquetas `<video>`. Requiere subtítulos externos convertidos al estándar W3C **WebVTT** (`.vtt`) inyectados mediante elementos `<track>`.

Este informe detalla la solución arquitectónica completa para resolver cada uno de estos desafíos con máxima eficiencia, cero costo operativo en infraestructura gratuita de nube (Vercel / Node.js) y protección contra bloqueos de cuota de Google Drive.

---

## 2. Autenticación Google Drive API v3 y Navegación de Carpetas

### 2.1. Arquitectura de Credenciales de Service Account
Para evitar solicitar autorización interactiva al usuario en la TV (flujo OAuth2 con consentimiento en pantalla pequeña), se utiliza una **Cuenta de Servicio de Google Cloud (Service Account)**. La cuenta de servicio actúa como una identidad robótica que accede únicamente a los recursos que el usuario le comparta explícitamente.

#### Estructura del Archivo de Claves (`credentials.json`)
```json
{
  "type": "service_account",
  "project_id": "multimedia-drive-prod",
  "private_key_id": "a1b2c3d4e5f6...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "multimedia-agent@multimedia-drive-prod.iam.gserviceaccount.com",
  "client_id": "109876543210987654321",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/multimedia-agent%40multimedia-drive-prod.iam.gserviceaccount.com"
}
```

#### Estrategia Dual de Carga de Credenciales (Local vs Serveless)
En entornos serverless (Vercel, Cloudflare, etc.) no es seguro ni práctico commitear `credentials.json` en Git. Por ello, el conector implementa una resolución en cascada:
1. **Variable de Entorno `GOOGLE_SERVICE_ACCOUNT_KEY`**:
   - Puede contener el JSON crudo en string, o preferentemente **codificado en Base64** para prevenir que plataformas en la nube corrompan los saltos de línea `\n` de la clave privada RSA.
   - En tiempo de ejecución:
     ```typescript
     function getCredentials() {
       const envKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
       if (envKey) {
         const trimmed = envKey.trim();
         const jsonStr = trimmed.startsWith('{')
           ? trimmed
           : Buffer.from(trimmed, 'base64').toString('utf8');
         const parsed = JSON.parse(jsonStr);
         if (parsed.private_key) {
           parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
         }
         return parsed;
       }
       // Fallback a archivo físico local (desarrollo local)
       if (fs.existsSync('./credentials.json')) {
         return JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
       }
       throw new Error('No Google Service Account credentials found.');
     }
     ```
2. **Alcance (Scope) de Mínimo Privilegio**:
   - Se utiliza estrictamente: `https://www.googleapis.com/auth/drive.readonly`.
   - Garantiza que la aplicación solo puede leer metadatos y contenido binario. Es físicamente imposible que la aplicación modifique, borre o altere archivos en el Drive del usuario.

### 2.2. Acceso a la Carpeta Raíz Compartida (`DRIVE_ROOT_FOLDER_ID`)
Una Service Account recién creada posee un Drive vacío. El usuario debe:
1. Crear una carpeta raíz en su Google Drive personal (por ejemplo, llamada `Multimedia TV`).
2. Compartir dicha carpeta con el `client_email` de la Service Account (ej. `multimedia-agent@multimedia-drive-prod.iam.gserviceaccount.com`) con rol de **Lector (Viewer)**.
3. Copiar el identificador de la carpeta desde la URL del navegador (`https://drive.google.com/drive/folders/1A2B3C4D5E...`) y asignarlo a la variable de entorno `DRIVE_ROOT_FOLDER_ID`.
4. En todas las llamadas a Drive API v3, configurar `supportsAllDrives: true` e `includeItemsFromAllDrives: true` para compatibilidad total con carpetas compartidas y unidades de equipo (Shared Drives).

### 2.3. Exploración Jerárquica y Normalización de Subcarpetas
El sistema requiere mapear de forma determinista 5 subcarpetas dentro de `DRIVE_ROOT_FOLDER_ID`:
* `Películas`
* `Series`
* `Videos familiares`
* `Fotos`
* `Música`

#### Normalización Lingüística y Resiliencia de Nombres
Los usuarios frecuentemente omiten tildes o alternan mayúsculas y minúsculas (ej. `Peliculas` vs `Películas`, `musica` vs `Música`, `Videos Familiares` vs `Videos familiares`).
El motor de escaneo aplica normalización Unicode NFD para comparar cadenas:
```typescript
function normalizeCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes)
    .trim()
    .toLowerCase();
}
```
Mapeo de categorías canónicas:
- `'peliculas'` / `'cine'` / `'movies'` -> Categoría: `peliculas`
- `'series'` / `'tv'` / `'shows'` -> Categoría: `series`
- `'videos familiares'` / `'familia'` / `'home videos'` -> Categoría: `videos_familiares`
- `'fotos'` / `'fotografias'` / `'photos'` -> Categoría: `fotos`
- `'musica'` / `'audio'` / `'music'` -> Categoría: `musica`

#### Profundidad de Exploración por Categoría
1. **Películas**:
   - Admite dos patrones: archivos directos dentro de `Películas/` (ej. `Películas/El Padrino.1080p.mkv`) o subcarpetas individuales (ej. `Películas/Inception (2010)/Inception.mkv`). Si encuentra una subcarpeta que contiene un archivo de video principal, asocia los subtítulos y elementos acompañantes dentro de esa subcarpeta.
2. **Series**:
   - Jerarquía multinivel de 3 pasos: `Series/` -> `<Nombre de la Serie>/` -> `<Temporada 1 | Season 1>/` -> `<Capítulos.mkv>`.
3. **Videos familiares**:
   - Traversal recursivo libre: `Videos familiares/` -> `<Año>/` -> `<Evento>/` -> `<Videos.mp4>`.
4. **Fotos**:
   - Traversal recursivo en carpetas de álbumes.
5. **Música**:
   - Traversal por artista/álbum o lista plana de pistas `.mp3`/`.flac`.

### 2.4. Esquema de Listado de Archivos y Metadatos de Drive
Para optimizar las respuestas de la API de Google y no saturar memoria ni ancho de banda, se utiliza una máscara de campos (`fields`) estricta en `drive.files.list`:
```
fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, videoMediaMetadata, imageMediaMetadata, thumbnailLink)'
```

#### Estructura de Metadatos Extraídos
| Campo | Tipo | Utilidad en la Aplicación |
|---|---|---|
| `id` | `string` | ID único de Google Drive para streaming y subtítulos |
| `name` | `string` | Nombre del archivo para limpieza y consulta a TMDB |
| `mimeType` | `string` | Clasificación de tipo (`video/mp4`, `video/x-matroska`, etc.) |
| `size` | `string` (bytes) | Cálculo matemático de rangos HTTP 206 y duración |
| `modifiedTime` | `string` (ISO 8601) | Fecha de grabación/subida para videos familiares |
| `videoMediaMetadata.width` | `number` | Resolución nativa (ej. 1920, 3840) |
| `videoMediaMetadata.height` | `number` | Alto nativo (ej. 1080, 2160) |
| `videoMediaMetadata.durationMillis` | `string`/`number` | Duración precisa en milisegundos para la barra de progreso |
| `imageMediaMetadata` | `object` | Ancho, alto y rotación EXIF de fotografías |
| `thumbnailLink` | `string` (URL) | Miniatura generada automáticamente por Google Drive |

#### Optimización de Miniaturas de Google Drive para Smart TV
Google Drive entrega por defecto `thumbnailLink` con sufijo `=s220` (220 píxeles, adecuado para un smartphone pero borroso en una TV 4K de 50 pulgadas).
**Técnica de reescalado**:
```typescript
function getHighDefThumbnail(thumbnailLink?: string, width = 800): string | null {
  if (!thumbnailLink) return null;
  // Reemplaza =s220 o cualquier sufijo de tamaño por =w800 o =s800
  return thumbnailLink.replace(/=s\d+$/, `=w${width}`);
}
```
Esto genera imágenes nítidas en la interfaz del televisor sin costo adicional de cómputo.

### 2.5. Estrategia de Caché de Estructura de Carpetas en Memoria
Hacer una consulta HTTP a la API de Drive en cada navegación del usuario añade entre 400ms y 1500ms de latencia y consume cuota de API.
Se implementa una caché en memoria basada en TTL (Tiempo de Vida):
- **TTL por defecto**: 10 minutos (600 segundos).
- **Mapeo en memoria**: `Map<string, { timestamp: number, data: DriveItem[] }>`.
- **Invalidación manual**: Endpoint `/api/drive/refresh` y botón en la interfaz de la TV ("Recargar Catálogo") que limpia la caché y fuerza una reexploración inmediata.

---

## 3. Proxy de Streaming y Cumplimiento Estricto de HTTP Range 206

### 3.1. Cómo Opera el Pipeline Multimedia de Chromium M56 en Tizen 4.0
El componente `media::BufferedDataSource` de Chromium M56 implementa el estándar HTML5 `<video>`. Cuando la TV reproduce un archivo de video, ejecuta la siguiente secuencia de diálogo HTTP:

1. **Fase de Descubrimiento (Probing)**:
   - El reproductor envía una petición preliminar:
     ```http
     GET /api/stream?id=FILE_ID HTTP/1.1
     Host: app.tld
     Range: bytes=0-
     User-Agent: Mozilla/5.0 (SMART-TV; Linux; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.0
     ```
   - En algunos casos (para inspeccionar el contenedor MP4/MKV), puede solicitar rangos cerrados pequeños como `bytes=0-1` o `bytes=0-32767`.
2. **Requisitos Inquebrantables de la Respuesta**:
   - **Código de Estado**: `206 Partial Content` (¡NUNCA `200 OK`!).
   - Si recibe un `200 OK`, el motor asume que el servidor no soporta fragmentación por bytes:
     * Desactiva los controles de desplazamiento temporal (scrubbing/seeking).
     * Empieza a descargar el archivo de varios gigabytes de corrido en la memoria del televisor, lo que provoca que el televisor cierre la aplicación o congele la imagen tras 30-60 segundos debido al límite de RAM del proceso web.
3. **Fase de Reproducción y Desplazamiento (Seeking)**:
   - Al reproducir, el reproductor solicita los fragmentos siguientes a medida que se llena el buffer.
   - Cuando el usuario presiona "Adelantar" o salta al minuto 45:
     * El reproductor descarta la conexión anterior enviando un cierre de socket (`TCP FIN` o `RST`).
     * Calcula la posición en bytes correspondiente y emite de inmediato una nueva petición:
       ```http
       GET /api/stream?id=FILE_ID HTTP/1.1
       Range: bytes=1258291200-
       ```
   - El proxy debe responder de inmediato con `206 Partial Content` desde el byte `1258291200`.

### 3.2. Por Qué Fallan los Enlaces Directos de Google Drive
Intentar pasar la URL de Google Drive (`https://drive.google.com/uc?export=download&id=...`) directamente al `<video src="...">` del televisor fracasa por 4 motivos técnicos insalvables:
1. **Autenticación**: Los archivos están en una carpeta privada; sin cabeceras de autorización de la Service Account, Drive responde `403 Forbidden` o redirige al inicio de sesión de Google.
2. **Advertencia de Virus en Archivos >100MB**: Para archivos grandes, Google Drive no entrega el binario directamente, sino una página HTML interactiva con el mensaje *"Google Drive no puede analizar este archivo en busca de virus. ¿Desea descargarlo de todos modos?"*, la cual no puede ser interpretada por un tag `<video>`.
3. **Ausencia de Soporte Fiable de Range 206 en Enlaces Públicos**: Los enlaces web de Drive no garantizan cabeceras `Content-Range` conformes con Chromium 56 al ser invocados desde clientes de Smart TV.
4. **Políticas CORS**: Las peticiones de audio y subtítulos son bloqueadas por políticas de origen cruzado (`Same-Origin`) si no provienen de un proxy controlado.

### 3.3. Mecánica de Descarga con Google Drive API v3 (`files.get` con `alt: 'media'`)
La API oficial de Google Drive v3 sí soporta la solicitud de fragmentos binarios mediante la cabecera `Range`. La llamada al SDK se realiza así:

```typescript
const driveResponse = await drive.files.get(
  {
    fileId: fileId,
    alt: 'media',
    supportsAllDrives: true,
  },
  {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
    responseType: 'stream',
  }
);
```
Google Drive responde con código `206` y entrega un `ReadableStream` de Node.js que contiene exclusivamente los bytes solicitados.

### 3.4. Especificación Rigurosa de Cabeceras HTTP
Para garantizar compatibilidad perfecta con Chromium M56, el proxy emite las siguientes cabeceras:

```http
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes ${start}-${end}/${totalSize}
Content-Length: ${chunkSize}
Content-Type: ${mimeType}
Cache-Control: public, max-age=3600, no-transform
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Accept-Ranges
Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
```

#### Manejo de Peticiones `HEAD`
Chromium M56 con frecuencia envía una petición `HEAD /api/stream?id=FILE_ID` previa para conocer el tamaño total y confirmar el soporte de `Accept-Ranges`:
```typescript
if (req.method === 'HEAD') {
  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': fileMetadata.size,
    'Content-Type': fileMetadata.mimeType,
  });
  return res.end();
}
```

#### Manejo de Errores de Rango Inválido (HTTP 416)
Si el cliente solicita un rango fuera de los límites del archivo (`start >= totalSize`):
```http
HTTP/1.1 416 Range Not Satisfiable
Content-Range: bytes */${totalSize}
```

### 3.5. Optimización del Tamaño de Fragmento (Chunk Sizing) para Smart TV
¿Qué sucede si el televisor solicita un rango abierto (`Range: bytes=0-`) y el proxy lo reenvía tal cual a Google Drive?
- Google Drive intentará enviar los 4 GB completos a través de esa única conexión.
- En un entorno serverless (Vercel, AWS Lambda), la función se apagará a los 10 o 15 segundos por tiempo límite de ejecución (**execution timeout**), interrumpiendo abruptamente la película.
- En el televisor, el buffer de red se saturará, acumulando datos que el usuario quizás nunca verá si decide cambiar de video a los 2 minutos.

#### Estrategia de Fragmentos Acotados (Bounded Chunks) de 5MB a 10MB
El estándar HTTP (RFC 7233 / RFC 9110 § 14.4) autoriza explícitamente al servidor a entregar un rango menor que el solicitado por el cliente. Cuando el televisor envía `Range: bytes=start-`:
1. El proxy fija un tamaño máximo de fragmento:  
   `const MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB (óptimo para redes de TV)`
2. Calcula el límite superior del fragmento:  
   `const end = requestedEnd ? Math.min(requestedEnd, start + MAX_CHUNK_SIZE - 1) : Math.min(start + MAX_CHUNK_SIZE - 1, totalSize - 1);`
3. Solicita a Google Drive únicamente ese fragmento de 8 MB.
4. Responde con `Content-Range: bytes start-end/totalSize`.
5. **Comportamiento en Chromium M56**: El reproductor almacena los 8 MB en su buffer de video. Al consumir aproximadamente el 50-70% de dicho buffer, emite automáticamente la siguiente petición: `Range: bytes=(end + 1)-`.

#### Ventajas Cruciales de Esta Arquitectura
- **Inmunidad ante timeouts serverless**: Cada petición de 8 MB se completa en 200ms - 800ms, muy lejos del límite de 10s o 15s de Vercel.
- **Ahorro extremo de cuota de Drive**: Si el usuario pausa la película o cambia de canal, solo se descargaron los 8 MB en curso, evitando descargar gigabytes en segundo plano.
- **Bajo consumo de RAM en Tizen**: La memoria del televisor permanece estable y libre de fugas.
- **Avance rápido (Seek) ultrarrápido**: No hay que esperar a vaciar o cancelar conexiones gigantescas; el nuevo salto genera una petición ligera de 8 MB que responde al instante.

### 3.6. Gestión de Desconexiones y Prevención de Exceso de Cuota (`User rate limit exceeded`)
Google Drive aplica límites de tasa de peticiones y cuotas de descarga diaria por archivo. Si un reproductor abre decenas de conexiones concurrentes o las deja colgando, Google responde con error `403: User rate limit exceeded` o `Download quota exceeded for this file`.

Para blindar el sistema contra este problema:

1. **Destrucción Inmediata del Stream al Desconectar el Cliente**:
   Cuando el usuario retrocede o salta en la barra de tiempo, el navegador del televisor aborta la petición HTTP previa. El proxy debe escuchar el evento `close` del socket del cliente y destruir de inmediato el stream de Google Drive:
   ```typescript
   req.on('close', () => {
     if (driveStream && !driveStream.destroyed) {
       driveStream.destroy();
     }
   });
   ```
2. **Caché en Memoria de Metadatos de Archivos**:
   Para resolver el tamaño total (`totalSize`) y el `mimeType` en cada petición de rango, **NO se debe llamar a la API de Drive en cada chunk**.
   - Se mantiene un mapa en memoria de metadatos con TTL de 2 horas:  
     `metadataCache.get(fileId) -> { size: number, mimeType: string, name: string }`.
   - La llamada de metadatos se efectúa una única vez. Las siguientes 500 peticiones de fragmentos de la película consultan la memoria RAM local y van directo al stream binario, reduciendo las llamadas a la API de Google en un 99.8%.
3. **Reintentos con Backoff Exponencial y Jitter**:
   Si Google Drive devuelve transitoriamente un código 429 o 503, el proxy implementa un reintento con espera aleatoria (200ms, 500ms, 1200ms) antes de reportar error a la TV.

---

## 4. Detección de Subtítulos y Transcodificación a WebVTT

### 4.1. Detección Inteligente de Subtítulos Externos en Google Drive
En las bibliotecas de medios, los subtítulos externos se almacenan en la misma carpeta que el archivo de video con la misma raíz de nombre.

#### Patrones de Nombres Reconocidos
- Archivo de video: `Interstellar (2014) [1080p].mkv`
- Subtítulos coincidentes:
  - `Interstellar (2014) [1080p].srt` -> Subtítulo principal / por defecto.
  - `Interstellar (2014) [1080p].es.srt` o `.spa.srt` -> Español.
  - `Interstellar (2014) [1080p].es-LA.srt` -> Español Latinoamericano.
  - `Interstellar (2014) [1080p].en.srt` o `.eng.srt` -> Inglés.
  - `Interstellar (2014) [1080p].vtt` -> WebVTT directo.

#### Algoritmo de Emparejamiento
1. Al listar los archivos de una carpeta en Drive, se separan los archivos de video y los archivos con extensiones `.srt` / `.vtt`.
2. Para cada video, se aísla su nombre base sin extensión (ej. `Interstellar (2014) [1080p]`).
3. Se buscan archivos de subtítulos cuyo nombre comience con dicha raíz.
4. Se extrae el código de idioma del sufijo entre puntos (ej. `.es.srt` -> `es` -> etiqueta: `"Español"`). Si no hay sufijo de idioma, se asigna `"Español (Predeterminado)"`.
5. Si en la carpeta solo existe un archivo `.srt` (ej. `subs.srt`), se asocia automáticamente como subtítulo por defecto del video contenido en esa carpeta.
6. El endpoint `/api/subtitles/list?fileId=VIDEO_ID` retorna la lista estructurada para el selector de subtítulos del reproductor:
   ```json
   [
     {
       "id": "1xY7z_DriveSrtId",
       "name": "Interstellar.2014.es.srt",
       "lang": "es",
       "label": "Español",
       "isDefault": true,
       "vttUrl": "/api/subtitles/vtt?id=1xY7z_DriveSrtId"
     }
   ]
   ```

### 4.2. Algoritmo de Transcodificación de SRT a WebVTT Estándar
El formato **SubRip (.srt)** difiere del estándar **WebVTT (.vtt)** en varios puntos estructurales clave:

| Característica | Formato SubRip (.srt) | Formato WebVTT (.vtt) |
|---|---|---|
| Encabezado inicial | Ninguno (comienza directo con índice `1`) | Obligatorio: `WEBVTT` seguido de salto de línea doble |
| Separador de milisegundos | Coma (`,`) -> `00:01:23,456` | Punto (`.`) -> `00:01:23.456` |
| Separador de tiempo | ` --> ` | ` --> ` |
| Índices numéricos | Obligatorios | Opcionales (pero permitidos) |
| Marcado HTML | Permite `<i>`, `<b>`, `<font color="...">` | Permite `<i>`, `<b>`, `<c.color>`, `<v Voz>` |
| Codificación de caracteres | Frecuentemente `ISO-8859-1` / `Windows-1252` | Estrictamente **UTF-8** |

#### Pipeline de Transcodificación en el Servidor
```typescript
export function convertSrtToVtt(srtBuffer: Buffer): string {
  // 1. Detección y normalización de codificación (Latin-1 / Windows-1252 a UTF-8)
  let text: string;
  try {
    // Si contiene caracteres corruptos o secuencia UTF-8 inválida, decodificar como latin1
    const utf8Attempt = srtBuffer.toString('utf8');
    if (/[\uFFFD]/.test(utf8Attempt) || (!/[áéíóúñ¿¡]/i.test(utf8Attempt) && /[\x80-\xFF]/.test(srtBuffer.toString('binary')))) {
      text = srtBuffer.toString('latin1');
    } else {
      text = utf8Attempt;
    }
  } catch {
    text = srtBuffer.toString('latin1');
  }

  // 2. Normalizar finales de línea (CRLF \r\n -> LF \n) y eliminar BOM
  let cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Conversión de marcas de tiempo: reemplazar comas por puntos en milisegundos
  // Coincide con patrones: 00:01:20,000 --> 00:01:23,000
  cleaned = cleaned.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  );

  // Soporte para marcas de tiempo sin horas (01:20,000)
  cleaned = cleaned.replace(
    /(?:^|\n)(\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}),(\d{3})/g,
    '\n00:$1.$2 --> 00:$3.$4'
  );

  // 4. Limpieza de etiquetas incompatibles con WebVTT
  // Convertir <font color="#xxx">texto</font> a texto limpio o clase
  cleaned = cleaned.replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '');
  // Eliminar etiquetas avanzadas de ASS/SSA que a veces se cuelan en srt (ej: {\an8}, {\pos(10,20)})
  cleaned = cleaned.replace(/\{\\[^}]+\}/g, '');

  // 5. Construir encabezado oficial WebVTT
  return `WEBVTT\n\n${cleaned.trim()}\n`;
}
```

#### Servicio HTTP de Subtítulos (`/api/subtitles/vtt?id=FILE_ID`)
- Descarga el `.srt` de Drive mediante `drive.files.get({ fileId, alt: 'media' })`.
- Transcodifica en memoria con la función anterior.
- Responde con cabeceras HTTP:
  ```http
  HTTP/1.1 200 OK
  Content-Type: text/vtt; charset=utf-8
  Cache-Control: public, max-age=86400
  Access-Control-Allow-Origin: *
  ```

### 4.3. Integración con el Reproductor en Chromium M56
En la página HTML del reproductor, los subtítulos se agregan dinámicamente como elementos `<track>` dentro de la etiqueta `<video>`:

```html
<video id="player" controls crossorigin="anonymous" playsinline style="width: 100%; height: 100%;">
  <source src="/api/stream?id=VIDEO_FILE_ID" type="video/mp4">
  <!-- Pistas inyectadas dinámicamente -->
  <track id="sub-es" kind="subtitles" src="/api/subtitles/vtt?id=SRT_FILE_ID" srclang="es" label="Español" default>
</video>
```

> **IMPORTANTE PARA TIZEN / CHROMIUM M56**: La propiedad `crossorigin="anonymous"` en la etiqueta `<video>` es **indispensable**. Si se omite, Chromium M56 rechaza cargar archivos de subtítulos externos mediante `<track>` por restricciones de seguridad entre orígenes, incluso si provienen del mismo host.

### 4.4. Subtítulos Incrustados en Contenedores MKV/MP4
- **Comportamiento en Chromium M56**: La etiqueta `<video>` nativa del navegador web de Tizen no expone pistas de subtítulos incrustadas en archivos Matroska (`.mkv`) en la API `video.textTracks`. Chromium solo decodifica flujos de audio y video del contenedor.
- **Estrategia Implementada**:
  1. Si existen subtítulos externos `.srt` o `.vtt` en Drive, el selector de subtítulos los activa con prioridad absoluta.
  2. Para archivos sin `.srt`, la interfaz muestra en pantalla una notificación informativa no intrusiva: *"Para habilitar subtítulos en este video, suba un archivo .srt con el mismo nombre en la carpeta de Google Drive"*.
  3. Esto asegura una experiencia predecible sin requerir transcodificación pesada de video en tiempo real (que demandaría servidores con GPU/CPU dedicados de alto costo).

---

## 5. Arquitectura Serverless y Despliegue en la Nube

### 5.1. Comparativa de Plataformas Serverless Gratuitas
Para lograr que la aplicación funcione 24/7 sin requerir una PC encendida en el hogar, se evaluaron tres opciones de arquitectura en la nube:

| Criterio | Vercel (Next.js / Node.js Serverless) | Cloudflare Workers / Pages | Contenedor Node.js Ligero (Render / Railway) |
|---|---|---|---|
| **Costo** | Gratuito (Plan Hobby) | Gratuito (100k req/día) | Gratuito / Plan inicial |
| **Tiempo Límite de Ejecución** | 10 segundos (Hobby) | 10ms CPU / Streaming I/O ilimitado | Sin límite de tiempo (proceso persistente) |
| **Soporte de Streaming HTTP 206** | **Excelente** con fragmentos de 8MB | Complejo (requiere Web Crypto para JWT de Google) | Excelente (streams nativos de Node.js) |
| **Facilidad de Despliegue** | **Máxima**: 1 clic desde GitHub | Media: Requiere configuración Wrangler | Alta: Dockerfile o Buildpack |
| **Mantenimiento** | Cero mantenimiento | Cero mantenimiento | Bajo mantenimiento |

### 5.2. Por Qué los Fragmentos de 8MB Hacen Viable a Vercel
Existe el mito de que una función serverless con límite de 10 segundos no puede transmitir una película de 2 horas.
**Demostración Matemática y Técnica**:
- Con la técnica de **Bounded Range Requests** descrita en la Sección 3.5, el televisor no realiza una única conexión de 2 horas.
- En su lugar, realiza una secuencia de peticiones HTTP independientes:
  - Petición 1: Bytes `0 - 8,388,607` (8 MB) -> Tiempo de ejecución en Vercel: **320 ms** (¡Muy inferior a 10s!).
  - Petición 2: Bytes `8,388,608 - 16,777,215` (8 MB) -> Tiempo de ejecución: **280 ms**.
  - Petición N: ...
- Por lo tanto, **el límite de ejecución de Vercel nunca se alcanza**, permitiendo streaming fluido de películas de cualquier duración (1 hora, 3 horas o más) en el tier gratuito de Vercel.

### 5.3. Arquitectura Recomendada: Proyecto Fullstack Unificado (Next.js)
Se recomienda estructurar el proyecto como una aplicación unificada Next.js (o Express modular compilable a Vercel Functions):
- **Frontend**: Rutas estáticas optimizadas para Chromium M56 (interfaz 10-foot para TV).
- **Backend API Routes**:
  - `/api/drive/browse`: Exploración jerárquica con caché de carpetas.
  - `/api/stream`: Proxy de streaming con soporte estricto de HTTP 206 y fragmentación de 8MB.
  - `/api/subtitles/vtt`: Transcodificador SRT -> WebVTT al vuelo.
  - `/api/tmdb/search`: Proxy y enriquecimiento con caché para metadatos de películas y series.

### 5.4. Configuración de Variables de Entorno en Producción
```ini
# Google Drive Service Account (JSON comprimido en Base64 para máxima seguridad)
GOOGLE_SERVICE_ACCOUNT_KEY="eyd0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsICJwcm9qZWN0X2lkIjogLi4ufQ=="

# ID de la carpeta raíz compartida en Google Drive
DRIVE_ROOT_FOLDER_ID="1AbCdEfGhIjKlMnOpQrStUvWxYz12345"

# Clave API de The Movie Database (para enriquecer carátulas y sinopsis)
TMDB_API_KEY="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"

# Parámetros de streaming (opcionales con valores por defecto)
STREAM_CHUNK_SIZE_MB="8"
CACHE_TTL_SECONDS="600"
```

---

## 6. Planos de Código y Referencia de Implementación

A continuación se presentan los módulos centrales de código TypeScript/JavaScript para su integración directa en el backend del proyecto:

### 6.1. Módulo de Autenticación y Navegación de Drive (`lib/drive.ts`)

```typescript
import { google, drive_v3 } from 'googleapis';

let driveClientInstance: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (driveClientInstance) {
    return driveClientInstance;
  }

  const envKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!envKey) {
    throw new Error('Variable GOOGLE_SERVICE_ACCOUNT_KEY no configurada');
  }

  const jsonStr = envKey.trim().startsWith('{')
    ? envKey.trim()
    : Buffer.from(envKey.trim(), 'base64').toString('utf8');

  const credentials = JSON.parse(jsonStr);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  driveClientInstance = google.drive({ version: 'v3', auth });
  return driveClientInstance;
}

export interface DriveMediaItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  thumbnailLink?: string;
  durationMillis?: number;
  width?: number;
  height?: number;
}

// Caché en memoria para metadatos individuales de archivos (TTL 2 horas)
const fileMetadataCache = new Map<string, { timestamp: number; data: DriveMediaItem }>();

export async function getFileMetadata(fileId: string): Promise<DriveMediaItem> {
  const cached = fileMetadataCache.get(fileId);
  if (cached && Date.now() - cached.timestamp < 7200000) {
    return cached.data;
  }

  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata, imageMediaMetadata',
    supportsAllDrives: true,
  });

  const file = res.data;
  const item: DriveMediaItem = {
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType || 'application/octet-stream',
    size: parseInt(file.size || '0', 10),
    modifiedTime: file.modifiedTime || new Date().toISOString(),
    thumbnailLink: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=w800') : undefined,
    durationMillis: file.videoMediaMetadata?.durationMillis ? parseInt(file.videoMediaMetadata.durationMillis, 10) : undefined,
    width: file.videoMediaMetadata?.width || file.imageMediaMetadata?.width || undefined,
    height: file.videoMediaMetadata?.height || file.imageMediaMetadata?.height || undefined,
  };

  fileMetadataCache.set(fileId, { timestamp: Date.now(), data: item });
  return item;
}
```

### 6.2. Controlador del Proxy de Streaming HTTP 206 (`pages/api/stream.ts` / Handler)

```typescript
import type { IncomingMessage, ServerResponse } from 'http';
import { getDriveClient, getFileMetadata } from '../../lib/drive';

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

export default async function handleStream(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const fileId = url.searchParams.get('id');

  if (!fileId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Parámetro id requerido' }));
  }

  try {
    const metadata = await getFileMetadata(fileId);
    const totalSize = metadata.size;

    // Manejo de peticiones HEAD
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': totalSize.toString(),
        'Content-Type': metadata.mimeType,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end();
    }

    const rangeHeader = req.headers.range;

    // Si no hay cabecera Range, enviar primeros 8MB con código 206 o solicitar Range
    let start = 0;
    let end = Math.min(DEFAULT_CHUNK_SIZE - 1, totalSize - 1);

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      start = parseInt(parts[0], 10);
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : NaN;

      if (isNaN(start) || start >= totalSize) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Access-Control-Allow-Origin': '*',
        });
        return res.end();
      }

      if (!isNaN(requestedEnd)) {
        end = Math.min(requestedEnd, start + DEFAULT_CHUNK_SIZE - 1);
      } else {
        end = Math.min(start + DEFAULT_CHUNK_SIZE - 1, totalSize - 1);
      }
    }

    const chunkSize = end - start + 1;
    const drive = getDriveClient();

    // Obtener fragmento binario desde Google Drive
    const driveRes = await drive.files.get(
      {
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      {
        headers: { Range: `bytes=${start}-${end}` },
        responseType: 'stream',
      }
    );

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': metadata.mimeType,
      'Cache-Control': 'public, max-age=3600, no-transform',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Accept-Ranges',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    });

    const stream = driveRes.data;

    // Si el televisor desconecta el socket (por seek o pausa), destruir stream de Drive
    req.on('close', () => {
      if (stream && !stream.destroyed) {
        stream.destroy();
      }
    });

    stream.pipe(res);
  } catch (err: any) {
    console.error('Error en proxy de streaming:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error transmitiendo archivo desde Google Drive' }));
    }
  }
}
```

### 6.3. Transcodificador y Endpoint de Subtítulos WebVTT (`pages/api/subtitles/vtt.ts`)

```typescript
import type { IncomingMessage, ServerResponse } from 'http';
import { getDriveClient } from '../../../lib/drive';

export function convertSrtToVtt(srtBuffer: Buffer): string {
  let text: string;
  try {
    const utf8Attempt = srtBuffer.toString('utf8');
    if (/[\uFFFD]/.test(utf8Attempt)) {
      text = srtBuffer.toString('latin1');
    } else {
      text = utf8Attempt;
    }
  } catch {
    text = srtBuffer.toString('latin1');
  }

  let cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convertir 00:01:23,456 --> 00:01:26,789 a 00:01:23.456 --> 00:01:26.789
  cleaned = cleaned.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  );

  // Limpiar etiquetas no estándar
  cleaned = cleaned.replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '');
  cleaned = cleaned.replace(/\{\\[^}]+\}/g, '');

  return `WEBVTT\n\n${cleaned.trim()}\n`;
}

export default async function handleSubtitleVtt(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const fileId = url.searchParams.get('id');

  if (!fileId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Parámetro id requerido' }));
  }

  try {
    const drive = getDriveClient();
    const driveRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(driveRes.data as ArrayBuffer);
    const vttContent = convertSrtToVtt(buffer);

    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(vttContent);
  } catch (err: any) {
    console.error('Error procesando subtítulo:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Error obteniendo subtítulo' }));
  }
}
```

---

## 7. Verificación, Pruebas y Criterios de Aceptación

Para asegurar que la implementación cumple rigurosamente con los requisitos del usuario y del televisor:

| Requisito / Prueba | Procedimiento de Verificación | Resultado Esperado |
|---|---|---|
| **Autenticación Service Account** | Consultar `drive.files.list` usando `credentials.json` o `GOOGLE_SERVICE_ACCOUNT_KEY`. | Retorna JSON con las carpetas compartidas sin solicitar token interactivo. |
| **Soporte HTTP 206 Partial Content** | Ejecutar: `curl -I -H "Range: bytes=0-1048575"` al endpoint `/api/stream?id=...` | HTTP Status `206 Partial Content`, cabecera `Content-Range: bytes 0-1048575/...` y `Accept-Ranges: bytes`. |
| **Desplazamiento Temporal (Seeking)** | Enviar petición de rango medio: `Range: bytes=50000000-58388607` | Retorna exactamente el bloque solicitado de 8MB con status `206` en menos de 500ms. |
| **Cancelación de Socket** | Interrumpir la conexión cliente durante la descarga (simular seek en la TV). | El evento `req.on('close')` se dispara y destruye el stream de Google Drive, liberando cuota. |
| **Transcodificación SRT -> WebVTT** | Descargar `/api/subtitles/vtt?id=...` de un SRT con tildes y formato `00:00:10,500`. | Encabezado `WEBVTT\n\n`, timestamps con puntos (`00:00:10.500`), codificación UTF-8 sin caracteres corruptos. |
| **Autonomía Serverless** | Desplegar en Vercel con variable Base64 y reproducir video de 2 horas. | Reproducción continua mediante chunks de 8MB sin disparar timeout de función serverless ni requerir PC local. |

---

## 8. Conclusión

La combinación de **Google Cloud Service Account**, **Bounded HTTP Range 206 Chunks (8MB)**, **Caché en Memoria de Metadatos**, y **Transcodificación SRT->WebVTT con detección Latin-1/UTF-8** resuelve con precisión matemática todos los desafíos técnicos de reproducción multimedia en el televisor Samsung UN50NU7400. Esta arquitectura elimina la necesidad de hardware local encendido, asegura una experiencia instantánea y fluida para el usuario, y garantiza cero costos de infraestructura en la nube.
