## 2026-10-13T12:31:32Z

You are the Media Players & Subtitles Explorer (`explorer_m3_3`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_3
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Prior survey research:
- Tizen & Chromium M56 specification: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_survey_1\tizen_chromium_m56_spec.md
- UI & Streaming research: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md

Scope: Features F14 (Custom Video Player with Subtitle Selector), F15 (Fullscreen Photo Slideshow), and F16 (Audio Player with Playlist).

Your task:
Analyze and formulate the exact technical architecture and blueprints for:
1. Custom HTML5 Video Player (`client/src/views/player.ts`):
   - Fullscreen `<video>` element pointing to `/api/stream/:fileId`.
   - 10-foot UI control overlay:
     * Top bar: Media title and category.
     * Bottom bar: Play/Pause button, current time / total duration formatted in `HH:MM:SS`, visual progress bar (scrubber) showing buffered ranges and playhead position.
     * Subtitle selector modal / menu: lists available WebVTT tracks fetched from `/api/subtitles/:fileId`, with auto-selection of Spanish track, and "Desactivado" option.
     * Auto-hide timer: controls automatically fade out after 3 seconds of inactivity during playback. Any remote keypress wakes up controls.
   - Remote key mappings during playback:
     * Enter (13) / MediaPlayPause (10252) / MediaPlay (415) / MediaPause (19): toggle Play / Pause.
     * ArrowLeft (37) / MediaRewind (412): seek backward 10 seconds.
     * ArrowRight (39) / MediaFastForward (417): seek forward 10 seconds.
     * ArrowUp (38) / ArrowDown (40): toggle control bar visibility or navigate into control buttons (Subtitle button, Audio track button).
     * Return (10009) / MediaStop (413): stop playback, cleanup video stream, and exit to previous view.
2. Fullscreen Photo Slideshow (`client/src/views/slideshow.ts`):
   - Fullscreen viewer for images in `Fotos` category.
   - Auto-advance slideshow timer (default 5 seconds per slide).
   - Remote controls: ArrowRight (next image), ArrowLeft (previous image), Enter / PlayPause (pause/resume auto-advance), Return (exit to photo gallery).
   - Smooth GPU opacity transitions between slides (using `transition: opacity 0.5s ease-in-out` and `transform: translate3d(0,0,0)`).
3. Audio Player with Playlist Queue (`client/src/views/audio.ts`):
   - Dedicated music view for items in `Música`.
   - Fullscreen/rich player with:
     * Large album art / cover image with fallback music disc icon.
     * Track title, artist/album name.
     * Audio scrubber progress bar with elapsed and remaining time.
     * Playlist queue list showing current and upcoming tracks.
   - Remote controls: Play/Pause, Next Track (ArrowRight or MediaTrackNext), Previous Track (ArrowLeft or MediaTrackPrevious), Return (exit while stopping audio or returning to catalog).
4. Unit test plan for player, subtitle selector, slideshow, and audio player in `tests/unit/m3/player.test.ts`.

Write your detailed blueprint to:
c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_3\players_subtitles_spec.md
Write handoff.md in your working directory and send a completion message to your parent.
