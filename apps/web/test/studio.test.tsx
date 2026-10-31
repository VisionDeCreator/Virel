import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { defaultStudioInput } from "@virel/shared";
import { Studio } from "../src/features/studio/Studio";
const fake = vi.hoisted(() => ({
  authenticated: true,
  available: 100,
  jobs: [] as unknown[],
  segments: {} as Record<
    string,
    {
      _id: string;
      mode: "create" | "remix";
      title: string;
      revision: number;
      input: typeof defaultStudioInput | Record<string, unknown>;
    }[]
  >,
  operations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock("../../../packages/api-client/src/http", () => ({
  useApiAction: (name: string) => fake.operations[name],
}));
vi.mock("convex/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  const media = [
    {
      _id: "source-1",
      type: "video",
      name: "Source clip",
      duration: 5,
      status: "ready",
    },
    {
      _id: "image-1",
      type: "image",
      name: "Clothing reference",
      status: "ready",
    },
  ];
  const profile = { _id: "profile-1", username: "creator" };
  return {
    ...original,
    useConvexAuth: () => ({
      isAuthenticated: fake.authenticated,
      isLoading: false,
    }),
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(fn)) {
        case "credits:balance":
          return { available: fake.available, reserved: 0 };
        case "credits:history":
          return [];
        case "media:list":
          return media;
        case "generation:list":
          return fake.jobs;
        case "studioScripts:list":
          return fake.segments[(args as { mode: string }).mode];
        case "studioScripts:versions":
          return [];
        case "profiles:me":
          return profile;
        default:
          return null;
      }
    },
    useMutation: (fn: Parameters<typeof getFunctionName>[0]) =>
      fake.operations[getFunctionName(fn)],
    useAction: (fn: Parameters<typeof getFunctionName>[0]) =>
      fake.operations[getFunctionName(fn)],
  };
});
beforeEach(() => {
  fake.authenticated = true;
  fake.available = 100;
  fake.jobs = [];
  fake.segments = {
    create: [
      {
        _id: "create-segment",
        mode: "create",
        title: "Create segment",
        revision: 0,
        input: { ...defaultStudioInput },
      },
    ],
    remix: [
      {
        _id: "remix-segment",
        mode: "remix",
        title: "Remix segment",
        revision: 0,
        input: { ...defaultStudioInput, mode: "remix" },
      },
    ],
  };
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
    removeItem: (key: string) => storage.delete(key),
  });
  fake.operations = {
    "studioScripts:ensure": vi.fn(),
    "studioScripts:create": vi.fn(),
    "studioScripts:save": vi
      .fn()
      .mockImplementation(async ({ expectedRevision }) => expectedRevision + 1),
    "credits:initialize": vi.fn().mockResolvedValue(null),
    "mediaActions:beginUpload": vi.fn(),
    "mediaActions:finishUpload": vi.fn(),
    "mediaActions:preview": vi
      .fn()
      .mockResolvedValue("https://storage.example/signed"),
    "generationActions:quote": vi.fn().mockResolvedValue({
      quoteId: "quote-1",
      credits: 20,
      duration: 5,
      expiresAt: Date.now() + 300000,
    }),
    "generation:start": vi.fn().mockResolvedValue("job-1"),
    "publishing:publish": vi.fn().mockResolvedValue("video-1"),
    "generation:resume": vi.fn(),
    "generation:unpublish": vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function open() {
  return render(
    <MemoryRouter>
      <Studio connected />
    </MemoryRouter>,
  );
}
async function prepare() {
  open();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Remix" }));
  await screen.findByRole("textbox", { name: "What would you change?" });
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Saved source video" }),
    "source-1",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Add saved reference image" }),
    "image-1",
  );
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    "Use @image_1 for the clothing",
  );
  await user.click(screen.getByRole("button", { name: "Review credit cost" }));
  await screen.findByRole("button", { name: "Create video · 20 credits" });
  return user;
}
test("Studio requires authentication before exposing upload and generation controls", () => {
  fake.authenticated = false;
  open();
  expect(
    screen.getByRole("link", { name: /Sign in or create an account/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Review credit cost" }),
  ).toBeNull();
});
test("source, prompt, and reference reach the quote; accepted cost gates generation", async () => {
  const user = await prepare();
  expect(fake.operations["generationActions:quote"]).toHaveBeenCalledWith({
    input: expect.objectContaining({
      sourceAssetId: "source-1",
      referenceAssetIds: ["image-1"],
      prompt: "Use @image_1 for the clothing",
      mode: "remix",
    }),
  });
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Create video · 20 credits" }),
  );
  await waitFor(() =>
    expect(fake.operations["generation:start"]).toHaveBeenCalledWith({
      quoteId: "quote-1",
      requestId: expect.any(String),
    }),
  );
  expect(await screen.findByText(/Generation queued/)).toBeTruthy();
});
test("editing a prompt invalidates the previously reviewed quote", async () => {
  const user = await prepare();
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    " and change the lighting",
  );
  expect(
    screen.queryByRole("button", { name: "Create video · 20 credits" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Review credit cost" }),
  ).toBeTruthy();
});
test("insufficient credits block generation after reviewing the cost", async () => {
  fake.available = 5;
  await prepare();
  expect(
    (
      screen.getByRole("button", {
        name: "Create video · 20 credits",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText(/Not enough credits/)).toBeTruthy();
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});
test("a private result can be explicitly published or used for the next AI revision", async () => {
  fake.jobs = [
    {
      _id: "job-1",
      input: {
        ...defaultStudioInput,
        prompt: "A private result",
        referenceAssetIds: ["image-1"],
      },
      outputAssetId: "source-1",
      status: "succeeded",
      credits: 20,
      financialState: "settled",
      video: {
        title: "My result",
        description: "",
        status: "draft",
        remixEnabled: true,
      },
    },
  ];
  open();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Publish video" }));
  await waitFor(() =>
    expect(fake.operations["publishing:publish"]).toHaveBeenCalledWith({
      jobId: "job-1",
      title: "My result",
      description: "",
      remixEnabled: true,
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Use this video as a reference" }),
  );
  expect(
    screen.getByRole("textbox", { name: "Script" }).getAttribute("value") ??
      (
        screen.getByRole("textbox", {
          name: "Script",
        }) as HTMLTextAreaElement
      ).value,
  ).toBe("A private result");
  expect(
    screen.getByText(/This result is now an optional video reference/),
  ).toBeTruthy();
});

test("Create generates from script alone and has only two mode choices", async () => {
  open();
  const user = userEvent.setup();
  expect(screen.queryByRole("button", { name: "Text to video" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Image to video" })).toBeNull();
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "A cinematic sunrise",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Duration" }),
    "15",
  );
  await user.click(screen.getByRole("button", { name: "Review credit cost" }));
  await waitFor(() =>
    expect(fake.operations["generationActions:quote"]).toHaveBeenCalledWith({
      input: expect.objectContaining({
        mode: "create",
        prompt: "A cinematic sunrise",
        referenceAssetIds: [],
        duration: 15,
        segmentId: "create-segment",
        scriptVersion: 1,
      }),
    }),
  );
});
test("dropping a video and multiple images preserves Create and includes every uploaded reference", async () => {
  fake.operations["mediaActions:beginUpload"].mockImplementation(
    async ({ name }) => ({
      assetId: name.split(".")[0],
      url: "https://storage.example/upload",
    }),
  );
  fake.operations["mediaActions:finishUpload"].mockResolvedValue(null);
  class UploadRequest {
    status = 200;
    upload = {};
    onload?: () => void;
    open() {}
    setRequestHeader() {}
    send() {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
  open();
  const user = userEvent.setup();
  const area = screen
    .getByLabelText("Upload optional images or video")
    .closest("label")!;
  const files = [
    new File(["video"], "video.mp4", { type: "video/mp4" }),
    new File(["one"], "first.png", { type: "image/png" }),
    new File(["two"], "second.jpg", { type: "image/jpeg" }),
  ];
  fireEvent.dragEnter(area, { dataTransfer: { files, types: ["Files"] } });
  expect(screen.getByText("Drop to upload")).toBeTruthy();
  fireEvent.drop(area, { dataTransfer: { files, types: ["Files"] } });
  await waitFor(() =>
    expect(fake.operations["mediaActions:finishUpload"]).toHaveBeenCalledTimes(
      3,
    ),
  );
  expect(screen.getByRole("textbox", { name: "Script" })).toBeTruthy();
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "Use @image_1 and @image_2 with @video_1",
  );
  await user.click(screen.getByRole("button", { name: "Review credit cost" }));
  await waitFor(() =>
    expect(fake.operations["generationActions:quote"]).toHaveBeenCalledWith({
      input: expect.objectContaining({
        mode: "create",
        referenceVideoAssetId: "video",
        referenceAssetIds: ["first", "second"],
      }),
    }),
  );
});
test("switching modes keeps separate saved drafts", async () => {
  open();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "Create draft",
  );
  fake.operations["studioScripts:save"].mockImplementation(
    async ({ expectedRevision, input, title }) => {
      const mode = input.mode as "create" | "remix";
      fake.segments[mode] = [
        {
          ...fake.segments[mode][0],
          input,
          title,
          revision: expectedRevision + 1,
        },
      ];
      return expectedRevision + 1;
    },
  );
  await user.click(screen.getByRole("button", { name: "Remix" }));
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    "Remix draft",
  );
  await user.click(screen.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "Script",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Create draft"),
  );
});

test("a delayed autosave cannot overwrite edits made while it is saving", async () => {
  let finish!: (revision: number) => void;
  const first = new Promise<number>((resolve) => {
    finish = resolve;
  });
  fake.operations["studioScripts:save"]
    .mockImplementationOnce(() => first)
    .mockImplementation(async ({ expectedRevision }) => expectedRevision + 1);
  open();
  const user = userEvent.setup();
  const script = screen.getByRole("textbox", { name: "Script" });
  await user.type(script, "First draft");
  await waitFor(
    () =>
      expect(fake.operations["studioScripts:save"]).toHaveBeenCalledTimes(1),
    { timeout: 2000 },
  );
  await user.type(script, " with newer edits");
  finish(1);
  await waitFor(() =>
    expect(fake.operations["studioScripts:save"]).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        input: expect.objectContaining({
          prompt: "First draft with newer edits",
        }),
      }),
    ),
  );
  expect((script as HTMLTextAreaElement).value).toBe(
    "First draft with newer edits",
  );
});
test("renaming a linked reference updates the script everywhere", async () => {
  open();
  const user = userEvent.setup();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Add saved reference image" }),
    "image-1",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "Use @image_1 twice: @image_1",
  );
  const alias = screen.getByRole("textbox", { name: "Reference name image_1" });
  await user.clear(alias);
  await user.type(alias, "wardrobe");
  await user.tab();
  expect(
    (screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Use @wardrobe twice: @wardrobe");
});

test("Studio opens a single script directly without segment controls", async () => {
  open();
  const script = await screen.findByRole("textbox", { name: "Script" });
  expect(screen.queryByRole("combobox", { name: "Script segment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add segment" })).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Segment title" })).toBeNull();
  await userEvent.setup().type(script, "A slow camera move across the skyline");
  await waitFor(() =>
    expect(
      fake.operations["studioScripts:save"].mock.calls.length,
    ).toBeGreaterThan(0),
  );
});

test("upload feedback tracks preparation, byte progress, verification, and failure cleanup", async () => {
  let begin!: (value: { assetId: string; url: string }) => void;
  let failVerification!: (error: Error) => void;
  fake.operations["mediaActions:beginUpload"].mockImplementation(
    () =>
      new Promise((resolve) => {
        begin = resolve;
      }),
  );
  fake.operations["mediaActions:finishUpload"].mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        failVerification = reject;
      }),
  );
  let xhr!: UploadRequest;
  class UploadRequest {
    status = 200;
    upload: {
      onprogress?: (event: {
        lengthComputable: boolean;
        loaded: number;
        total: number;
      }) => void;
    } = {};
    onload?: () => void;
    constructor() {
      xhr = this;
    }
    open() {}
    setRequestHeader() {}
    send() {}
  }
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
  open();
  fireEvent.change(screen.getByLabelText("Upload optional images or video"), {
    target: {
      files: [new File(["clip"], "reference.mp4", { type: "video/mp4" })],
    },
  });
  await screen.findByText("Preparing upload…");
  expect(screen.getByText("reference.mp4")).toBeTruthy();
  await act(async () =>
    begin({ assetId: "reference", url: "https://storage.example/upload" }),
  );
  await screen.findByText("Uploading media…");
  act(() =>
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }),
  );
  expect(
    screen
      .getByRole("progressbar", { name: "Media upload progress" })
      .getAttribute("value"),
  ).toBe("50");
  act(() => xhr.onload?.());
  await screen.findByText("Checking your media…");
  expect(
    screen
      .getByRole("progressbar", { name: "Media upload progress" })
      .hasAttribute("value"),
  ).toBe(false);
  await act(async () => failVerification(new Error("Video rejected")));
  await screen.findByText("Video rejected");
  expect(
    screen.queryByRole("progressbar", { name: "Media upload progress" }),
  ).toBeNull();
});
