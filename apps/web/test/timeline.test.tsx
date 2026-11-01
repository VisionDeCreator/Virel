import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TimelineEditor } from "../src/features/timeline/TimelineEditor";
import { newTimelineClip } from "@virel/shared";
import type { Id } from "@virel/api-client";
const fake = vi.hoisted(() => ({
  project: {} as Record<string, unknown>,
  assets: [] as Record<string, unknown>[],
  save: vi.fn(),
  queue: vi.fn(),
  preview: vi.fn(),
  other: vi.fn(),
}));
vi.mock("convex/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  return {
    ...original,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "timeline:get" ? fake.project : fake.assets,
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "timeline:save"
        ? fake.save
        : getFunctionName(ref) === "timeline:queueExport"
          ? fake.queue
          : fake.other,
  };
});
vi.mock("../../../packages/api-client/src/http", () => ({
  useApiAction: (name: string) =>
    name === "mediaActions:preview" ? fake.preview : fake.other,
}));
beforeEach(() => {
  vi.useFakeTimers();
  const memory = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
  fake.assets = [
    {
      _id: "asset-one",
      name: "First clip",
      duration: 5,
      type: "video",
      width: 720,
      height: 1280,
    },
    {
      _id: "asset-two",
      name: "Second clip",
      duration: 5,
      type: "video",
      width: 720,
      height: 1280,
    },
  ];
  fake.project = {
    _id: "project-one",
    title: "My manual edit",
    revision: 0,
    document: {
      aspectRatio: "9:16",
      clips: [
        newTimelineClip("asset-one", 5, "clip-one"),
        newTimelineClip("asset-one", 5, "clip-two"),
      ],
      texts: [],
      audio: [],
    },
    latestExport: null,
  };
  fake.save.mockReset().mockResolvedValue(1);
  fake.queue.mockReset().mockResolvedValue("export-one");
  fake.preview.mockReset().mockResolvedValue("https://example.com/preview.mp4");
  fake.other.mockReset().mockResolvedValue(null);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    render(
      <MemoryRouter>
        <TimelineEditor
          projectId={"project-one" as Id<"timelineProjects">}
          onBack={() => {}}
        />
      </MemoryRouter>,
    );
  });
}
test("trim and rearrange clips, undo edits, and autosave without a generation operation", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "1 · First clip" }));
  fireEvent.change(screen.getByLabelText("Trim start (s)"), {
    target: { value: "1" },
  });
  await act(() => vi.advanceTimersByTimeAsync(750));
  expect(fake.save).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 0,
      document: expect.objectContaining({
        clips: expect.arrayContaining([expect.objectContaining({ start: 1 })]),
      }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Move later" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByRole("button", { name: "1 · First clip" })).toBeTruthy();
  expect(fake.other).not.toHaveBeenCalled();
});
test("a delayed save cannot overwrite edits made while it is saving", async () => {
  let release!: (revision: number) => void;
  fake.save
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(2);
  await mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Project title" }), {
    target: { value: "Earlier edit" },
  });
  await act(() => vi.advanceTimersByTimeAsync(750));
  fireEvent.change(screen.getByRole("textbox", { name: "Project title" }), {
    target: { value: "Latest edit" },
  });
  await act(() => vi.advanceTimersByTimeAsync(750));
  await act(async () => {
    release(1);
    await Promise.resolve();
  });
  expect(fake.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ revision: 1, title: "Latest edit" }),
  );
  expect(
    (screen.getByRole("textbox", { name: "Project title" }) as HTMLInputElement)
      .value,
  ).toBe("Latest edit");
});
test("text controls save timed overlays and export the current revision without AI requests", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Add text" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Text content" }), {
    target: { value: "My caption" },
  });
  await act(() => vi.advanceTimersByTimeAsync(750));
  expect(fake.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      document: expect.objectContaining({
        texts: [
          expect.objectContaining({ text: "My caption", start: 0, end: 10 }),
        ],
      }),
    }),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Export video" }));
  });
  expect(fake.queue).toHaveBeenCalledWith({
    projectId: "project-one",
    revision: 1,
  });
  expect(fake.other).not.toHaveBeenCalled();
});
test("failed autosave keeps a recovery draft and exposes the conflict instead of overwriting it", async () => {
  fake.save.mockRejectedValue(
    new Error(
      "Timeline changed on another device. Reopen the saved version before editing.",
    ),
  );
  await mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Project title" }), {
    target: { value: "Keep these edits" },
  });
  await act(() => vi.advanceTimersByTimeAsync(750));
  expect(screen.getByText(/Timeline changed on another device/)).toBeTruthy();
  expect(
    JSON.parse(window.localStorage.getItem("virel.timeline.project-one")!)
      .title,
  ).toBe("Keep these edits");
});

test("video imports and adding other videos are unavailable", async () => {
  await mount();
  expect(screen.getByRole("button", { name: "Import music" })).toBeTruthy();
  expect(
    document.querySelector('input[type="file"]')?.getAttribute("accept"),
  ).toBe("audio/*");
  expect(screen.queryByRole("button", { name: "Add clip" })).toBeNull();
  expect(screen.queryByText("Second clip")).toBeNull();
});
