/**
 * The parts of "Tell me about new versions" that need no phone: reading version
 * numbers, picking the newest release from GitHub's list, deciding when to check,
 * and turning a release's notes into plain text. Tested in scripts/check.ts.
 */

export type Version = { major: number; minor: number; patch: number };

/** "v0.10.0-beta.5" or "0.10.0" → its three numbers. Null for anything else. */
export function parseVersion(tag: string | null | undefined): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec((tag ?? '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * Negative when a is older, positive when newer. Only the three numbers count:
 * every Engram release raises them, and the app knows its version as "0.10.0"
 * without the "-beta.5" its tag carries.
 */
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** The fields of a GitHub release this feature reads. */
export type Release = { tag_name: string; html_url: string; body?: string | null; draft?: boolean; prerelease?: boolean };

export type Found = { version: string; url: string; notes: string };

/**
 * The newest published release that is newer than `installed`, or null.
 * Drafts and pre-releases are skipped: a pre-release is the owner's to test and
 * promote by hand (AGENTS.md, Releasing), so testers are not sent to one.
 */
export function newerRelease(releases: Release[], installed: string): Found | null {
  const mine = parseVersion(installed);
  if (!mine) return null;
  let best: { r: Release; v: Version } | null = null;
  for (const r of releases) {
    if (!r || r.draft || r.prerelease) continue;
    const v = parseVersion(r.tag_name);
    if (!v || compareVersions(v, mine) <= 0) continue;
    if (!best || compareVersions(v, best.v) > 0) best = { r, v };
  }
  if (!best) return null;
  return { version: best.r.tag_name.replace(/^v/, ''), url: best.r.html_url, notes: plainNotes(best.r.body ?? '') };
}

/** One check a day at most. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export function checkDue(lastCheck: number | null, now: number): boolean {
  return lastCheck === null || !Number.isFinite(lastCheck) || now - lastCheck >= CHECK_EVERY_MS || now < lastCheck;
}

/**
 * A release body (Markdown) as short plain text for a sheet: no HTML comments,
 * headings or emphasis marks, links as their words, bullets as "•", and only the
 * "What's new"-style part before any install instructions when it is long.
 */
export function plainNotes(body: string, max = 900): string {
  let s = body.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  s = s
    .split('\n')
    .map((line) => {
      let l = line.replace(/^\s{0,3}#{1,6}\s+/, '');
      l = l.replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '• ');
      l = l.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
      l = l.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      l = l.replace(/`([^`]*)`/g, '$1');
      l = l.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, '$1$2');
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(l)) return '';
      return l.trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length <= max) return s;
  const cut = s.lastIndexOf('\n', max);
  return `${s.slice(0, cut > max * 0.5 ? cut : max).trimEnd()}\n…`;
}

/** Google Play's package name, as the installer of a Play install. */
export const PLAY_INSTALLER = 'com.android.vending';

export type Channel = 'play' | 'github';

/** A Play install asks Play; anything else (sideloaded from GitHub, adb) looks at GitHub's releases. */
export function channelFor(installer: string | null | undefined): Channel {
  return installer === PLAY_INSTALLER ? 'play' : 'github';
}
