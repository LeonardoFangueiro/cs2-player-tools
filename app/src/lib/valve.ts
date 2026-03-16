/**
 * Valve SDR datacenter resolver — fetches real IPs from Steam API.
 * Never hardcode Valve IPs — they change. Always use this module.
 */

import { invoke } from "./tauri";

export interface ValveDC {
  code: string;
  name: string;
  ip: string;
}

// Cache: fetched once, reused everywhere
let cachedDCs: ValveDC[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 300000; // 5 minutes

/**
 * Get Valve datacenter IPs from the live SDR config.
 * Returns the first relay IP for each PoP that has relays.
 * Cached for 5 minutes.
 */
export async function getValveDCs(): Promise<ValveDC[]> {
  if (cachedDCs && Date.now() - cacheTime < CACHE_TTL) {
    return cachedDCs;
  }

  try {
    const config = await invoke<{
      pops: Array<{
        code: string;
        desc: string;
        relays: Array<{ ipv4: string }>;
      }>;
    }>("fetch_sdr_config");

    const dcs: ValveDC[] = config.pops
      .filter((p) => p.relays.length > 0)
      .map((p) => ({
        code: p.code,
        name: p.desc || p.code.toUpperCase(),
        ip: p.relays[0].ipv4,
      }))
      // Sort by common EU/NA DCs first for faster ping
      .sort((a, b) => {
        const priority = ["fra", "ams", "lhr", "mad", "sto", "waw", "vie", "iad", "ord", "gru", "sgp", "tyo", "syd"];
        const ai = priority.indexOf(a.code);
        const bi = priority.indexOf(b.code);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.code.localeCompare(b.code);
      });

    cachedDCs = dcs;
    cacheTime = Date.now();
    return dcs;
  } catch {
    // If SDR fetch fails, return empty — callers should handle gracefully
    return cachedDCs || [];
  }
}

/**
 * Get top N datacenters (for quick ping tests).
 */
export async function getTopDCs(n = 10): Promise<ValveDC[]> {
  const all = await getValveDCs();
  return all.slice(0, n);
}

/**
 * Get a single DC IP by code (e.g. "fra" → "155.133.240.55").
 * Returns null if not found.
 */
export async function getDCIp(code: string): Promise<string | null> {
  const all = await getValveDCs();
  return all.find((d) => d.code === code)?.ip ?? null;
}

/**
 * Get the first available DC IP (for default ping target).
 */
export async function getDefaultPingTarget(): Promise<string> {
  const dcs = await getTopDCs(1);
  return dcs[0]?.ip ?? "1.1.1.1"; // Ultimate fallback
}

/**
 * Clear the cache (e.g. when user clicks Refresh).
 */
export function clearValveCache() {
  cachedDCs = null;
  cacheTime = 0;
}
