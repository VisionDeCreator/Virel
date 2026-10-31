import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { env, httpAction } from "./_generated/server";
const http = httpRouter();
const deliverMedia = httpAction(async (ctx, request) => {
  const videoId = new URL(request.url).pathname.slice("/media/".length);
  const headers = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };
  try {
    // Compatibility URL; all visibility checks and R2 signing happen in the API.
    const base = env.API_PUBLIC_URL?.replace(/\/$/, "");
    const url = base ? `${base}/media/${encodeURIComponent(videoId)}` : null;
    return url
      ? new Response(null, {
          status: 307,
          headers: { ...headers, Location: url },
        })
      : new Response("Video unavailable", { status: 404, headers });
  } catch {
    return new Response("Playback temporarily unavailable", {
      status: 503,
      headers,
    });
  }
});
http.route({ pathPrefix: "/media/", method: "GET", handler: deliverMedia });
auth.addHttpRoutes(http);
export default http;
