/**
 * loadMapLibre — client-only loader for maplibre-gl, passed to react-map-gl's
 * `mapLib` prop.
 *
 * maplibre-gl v6 is ESM-only and starts its tile worker from a separate file
 * (`maplibre-gl-worker.mjs`). Under a bundler it cannot find that file by
 * itself, so the worker URL must be set once with `setWorkerUrl`. The
 * `new URL(..., import.meta.url)` expression has to stay literal: webpack and
 * Turbopack both detect it and emit the worker as a hashed same-origin asset
 * (served from /_next/static, so CSP `worker-src 'self'` covers it).
 *
 * The import is dynamic so the server bundle never evaluates maplibre-gl.
 */
import type * as MapLibre from "maplibre-gl";

let mapLibPromise: Promise<typeof MapLibre> | undefined;

export function loadMapLibre(): Promise<typeof MapLibre> {
  mapLibPromise ??= import("maplibre-gl").then((maplibre) => {
    maplibre.setWorkerUrl(
      new URL(
        "maplibre-gl/dist/maplibre-gl-worker.mjs",
        import.meta.url,
      ).toString(),
    );
    return maplibre;
  });
  return mapLibPromise;
}
