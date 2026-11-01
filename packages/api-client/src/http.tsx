import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import type { Id } from "@virel/backend";
import type { StudioInput } from "@virel/shared";
const ApiContext = createContext("");
export function ApiProvider({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <ApiContext.Provider value={url.replace(/\/$/, "")}>
      {children}
    </ApiContext.Provider>
  );
}
export function useApiUrl() {
  return useContext(ApiContext);
}
type Operations = {
  "timeline:publish": {
    args: {
      exportId: Id<"timelineExports">;
      title: string;
      description: string;
      remixEnabled: boolean;
    };
    result: string;
  };
  "mediaActions:beginUpload": {
    args: {
      name: string;
      contentType: string;
      bytes: number;
      purpose?: "editor";
    };
    result: { assetId: string; url: string };
  };
  "mediaActions:finishUpload": {
    args: { assetId: Id<"mediaAssets"> };
    result: string;
  };
  "mediaActions:preview": {
    args: { assetId: Id<"mediaAssets">; download?: boolean };
    result: string;
  };
  "generationActions:quote": {
    args: { input: StudioInput };
    result: {
      quoteId: Id<"generationQuotes">;
      credits: number;
      surchargeCredits: number;
      royaltyEligible: boolean;
      rewardMessage: string;
      duration: number;
      expiresAt: number;
    };
  };
  "generation:start": {
    args: { quoteId: Id<"generationQuotes">; requestId: string };
    result: Id<"generationJobs">;
  };
  "generation:resume": { args: { jobId: Id<"generationJobs"> }; result: null };
  "generation:unpublish": {
    args: { jobId: Id<"generationJobs"> };
    result: null;
  };
  "publishing:publish": {
    args: {
      jobId: Id<"generationJobs">;
      title: string;
      description: string;
      remixEnabled: boolean;
    };
    result: string;
  };
};
export async function studioRequest<Result>(
  base: string,
  token: string | null | undefined,
  operation: string,
  args: unknown,
): Promise<Result> {
  if (!base) throw new Error("Studio API is not configured.");
  if (!token) throw new Error("Sign in to use Studio.");
  const response = await fetch(
    `${base}/v1/studio/${encodeURIComponent(operation)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    },
  );
  const data = (await response.json().catch(() => null)) as {
    value?: Result;
    error?: string;
  } | null;
  if (!response.ok)
    throw new Error(data?.error ?? "Studio request failed. Try again.");
  if (!data || !("value" in data))
    throw new Error("Studio returned an invalid response.");
  return data.value as Result;
}
export function useApiAction<Key extends keyof Operations>(operation: Key) {
  const base = useContext(ApiContext);
  const token = useAuthToken();
  return useCallback(
    (args: Operations[Key]["args"]): Promise<Operations[Key]["result"]> =>
      studioRequest(base, token, operation, args),
    [base, token, operation],
  );
}
