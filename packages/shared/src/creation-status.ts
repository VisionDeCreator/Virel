export const generationWaitMessage =
  "This can take several minutes, sometimes longer than 5 minutes.";
export const creationFilters = [
  { value: "ready", label: "Ready" },
  { value: "all", label: "All" },
  { value: "progress", label: "In progress" },
] as const;
export type CreationFilter = (typeof creationFilters)[number]["value"];
export function generationStatus(status: string): string {
  const labels: Record<string, string> = {
    reserved: "Preparing",
    submitting: "Submitting",
    queued: "Queued",
    generating: "Generating",
    ingesting: "Finishing your video",
    succeeded: "Ready",
    failed: "Generation failed",
    reconciliation_required: "Checking video status",
  };
  return labels[status] ?? "Checking video status";
}
export function generationInProgress(status: string): boolean {
  return status !== "succeeded" && status !== "failed";
}
export function elapsedTime(createdAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type PlatformBase = {
  assetId: string;
  videoId?: string;
  title: string;
  creator: string;
  duration: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  playbackUrl?: string;
};
