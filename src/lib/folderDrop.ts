/**
 * Collect files from a drag-and-drop, preserving folder structure via
 * webkitRelativePath when the browser exposes directory entries.
 */
export async function filesFromDataTransfer(
  dt: DataTransfer
): Promise<File[]> {
  const items = dt.items;
  if (!items || items.length === 0) {
    return Array.from(dt.files ?? []);
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    const entry =
      typeof item.webkitGetAsEntry === 'function'
        ? item.webkitGetAsEntry()
        : null;
    if (entry) entries.push(entry);
  }

  // No directory entries — fall back to flat FileList (may still have webkitRelativePath).
  if (entries.length === 0 || entries.every((e) => e.isFile)) {
    return Array.from(dt.files ?? []);
  }

  const files: File[] = [];
  for (const entry of entries) {
    await readEntry(entry, '', files);
  }
  return files;
}

async function readEntry(
  entry: FileSystemEntry,
  parentPath: string,
  out: File[]
): Promise<void> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    const relative = parentPath ? `${parentPath}/${file.name}` : file.name;
    out.push(withRelativePath(file, relative));
    return;
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry;
    const nextParent = parentPath ? `${parentPath}/${dir.name}` : dir.name;
    const children = await readDirEntries(dir);
    for (const child of children) {
      await readEntry(child, nextParent, out);
    }
  }
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirEntries(
  dir: FileSystemDirectoryEntry
): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];

  return new Promise((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function withRelativePath(file: File, relativePath: string): File {
  // File.webkitRelativePath is read-only; rebuild so ingest can see the path.
  try {
    const clone = new File([file], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
    Object.defineProperty(clone, 'webkitRelativePath', {
      value: relativePath.replace(/\\/g, '/'),
      writable: false,
      configurable: true,
    });
    return clone;
  } catch {
    return file;
  }
}
