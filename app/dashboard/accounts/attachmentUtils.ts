// Shared by the Files (upload) modal and the View modal.

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function kindLabel(type: string): string {
  if (type.startsWith("image/")) return "IMG";
  if (type === "application/pdf") return "PDF";
  return "DOC";
}

// Images and PDFs render in a browser tab; Word files only download.
export function isPreviewable(type: string): boolean {
  return type.startsWith("image/") || type === "application/pdf";
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",", 2);
  const mime = /^data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
