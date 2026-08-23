import type {
  AccountInfo,
  Configuration,
  PublicClientApplication as PublicClientApplicationType,
} from '@azure/msal-browser';
import { ingestFile } from './uploads';

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string | undefined;

export function microsoftConfigured(): boolean {
  return Boolean(clientId && clientId.trim().length > 0);
}

/** @deprecated Use microsoftConfigured */
export function sharePointConfigured(): boolean {
  return microsoftConfigured();
}

function authority(): string {
  const tid = tenantId?.trim();
  if (tid) return `https://login.microsoftonline.com/${tid}`;
  return 'https://login.microsoftonline.com/common';
}

const SCOPES = ['Files.Read.All', 'Sites.Read.All', 'User.Read'];
// Least privilege for this connector still needs site + file read to list
// document libraries. Tokens are stored in sessionStorage (tab-scoped).
// Do not add write scopes. Review with UN Azure AD before production.

let msalInstance: PublicClientApplicationType | null = null;
let initPromise: Promise<void> | null = null;

// @azure/msal-browser is dynamically imported so it never lands in the main
// bundle for a deployment that hasn't configured Azure AD (or for users who
// never open the SharePoint connector).
async function getInstance(): Promise<PublicClientApplicationType> {
  if (!microsoftConfigured()) {
    throw new Error(
      'SharePoint integration is not configured. Add VITE_AZURE_CLIENT_ID to .env.local.'
    );
  }
  if (!msalInstance) {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const config: Configuration = {
      auth: {
        clientId: clientId!,
        authority: authority(),
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    };
    msalInstance = new PublicClientApplication(config);
  }
  return msalInstance;
}

async function ensureInitialised(): Promise<PublicClientApplicationType> {
  const instance = await getInstance();
  if (!initPromise) initPromise = instance.initialize();
  await initPromise;
  return instance;
}

export interface SignedInUser {
  name: string;
  email: string;
  account: AccountInfo;
}

export async function signIn(): Promise<SignedInUser> {
  const instance = await ensureInitialised();
  const result = await instance.loginPopup({ scopes: SCOPES });
  instance.setActiveAccount(result.account);
  return accountToUser(result.account);
}

export async function signOut(): Promise<void> {
  const instance = await ensureInitialised();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  await instance.logoutPopup({ account: account ?? undefined });
}

export async function getCurrentUser(): Promise<SignedInUser | null> {
  const instance = await ensureInitialised();
  const accounts = instance.getAllAccounts();
  if (accounts.length === 0) return null;
  const account = instance.getActiveAccount() ?? accounts[0];
  if (!instance.getActiveAccount()) instance.setActiveAccount(account);
  return accountToUser(account);
}

function accountToUser(account: AccountInfo): SignedInUser {
  return {
    name: account.name ?? account.username,
    email: account.username,
    account,
  };
}

async function getAccessToken(): Promise<string> {
  const instance = await ensureInitialised();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  if (!account) throw new Error('Not signed in.');
  try {
    const result = await instance.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch {
    const result = await instance.acquireTokenPopup({ scopes: SCOPES, account });
    return result.accessToken;
  }
}

async function graph<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith('http')
    ? path
    : `https://graph.microsoft.com/v1.0${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function graphOptional<T>(path: string): Promise<T | null> {
  const token = await getAccessToken();
  const url = path.startsWith('http')
    ? path
    : `https://graph.microsoft.com/v1.0${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Retention labels matching this name are excluded from browse and import. */
export const BLOCKED_RETENTION_LABEL = 'Confidential';

export function isBlockedRetentionLabel(label?: string | null): boolean {
  if (!label) return false;
  return label.trim().toLowerCase() === BLOCKED_RETENTION_LABEL.toLowerCase();
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

interface GraphList<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export interface SharePointSite {
  id: string;
  displayName: string;
  webUrl: string;
}

export interface DriveSummary {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

export interface DriveItemSummary {
  id: string;
  name: string;
  isFolder: boolean;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl: string;
  parentDriveId: string;
  mimeType?: string;
}

export async function listMyDrives(): Promise<DriveSummary[]> {
  const data = await graph<GraphList<{ id: string; name: string; driveType: string; webUrl: string }>>('/me/drives');
  return data.value.map((d) => ({
    id: d.id,
    name: d.name,
    driveType: d.driveType,
    webUrl: d.webUrl,
  }));
}

export async function searchSites(q: string): Promise<SharePointSite[]> {
  const query = q.trim() ? encodeURIComponent(q.trim()) : '*';
  const data = await graph<GraphList<{ id: string; displayName?: string; name?: string; webUrl: string }>>(
    `/sites?search=${query}`
  );
  return data.value.map((s) => ({
    id: s.id,
    displayName: s.displayName ?? s.name ?? s.webUrl,
    webUrl: s.webUrl,
  }));
}

export async function getSiteDefaultDrive(siteId: string): Promise<DriveSummary> {
  const data = await graph<{ id: string; name: string; driveType: string; webUrl: string }>(
    `/sites/${siteId}/drive`
  );
  return {
    id: data.id,
    name: data.name,
    driveType: data.driveType,
    webUrl: data.webUrl,
  };
}

interface RawDriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl: string;
  folder?: unknown;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string };
  retentionLabel?: { name?: string } | null;
}

export interface ListChildrenResult {
  items: DriveItemSummary[];
  /** Number of items hidden because they carry the Confidential retention label. */
  hiddenConfidentialCount: number;
}

async function fetchChildrenRaw(
  driveId: string,
  itemId: string | 'root'
): Promise<{ items: RawDriveItem[]; expandWorked: boolean }> {
  const base =
    itemId === 'root'
      ? `/drives/${driveId}/root/children?$top=200`
      : `/drives/${driveId}/items/${itemId}/children?$top=200`;
  try {
    const data = await graph<GraphList<RawDriveItem>>(`${base}&$expand=retentionLabel`);
    return { items: data.value, expandWorked: true };
  } catch {
    const data = await graph<GraphList<RawDriveItem>>(base);
    return { items: data.value, expandWorked: false };
  }
}

async function resolveRetentionLabels(
  driveId: string,
  raw: RawDriveItem[],
  expandWorked: boolean
): Promise<Map<string, string | null>> {
  const labelById = new Map<string, string | null>();

  if (expandWorked) {
    for (const it of raw) {
      labelById.set(it.id, it.retentionLabel?.name ?? null);
    }
    return labelById;
  }

  await mapPool(raw, 8, async (it) => {
    const label = await graphOptional<{ name?: string }>(
      `/drives/${driveId}/items/${it.id}/retentionLabel`
    );
    labelById.set(it.id, label?.name ?? null);
  });
  return labelById;
}

function rawToSummary(it: RawDriveItem, driveId: string): DriveItemSummary {
  return {
    id: it.id,
    name: it.name,
    isFolder: Boolean(it.folder),
    size: it.size,
    lastModifiedDateTime: it.lastModifiedDateTime,
    webUrl: it.webUrl,
    parentDriveId: it.parentReference?.driveId ?? driveId,
    mimeType: it.file?.mimeType,
  };
}

export async function listChildren(
  driveId: string,
  itemId: string | 'root'
): Promise<ListChildrenResult> {
  const { items: raw, expandWorked } = await fetchChildrenRaw(driveId, itemId);
  const labelById = await resolveRetentionLabels(driveId, raw, expandWorked);

  let hiddenConfidentialCount = 0;
  const items: DriveItemSummary[] = [];

  for (const it of raw) {
    const label = labelById.get(it.id);
    if (isBlockedRetentionLabel(label)) {
      hiddenConfidentialCount += 1;
      continue;
    }
    items.push(rawToSummary(it, driveId));
  }

  return { items, hiddenConfidentialCount };
}

export async function itemHasBlockedRetentionLabel(
  driveId: string,
  itemId: string
): Promise<boolean> {
  const label = await graphOptional<{ name?: string }>(
    `/drives/${driveId}/items/${itemId}/retentionLabel`
  );
  return isBlockedRetentionLabel(label?.name);
}

export interface ImportResult {
  ok: boolean;
  filename: string;
  error?: string;
}

const SUPPORTED_EXT = ['.pdf', '.docx', '.txt', '.md', '.markdown'];

export function isImportableFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_EXT.some((ext) => lower.endsWith(ext));
}

export async function importDriveItem(
  driveId: string,
  itemId: string,
  filename: string
): Promise<ImportResult> {
  if (!isImportableFilename(filename)) {
    return {
      ok: false,
      filename,
      error: 'Unsupported type. Only PDF, .txt, .md are supported in this session.',
    };
  }
  try {
    if (await itemHasBlockedRetentionLabel(driveId, itemId)) {
      return {
        ok: false,
        filename,
        error: `Excluded — retention label is "${BLOCKED_RETENTION_LABEL}".`,
      };
    }
    const token = await getAccessToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      return {
        ok: false,
        filename,
        error: `Download failed (${res.status}).`,
      };
    }
    const blob = await res.blob();
    const file = new File([blob], filename, {
      type: blob.type || guessMime(filename),
    });
    const ingest = await ingestFile(file);
    if (!ingest.ok) {
      return { ok: false, filename, error: ingest.error };
    }
    return { ok: true, filename };
  } catch (err) {
    return {
      ok: false,
      filename,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  return 'text/plain';
}
