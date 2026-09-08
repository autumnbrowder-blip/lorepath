/**
 * Hardcover.app is removed from the catalog pipeline.
 * HARDCOVER_API_TOKEN may still exist in Netlify; this module never reads it
 * and never contacts api.hardcover.app.
 *
 * Keep isHardcoverId so leftover /books/hardcover-* routes are not treated
 * as Google volume ids.
 */
const HARDCOVER_ID_PREFIX = "hardcover-";

export function isHardcoverId(id: string): boolean {
  return id.startsWith(HARDCOVER_ID_PREFIX);
}
