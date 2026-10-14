## 2026-10-13T03:46:22Z
Sender: a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c (parent)
Content:
You are the Cloud Streaming Proxy Explorer (`explorer_survey_2`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_2
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md

Your task is to conduct an authoritative investigation of the cloud connector and private Google Drive streaming proxy (R1).

Investigate and document thoroughly:
1. Google Drive API v3 Authentication & Folder Navigation:
   - Google Cloud Service Account authentication (`credentials.json` with client_email and private_key, or `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable).
   - Scopes required: `https://www.googleapis.com/auth/drive.readonly`.
   - Accessing shared folder via root folder ID (`DRIVE_ROOT_FOLDER_ID`).
   - Recursive and hierarchical traversal of required subfolders: 'Películas', 'Series', 'Videos familiares', 'Fotos', 'Música'.
   - File listing schema: id, name, mimeType, size, modifiedTime, videoMediaMetadata (width, height, durationMillis), imageMediaMetadata, thumbnailLink.
2. Streaming Proxy & Strict HTTP Range 206 Partial Content:
   - How HTTP Range requests work between Smart TV (Chromium M56 <video>) and the proxy: parsing `Range: bytes=start-end`.
   - Google Drive API download mechanics: fetching file chunks using Drive API `files.get(fileId, { alt: 'media' }, { headers: { Range: ... }, responseType: 'stream' })`.
   - Response headers: `Status: 206 Partial Content`, `Content-Range: bytes start-end/totalSize`, `Content-Length: chunkLength`, `Content-Type: video/mp4 | video/x-matroska | audio/mpeg`, `Accept-Ranges: bytes`, `Cache-Control`.
   - Handling seeking, pausing, rewinding without buffering freezes or Google Drive rate limit / quota exhaustion (`User rate limit exceeded`).
   - Buffer chunk sizing optimization for TV streaming (e.g., 2MB-10MB chunks).
3. Subtitle Processing & WebVTT Conversion:
   - External subtitle detection: matching movie filename with `.srt` or `.vtt` in the same Drive folder (e.g., `Movie.2021.1080p.mkv` and `Movie.2021.1080p.es.srt`).
   - Algorithmic conversion of SRT format (numeric index, `00:01:20,000 --> 00:01:23,000`, comma millisecond separators) to standard WebVTT (`WEBVTT`, `00:01:20.000 --> 00:01:23.000`, period millisecond separators, UTF-8 encoding).
   - Embedded subtitle handling in MKV/MP4 containers (detecting subtitle streams or providing player fallback).
4. Serverless & Cloud Deployment Architecture:
   - Serverless constraints (execution timeouts, streaming response support on Vercel / Cloudflare Workers / Node.js lightweight backend).
   - Architecture recommendations to ensure streaming runs smoothly and autonomously in the cloud without requiring a local PC.
5. Output Requirements:
   - Write your complete findings to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_2\proxy_report.md
   - Include `handoff.md` in your working directory.
   - Send a concise completion message with the path to your report.
