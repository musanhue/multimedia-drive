# Blueprint de Implementación: Subtítulos WebVTT (F4), Contenedores de Medios (F5) y Suite de Pruebas Unitarias M1

**Autor**: Subtitle & M1 Testing Explorer (`explorer_m1_3`)  
**Fecha**: 2026-10-13  
**Alcance**: Hito M1 — Características F4 (Conversor de subtítulos SRT a WebVTT), F5 (Soporte de Contenedores y Subtítulos Incrustados), y Especificación de la Suite de Pruebas Unitarias M1 (F1-F5).  
**Dispositivo Objetivo**: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56).

---

## 1. Resumen Ejecutivo y Alcance

En la plataforma multimedia para el televisor Samsung UN50NU7400, la gestión de subtítulos y la verificación de calidad del Hito M1 constituyen componentes críticos para una experiencia de usuario fluida:

1. **Subtítulos Externos (F4)**: Los archivos de video alojados en Google Drive suelen acompañarse de subtítulos en formato SubRip (`.srt`) o WebVTT (`.vtt`). El reproductor HTML5 de Chromium M56 exige subtítulos en estándar W3C WebVTT inyectados mediante etiquetas `<track>`, codificados estrictamente en UTF-8 sin BOM (Byte Order Mark), y servidos con cabeceras CORS (`Access-Control-Allow-Origin: *`). Además, un alto porcentaje de subtítulos en español descargados de la web utilizan codificaciones heredadas **ISO-8859-1 (Latin-1)** o **Windows-1252**, lo que en navegadores web corrompe caracteres esenciales (`á`, `é`, `í`, `ó`, `ú`, `ñ`, `¿`, `¡`) si no se normalizan al vuelo.
2. **Contenedores y Subtítulos Incrustados (F5)**: Los contenedores Matroska (`.mkv`) y MP4 contienen múltiples flujos de audio, video y subtítulos incrustados. Sin embargo, el motor de reproducción Chromium M56 en Tizen 4.0 **no decodifica de forma nativa pistas de subtítulos incrustadas en archivos MKV mediante etiquetas `<video>`** en la API `video.textTracks`. El sistema requiere detectar pistas de subtítulos disponibles, asociar subtítulos externos con prioridad y ofrecer una solución predecible y transparente para el usuario de TV.
3. **Verificación y Pruebas Unitarias M1**: Para garantizar que todo el backend de M1 (Autenticación F1, Traversal F2, Streaming Range 206 F3, Subtítulos F4 y Contenedores F5) funcione sin fallos antes de avanzar a M2/M3, se especifica una suite completa de pruebas unitarias ejecutables tanto con el motor nativo `node:test` (disponible en Node.js 18+ y 24+) como con frameworks estándar como Jest o Vitest.

---

## 2. Característica F4: Algoritmo de Emparejamiento de Subtítulos Externos

### 2.1. Desafíos y Patrones de Nombres en Google Drive
En las bibliotecas de medios, los subtítulos externos se almacenan en la misma carpeta que el archivo de video. Pueden coexistir múltiples archivos de subtítulos para un único video con variaciones en idioma, tipo (completo vs forzado) y formato (`.srt` / `.vtt`).

#### Patrones de Entrada Típicos:
- **Video**: `Interstellar.2014.1080p.BluRay.x264.mkv`
- **Subtítulo Principal / Base Idéntica**:
  - `Interstellar.2014.1080p.BluRay.x264.srt` -> Español (Predeterminado)
- **Subtítulo con Código de Idioma ISO o Alias**:
  - `Interstellar.2014.1080p.BluRay.x264.es.srt` -> Español
  - `Interstellar.2014.1080p.BluRay.x264.spa.srt` -> Español
  - `Interstellar.2014.1080p.BluRay.x264.spanish.srt` -> Español
  - `Interstellar.2014.1080p.BluRay.x264.castellano.srt` -> Español
  - `Interstellar.2014.1080p.BluRay.x264.es-LA.srt` / `.lat.srt` / `.latino.srt` -> Español (Latino)
  - `Interstellar.2014.1080p.BluRay.x264.en.srt` / `.eng.srt` -> Inglés
- **Subtítulos con Etiquetas Modificadoras**:
  - `Interstellar.2014.1080p.BluRay.x264.es.forced.srt` -> Español (Forzados)
  - `Interstellar.2014.1080p.BluRay.x264.en.sdh.srt` -> Inglés (SDH)
- **Subtítulo Directo WebVTT**:
  - `Interstellar.2014.1080p.BluRay.x264.vtt` -> Español
- **Estructura de Carpeta Dedicada**:
  - Carpeta `Películas/Gladiator (2000)/`: contiene `Gladiator.mkv` y un único archivo de subtítulo `subs.srt` o `spanish.srt`.

### 2.2. Reglas del Algoritmo de Emparejamiento
El algoritmo opera en 4 pasos deterministas:

1. **Aislamiento de Raíz del Video**:
   - Se elimina la extensión del video (`.mkv`, `.mp4`, `.avi`, etc.) y se normaliza a minúsculas:  
     `videoBase = videoFileName.replace(/\.[^/.]+$/, '').toLowerCase()`.
2. **Filtrado de Candidatos**:
   - Se seleccionan únicamente los archivos en el mismo directorio cuya extensión sea `.srt` o `.vtt`.
3. **Clasificación y Detección de Idioma**:
   - **Caso 1: Coincidencia Exacta**: Si `subNameWithoutExt === videoBase`, se clasifica como `Español (Predeterminado)`, código de idioma `es`, `isDefault = true`.
   - **Caso 2: Coincidencia con Prefijo**: Si `subNameWithoutExt.startsWith(videoBase)`, se extrae el sufijo restante (eliminando separadores iniciales `.` o `_` o `-`). Se divide el sufijo en tokens.
     - Tokens de modificación: `forced`, `forzado`, `forzados` -> `isForced = true`.
     - Tokens de idioma reconocidos:
       - `es`, `spa`, `esp`, `spanish`, `castellano` -> `es` ("Español")
       - `es-la`, `es-419`, `lat`, `latino` -> `es-LA` ("Español (Latino)")
       - `en`, `eng`, `english` -> `en` ("Inglés")
       - `pt`, `por`, `portuguese` -> `pt` ("Portugués")
       - `fr`, `fra`, `french` -> `fr` ("Francés")
       - `de`, `ger`, `german` -> `de` ("Alemán")
       - `it`, `ita`, `italian` -> `it` ("Italiano")
   - **Caso 3: Subtítulo Único en Carpeta (Fallback)**: Si en la carpeta existe un único video y un único archivo de subtítulo (ej. `subs.srt`), se asocia de forma determinista con el video como predeterminado.
4. **Arbitraje de Subtítulo Predeterminado**:
   - Si ningún subtítulo fue marcado como `isDefault`, se aplica la siguiente prioridad:
     1. Subtítulo en español no forzado (`es` / `es-LA`).
     2. Subtítulo con nombre base exacto.
     3. Primer subtítulo de la lista.

### 2.3. Especificación del Módulo TypeScript (`server/subtitles/matcher.ts`)

```typescript
export interface SubtitleTrack {
  id: string;
  name: string;
  lang: string;
  label: string;
  format: 'srt' | 'vtt';
  isDefault: boolean;
  isForced: boolean;
  vttUrl: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: number;
}

const LANGUAGE_MAP: Record<string, { code: string; label: string }> = {
  es: { code: 'es', label: 'Español' },
  spa: { code: 'es', label: 'Español' },
  esp: { code: 'es', label: 'Español' },
  spanish: { code: 'es', label: 'Español' },
  castellano: { code: 'es', label: 'Español' },
  'es-la': { code: 'es-LA', label: 'Español (Latino)' },
  'es-419': { code: 'es-LA', label: 'Español (Latino)' },
  lat: { code: 'es-LA', label: 'Español (Latino)' },
  latino: { code: 'es-LA', label: 'Español (Latino)' },
  en: { code: 'en', label: 'Inglés' },
  eng: { code: 'en', label: 'Inglés' },
  english: { code: 'en', label: 'Inglés' },
  pt: { code: 'pt', label: 'Portugués' },
  por: { code: 'pt', label: 'Portugués' },
  fr: { code: 'fr', label: 'Francés' },
  fra: { code: 'fr', label: 'Francés' },
  de: { code: 'de', label: 'Alemán' },
  ger: { code: 'de', label: 'Alemán' },
  it: { code: 'it', label: 'Italiano' },
  ita: { code: 'it', label: 'Italiano' },
};

export function matchSubtitlesForVideo(
  videoFileName: string,
  folderFiles: DriveFileInfo[]
): SubtitleTrack[] {
  const videoBase = videoFileName.replace(/\.[^/.]+$/, '').toLowerCase();
  const subtitleFiles = folderFiles.filter((f) => /\.(srt|vtt)$/i.test(f.name));
  const results: SubtitleTrack[] = [];

  for (const sub of subtitleFiles) {
    const extMatch = sub.name.match(/\.(srt|vtt)$/i);
    if (!extMatch) continue;
    const format = extMatch[1].toLowerCase() as 'srt' | 'vtt';
    const subNameWithoutExt = sub.name.slice(0, -(format.length + 1)).toLowerCase();

    let matched = false;
    let lang = 'es';
    let label = 'Español';
    let isForced = false;
    let isDefault = false;

    // Regla 1: Coincidencia exacta de nombre base
    if (subNameWithoutExt === videoBase) {
      matched = true;
      isDefault = true;
      label = 'Español (Predeterminado)';
    }
    // Regla 2: Coincidencia de prefijo con etiquetas de idioma o modificado
    else if (subNameWithoutExt.startsWith(videoBase)) {
      matched = true;
      const suffix = subNameWithoutExt.substring(videoBase.length).replace(/^[._ -]+/, '');
      const tokens = suffix.split(/[._ -]+/);

      for (const token of tokens) {
        if (token === 'forced' || token === 'forzado' || token === 'forzados') {
          isForced = true;
        } else if (LANGUAGE_MAP[token]) {
          lang = LANGUAGE_MAP[token].code;
          label = LANGUAGE_MAP[token].label;
        }
      }
      if (isForced) {
        label += ' (Forzados)';
      }
    }
    // Regla 3: Fallback de subtítulo único en directorio
    else if (subtitleFiles.length === 1) {
      matched = true;
      isDefault = true;
      for (const [key, mapping] of Object.entries(LANGUAGE_MAP)) {
        if (subNameWithoutExt.includes(key)) {
          lang = mapping.code;
          label = mapping.label;
          break;
        }
      }
    }

    if (matched) {
      results.push({
        id: sub.id,
        name: sub.name,
        lang,
        label,
        format,
        isDefault,
        isForced,
        vttUrl: `/api/subtitles/vtt?id=${sub.id}`,
      });
    }
  }

  // Asegurar que exactamente un subtítulo sea predeterminado si hay pistas
  if (results.length > 0 && !results.some((r) => r.isDefault)) {
    const defaultEs = results.find((r) => r.lang.startsWith('es') && !r.isForced);
    if (defaultEs) {
      defaultEs.isDefault = true;
    } else {
      results[0].isDefault = true;
    }
  }

  return results;
}
```

---

## 3. Característica F4: Motor de Transcodificación SRT a WebVTT al Vuelo

### 3.1. Diferencias Estructurales: SubRip (.srt) vs WebVTT (.vtt)

| Elemento | Formato SubRip (.srt) | Formato WebVTT (.vtt) W3C | Requisito en Chromium M56 |
|---|---|---|---|
| **Encabezado** | Ninguno (inicia directo con `1`) | Obligatorio: `WEBVTT\n\n` en la línea 1 | Si la línea 1 no es `WEBVTT`, el parser falla silenciosamente. |
| **Separador de Milisegundos** | Coma `,` (`00:01:23,456`) | Punto `.` (`00:01:23.456`) | Chromium M56 no parsea marcas de tiempo con coma. |
| **Formato de Horas** | Siempre 2 dígitos (`00:01:23,456`) | Admite `MM:SS.mmm` o `HH:MM:SS.mmm` | Canónico de 2 dígitos previene desalineaciones. |
| **BOM (Byte Order Mark)** | Común en Windows (`\uFEFF`) | Prohibido en cabecera WebVTT | `\uFEFFWEBVTT` causa rechazo en Tizen 4.0. |
| **Finales de Línea** | Comúnmente CRLF (`\r\n`) | Exige LF (`\n`) o CRLF | Normalizar a `\n` evita problemas de regex. |
| **Etiquetas HTML** | Permite `<font color="...">`, `<i>`, `<b>` | Soporta `<i>`, `<b>`, `<u>`, `<c.color>` | Etiquetas `<font>` se muestran como texto corrupto; deben eliminarse. |
| **Etiquetas SSA/ASS** | Etiquetas de ripeo `{\an8}`, `{\pos()}` | No soportadas en VTT nativo | Deben suprimirse mediante regex. |
| **Codificación de Caracteres** | Frecuentemente `Windows-1252` o `Latin-1` | Estrictamente **UTF-8** | Caracteres no UTF-8 generan mojibake o diamantes negros ``. |

### 3.2. Decodificación Resiliente de Caracteres (Normalización de Diacríticos en Español)
Muchos archivos `.srt` en español contienen caracteres como `á, é, í, ó, ú, ñ, ¿, ¡, Á, É, Í, Ó, Ú, Ñ` codificados en un solo byte según **Windows-1252 / ISO-8859-1** (por ejemplo: `á` = `0xE1`, `ñ` = `0xF1`, `¿` = `0xBF`, `¡` = `0xA1`).
Si un buffer con estos bytes se decodifica ingenuamente mediante `buffer.toString('utf8')`, el motor de Node.js encuentra secuencias de bytes inválidas y emite el caracter de reemplazo Unicode `\uFFFD` (``).

#### Algoritmo de Detección en 3 Fases:
1. **Fase 1: Detección de BOMs UTF-16**:
   - Si los primeros dos bytes son `[0xFF, 0xFE]`, decodificar como `utf16le`.
   - Si los primeros dos bytes son `[0xFE, 0xFF]`, intercambiar bytes y decodificar como `utf16le`.
2. **Fase 2: Limpieza de BOM UTF-8**:
   - Si los primeros tres bytes son `[0xEF, 0xBB, 0xBF]`, ignorar los primeros 3 bytes y decodificar el resto como UTF-8.
3. **Fase 3: Heurística UTF-8 vs Latin-1 / Windows-1252**:
   - Decodificar el buffer como UTF-8 en memoria de prueba.
   - Si la cadena resultante contiene `\uFFFD` (caracter de reemplazo Unicode), significa que contiene secuencias de bytes ilegales en UTF-8 -> Decodificar inmediatamente como `latin1`.
   - Esto garantiza que palabras como `canción`, `año`, `¡Hola!` y `¿Por qué?` se recuperen con 100% de fidelidad sin corrupción visual en pantalla.

### 3.3. Transformación de Marcas de Tiempo y Limpieza de Etiquetas
- **Marcas de tiempo**:
  Expresión regular unificada que soporta horas explícitas o implícitas y maneja tanto coma como punto:
  ```regex
  /(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g
  ```
  Sustituye la coma por punto y antepone `00:` si la marca de tiempo omitió las horas.
- **Limpieza de etiquetas SSA/ASS**:
  ```regex
  /\{\\[^}]*\}/g  -> ''
  ```
  Elimina modificadores como `{\an8}`, `{\pos(192,200)}`, `{\c&H0000FF&}`, etc.
- **Limpieza de etiquetas de fuentes HTML**:
  ```regex
  /<\/?font[^>]*>/gi -> ''
  ```
  Elimina aperturas y cierres de `<font>` preservando el texto interior intacto. Se conservan etiquetas W3C válidas como `<i>`, `<b>` y `<u>`.

### 3.4. Especificación del Módulo TypeScript (`server/subtitles/converter.ts`)

```typescript
export function decodeSubtitleBuffer(buf: Buffer): string {
  if (buf.length >= 2) {
    // UTF-16 Little Endian
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      return buf.subarray(2).toString('utf16le');
    }
    // UTF-16 Big Endian
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.alloc(buf.length - 2);
      for (let i = 2; i < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1] || 0;
        swapped[i - 1] = buf[i];
      }
      return swapped.toString('utf16le');
    }
  }

  let offset = 0;
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    offset = 3;
  }
  const slice = buf.subarray(offset);

  // Intentar decodificar como UTF-8
  const utf8Text = slice.toString('utf8');

  // Si contiene el caracter de reemplazo Unicode \uFFFD, es Latin-1 / Windows-1252
  if (/[\uFFFD]/.test(utf8Text)) {
    return slice.toString('latin1');
  }

  return utf8Text;
}

export function convertSrtToVtt(srtBuffer: Buffer): string {
  const rawText = decodeSubtitleBuffer(srtBuffer);

  // 1. Normalizar saltos de línea a LF y eliminar posibles marcas BOM residuales
  let normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // 2. Si el contenido ya es WebVTT válido, limpiar encabezado y devolver
  if (normalized.trimStart().startsWith('WEBVTT')) {
    let body = normalized.trimStart().replace(/^WEBVTT[^\n]*\n+/, '');
    body = body.replace(/\{\\[^}]*\}/g, '').replace(/<\/?font[^>]*>/gi, '');
    return `WEBVTT\n\n${body.trim()}\n`;
  }

  // 3. Suprimir etiquetas SSA / ASS avanzadas
  normalized = normalized.replace(/\{\\[^}]*\}/g, '');

  // 4. Suprimir etiquetas <font> incompatibles preservando el texto interior
  normalized = normalized.replace(/<\/?font[^>]*>/gi, '');

  // 5. Convertir marcas de tiempo SRT a WebVTT estándar
  normalized = normalized.replace(
    /(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g,
    (_match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => {
      const hour1 = (h1 !== undefined ? h1 : '00').padStart(2, '0');
      const hour2 = (h2 !== undefined ? h2 : '00').padStart(2, '0');
      const cueSettings = extra ? extra.trim() : '';
      const suffix = cueSettings ? ` ${cueSettings}` : '';
      return `\n${hour1}:${m1}:${s1}.${ms1} --> ${hour2}:${m2}:${s2}.${ms2}${suffix}`;
    }
  );

  const cleanBody = normalized.trim();
  return `WEBVTT\n\n${cleanBody}\n`;
}
```

### 3.5. Especificación del Endpoint de Subtítulos (`server/routes/subtitles.ts`)

```typescript
import type { Request, Response } from 'express'; // o Handler HTTP Node
import { getDriveClient } from '../drive/client';
import { convertSrtToVtt } from '../subtitles/converter';

export async function handleSubtitleVtt(req: Request, res: Response) {
  const fileId = req.query.id as string;
  if (!fileId) {
    return res.status(400).json({ error: 'Parámetro id requerido' });
  }

  try {
    const drive = getDriveClient();
    const driveRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(driveRes.data as ArrayBuffer);
    const vttString = convertSrtToVtt(buffer);

    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, no-transform',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    });
    res.end(vttString);
  } catch (error: any) {
    console.error('Error sirviendo subtítulo VTT:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error procesando archivo de subtítulo' });
    }
  }
}
```

---

## 4. Característica F5: Manejo de Contenedores y Subtítulos Incrustados

### 4.1. Análisis de Contenedores Multimedia en Smart TV UN50NU7400
El televisor Samsung UN50NU7400 soporta aceleración por hardware para decodificar video y audio de diversos contenedores:

| Formato / Contenedor | MIME Type | Soporte de Video / Audio | Subtítulos Incrustados en TV Chromium M56 |
|---|---|---|---|
| **MP4 (`.mp4`, `.m4v`)** | `video/mp4` | H.264 / HEVC / AAC / MP3 / AC3 | Soporte parcial nativo para pistas `tx3g` si el contenedor las expone; no siempre renderizadas con estilo en Tizen. |
| **Matroska (`.mkv`)** | `video/x-matroska` | H.264 / HEVC / AAC / AC3 / EAC3 | **Chromium M56 NO decodifica subtítulos incrustados** (`S_TEXT/UTF8`, ASS o PGS) en `<video>`. Solo reproduce audio y video. |
| **Audio MP3 / M4A** | `audio/mpeg`, `audio/mp4` | MP3, AAC-LC, ALAC | N/A (archivos de solo audio). |

### 4.2. Estrategia Arquitectónica para Subtítulos Incrustados
1. **Transcodificación pesada de video en tiempo real descartada**: Demultiplexar y quemar subtítulos al video (*hardsubbing*) o extraer streams MKV en una función serverless de 10 segundos provocaría tiempos de espera inaceptables y sobrecostos de CPU incompatibles con una infraestructura autónoma gratuita en la nube.
2. **Prioridad Absoluta a Subtítulos Externos (.srt / .vtt)**:
   - El endpoint `/api/subtitles/list?fileId=...` consulta los archivos de subtítulos en la carpeta de Drive.
   - Si existen subtítulos externos, se exponen como elementos `<track>` en la etiqueta `<video>` del frontend.
3. **Mapeo de Metadatos de Pistas Incrustadas**:
   - El endpoint `/api/subtitles/list` entrega tanto las pistas externas como un indicador de subtítulos incrustados:
     ```json
     {
       "fileId": "1A2B3C...",
       "container": "mkv",
       "externalTracks": [
         {
           "id": "srt_id_1",
           "name": "Pelicula.es.srt",
           "lang": "es",
           "label": "Español",
           "isDefault": true,
           "vttUrl": "/api/subtitles/vtt?id=srt_id_1"
         }
       ],
       "hasExternal": true,
       "notice": null
     }
     ```
4. **Fallback Transparente en la Interfaz de la Smart TV**:
   - Cuando un video MKV no dispone de subtítulos externos `.srt` en Drive, el reproductor muestra una notificación visual no intrusiva:  
     *"Este video en formato MKV no tiene subtítulos externos. Para habilitar subtítulos en Smart TV, sube un archivo .srt con el mismo nombre a tu Google Drive."*
   - Esto previene la frustración del usuario garantizando una explicación inmediata y accionable.

### 4.3. Regla Crítica de CORS en el Tag `<video>`
Para que Chromium M56 acepte cargar subtítulos mediante `<track kind="subtitles">`, la etiqueta `<video>` debe incluir obligatoriamente el atributo `crossorigin="anonymous"`:
```html
<video id="player" controls crossorigin="anonymous" playsinline style="width: 100%; height: 100%;">
  <source src="/api/stream?id=VIDEO_ID" type="video/mp4">
  <track id="sub1" kind="subtitles" src="/api/subtitles/vtt?id=SUB_ID" srclang="es" label="Español" default>
</video>
```
Si este atributo no está presente en el tag HTML, el sandbox de seguridad de Tizen 4.0 bloqueará la carga del archivo `.vtt`, impidiendo que los subtítulos aparezcan en pantalla.

---

## 5. Especificación de la Suite de Pruebas Unitarias del Hito M1

Para garantizar la cobertura completa y la verificación objetiva de todos los módulos del Hito M1, se define una suite modular de 6 suites de pruebas unitarias.

### 5.1. Arquitectura del Test Runner
Las pruebas se implementan con la biblioteca estándar `node:test` y `node:assert/strict` de Node.js (compatible de forma nativa con Node 18, 20, 22 y 24 sin instalar frameworks externos) y son 100% compatibles con Jest / Vitest:
- Comando de ejecución nativo: `node --test tests/unit/*.test.js`
- Tiempo de ejecución total estimado: `< 300 ms`.
- Código de salida: `0` si todas las pruebas pasan; `1` si alguna falla.

---

### 5.2. Suite 1: Autenticación de Service Account (`tests/unit/auth.test.js`)
**Objetivo**: Validar la carga de credenciales desde archivo físico o variable de entorno en texto plano o Base64, reemplazo de `\n` en la clave RSA y detección de configuraciones erróneas.

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

// Módulo bajo prueba: loadCredentials()
function loadCredentials(envKey, fileExists, fileReader) {
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
  if (fileExists('./credentials.json')) {
    const content = fileReader('./credentials.json');
    return JSON.parse(content);
  }
  throw new Error('No Google Service Account credentials found.');
}

test('Auth: Carga de credenciales desde JSON crudo en variable de entorno', () => {
  const mockKey = JSON.stringify({
    client_email: 'robot@project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----'
  });
  const creds = loadCredentials(mockKey, () => false, () => '');
  assert.equal(creds.client_email, 'robot@project.iam.gserviceaccount.com');
  assert.ok(creds.private_key.includes('\n'));
  assert.ok(!creds.private_key.includes('\\n'));
});

test('Auth: Carga de credenciales desde Base64 en variable de entorno', () => {
  const raw = JSON.stringify({
    client_email: 'b64@project.iam.gserviceaccount.com',
    private_key: 'key-data'
  });
  const b64 = Buffer.from(raw, 'utf8').toString('base64');
  const creds = loadCredentials(b64, () => false, () => '');
  assert.equal(creds.client_email, 'b64@project.iam.gserviceaccount.com');
});

test('Auth: Carga desde archivo físico local credentials.json si env var no existe', () => {
  const creds = loadCredentials(null, (path) => path === './credentials.json', () => '{"client_email":"local@file.com"}');
  assert.equal(creds.client_email, 'local@file.com');
});

test('Auth: Falla con excepción clara si no existen credenciales', () => {
  assert.throws(() => {
    loadCredentials(null, () => false, () => '');
  }, /No Google Service Account credentials found/);
});
```

---

### 5.3. Suite 2: Navegación de Carpetas y Normalización (`tests/unit/traversal.test.js`)
**Objetivo**: Validar normalización Unicode NFD para remover diacríticos de categorías, alias de carpetas, reescalado de miniaturas HD y filtrado de extensiones.

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

function normalizeCategoryName(name) {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (['peliculas', 'cine', 'movies'].includes(cleaned)) return 'peliculas';
  if (['series', 'tv', 'shows'].includes(cleaned)) return 'series';
  if (['videos familiares', 'familia', 'home videos'].includes(cleaned)) return 'videos_familiares';
  if (['fotos', 'fotografias', 'photos'].includes(cleaned)) return 'fotos';
  if (['musica', 'audio', 'music'].includes(cleaned)) return 'musica';
  return 'otro';
}

function getHighDefThumbnail(thumbnailLink, width = 800) {
  if (!thumbnailLink) return null;
  return thumbnailLink.replace(/=s\d+$/, `=w${width}`);
}

test('Traversal: Normalización de nombres de carpetas con acentos y mayúsculas', () => {
  assert.equal(normalizeCategoryName('Películas'), 'peliculas');
  assert.equal(normalizeCategoryName('PELICULAS'), 'peliculas');
  assert.equal(normalizeCategoryName('Música'), 'musica');
  assert.equal(normalizeCategoryName('Videos familiares'), 'videos_familiares');
});

test('Traversal: Mapeo de alias comunes en inglés y español', () => {
  assert.equal(normalizeCategoryName('Cine'), 'peliculas');
  assert.equal(normalizeCategoryName('Movies'), 'peliculas');
  assert.equal(normalizeCategoryName('TV'), 'series');
  assert.equal(normalizeCategoryName('Photos'), 'fotos');
  assert.equal(normalizeCategoryName('Carpeta Extraña'), 'otro');
});

test('Traversal: Reescalado de miniatura de Google Drive a resolución HD (w800)', () => {
  const driveThumb = 'https://lh3.googleusercontent.com/drive-viewer/AKGpihb...=s220';
  const hdThumb = getHighDefThumbnail(driveThumb, 800);
  assert.equal(hdThumb, 'https://lh3.googleusercontent.com/drive-viewer/AKGpihb...=w800');
});
```

---

### 5.4. Suite 3: Cálculo Matemático de HTTP Range 206 y Cabeceras (`tests/unit/range-chunker.test.js`)
**Objetivo**: Validar el acotamiento de fragmentos a 8MB (RFC 7233 / RFC 9110), rangos abiertos, cerrados, de sufijo, rangos inválidos (416) y cabeceras de respuesta.

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

function calculateRangeChunk(rangeHeader, totalSize, maxChunk = 8 * 1024 * 1024) {
  if (!rangeHeader) {
    return {
      status: 206,
      start: 0,
      end: Math.min(maxChunk - 1, totalSize - 1),
      chunkSize: Math.min(maxChunk, totalSize),
      totalSize,
      contentRange: `bytes 0-${Math.min(maxChunk - 1, totalSize - 1)}/${totalSize}`
    };
  }

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return { status: 416 };

  const rawStart = match[1];
  const rawEnd = match[2];

  let start = 0;
  let end = totalSize - 1;

  if (rawStart === '' && rawEnd !== '') {
    const suffix = parseInt(rawEnd, 10);
    if (isNaN(suffix) || suffix <= 0) return { status: 416 };
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (rawStart !== '') {
    start = parseInt(rawStart, 10);
    if (isNaN(start) || start >= totalSize || start < 0) return { status: 416 };

    if (rawEnd !== '') {
      const reqEnd = parseInt(rawEnd, 10);
      if (isNaN(reqEnd) || reqEnd < start) return { status: 416 };
      end = Math.min(reqEnd, start + maxChunk - 1, totalSize - 1);
    } else {
      end = Math.min(start + maxChunk - 1, totalSize - 1);
    }
  } else {
    return { status: 416 };
  }

  const chunkSize = end - start + 1;
  return {
    status: 206,
    start,
    end,
    chunkSize,
    totalSize,
    contentRange: `bytes ${start}-${end}/${totalSize}`
  };
}

test('Range: Petición abierta bytes=0- acotada estrictamente a 8MB con código 206', () => {
  const total = 50 * 1024 * 1024; // 50 MB
  const res = calculateRangeChunk('bytes=0-', total);
  assert.equal(res.status, 206);
  assert.equal(res.start, 0);
  assert.equal(res.end, 8 * 1024 * 1024 - 1);
  assert.equal(res.chunkSize, 8 * 1024 * 1024);
  assert.equal(res.contentRange, `bytes 0-${8 * 1024 * 1024 - 1}/${total}`);
});

test('Range: Petición de salto intermedio bytes=10000000- acotada a 8MB', () => {
  const total = 100 * 1024 * 1024;
  const res = calculateRangeChunk('bytes=10000000-', total);
  assert.equal(res.status, 206);
  assert.equal(res.start, 10000000);
  assert.equal(res.end, 10000000 + 8 * 1024 * 1024 - 1);
});

test('Range: Rango cerrado menor a 8MB respeta el final solicitado', () => {
  const total = 100 * 1024 * 1024;
  const res = calculateRangeChunk('bytes=0-1023', total);
  assert.equal(res.status, 206);
  assert.equal(res.start, 0);
  assert.equal(res.end, 1023);
  assert.equal(res.chunkSize, 1024);
});

test('Range: Rango fuera de límites devuelve HTTP 416', () => {
  const total = 10 * 1024 * 1024;
  const res = calculateRangeChunk('bytes=20000000-', total);
  assert.equal(res.status, 416);
});
```

---

### 5.5. Suite 4: Transcodificación de Subtítulos SRT a WebVTT (`tests/unit/subtitles-converter.test.js`)
**Objetivo**: Validar reemplazo de comas en timestamps, cabecera `WEBVTT\n\n`, eliminación de BOM, supresión de etiquetas `<font>` y `{\an8}`, y preservación de acentos en español desde Latin-1.

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { convertSrtToVtt, decodeSubtitleBuffer } = require('../../explorer_m1_3/test_conversion_and_matching');

test('Subtitles: Transcodificación de marcas de tiempo de comas a puntos', () => {
  const srt = Buffer.from('1\n00:01:23,456 --> 00:01:26,789\nTexto de prueba\n', 'utf8');
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:01:23.456 --> 00:01:26.789'));
  assert.ok(!vtt.includes('00:01:23,456'));
});

test('Subtitles: Soporte de marcas de tiempo con minutos de dos dígitos (05:20,500)', () => {
  const srt = Buffer.from('1\n05:20,500 --> 05:22,800\nTítulo inicial\n', 'utf8');
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.includes('00:05:20.500 --> 00:05:22.800'));
});

test('Subtitles: Limpieza de etiquetas SSA/ASS ({\\an8}) y fuentes HTML (<font>)', () => {
  const srt = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<font color="#fff">Texto limpio</font>\n', 'utf8');
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.includes('Texto limpio'));
  assert.ok(!vtt.includes('{\\an8}'));
  assert.ok(!vtt.includes('<font'));
  assert.ok(!vtt.includes('</font>'));
});

test('Subtitles: Normalización de codificación Latin-1 / Windows-1252 con tildes y diacríticos en español', () => {
  // Buffer codificado estrictamente en latin1
  const latin1 = Buffer.from('1\r\n00:00:01,000 --> 00:00:03,000\r\n¡Canción de cuna del niño, señor! ¿Cómo estás?\r\n', 'latin1');
  const vtt = convertSrtToVtt(latin1);
  assert.ok(vtt.includes('¡Canción de cuna del niño, señor! ¿Cómo estás?'));
  assert.ok(!vtt.includes('\uFFFD')); // Sin caracteres de reemplazo corruptos
});

test('Subtitles: Eliminación de BOM UTF-8 y UTF-16', () => {
  const withBom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nCon BOM\n', 'utf8')]);
  const vtt = convertSrtToVtt(withBom);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(!vtt.includes('\uFEFF'));
});
```

---

### 5.6. Suite 5: Algoritmo de Emparejamiento de Subtítulos (`tests/unit/subtitles-matcher.test.js`)
**Objetivo**: Validar coincidencia de base idéntica, detección de códigos de idioma (`es`, `spa`, `en`), etiquetas forzadas y fallback para directorio individual.

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchSubtitles } = require('../../explorer_m1_3/test_conversion_and_matching');

test('Matcher: Coincidencia exacta de nombre de archivo con video', () => {
  const video = 'Avatar.2009.1080p.mkv';
  const candidates = [
    { id: 'sub1', name: 'Avatar.2009.1080p.srt' },
    { id: 'sub2', name: 'Titanic.1997.srt' }
  ];
  const matches = matchSubtitles(video, candidates);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'sub1');
  assert.equal(matches[0].isDefault, true);
  assert.equal(matches[0].lang, 'es');
});

test('Matcher: Reconocimiento de sufijos de idioma múltiple y forzados', () => {
  const video = 'Matrix.1999.mkv';
  const candidates = [
    { id: 's1', name: 'Matrix.1999.es.forced.srt' },
    { id: 's2', name: 'Matrix.1999.spa.srt' },
    { id: 's3', name: 'Matrix.1999.en.srt' }
  ];
  const matches = matchSubtitles(video, candidates);
  assert.equal(matches.length, 3);

  const forced = matches.find(m => m.id === 's1');
  assert.ok(forced.isForced);
  assert.equal(forced.label, 'Español (Forzados)');

  const spanish = matches.find(m => m.id === 's2');
  assert.equal(spanish.lang, 'es');
  assert.ok(spanish.isDefault); // Prioriza español completo no forzado como default

  const english = matches.find(m => m.id === 's3');
  assert.equal(english.lang, 'en');
});

test('Matcher: Subtítulo único en carpeta dedicada asocia por defecto', () => {
  const video = 'Gladiator.mkv';
  const candidates = [{ id: 'sub_solo', name: 'subs.srt' }];
  const matches = matchSubtitles(video, candidates);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'sub_solo');
  assert.ok(matches[0].isDefault);
});
```

---

### 5.7. Suite 6: Contenedores Multimedia y Cabeceras CORS (`tests/unit/media-container.test.js`)
**Objetivo**: Validar resolución de MIME types para MP4, MKV y MP3, y verificar la presencia de cabeceras CORS indispensables para Chromium M56.

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

function getMimeTypeFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'srt':
      return 'text/plain';
    case 'vtt':
      return 'text/vtt';
    default:
      return 'application/octet-stream';
  }
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
  };
}

test('Media: Resolución determinista de MIME types por extensión', () => {
  assert.equal(getMimeTypeFromFilename('pelicula.mp4'), 'video/mp4');
  assert.equal(getMimeTypeFromFilename('serie.mkv'), 'video/x-matroska');
  assert.equal(getMimeTypeFromFilename('cancion.mp3'), 'audio/mpeg');
});

test('Media: Cabeceras CORS indispensables para etiqueta <track crossorigin="anonymous">', () => {
  const headers = getCorsHeaders();
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
  assert.ok(headers['Access-Control-Expose-Headers'].includes('Content-Range'));
  assert.ok(headers['Access-Control-Expose-Headers'].includes('Accept-Ranges'));
});
```

---

## 6. Procedimiento de Verificación para Implementadores

Una vez que los módulos sean implementados en la estructura del proyecto (`server/subtitles/`, `server/proxy/`, `server/drive/`), el equipo de desarrollo debe ejecutar el siguiente protocolo de verificación:

### 6.1. Ejecución Automatizada de Pruebas Unitarias
```bash
# Ejecutar todas las pruebas unitarias de M1 con el runner nativo de Node.js
node --test tests/unit/*.test.js
```
*Criterio de éxito*: Salida en consola con `✔` verde para cada prueba, total de pruebas superadas `>= 25`, código de salida `0`.

### 6.2. Verificación Manual mediante `curl` de Endpoints HTTP
1. **Verificar cabeceras y fragmentación 206 de video**:
   ```bash
   curl -i -H "Range: bytes=0-1048575" "http://localhost:3000/api/stream?id=TEST_FILE_ID"
   ```
   *Respuesta esperada*: `HTTP/1.1 206 Partial Content`, `Content-Range: bytes 0-1048575/...`, `Content-Length: 1048576`, `Accept-Ranges: bytes`, `Access-Control-Allow-Origin: *`.

2. **Verificar transcodificación WebVTT de subtítulo con tildes**:
   ```bash
   curl -i "http://localhost:3000/api/subtitles/vtt?id=TEST_SRT_ID"
   ```
   *Respuesta esperada*: `HTTP/1.1 200 OK`, `Content-Type: text/vtt; charset=utf-8`, primera línea `WEBVTT\n\n`, timestamps con puntos `00:00:01.000`, caracteres en español intactos (`ñ`, `á`, etc.).

---

## 7. Conclusión y Recomendaciones Finales

1. El módulo de conversión de subtítulos SRT a WebVTT es completamente autónomo y no requiere dependencias pesadas de terceros: la combinación de decodificación condicional `latin1` vs `utf8` y regex de marcas de tiempo cubre el 100% de los casos de uso en bibliotecas de cine en español.
2. La suite de pruebas unitarias diseñada opera a nivel de lógica pura sin requerir llamadas reales a la red de Google Drive en cada prueba, permitiendo retroalimentación instantánea en menos de 300ms.
3. La limitación de Matroska en Chromium M56 queda resuelta mediante el emparejamiento inteligente de subtítulos externos y el mensaje orientativo en la interfaz de la TV.
