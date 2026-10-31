import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@virel/backend";
import {
  defaultStudioInput,
  normalizeStudioDraft,
  type StudioInput,
} from "@virel/shared";
import { serverInput } from "./studioInput";
export type DraftStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => unknown;
  removeItem: (key: string) => unknown;
};
export function useStudioScripts(
  input: StudioInput,
  setInput: Dispatch<SetStateAction<StudioInput>>,
  storage?: DraftStorage,
) {
  const mode = input.mode === "remix" ? "remix" : "create";
  const segments = useQuery(api.studioScripts.list, { mode });
  const ensure = useMutation(api.studioScripts.ensure);
  const save = useMutation(api.studioScripts.save);
  const [segmentId, setSegmentId] = useState<Id<"studioSegments"> | null>(null);
  const versions = useQuery(
    api.studioScripts.versions,
    segmentId ? { segmentId } : "skip",
  );
  const [title, setTitle] = useState("Script");
  const [status, setStatus] = useState("Opening script…");
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<{
    input: StudioInput;
    title: string;
  } | null>(null);
  const hydrated = useRef<string | null>(null);
  const revision = useRef(0);
  const savedKey = useRef("");
  const selected = useRef<Partial<Record<"create" | "remix", string>>>({});
  const modeDrafts = useRef<Partial<Record<"create" | "remix", StudioInput>>>(
    {},
  );
  const current = useRef({ input, title, segmentId });
  current.current = { input, title, segmentId };
  const saving = useRef<Promise<StudioInput> | null>(null);
  const ensuring = useRef<string | null>(null);
  const payloadKey = (draft: StudioInput, name: string) =>
    JSON.stringify({
      ...draft,
      segmentId: undefined,
      scriptVersion: undefined,
      segmentTitle: undefined,
      title: name,
    });
  function hydrate(
    segment: NonNullable<typeof segments>[number],
    preserveNewDraft = false,
  ) {
    hydrated.current = segment._id;
    setRecovery(null);
    setSegmentId(segment._id);
    revision.current = segment.revision;
    selected.current[segment.mode] = segment._id;
    const draft = preserveNewDraft
      ? { ...current.current.input, segmentId: segment._id }
      : normalizeStudioDraft({ ...segment.input, segmentId: segment._id });
    setTitle(segment.title);
    setInput(draft);
    setError("");
    savedKey.current = preserveNewDraft
      ? ""
      : payloadKey(segment.input, segment.title);
    setStatus(preserveNewDraft ? "Unsaved changes" : "Saved");
    if (storage && !preserveNewDraft) {
      const serverKey = payloadKey(draft, segment.title);
      void Promise.resolve()
        .then(() => storage.getItem(`virel.script.${segment._id}`))
        .then((raw) => {
          if (
            !raw ||
            hydrated.current !== segment._id ||
            payloadKey(current.current.input, current.current.title) !==
              serverKey
          )
            return;
          try {
            const recovered = JSON.parse(raw) as {
              input: StudioInput;
              title: string;
              baseRevision: number;
            };
            if (
              recovered.baseRevision !== segment.revision ||
              recovered.input.mode !== segment.mode
            ) {
              setRecovery({
                input: normalizeStudioDraft(recovered.input),
                title: recovered.title,
              });
              setError(
                "A local draft was based on an older server version. Recover it as a new draft or keep the saved script.",
              );
              return;
            }
            setInput(normalizeStudioDraft(recovered.input));
            setTitle(recovered.title);
            setStatus("Recovered local draft");
          } catch {
            /* Invalid local data cannot replace server scripts. */
          }
        })
        .catch(() => {});
    }
  }
  useEffect(() => {
    if (segments === undefined) return;
    if (!segments.length) {
      if (ensuring.current === mode) return;
      ensuring.current = mode;
      void ensure({ mode }).catch(() => {
        ensuring.current = null;
        setError("Could not open the script. Reopen Studio to retry.");
      });
      return;
    }
    const remembered = segments.find(
      (segment) => segment._id === selected.current[mode],
    );
    const segment = remembered ?? segments[0];
    if (hydrated.current !== segment._id)
      hydrate(
        segment,
        segment.revision === 0 &&
          Boolean(current.current.input.prompt) &&
          current.current.input.mode === mode,
      );
  }, [segments, mode, ensure]);
  function flush(): Promise<StudioInput> {
    if (saving.current) return saving.current;
    saving.current = (async () => {
      for (;;) {
        const snapshot = current.current;
        if (!snapshot.segmentId || hydrated.current !== snapshot.segmentId)
          throw new Error("Wait for the script to finish opening.");
        const key = payloadKey(snapshot.input, snapshot.title);
        if (key === savedKey.current)
          return {
            ...snapshot.input,
            segmentId: snapshot.segmentId,
            scriptVersion: revision.current,
            segmentTitle: snapshot.title,
          };
        setStatus("Saving…");
        const nextRevision = await save({
          segmentId: snapshot.segmentId,
          expectedRevision: revision.current,
          title: snapshot.title,
          input: serverInput(snapshot.input),
        });
        if (storage)
          void Promise.resolve()
            .then(() =>
              storage.removeItem(`virel.script.${snapshot.segmentId}`),
            )
            .catch(() => {});
        revision.current = nextRevision;
        savedKey.current = key;
        setError("");
        setStatus("Saved");
        // Serialize edits made during an in-flight save before taking the generation snapshot.
      }
    })()
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Could not save the script.";
        setError(message);
        setStatus("Save failed");
        throw error;
      })
      .finally(() => {
        saving.current = null;
      });
    return saving.current;
  }
  useEffect(() => {
    if (!segmentId || hydrated.current !== segmentId) return;
    if (payloadKey(input, title) === savedKey.current) return;
    setStatus("Unsaved changes");
    if (storage)
      void Promise.resolve()
        .then(() =>
          storage.setItem(
            `virel.script.${segmentId}`,
            JSON.stringify({ input, title, baseRevision: revision.current }),
          ),
        )
        .catch(() => {});
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [input, title, segmentId, save]);
  async function switchMode(next: "create" | "remix") {
    if (next === mode) return;
    await flush();
    modeDrafts.current[mode] = current.current.input;
    hydrated.current = null;
    setSegmentId(null);
    setStatus("Opening script…");
    setInput(modeDrafts.current[next] ?? { ...defaultStudioInput, mode: next });
  }
  async function select(id: string, reload = false) {
    if (!reload) await flush();
    const segment = segments?.find((segment) => segment._id === id);
    if (segment) hydrate(segment);
  }
  return {
    recovery,
    recoverLocal: () => {
      if (recovery) {
        setInput({ ...recovery.input, segmentId: segmentId ?? undefined });
        setTitle(recovery.title);
        setRecovery(null);
        setError("");
        setStatus("Recovered local draft");
      }
    },
    segments,
    segmentId,
    versions,
    title,
    setTitle,
    status,
    error,
    flush,
    switchMode,
    reload: () => (segmentId ? select(segmentId, true) : Promise.resolve()),
    restore: (version: NonNullable<typeof versions>[number]) => {
      setInput(
        normalizeStudioDraft({
          ...version.input,
          segmentId: segmentId ?? undefined,
        }),
      );
      setTitle(version.title);
      setStatus("Unsaved changes");
    },
  };
}
