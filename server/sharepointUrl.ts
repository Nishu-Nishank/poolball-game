/**
 * Splits a SharePoint file link — as copied from the browser or the "Share" dialog — into the
 * parts Microsoft Graph needs: host name, site path and the decoded server-relative file path.
 *
 *   https://contoso.sharepoint.com/:x:/r/sites/Team/SiteAssets/Published/Book%20(Published).xlsx?d=…
 *   → { hostname: 'contoso.sharepoint.com', sitePath: '/sites/Team',
 *       filePath: '/sites/Team/SiteAssets/Published/Book (Published).xlsx' }
 */
export interface SharePointFileUrl {
  hostname: string;
  sitePath: string;
  filePath: string;
}

export function parseSharePointFileUrl(link: string): SharePointFileUrl {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error('SHAREPOINT_FILE_URL is not a valid URL.');
  }
  // Drop the "/:x:/r" (or ":w:/s", ":b:/g" …) link-type prefix that SharePoint adds to shared links.
  const path = decodeURIComponent(url.pathname.replace(/^\/:[a-z]:\/[a-z]\//i, '/'));
  const match = /^(\/(?:sites|teams)\/[^/]+)(\/.+)$/i.exec(path);
  if (!match || !/\.(xlsx|csv)$/i.test(path)) {
    throw new Error(
      'SHAREPOINT_FILE_URL must be a link to an .xlsx or .csv file inside a SharePoint site (…/sites/<site>/…/<file>.xlsx).',
    );
  }
  return { hostname: url.hostname, sitePath: match[1], filePath: path };
}

/**
 * Finds the document library containing the file and the file's path inside it.
 * Libraries are matched by their web URL, so files outside the default "Documents"
 * library (e.g. "Site Assets") resolve correctly. The longest matching library wins.
 */
export function locateInDrives(
  file: SharePointFileUrl,
  drives: { id: string; webUrl: string }[],
): { driveId: string; pathInDrive: string } | null {
  const target = file.filePath.toLowerCase();
  let best: { driveId: string; pathInDrive: string; length: number } | null = null;
  for (const drive of drives) {
    let drivePath: string;
    try {
      drivePath = decodeURIComponent(new URL(drive.webUrl).pathname).replace(/\/+$/, '');
    } catch {
      continue;
    }
    if (!target.startsWith(`${drivePath.toLowerCase()}/`)) continue;
    if (!best || drivePath.length > best.length) {
      best = { driveId: drive.id, pathInDrive: file.filePath.slice(drivePath.length), length: drivePath.length };
    }
  }
  return best && { driveId: best.driveId, pathInDrive: best.pathInDrive };
}
