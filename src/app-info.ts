const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface AppInfo {
  name: string;
  version: string;
}

/**
 * Formats a semver string for display, e.g. "0.1.0" -> "v0.1.0".
 * Throws on anything that isn't semver, so a bad build fails loudly
 * instead of showing a broken version on the page.
 */
export function formatVersion(version: string): string {
  const trimmed = version.trim();
  if (!SEMVER.test(trimmed)) {
    throw new Error(`Invalid version: "${version}"`);
  }
  return `v${trimmed}`;
}

export function appInfo(version: string = __APP_VERSION__): AppInfo {
  return { name: 'Spoofball', version: formatVersion(version) };
}
