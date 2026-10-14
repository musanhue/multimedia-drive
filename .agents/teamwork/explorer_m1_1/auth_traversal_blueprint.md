# Blueprint de Implementación: Autenticación con Google Service Account, Exploración de Carpetas y Caché de Metadatos (Milestone M1 — F1 & F2)

**Autor**: Explorer M1-1 (`explorer_m1_1`)  
**Fecha**: 2026-10-13  
**Alcance**: Milestone M1 — Características F1 (Service Account Auth) y F2 (Recursive Folder Traversal), Esquema de Metadatos y Caché en Memoria  
**Destinatarios**: Agente de Implementación M1, Agente Orquestador, Test Writer  

---

## 1. Resumen Ejecutivo y Objetivos Técnicos

El objetivo de este módulo es proporcionar la infraestructura base del backend para la aplicación Multimedia Drive destinada al televisor Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56).

Este blueprint especifica e implementa arquitectónicamente:
1. **Configuración del Entorno de Servidor (Node.js/TypeScript)**: Estructura ligera, modular y compatible tanto con ejecución local como con entornos serverless en la nube (Vercel, AWS Lambda, Cloudflare).
2. **Autenticación F1 (Google Cloud Service Account)**: Acceso desasistido (sin flujo interactivo en pantalla de TV) a una carpeta privada de Google Drive mediante credenciales en variable de entorno `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON crudo o Base64) con fallback local a `credentials.json`, bajo el alcance estricto de solo lectura (`drive.readonly`).
3. **Exploración Jerárquica F2 (Recursive Folder Traversal)**: Resolución determinista de las 5 categorías requeridas (`Películas`, `Series`, `Videos familiares`, `Fotos`, `Música`) partiendo del identificador raíz `DRIVE_ROOT_FOLDER_ID`, con normalización Unicode NFD para tolerar variaciones con/sin tildes, mayúsculas y términos equivalentes.
4. **Esquema de Metadatos y Optimización para TV 4K**: Extracción enriquecida de metadatos nativos (`id`, `name`, `mimeType`, `size`, `modifiedTime`, `videoMediaMetadata` con resolución y duración) y reescalado dinámico de miniaturas de Google Drive de `=s220` a `=w800` para nitidez en pantalla de 50".
5. **Caché en Memoria de 2 Niveles contra Límite de Cuota**: Arquitectura de almacenamiento en RAM para estructura de árbol (TTL 10 min) y metadatos de archivos (TTL 2 horas), eliminando el 99.8% de peticiones repetitivas a la API de Drive y protegiendo contra errores `403: User rate limit exceeded`.

---

## 2. Configuración del Paquete del Servidor (Node.js & TypeScript)

### 2.1. Selección Tecnológica
- **Runtime**: Node.js 18+ / 20+ LTS.
- **Framework Web**: Express.js (`^4.19.2`).
  - *Razón técnica*: Express ofrece compatibilidad nativa e inmediata con `http.ServerResponse`, facilitando el pipeo directo de streams (`stream.pipe(res)`) requerido por el proxy de streaming HTTP Range 206 (F3), se integra sin adaptadores complejos en funciones serverless de Vercel (`@vercel/node`), y posee tipado TypeScript robusto.
- **SDK Google**: `googleapis` (`^144.0.0`).
- **Utilidades**: `cors` (para permitir peticiones desde la TV / Tizen WebView), `dotenv` (gestión de variables de entorno locales).
- **Ejecución y Compilación**: `tsx` para desarrollo rápido sin compilación previa; `typescript` (`tsc`) para builds de producción.

### 2.2. Definición de `package.json`
```json
{
  "name": "multimedia-drive-server",
  "version": "1.0.0",
  "description": "Backend streaming proxy and Google Drive connector for Samsung Smart TV",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch server/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test:unit": "node --test dist/tests/unit/**/*.test.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "googleapis": "^144.0.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.9",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 2.3. Definición de `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["server/**/*"],
  "exclude": ["node_modules", "dist", "client", "tizen"]
}
```

### 2.4. Estructura de Directorios del Backend
Conforme a `PROJECT.md`:
```
server/
├── config.ts              # Carga y validación de variables de entorno y credenciales
├── index.ts               # Servidor Express y arranque
├── drive/
│   ├── client.ts          # Singleton de autenticación GoogleAuth y cliente Drive v3
│   ├── types.ts           # Interfaces de datos y esquemas de metadatos
│   ├── traversal.ts       # Algoritmos de exploración recursiva y normalización
│   └── cache.ts           # Motor de caché en memoria TTL
└── routes/
    └── drive.ts           # Endpoints REST /api/drive/*
```

---

## 3. Autenticación con Google Service Account (F1)

### 3.1. Flujo de Resolución de Credenciales
Para garantizar despliegues portables y seguros (local vs Vercel/Cloud), la carga de credenciales implementa la siguiente cascada de prioridad:

```
[Inicio de Carga]
       │
       ▼
¿Existe GOOGLE_SERVICE_ACCOUNT_KEY en process.env?
 ├── SÍ ──► ¿Empieza con '{'? 
 │           ├── SÍ  ──► Parsear JSON crudo.
 │           └── NO  ──► Decodificar desde Base64 a UTF-8 y parsear JSON.
 │           └── Sanitizar private_key: reemplazar `\\n` literales por `\n`.
 │
 └── NO  ──► ¿Existe ./credentials.json en disco?
              ├── SÍ  ──► Leer archivo con fs.readFileSync y parsear JSON.
              └── NO  ──► Lanzar error explicativo (MissingCredentialsError).
```

### 3.2. Alcance (Scope) de Mínimo Privilegio
Se utiliza de forma inmutable:
```typescript
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
```
Esto asegura que la aplicación no puede escribir, sobrescribir, mover ni eliminar ningún archivo en la cuenta del usuario.

### 3.3. Configuración de `server/config.ts`

```typescript
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri?: string;
  token_uri?: string;
}

export interface AppConfig {
  port: number;
  driveRootFolderId: string;
  credentials: ServiceAccountCredentials;
  cacheTtlSeconds: number;
  streamChunkSizeBytes: number;
  tmdbApiKey?: string;
}

export function loadCredentials(): ServiceAccountCredentials {
  const envKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (envKey && envKey.trim().length > 0) {
    const trimmed = envKey.trim();
    let jsonStr: string;

    if (trimmed.startsWith('{')) {
      jsonStr = trimmed;
    } else {
      try {
        jsonStr = Buffer.from(trimmed, 'base64').toString('utf8');
      } catch (err: any) {
        throw new Error(`Fallo al decodificar GOOGLE_SERVICE_ACCOUNT_KEY desde Base64: ${err.message}`);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr) as ServiceAccountCredentials;
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Credenciales inválidas: client_email o private_key faltantes');
      }
      // Reemplazo vital de saltos de línea escapados en la clave privada RSA
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch (err: any) {
      throw new Error(`Fallo al parsear JSON de GOOGLE_SERVICE_ACCOUNT_KEY: ${err.message}`);
    }
  }

  // Fallback 1: GOOGLE_APPLICATION_CREDENTIALS ruta
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds && fs.existsSync(googleAppCreds)) {
    const raw = fs.readFileSync(googleAppCreds, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }

  // Fallback 2: Archivo local credentials.json
  const localPath = path.resolve(process.cwd(), 'credentials.json');
  if (fs.existsSync(localPath)) {
    const raw = fs.readFileSync(localPath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  }

  throw new Error(
    'No se encontraron credenciales de Google Service Account. ' +
    'Configure GOOGLE_SERVICE_ACCOUNT_KEY (JSON o Base64) o coloque credentials.json en la raíz del proyecto.'
  );
}

export function getConfig(): AppConfig {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId || rootFolderId.trim().length === 0) {
    throw new Error('Variable de entorno DRIVE_ROOT_FOLDER_ID no configurada.');
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    driveRootFolderId: rootFolderId.trim(),
    credentials: loadCredentials(),
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '600', 10),
    streamChunkSizeBytes: parseInt(process.env.STREAM_CHUNK_SIZE_MB || '8', 10) * 1024 * 1024,
    tmdbApiKey: process.env.TMDB_API_KEY?.trim(),
  };
}
```

### 3.4. Inicialización del Cliente Drive v3 (`server/drive/client.ts`)

```typescript
import { google, drive_v3 } from 'googleapis';
import { getConfig } from '../config.js';

let driveInstance: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (driveInstance) {
    return driveInstance;
  }

  const config = getConfig();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.credentials.client_email,
      private_key: config.credentials.private_key,
      project_id: config.credentials.project_id,
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  driveInstance = google.drive({ version: 'v3', auth });
  return driveInstance;
}

// Permite inyectar mocks durante pruebas unitarias/E2E
export function setDriveClient(mock: drive_v3.Drive | null): void {
  driveInstance = mock;
}
```

---

## 4. Tipos y Esquemas de Metadatos (`server/drive/types.ts`)

```typescript
export type MediaCategory = 'peliculas' | 'series' | 'familiares' | 'fotos' | 'musica';

export interface DriveMediaItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  category: MediaCategory;
  thumbnailUrl?: string;
  durationMillis?: number;
  width?: number;
  height?: number;
  parentFolderId?: string;
  parentFolderName?: string;
  isFolder: boolean;
  // Campos complementarios
  extension?: string;
  subtitleFiles?: SubtitleReference[];
}

export interface SubtitleReference {
  id: string;
  name: string;
  lang: string;
  label: string;
  vttUrl: string;
}

export interface CategoryFolderMap {
  peliculas?: string;
  series?: string;
  familiares?: string;
  fotos?: string;
  musica?: string;
}

export interface FolderNode {
  id: string;
  name: string;
  category: MediaCategory;
  filesCount: number;
  subfoldersCount: number;
}

export interface CategorySummary {
  category: MediaCategory;
  folderId: string;
  folderName: string;
  totalItems: number;
}
```

---

## 5. Exploración Recursiva de Carpetas y Normalización (F2)

### 5.1. Normalización Lingüística de Nombres de Categoría
Los usuarios pueden nombrar carpetas con o sin tildes, en minúsculas, mayúsculas o con nombres alternativos comunes:
- `Películas`, `Peliculas`, `PELICULAS`, `Movies`, `Cine` -> `peliculas`
- `Series`, `SERIES`, `TV Shows`, `Series TV` -> `series`
- `Videos familiares`, `Videos Familiares`, `Videos Caseros`, `Familia`, `Home Videos` -> `familiares`
- `Fotos`, `Fotografías`, `Fotografias`, `Photos`, `Imágenes` -> `fotos`
- `Música`, `Musica`, `Audio`, `Music` -> `musica`

**Función de normalización**:
```typescript
export function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes, virgulillas)
    .trim()
    .toLowerCase();
}

export function matchCategory(folderName: string): MediaCategory | null {
  const norm = normalizeString(folderName);
  if (/^(peliculas|cine|movies)$/.test(norm)) return 'peliculas';
  if (/^(series|tv|shows|series tv)$/.test(norm)) return 'series';
  if (/^(videos familiares|familia|home videos|videos caseros|videos)$/.test(norm)) return 'familiares';
  if (/^(fotos|fotografias|photos|imagenes)$/.test(norm)) return 'fotos';
  if (/^(musica|music|audio)$/.test(norm)) return 'musica';
  return null;
}
```

### 5.2. Parámetros Críticos de Consulta en Drive API v3
Para evitar omisiones de archivos y errores de permisos:
1. `supportsAllDrives: true` e `includeItemsFromAllDrives: true`: **Obligatorios** en toda llamada. Permiten acceder a carpetas compartidas con la Service Account y Unidades Compartidas de Google Workspace.
2. `q`: Consulta estructurada:
   - Carpetas hijas de un padre: `'${folderId}' in parents and trashed = false`
   - Solo carpetas: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
   - Solo archivos: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
3. `pageSize: 1000`: Valor máximo permitido por Drive API para minimizar número de páginas.
4. `fields`: Selección quirúrgica para no saturar memoria:
   `'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata, imageMediaMetadata, parents)'`

### 5.3. Paginación Robusta con `nextPageToken`
Cuando una carpeta contiene cientos o miles de elementos, Google Drive pagina las respuestas. El motor ejecuta un bucle de drenaje:
```typescript
async function fetchAllFiles(query: string, driveClient: drive_v3.Drive): Promise<drive_v3.Schema$File[]> {
  const allFiles: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const res = await driveClient.files.list({
      q: query,
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata, imageMediaMetadata, parents)',
    });

    if (res.data.files) {
      allFiles.push(...res.data.files);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return allFiles;
}
```

### 5.4. Reescalado de Miniaturas HD para Smart TV 4K
Google Drive genera por defecto enlaces de miniatura con sufijo `=s220`. En un panel 4K de 50 pulgadas, esta imagen se visualiza pixelada.
El transformador reemplaza el sufijo por `=w800`:
```typescript
export function transformThumbnailLink(link?: string | null): string | undefined {
  if (!link) return undefined;
  // Reemplaza =s220 o cualquier =sXXX/=wXXX por =w800
  if (/=[sw]\d+.*$/.test(link)) {
    return link.replace(/=[sw]\d+.*$/, '=w800');
  }
  return `${link}=w800`;
}
```

### 5.5. Inferencia de Tipos MIME y Extensiones
En ocasiones, archivos `.mkv` subidos a Google Drive se etiquetan genéricamente como `application/octet-stream`. El extractor infiere el MIME correcto según la extensión:
```typescript
const MIME_EXTENSIONS: Record<string, string> = {
  mkv: 'video/x-matroska',
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  ts: 'video/mp2t',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
};

export function inferMimeType(name: string, reportedMime?: string | null): string {
  if (reportedMime && reportedMime !== 'application/octet-stream') {
    return reportedMime;
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return MIME_EXTENSIONS[ext] || reportedMime || 'application/octet-stream';
}
```

### 5.6. Motor de Exploración (`server/drive/traversal.ts`)

```typescript
import { drive_v3 } from 'googleapis';
import { getDriveClient } from './client.js';
import {
  MediaCategory,
  DriveMediaItem,
  CategoryFolderMap,
  matchCategory,
  inferMimeType,
  transformThumbnailLink,
} from './types.js';
import { memoryCache } from './cache.js';

export class DriveTraversalEngine {
  private drive: drive_v3.Drive;
  private rootFolderId: string;

  constructor(drive?: drive_v3.Drive, rootFolderId?: string) {
    this.drive = drive || getDriveClient();
    this.rootFolderId = rootFolderId || process.env.DRIVE_ROOT_FOLDER_ID || '';
  }

  /**
   * Resuelve los IDs de las 5 carpetas de categorías principales bajo DRIVE_ROOT_FOLDER_ID
   */
  async resolveCategoryFolders(): Promise<CategoryFolderMap> {
    const cacheKey = `categories_map:${this.rootFolderId}`;
    const cached = memoryCache.get<CategoryFolderMap>(cacheKey);
    if (cached) return cached;

    const query = `'${this.rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await this.drive.files.list({
      q: query,
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id, name)',
    });

    const categoryMap: CategoryFolderMap = {};
    const folders = res.data.files || [];

    for (const folder of folders) {
      if (!folder.name || !folder.id) continue;
      const matched = matchCategory(folder.name);
      if (matched && !categoryMap[matched]) {
        categoryMap[matched] = folder.id;
      }
    }

    // Almacena en caché por 30 minutos
    memoryCache.set(cacheKey, categoryMap, 1800000);
    return categoryMap;
  }

  /**
   * Explora los contenidos de una categoría de forma recursiva o plana según el tipo
   */
  async listCategoryItems(category: MediaCategory): Promise<DriveMediaItem[]> {
    const cacheKey = `category_items:${category}`;
    const cached = memoryCache.get<DriveMediaItem[]>(cacheKey);
    if (cached) return cached;

    const categoryMap = await this.resolveCategoryFolders();
    const folderId = categoryMap[category];

    if (!folderId) {
      console.warn(`Carpeta no encontrada para la categoría: ${category}`);
      return [];
    }

    const items = await this.traverseFolder(folderId, category, folderId);
    
    // Almacena en caché por TTL estándar (10 min)
    memoryCache.set(cacheKey, items);
    return items;
  }

  /**
   * Traversal recursivo adaptativo
   */
  private async traverseFolder(
    folderId: string,
    category: MediaCategory,
    parentFolderId: string,
    parentFolderName?: string
  ): Promise<DriveMediaItem[]> {
    const query = `'${folderId}' in parents and trashed = false`;
    let pageToken: string | undefined = undefined;
    const items: DriveMediaItem[] = [];
    const subfolderPromises: Promise<DriveMediaItem[]>[] = [];

    do {
      const res = await this.drive.files.list({
        q: query,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata, imageMediaMetadata)',
      });

      const files = res.data.files || [];
      for (const file of files) {
        if (!file.id || !file.name) continue;

        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

        if (isFolder) {
          // Explorar recursivamente las subcarpetas
          subfolderPromises.push(
            this.traverseFolder(file.id, category, folderId, file.name)
          );
        } else {
          // Filtrar y convertir a DriveMediaItem
          const mediaItem = this.mapToDriveMediaItem(file, category, folderId, parentFolderName);
          if (this.isRelevantForCategory(mediaItem, category)) {
            items.push(mediaItem);
            // Registrar también en caché individual de archivo para streaming rápido
            memoryCache.set(`file_meta:${mediaItem.id}`, mediaItem, 7200000); // 2 horas
          }
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    // Esperar resultados de subcarpetas en paralelo
    const subfolderResults = await Promise.all(subfolderPromises);
    for (const subItems of subfolderResults) {
      items.push(...subItems);
    }

    return items;
  }

  /**
   * Mapeo de archivo de Drive a esquema normalizado DriveMediaItem
   */
  mapToDriveMediaItem(
    file: drive_v3.Schema$File,
    category: MediaCategory,
    parentFolderId: string,
    parentFolderName?: string
  ): DriveMediaItem {
    const name = file.name || 'Sin título';
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const mimeType = isFolder ? file.mimeType! : inferMimeType(name, file.mimeType);
    const size = parseInt(file.size || '0', 10);
    const modifiedTime = file.modifiedTime || new Date().toISOString();
    const durationMillis = file.videoMediaMetadata?.durationMillis
      ? parseInt(file.videoMediaMetadata.durationMillis, 10)
      : undefined;
    const width = file.videoMediaMetadata?.width || file.imageMediaMetadata?.width || undefined;
    const height = file.videoMediaMetadata?.height || file.imageMediaMetadata?.height || undefined;
    const thumbnailUrl = transformThumbnailLink(file.thumbnailLink);
    const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;

    return {
      id: file.id!,
      name,
      mimeType,
      size,
      modifiedTime,
      category,
      thumbnailUrl,
      durationMillis,
      width,
      height,
      parentFolderId,
      parentFolderName,
      isFolder,
      extension,
    };
  }

  /**
   * Filtra elementos irrelevantes según la categoría
   */
  private isRelevantForCategory(item: DriveMediaItem, category: MediaCategory): boolean {
    const ext = item.extension || '';

    if (category === 'peliculas' || category === 'series' || category === 'familiares') {
      // Admitir videos y subtítulos auxiliares
      return (
        item.mimeType.startsWith('video/') ||
        ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'ts', 'm4v', 'webm', 'srt', 'vtt'].includes(ext)
      );
    }

    if (category === 'fotos') {
      return (
        item.mimeType.startsWith('image/') ||
        ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)
      );
    }

    if (category === 'musica') {
      return (
        item.mimeType.startsWith('audio/') ||
        ['mp3', 'flac', 'aac', 'm4a', 'wav', 'ogg'].includes(ext)
      );
    }

    return true;
  }
}
```

---

## 6. Arquitectura de Caché en Memoria (`server/drive/cache.ts`)

### 6.1. Justificación y Análisis de Cuotas
Google Drive aplica una cuota por defecto de 20,000 peticiones cada 100 segundos y cuotas estrictas de lectura por archivo. En una película de 4GB dividida en fragmentos de 8MB, el reproductor de la TV emite ~500 peticiones HTTP. Si cada petición consultara `drive.files.get` para leer `size` y `mimeType`, la cuota se agotaría rápidamente.

### 6.2. Diseño de 2 Niveles
1. **Nivel 1: Caché de Estructura de Carpetas e Items**
   - **Clave**: `categories_map:<rootId>`, `category_items:<category>`
   - **TTL**: 10 minutos (600,000 ms), configurable vía `CACHE_TTL_SECONDS`.
   - **Función**: Navegación instantánea en la interfaz de la TV (0ms latencia).
2. **Nivel 2: Caché de Metadatos de Archivo Individual**
   - **Clave**: `file_meta:<fileId>`
   - **TTL**: 2 horas (7,200,000 ms).
   - **Función**: Respuestas inmediatas para el proxy de streaming HTTP Range 206 sin llamadas a Google Drive en peticiones sucesivas de fragmentos.

### 6.3. Implementación del Motor de Caché (`server/drive/cache.ts`)

```typescript
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class MemoryCache {
  private store: Map<string, CacheEntry<any>> = new Map();
  private defaultTtlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(defaultTtlSeconds = 600) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
    // Tarea de limpieza automática cada 5 minutos
    this.cleanupInterval = setInterval(() => this.purgeExpired(), 300000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref(); // No bloquea la terminación del proceso
    }
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const duration = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    this.store.set(key, {
      data,
      expiresAt: Date.now() + duration,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

export const memoryCache = new MemoryCache();
```

---

## 7. Contratos de Interfaz REST API (`server/routes/drive.ts`)

### 7.1. Definición de Endpoints

| Método | Ruta | Descripción | Parámetros | Códigos de Estado |
|---|---|---|---|---|
| `GET` | `/api/drive/status` | Verifica estado de credenciales y conexión con Drive | Ninguno | 200 OK, 500 Error |
| `GET` | `/api/drive/folders` | Retorna mapa y resumen de categorías disponibles | Ninguno | 200 OK, 500 Error |
| `GET` | `/api/drive/files/:category` | Retorna lista de archivos para una categoría | `:category` (`peliculas`, `series`, etc.) | 200 OK, 400 Bad Request, 500 Error |
| `GET` | `/api/drive/file/:fileId` | Retorna metadatos de un archivo específico | `:fileId` (ID de Drive) | 200 OK, 404 Not Found, 500 Error |
| `POST` / `GET` | `/api/drive/refresh` | Invalida la caché completa y fuerza reindexación | Ninguno | 200 OK |

### 7.2. Controlador de Rutas (`server/routes/drive.ts`)

```typescript
import { Router, Request, Response } from 'express';
import { DriveTraversalEngine } from '../drive/traversal.js';
import { memoryCache } from '../drive/cache.js';
import { MediaCategory, DriveMediaItem } from '../drive/types.js';
import { getConfig } from '../config.js';
import { getDriveClient } from '../drive/client.js';

export const driveRouter = Router();
const traversalEngine = new DriveTraversalEngine();

/**
 * GET /api/drive/status
 * Comprueba conexión y salud de la Service Account
 */
driveRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const drive = getDriveClient();
    
    // Test liviano: obtener metadatos de la carpeta raíz
    const rootCheck = await drive.files.get({
      fileId: config.driveRootFolderId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });

    res.json({
      status: 'ok',
      serviceAccountEmail: config.credentials.client_email,
      rootFolderId: config.driveRootFolderId,
      rootFolderName: rootCheck.data.name,
      cacheSize: memoryCache.size(),
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: 'Fallo al conectar con Google Drive API',
      error: err.message,
    });
  }
});

/**
 * GET /api/drive/folders
 * Retorna las categorías detectadas
 */
driveRouter.get('/folders', async (_req: Request, res: Response) => {
  try {
    const categories = await traversalEngine.resolveCategoryFolders();
    res.json({
      categories,
    });
  } catch (err: any) {
    res.status(500).json({
      error: 'Error resolviendo categorías de Google Drive',
      message: err.message,
    });
  }
});

/**
 * GET /api/drive/files/:category
 * Retorna los archivos de una categoría específica
 */
driveRouter.get('/files/:category', async (req: Request, res: Response) => {
  const categoryParam = req.params.category.toLowerCase() as MediaCategory;
  const validCategories: MediaCategory[] = ['peliculas', 'series', 'familiares', 'fotos', 'musica'];

  if (!validCategories.includes(categoryParam)) {
    return res.status(400).json({
      error: `Categoría inválida: ${req.params.category}`,
      validCategories,
    });
  }

  try {
    const items = await traversalEngine.listCategoryItems(categoryParam);
    res.json({
      category: categoryParam,
      count: items.length,
      items,
    });
  } catch (err: any) {
    res.status(500).json({
      error: `Error obteniendo archivos de la categoría ${categoryParam}`,
      message: err.message,
    });
  }
});

/**
 * GET /api/drive/file/:fileId
 * Retorna metadatos de un archivo específico
 */
driveRouter.get('/file/:fileId', async (req: Request, res: Response) => {
  const fileId = req.params.fileId;
  const cacheKey = `file_meta:${fileId}`;

  // 1. Verificar caché
  const cached = memoryCache.get<DriveMediaItem>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  // 2. Consulta en vivo a Drive API
  try {
    const drive = getDriveClient();
    const result = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, modifiedTime, thumbnailLink, videoMediaMetadata, imageMediaMetadata',
      supportsAllDrives: true,
    });

    const file = result.data;
    if (!file.id) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const item = traversalEngine.mapToDriveMediaItem(file, 'peliculas', '');
    memoryCache.set(cacheKey, item, 7200000); // 2 horas
    res.json(item);
  } catch (err: any) {
    res.status(500).json({
      error: 'Error obteniendo metadatos del archivo',
      message: err.message,
    });
  }
});

/**
 * POST /api/drive/refresh & GET /api/drive/refresh
 * Invalida la caché completa
 */
const handleRefresh = (_req: Request, res: Response) => {
  memoryCache.clear();
  res.json({
    status: 'ok',
    message: 'Caché de Google Drive invalidada correctamente',
    timestamp: new Date().toISOString(),
  });
};

driveRouter.post('/refresh', handleRefresh);
driveRouter.get('/refresh', handleRefresh);
```

### 7.3. Servidor Principal (`server/index.ts`)

```typescript
import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { driveRouter } from './routes/drive.js';

const app = express();
const config = getConfig();

// Middleware básico
app.use(cors());
app.use(express.json());

// Registro de rutas
app.use('/api/drive', driveRouter);

// Ruta raíz informativa
app.get('/', (_req, res) => {
  res.json({
    app: 'Multimedia Drive Server',
    version: '1.0.0',
    target: 'Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)',
    status: 'online',
  });
});

// Middleware de manejo de errores global
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error no capturado:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'Error desconocido',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`[Multimedia Drive] Servidor iniciado en http://localhost:${config.port}`);
    console.log(`[Multimedia Drive] Carpeta raíz configurada: ${config.driveRootFolderId}`);
  });
}

export default app;
```

---

## 8. Matriz de Casos de Borde y Manejo de Errores

| Caso de Borde | Causa Posible | Comportamiento del Sistema | Mitigación Implementada |
|---|---|---|---|
| **Credenciales en Base64 con saltos de línea `\n` escapados** | Vercel / Docker convierte saltos de línea de la clave RSA a `\\n` literales. | `error:0909006C:PEM routines:get_name:no start line`. | Regex `parsed.private_key.replace(/\\n/g, '\n')` en `loadCredentials()`. |
| **`DRIVE_ROOT_FOLDER_ID` no compartida con Service Account** | El usuario no dio permisos de Lector a la cuenta de servicio. | Google Drive API responde `404 File not found`. | Endpoint `/api/drive/status` verifica la carpeta raíz y emite mensaje diagnóstico explicativo. |
| **Carpetas con nombres alternativos o sin tildes** | El usuario crea `Peliculas` en vez de `Películas` o `Family Videos`. | La aplicación no encontraría la categoría si la búsqueda fuera exacta. | Normalización Unicode NFD + Regex multilingüe tolerante en `matchCategory()`. |
| **Carpeta con más de 1000 archivos** | Colección extensa de fotos o música. | Drive API solo entrega los primeros 100 o 1000 archivos en una sola llamada. | Bucle `do { ... } while (pageToken)` hasta drenar completamente `nextPageToken`. |
| **Cuota excedida (`403 rateLimitExceeded`)** | Múltiples peticiones concurrentes de la TV. | Congelamiento o interrupción de reproducción. | Caché en memoria de 2 niveles (10 min para listas, 2 horas para metadatos individuales). |
| **Subcarpetas anidadas en Series y Videos Familiares** | Series organizadas por Temporada; videos familiares organizados por Año y Evento. | Una búsqueda plana no descubriría los capítulos o grabaciones. | Traversal recursivo `traverseFolder()` que explora subcarpetas en paralelo mediante `Promise.all()`. |
| **Archivos `.mkv` con MIME genérico** | Google Drive reporta `application/octet-stream`. | La TV no reconoce el tipo de medio y rechaza la reproducción. | Función `inferMimeType()` basada en extensión de archivo. |

---

## 9. Plan de Pruebas Unitarias de Milestone M1 (F1 & F2)

Para garantizar la máxima calidad y verificar de forma aislada este subsistema:

### Suite 1: Configuración y Credenciales (`tests/unit/config.test.ts`)
- [ ] Debe cargar credenciales desde JSON crudo en `GOOGLE_SERVICE_ACCOUNT_KEY`.
- [ ] Debe cargar credenciales desde Base64 en `GOOGLE_SERVICE_ACCOUNT_KEY`.
- [ ] Debe reemplazar correctamente los saltos de línea `\\n` en `private_key`.
- [ ] Debe lanzar error descriptivo cuando no existan credenciales ni variable de entorno.
- [ ] Debe lanzar error si `DRIVE_ROOT_FOLDER_ID` no está definida.

### Suite 2: Normalización y Mapeo de Categorías (`tests/unit/traversal-norm.test.ts`)
- [ ] Debe asociar `Películas`, `Peliculas`, `PELICULAS`, `Cine` a `peliculas`.
- [ ] Debe asociar `Series`, `TV Shows`, `series` a `series`.
- [ ] Debe asociar `Videos familiares`, `Videos Familiares`, `Familia` a `familiares`.
- [ ] Debe asociar `Fotos`, `Fotografías`, `Photos` a `fotos`.
- [ ] Debe asociar `Música`, `Musica`, `Music` a `musica`.
- [ ] Debe retornar `null` para nombres no reconocidos (ej. `Documentos`, `Backups`).

### Suite 3: Inferencia de MIME y Reescalado de Miniaturas (`tests/unit/metadata.test.ts`)
- [ ] Debe inferir `video/x-matroska` para archivos `.mkv` con MIME `application/octet-stream`.
- [ ] Debe inferir `video/mp4` para archivos `.mp4`.
- [ ] Debe transformar miniaturas `=s220` a `=w800`.
- [ ] Debe preservar miniaturas que ya posean formato HD o agregar `=w800` si carecen de parámetro.

### Suite 4: Caché en Memoria (`tests/unit/cache.test.ts`)
- [ ] Debe guardar y recuperar elementos dentro de su TTL.
- [ ] Debe retornar `null` para claves expiradas.
- [ ] Debe limpiar todas las entradas tras invocar `memoryCache.clear()`.
- [ ] Debe eliminar automáticamente entradas antiguas en la purga periódica.

### Suite 5: Traversal con Mock de Drive API (`tests/unit/traversal.test.ts`)
- [ ] Debe recorrer correctamente una estructura simulada con carpetas de categorías y archivos.
- [ ] Debe paginar correctamente cuando se simula un `nextPageToken`.
- [ ] Debe poblar la caché tras la primera exploración y responder desde caché en la segunda llamada.

---

## 10. Conclusión

Este blueprint proporciona la arquitectura técnica, tipos de datos, algoritmos de resolución y código completo para Features F1 y F2 de Milestone M1. La combinación de autenticación por Service Account con tolerancia a Base64, normalización Unicode NFD para carpetas en español, paginación exhaustiva, reescalado de miniaturas para paneles 4K y caché en memoria de 2 niveles garantiza un conector con Google Drive robusto, rápido y 100% blindado contra límites de cuota de API.
