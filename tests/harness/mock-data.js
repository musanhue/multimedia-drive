// Authoritative Mock Data & Test Fixtures
// Derived from ORIGINAL_REQUEST.md & PROJECT.md specifications

const SAMPLE_VIDEO_BUFFER_SIZE = 16 * 1024 * 1024; // 16 MB mock video payload
const sampleVideoBuffer = Buffer.alloc(SAMPLE_VIDEO_BUFFER_SIZE);
// Fill with predictable pattern for range verification
for (let i = 0; i < 1024 * 64; i++) {
  sampleVideoBuffer.writeUInt8(i % 256, i);
}

const FOLDERS = [
  { id: 'f_pel', name: 'Películas', category: 'peliculas', itemCount: 10 },
  { id: 'f_ser', name: 'Series', category: 'series', itemCount: 15 },
  { id: 'f_fam', name: 'Videos familiares', category: 'familiares', itemCount: 8 },
  { id: 'f_fot', name: 'Fotos', category: 'fotos', itemCount: 25 },
  { id: 'f_mus', name: 'Música', category: 'musica', itemCount: 12 }
];

const MOVIES = [
  {
    id: 'vid_inc',
    name: 'Inception.2010.1080p.BluRay.x264-SPARKS.mkv',
    cleanTitle: 'Inception',
    year: 2010,
    category: 'peliculas',
    mimeType: 'video/x-matroska',
    size: 4294967296, // 4GB
    durationMillis: 8880000, // 148 min
    width: 1920,
    height: 1080,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-1=s220',
    subtitles: [{ id: 'sub_inc_es', name: 'Inception.2010.es.srt', lang: 'es', label: 'Español' }]
  },
  {
    id: 'vid_int',
    name: 'Interstellar.2014.1080p.BluRay.x264.mkv',
    cleanTitle: 'Interstellar',
    year: 2014,
    category: 'peliculas',
    mimeType: 'video/x-matroska',
    size: 5368709120, // 5GB
    durationMillis: 10140000, // 169 min
    width: 1920,
    height: 1080,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-2=s220',
    subtitles: [{ id: 'sub_int_es', name: 'Interstellar.2014.es.srt', lang: 'es', label: 'Español' }]
  },
  {
    id: 'vid_sec',
    name: 'El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4',
    cleanTitle: 'El Secreto De Sus Ojos',
    year: 2009,
    category: 'peliculas',
    mimeType: 'video/mp4',
    size: 3221225472, // 3GB
    durationMillis: 7740000,
    width: 1920,
    height: 1080,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-3=s220',
    subtitles: []
  },
  {
    id: 'vid_br',
    name: 'Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv',
    cleanTitle: 'Blade Runner 2049',
    year: 2017,
    category: 'peliculas',
    mimeType: 'video/x-matroska',
    size: 8589934592, // 8GB (4K)
    durationMillis: 9780000,
    width: 3840,
    height: 2160,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-4=s220',
    subtitles: [{ id: 'sub_br_es', name: 'Blade.Runner.2049.2017.es.srt', lang: 'es', label: 'Español' }]
  },
  {
    id: 'vid_rel',
    name: 'Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv',
    cleanTitle: 'Relatos salvajes',
    year: 2014,
    category: 'peliculas',
    mimeType: 'video/x-matroska',
    size: 3100000000,
    durationMillis: 7320000,
    width: 1920,
    height: 1080,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-5=s220',
    subtitles: []
  }
];

const SERIES = [
  {
    id: 'vid_st_s4e9',
    name: 'Stranger.Things.S04E09.1080p.NF.WEB-DL.mkv',
    cleanTitle: 'Stranger Things',
    seriesName: 'Stranger Things',
    season: 4,
    episode: 9,
    year: 2022,
    category: 'series',
    mimeType: 'video/x-matroska',
    size: 2684354560,
    durationMillis: 8340000,
    width: 1920,
    height: 1080,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-s1=s220'
  },
  {
    id: 'vid_lcdp_4x8',
    name: 'La.Casa.de.Papel.4x08.1080p.NF.mkv',
    cleanTitle: 'La Casa de Papel',
    seriesName: 'La Casa de Papel',
    season: 4,
    episode: 8,
    year: 2020,
    category: 'series',
    mimeType: 'video/x-matroska',
    size: 1800000000,
    durationMillis: 3600000,
    width: 1920,
    height: 1080,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb-s2=s220'
  }
];

const FAMILY_VIDEOS = [
  {
    id: 'vid_fam_1',
    name: 'Cumpleaños_de_Lucas_2021.mp4',
    category: 'familiares',
    mimeType: 'video/mp4',
    size: 1073741824, // 1GB
    durationMillis: 872000, // 14m 32s
    width: 1920,
    height: 1080,
    createdTime: '2021-10-15T15:30:00Z',
    modifiedTime: '2021-10-15T15:30:00Z',
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-fam-thumb-1=s220',
    // Strictly native metadata only:
    dateFormatted: '15 de octubre de 2021',
    durationFormatted: '14:32',
    cleanTitle: 'Cumpleaños De Lucas 2021'
  },
  {
    id: 'vid_fam_2',
    name: 'Vacaciones_Bariloche_2019.mp4',
    category: 'familiares',
    mimeType: 'video/mp4',
    size: 2147483648, // 2GB
    durationMillis: 1950000, // 32m 30s
    width: 3840,
    height: 2160,
    createdTime: '2019-07-20T10:15:00Z',
    modifiedTime: '2019-07-20T10:15:00Z',
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-fam-thumb-2=s220',
    dateFormatted: '20 de julio de 2019',
    durationFormatted: '32:30',
    cleanTitle: 'Vacaciones Bariloche 2019'
  },
  {
    id: 'vid_fam_3',
    name: 'Navidad_En_Familia_2022.mov',
    category: 'familiares',
    mimeType: 'video/quicktime',
    size: 524288000, // 500MB
    durationMillis: 450000, // 7m 30s
    width: 1920,
    height: 1080,
    createdTime: '2022-12-25T01:00:00Z',
    modifiedTime: '2022-12-25T01:00:00Z',
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-fam-thumb-3=s220',
    dateFormatted: '25 de diciembre de 2022',
    durationFormatted: '07:30',
    cleanTitle: 'Navidad En Familia 2022'
  }
];

const PHOTOS = [
  {
    id: 'img_001',
    name: 'IMG_20221014_182045.jpg',
    category: 'fotos',
    mimeType: 'image/jpeg',
    size: 4194304,
    width: 3840,
    height: 2160,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-img-thumb-1=s220',
    fullUrl: 'https://lh3.googleusercontent.com/drive-img-thumb-1=s1920'
  },
  {
    id: 'img_002',
    name: 'Playa_Atardecer.jpg',
    category: 'fotos',
    mimeType: 'image/jpeg',
    size: 5242880,
    width: 3840,
    height: 2160,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-img-thumb-2=s220',
    fullUrl: 'https://lh3.googleusercontent.com/drive-img-thumb-2=s1920'
  }
];

const MUSIC = [
  {
    id: 'mus_001',
    name: '01 - Bohemian Rhapsody.mp3',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    year: 1975,
    category: 'musica',
    mimeType: 'audio/mpeg',
    size: 14680064,
    durationMillis: 354000,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-album-art-1=s220'
  },
  {
    id: 'mus_002',
    name: '02 - Hotel California.mp3',
    title: 'Hotel California',
    artist: 'Eagles',
    album: 'Hotel California',
    year: 1976,
    category: 'musica',
    mimeType: 'audio/mpeg',
    size: 16777216,
    durationMillis: 390000,
    thumbnailLink: 'https://lh3.googleusercontent.com/drive-album-art-2=s220'
  }
];

const TMDB_RECORDS = {
  'inception_2010': {
    id: 27205,
    title: 'Origen',
    originalTitle: 'Inception',
    year: 2010,
    overview: 'Dom Cobb es un ladrón capaz de adentrarse en los sueños de los demás para robar sus secretos del subconsciente más profundo.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
    rating: 8.4,
    runtime: '2h 28m',
    director: 'Christopher Nolan',
    cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page', 'Tom Hardy', 'Ken Watanabe'],
    genres: ['Ciencia ficción', 'Acción', 'Aventura']
  },
  'interstellar_2014': {
    id: 157336,
    title: 'Interstellar',
    originalTitle: 'Interstellar',
    year: 2014,
    overview: 'Un grupo de científicos y exploradores, encabezados por Cooper, se embarcan en un viaje espacial para encontrar un lugar con mejores condiciones para la vida humana.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    rating: 8.4,
    runtime: '2h 49m',
    director: 'Christopher Nolan',
    cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain', 'Michael Caine', 'Matt Damon'],
    genres: ['Aventura', 'Drama', 'Ciencia ficción']
  },
  'el secreto de sus ojos_2009': {
    id: 25376,
    title: 'El secreto de sus ojos',
    originalTitle: 'El secreto de sus ojos',
    year: 2009,
    overview: 'Benjamín Espósito es oficial de un Juzgado de Instrucción de Buenos Aires recién retirado. Obsesionado por un brutal asesinato ocurrido treinta años antes, decide escribir una novela.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/6yVfP7c1w6rJdE8v3KqZ4uE5uR0.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/3z8c5G7y6wQ4e9z5m2KqE9.jpg',
    rating: 8.2,
    runtime: '2h 09m',
    director: 'Juan José Campanella',
    cast: ['Ricardo Darín', 'Soledad Villamil', 'Guillermo Francella', 'Pablo Rago'],
    genres: ['Drama', 'Misterio', 'Crimen']
  },
  'blade runner 2049_2017': {
    id: 335984,
    title: 'Blade Runner 2049',
    originalTitle: 'Blade Runner 2049',
    year: 2017,
    overview: 'Treinta años después de los eventos del primer film, un nuevo blade runner, K, descubre un secreto profundamente oculto.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/ilRyAZwxi9u7O1vG0CqI.jpg',
    rating: 7.9,
    runtime: '2h 44m',
    director: 'Denis Villeneuve',
    cast: ['Ryan Gosling', 'Harrison Ford', 'Ana de Armas', 'Sylvia Hoeks'],
    genres: ['Ciencia ficción', 'Misterio']
  },
  'relatos salvajes_2014': {
    id: 265195,
    title: 'Relatos salvajes',
    originalTitle: 'Relatos salvajes',
    year: 2014,
    overview: 'Seis relatos que alternan la intriga, la comedia y la violencia de personajes empujados al abismo.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/w1aXW4Qd6lQ9i6e9uV8r9.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/vG9r3Q9i6e9uV8r9.jpg',
    rating: 8.1,
    runtime: '2h 02m',
    director: 'Damián Szifron',
    cast: ['Ricardo Darín', 'Oscar Martínez', 'Leonardo Sbaraglia', 'Érica Rivas'],
    genres: ['Drama', 'Comedia', 'Suspense']
  },
  'stranger things_2022': {
    id: 66732,
    title: 'Stranger Things',
    year: 2022,
    season: 4,
    episode: 9,
    overview: 'Cuando un niño desaparece, sus amigos, la familia y la policía se ven envueltos en un misterio que involucra experimentos secretos.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/56v2KjUmLeLo5aMw7c8wVz.jpg',
    rating: 8.6,
    director: 'Duffer Brothers',
    cast: ['Millie Bobby Brown', 'Finn Wolfhard', 'Winona Ryder', 'David Harbour']
  }
};

const SAMPLE_SRT_UTF8 = `1
00:01:23,456 --> 00:01:26,789
¡Hola mundo! Esta es una película con subtítulos en español.

2
00:01:27,100 --> 00:01:30,500
Contiene diacríticos: á, é, í, ó, ú, ñ, ¿, ¡ y mayúsculas: Á, É, Í, Ó, Ú, Ñ.
`;

const SAMPLE_SRT_WITH_BOM = '\uFEFF' + SAMPLE_SRT_UTF8;

// Latin-1 buffer encoding "canción" and "niño"
const SAMPLE_SRT_LATIN1_BUFFER = Buffer.concat([
  Buffer.from('1\n00:00:10,000 --> 00:00:15,000\nEsta es una canci', 'ascii'),
  Buffer.from([0xF3]), // ó in latin1
  Buffer.from('n para el ni', 'ascii'),
  Buffer.from([0xF1]), // ñ in latin1
  Buffer.from('o.\n', 'ascii')
]);

const SAMPLE_SRT_CORRUPT_TAGS = `1
00:00:01,000 --> 00:00:04,000
<font color="#ff0000">Texto en rojo</font> y {\an8}posición arriba

2
INVALID_TIMESTAMP_LINE
Texto que debe manejarse sin quebrar el conversor

3
00:00:10,500 --> 00:00:12,800
Subtítulo normal recuperado
`;

module.exports = {
  SAMPLE_VIDEO_BUFFER_SIZE,
  sampleVideoBuffer,
  FOLDERS,
  MOVIES,
  SERIES,
  FAMILY_VIDEOS,
  PHOTOS,
  MUSIC,
  TMDB_RECORDS,
  SAMPLE_SRT_UTF8,
  SAMPLE_SRT_WITH_BOM,
  SAMPLE_SRT_LATIN1_BUFFER,
  SAMPLE_SRT_CORRUPT_TAGS
};
