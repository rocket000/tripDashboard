export const folderMime = 'application/vnd.google-apps.folder';
export const driveScope = 'https://www.googleapis.com/auth/drive.readonly';

const api = 'https://www.googleapis.com/drive/v3/files';
const validId = /^[a-zA-Z0-9_-]+$/;
const fileFields = 'id,name,mimeType,webViewLink,resourceKey,size,capabilities(canDownload,canListChildren)';
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
const maxPreviewBytes = 30 * 1024 * 1024;

export function driveLink(file) {
  try {
    const url = new URL(file.webViewLink);
    if (url.origin === 'https://drive.google.com' || url.origin === 'https://docs.google.com') {
      return url.href;
    }
  } catch {
    // Use Drive's generic link if the file has no browser link.
  }
  const url = new URL('https://drive.google.com/open');
  url.searchParams.set('id', file.id);
  if (file.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
  return url.href;
}

export function previewType(file) {
  if (file.mimeType === 'application/pdf') return 'pdf';
  if (imageTypes.has(file.mimeType)) return 'image';
  return null;
}

export function fileKind(file) {
  if (file.mimeType === folderMime) return 'Folder';
  const preview = previewType(file);
  if (preview === 'pdf') return 'PDF';
  if (preview === 'image') return 'Image';
  return 'File';
}

export class DriveError extends Error {
  constructor(status, details) {
    super(`Drive request failed with HTTP ${status}`);
    this.status = status;
    this.reason = details?.details?.find(item => item.reason)?.reason ?? details?.errors?.[0]?.reason;
  }
}

const folderErrorMessages = new Map([
  ['SERVICE_DISABLED', 'Enable the Google Drive API in the Google Cloud project that owns this dashboard’s OAuth client, then try again.'],
  ['accessNotConfigured', 'Enable the Google Drive API in the Google Cloud project that owns this dashboard’s OAuth client, then try again.'],
  ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'The Google connection is missing Drive read access. Connect again and grant the requested Drive permission.'],
  ['insufficientPermissions', 'The Google connection is missing Drive read access. Connect again and grant the requested Drive permission.'],
  ['domainPolicy', 'Your Google Workspace administrator has blocked this app from accessing Drive. Ask the administrator to allow it.'],
]);

export function folderErrorMessage(error) {
  return folderErrorMessages.get(error.reason) ?? ([403, 404].includes(error.status)
    ? 'This folder is unavailable. Check that you connected the invited Google account and that the folder is shared with you.'
    : 'Could not load this folder. Check your connection and try again.');
}

export function connectDrive(token, fetcher = fetch) {
  async function request(path, params, signal) {
    const suffix = params ? `?${new URLSearchParams(params)}` : '';
    const response = await fetcher(`${api}${path}${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new DriveError(response.status, body?.error);
    }
    return response;
  }

  return {
    async folder(id, signal) {
      const response = await request(`/${encodeURIComponent(id)}`, {
        fields: 'id,name,mimeType,trashed,capabilities(canListChildren)',
        supportsAllDrives: 'true',
      }, signal);
      const folder = await response.json();
      if (folder.mimeType !== folderMime || folder.trashed || folder.capabilities?.canListChildren === false) {
        throw new DriveError(404);
      }
      return folder;
    },

    async children(id, signal) {
      if (!validId.test(id)) throw new DriveError(404);

      const list = [];
      const params = {
        q: `'${id}' in parents and trashed = false`,
        fields: `nextPageToken,files(${fileFields})`,
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      };

      do {
        const response = await request('', params, signal);
        const page = await response.json();
        for (const file of page.files ?? []) {
          if (file.mimeType !== folderMime || file.capabilities?.canListChildren !== false) {
            list.push(file);
          }
        }
        params.pageToken = page.nextPageToken;
      } while (params.pageToken);

      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      return list.sort((a, b) =>
        Number(b.mimeType === folderMime) - Number(a.mimeType === folderMime) ||
        collator.compare(a.name, b.name));
    },

    async preview(file, signal) {
      if (Number(file.size) > maxPreviewBytes) throw new DriveError(413);
      const response = await request(`/${encodeURIComponent(file.id)}`, {
        alt: 'media',
        supportsAllDrives: 'true',
      }, signal);
      if (Number(response.headers.get('Content-Length')) > maxPreviewBytes) {
        await response.body?.cancel();
        throw new DriveError(413);
      }
      const blob = await response.blob();
      if (blob.size > maxPreviewBytes) throw new DriveError(413);

      // Assign only the expected type. The UI renders images in an <img>.
      return new Blob([blob], { type: file.mimeType });
    },
  };
}
