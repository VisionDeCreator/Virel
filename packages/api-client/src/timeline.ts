import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@virel/backend";
import {
  emptyTimeline,
  validateTimeline,
  validateEditorUpload,
  type Timeline,
  type TimelineClip,
} from "@virel/shared";
import { useApiAction } from "./http";
export type TimelineStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
};
const copy = (document: Timeline): Timeline =>
  JSON.parse(JSON.stringify(document));
export function useTimeline(
  projectId: Id<"timelineProjects">,
  storage?: TimelineStorage,
) {
  const project = useQuery(api.timeline.get, { projectId });
  const assets = useQuery(api.timeline.assets, { projectId });
  const save = useMutation(api.timeline.save),
    queue = useMutation(api.timeline.queueExport);
  const preview = useApiAction("mediaActions:preview"),
    begin = useApiAction("mediaActions:beginUpload"),
    finish = useApiAction("mediaActions:finishUpload"),
    publishAction = useApiAction("timeline:publish");
  const [document, setDocument] = useState<Timeline>(copy(emptyTimeline));
  const [title, setTitle] = useState("");
  const [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [recovery, setRecovery] = useState<{
    document: Timeline;
    title: string;
  } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const revision = useRef(0),
    changeVersion = useRef(0),
    savedVersion = useRef(0),
    initial = useRef(false);
  const state = useRef({ document, title });
  state.current = { document, title };
  const history = useRef<Timeline[]>([]),
    future = useRef<Timeline[]>([]);
  const flight = useRef<Promise<number> | null>(null);
  const draftKey = `virel.timeline.${projectId}`;
  const draftStorage =
    storage ??
    (typeof window === "undefined" ? undefined : window.localStorage);
  useEffect(() => {
    if (!project || initial.current) return;
    initial.current = true;
    revision.current = project.revision;
    setDocument(copy(project.document));
    setTitle(project.title);
    setReady(true);
    if (draftStorage)
      void Promise.resolve(draftStorage.getItem(draftKey))
        .then((raw) => {
          if (!raw) return;
          try {
            const draft = JSON.parse(raw);
            validateTimeline(draft.document, true);
            if (
              JSON.stringify(draft.document) !==
                JSON.stringify(project.document) ||
              draft.title !== project.title
            )
              setRecovery(draft);
          } catch {
            /* Invalid local recovery never replaces a server draft. */
          }
        })
        .catch(() => {});
  }, [project, draftKey, draftStorage]);
  function changed(next: Timeline) {
    history.current = [
      ...history.current.slice(-49),
      copy(state.current.document),
    ];
    future.current = [];
    changeVersion.current++;
    setDocument(next);
    state.current.document = next;
    setDirty(true);
    setError("");
  }
  function setProjectTitle(value: string) {
    changeVersion.current++;
    setTitle(value);
    state.current.title = value;
    setDirty(true);
    setError("");
  }
  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(copy(state.current.document));
    changeVersion.current++;
    setDocument(previous);
    state.current.document = previous;
    setDirty(true);
    setError("");
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(copy(state.current.document));
    changeVersion.current++;
    setDocument(next);
    state.current.document = next;
    setDirty(true);
    setError("");
  }
  async function flush(): Promise<number> {
    while (flight.current) await flight.current;
    if (savedVersion.current === changeVersion.current) return revision.current;
    const current = { ...state.current },
      version = changeVersion.current;
    validateTimeline(current.document, true);
    setSaving(true);
    const task = (async () => {
      try {
        revision.current = await save({
          projectId,
          revision: revision.current,
          title: current.title,
          document: current.document as Parameters<typeof save>[0]["document"],
        });
        savedVersion.current = version;
        if (version === changeVersion.current) {
          setDirty(false);
          await draftStorage?.removeItem(draftKey);
        }
        return revision.current;
      } finally {
        flight.current = null;
        setSaving(false);
      }
    })();
    flight.current = task;
    return task;
  }
  useEffect(() => {
    if (!ready || !dirty) return;
    if (draftStorage)
      void Promise.resolve(
        draftStorage.setItem(
          draftKey,
          JSON.stringify({ ...state.current, revision: revision.current }),
        ),
      ).catch(() => {});
    const timer = setTimeout(() => {
      void flush().catch((e) =>
        setError(
          e instanceof Error ? e.message : "Could not save your timeline.",
        ),
      );
    }, 700);
    return () => clearTimeout(timer);
  }, [document, title, ready, dirty]);
  // Keep signed links fresh without ever persisting them in the project document.
  const assetKey = [
    ...new Set(
      [...document.clips, ...document.audio]
        .map((c) => c.assetId)
        .concat(project?.latestExport?.assetId ?? []),
    ),
  ].join(",");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      for (const assetId of assetKey.split(",").filter(Boolean))
        void preview({ assetId: assetId as Id<"mediaAssets"> })
          .then((url) => {
            if (live) setUrls((old) => ({ ...old, [assetId]: url }));
          })
          .catch(() => {
            if (live)
              setError(
                "Could not load a media preview. Reopen the editor to refresh it.",
              );
          });
    };
    refresh();
    const timer = setInterval(refresh, 45 * 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [assetKey, preview]);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return {
    project,
    assets,
    document,
    title,
    setTitle: setProjectTitle,
    ready,
    dirty,
    saving,
    busy,
    error,
    urls,
    recovery,
    canUndo: history.current.length > 0,
    canRedo: future.current.length > 0,
    change: changed,
    undo,
    redo,
    flush,
    run,
    restore: () => {
      if (recovery) {
        changed(copy(recovery.document));
        setProjectTitle(recovery.title);
        setRecovery(null);
      }
    },
    reload: () => {
      if (!project) return;
      revision.current = project.revision;
      setDocument(copy(project.document));
      setTitle(project.title);
      state.current = {
        document: copy(project.document),
        title: project.title,
      };
      changeVersion.current = savedVersion.current = 0;
      history.current = [];
      future.current = [];
      setDirty(false);
      setError("");
      setRecovery(null);
      if (draftStorage)
        void Promise.resolve(draftStorage.removeItem(draftKey)).catch(() => {});
    },
    export: () =>
      run(async () => {
        let rev = await flush();
        while (savedVersion.current !== changeVersion.current)
          rev = await flush();
        validateTimeline(state.current.document);
        return queue({ projectId, revision: rev });
      }),
    upload: (
      file: { name: string; type: string; bytes: number },
      transfer: (url: string) => Promise<void>,
    ) =>
      run(async () => {
        validateEditorUpload(file.type, file.bytes);
        const uploaded = await begin({
          name: file.name,
          contentType: file.type,
          bytes: file.bytes,
          purpose: "editor",
        });
        await transfer(uploaded.url);
        await finish({ assetId: uploaded.assetId as Id<"mediaAssets"> });
        return uploaded.assetId;
      }),
    publish: (description: string, remixEnabled: boolean) =>
      run(async () => {
        const job = project?.latestExport;
        if (
          !job ||
          job.status !== "ready" ||
          dirty ||
          job.revision !== project?.revision
        )
          throw new Error("Export the saved timeline before publishing.");
        return publishAction({
          exportId: job._id,
          title,
          description,
          remixEnabled,
        });
      }),
    download: () =>
      run(async () => {
        const assetId = project?.latestExport?.assetId;
        if (!assetId) throw new Error("Export your timeline first.");
        return preview({ assetId, download: true });
      }),
    updateClip: (id: string, patch: Partial<TimelineClip>) =>
      changed({
        ...state.current.document,
        clips: state.current.document.clips.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      }),
  };
}
