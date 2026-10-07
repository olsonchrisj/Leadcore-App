export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari needs the URL to outlive the click by a moment.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type SaveOutcome = "shared" | "downloaded" | "cancelled";

/** Share sheet where the browser has one for files (iOS: Save to Files, AirDrop, Mail), else a download. */
export async function shareOrDownload(name: string, text: string): Promise<SaveOutcome> {
  try {
    const file = new File([text], name, { type: "application/json" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Leadcore backup" });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
    /* anything else: fall through to a plain download */
  }
  downloadText(name, text);
  return "downloaded";
}
