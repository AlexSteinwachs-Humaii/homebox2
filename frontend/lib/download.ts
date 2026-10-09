/** Save a validated response without navigating away or retaining its object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start reading the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
