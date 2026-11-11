import kinds from './cloud-shared/filekinds.json' with { type: 'json' };

// Attached files on a card, like the website, Obsidian and Android. No Joplin API in here, so it can be tested on its own.
// A Joplin attachment is a resource, linked as [name](:/<id>) or ![name](:/<id>). Photos and sounds already show on the
// card (cover and player); every other file shows as a chip with its name and size.

const RESOURCE_LINK = /!?\[([^\]]*)\]\(:\/([0-9a-fA-F]{32})[^)]*\)/g;

const extensionOf = (name) => /\.([^./\\]+)$/.exec(String(name || ''))?.[1].toLowerCase() || '';

/** image, audio, video, pdf or file: the one list every JotDrop app uses (cloud/shared/filekinds.json). */
export function fileKind(name) {
  const extension = extensionOf(name);
  for (const kind of ['image', 'audio', 'video', 'pdf']) if (Object.prototype.hasOwnProperty.call(kinds[kind], extension)) return kind;
  return 'file';
}

/** Every link to a resource or note in [body], in order: { link, id, text }. A link to a note is sorted out by its lookup. */
export function resourceLinks(body) {
  return [...String(body || '').matchAll(RESOURCE_LINK)].map((m) => ({ link: m[0], id: m[2].toLowerCase(), text: m[1] }));
}

/**
 * The chip for a resource (fields id, title, mime, file_extension, size), or null for a photo or a sound.
 * The name is the resource's file name, as Joplin shows it; the size only once the file is on this device.
 */
export function fileChip(resource, linkText = '') {
  const name = String(resource.title || linkText || `file.${resource.file_extension || 'bin'}`);
  const kind = fileKind(resource.file_extension ? `.${resource.file_extension}` : name);
  const mime = String(resource.mime || '');
  if (kind === 'image' || kind === 'audio' || mime.startsWith('image/') || mime.startsWith('audio/')) return null;
  return { id: String(resource.id), name, kind, size: Number(resource.size) > 0 ? Number(resource.size) : 0 };
}

/** Like the website's file chips. */
export function sizeText(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.ceil(bytes / 1024))} KiB`;
}
