import { Router, Request, Response } from 'express';
import { isFamilyContent } from '../metadata/isolator';
import { sanitizeMediaFilename } from '../metadata/sanitizer';
import { tmdbClient } from '../metadata/tmdb';

export const metadataRouter = Router();

/**
 * GET /api/metadata/clean-title
 * Sanitizes raw media filenames into clean title, year, and series tags.
 */
metadataRouter.get('/clean-title', (req: Request, res: Response) => {
  const filename = (req.query.filename as string) || '';
  const result = sanitizeMediaFilename(filename);
  return res.json(result);
});

/**
 * GET /api/metadata/enrich
 * Enriches media title with TMDB metadata, enforcing strict family isolation barrier.
 */
metadataRouter.get('/enrich', async (req: Request, res: Response) => {
  const rawTitle = (req.query.title as string) || '';
  const rawYear = req.query.year as string | undefined;
  const rawCategory = req.query.category as string | undefined;
  const isSeries = req.query.isSeries === 'true';

  let decodedCategory = rawCategory || '';
  try {
    decodedCategory = decodeURIComponent(decodedCategory);
  } catch {}

  let decodedTitle = rawTitle;
  try {
    decodedTitle = decodeURIComponent(decodedTitle);
  } catch {}

  // 1. Strict Family Isolation Barrier Gate
  if (isFamilyContent({ category: decodedCategory, title: decodedTitle })) {
    return res.status(403).json({
      error: 'Strict Isolation Barrier: Family media is barred from external TMDB enrichment',
    });
  }

  // 2. Empty title handling (Graceful 200 fallback per F7-B03)
  if (!rawTitle.trim()) {
    return res.json({
      id: null,
      title: '',
      originalTitle: '',
      year: null,
      overview: 'Sinopsis no disponible en TMDB.',
      posterUrl: 'https://via.placeholder.com/500x750.png?text=' + encodeURIComponent('Sin Cartel'),
      backdropUrl: null,
      rating: 0,
      runtime: null,
      director: 'Desconocido',
      cast: [],
      genres: [],
      cached: false,
    });
  }

  const parsedYear = rawYear ? parseInt(rawYear, 10) : undefined;
  const validYear = parsedYear && !isNaN(parsedYear) ? parsedYear : undefined;

  // 3. TMDB Enrichment
  try {
    const data = await tmdbClient.enrich({
      title: decodedTitle,
      year: validYear,
      isSeries,
      category: decodedCategory,
    });
    return res.json(data);
  } catch (err: any) {
    // Failsafe fallback
    return res.json({
      id: null,
      title: decodedTitle,
      originalTitle: decodedTitle,
      year: validYear || null,
      overview: 'Sinopsis no disponible en TMDB.',
      posterUrl: `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(decodedTitle)}`,
      backdropUrl: null,
      rating: 0,
      runtime: null,
      director: 'Desconocido',
      cast: [],
      genres: [],
      cached: false,
    });
  }
});
