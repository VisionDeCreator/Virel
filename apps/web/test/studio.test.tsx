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
import { Settings } from "../src/features/settings/Settings";
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
  useApiUrl: () => "http://localhost:3101",
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
    usePaginatedQuery: (
      fn: Parameters<typeof getFunctionName>[0],
      args: { filter?: string; scope?: string },
    ) => ({
      results:
        getFunctionName(fn) === "media:bases"
          ? [
              {
                assetId: "source-1",
                title: "Source clip",
                creator: "creator",
                duration: 5,
                aspectRatio: "9:16",
              },
            ]
          : fake.jobs.filter((value) => {
              const job = value as { status: string };
              return args.filter === "all"
                ? job.status !== "failed"
                : args.filter === "ready"
                  ? job.status === "succeeded"
                  : !["succeeded", "failed"].includes(job.status);
            }),
      status: "Exhausted",
      loadMore: vi.fn(),
    }),
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
        case "media:base":
          return {
            assetId: "source-1",
            title: "Source clip",
            creator: "creator",
            duration: 5,
            aspectRatio: "9:16",
          };
        case "media:list":
          return media;
        case "generation:list":
          return fake.jobs;
        case "generation:detail":
          return (
            fake.jobs.find(
              (value) =>
                (value as { _id: string })._id ===
                (args as { jobId: string }).jobId,
            ) ?? {
              _id: "job-1",
              _creationTime: Date.now() - 310000,
              input: defaultStudioInput,
              status: "queued",
              credits: 20,
              financialState: "reserved",
              video: null,
            }
          );
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
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
      surchargeCredits: 15,
      royaltyEligible: false,
      rewardMessage: "This creation has no remix beneficiaries.",
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
function open(path = "/create?view=new") {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Studio connected />
    </MemoryRouter>,
  );
  document
    .querySelectorAll(".reference-section")
    .forEach((el) => el.setAttribute("open", ""));
  return view;
}
async function chooseBase(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Choose a platform video" }),
  );
  await user.click(screen.getByRole("button", { name: /Source clip/ }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "What would you change?",
        }) as HTMLTextAreaElement
      ).disabled,
    ).toBe(false),
  );
}
async function removeBase(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Remove base" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement)
        .disabled,
    ).toBe(false),
  );
}
async function prepare() {
  open();
  const user = userEvent.setup();
  await chooseBase(user);
  await screen.findByRole("textbox", { name: "What would you change?" });
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Add saved reference image" }),
    "image-1",
  );
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    "Use @image_1 for the clothing",
  );
  await user.click(
    screen.getByRole("button", { name: /Review (?:credit|remix) cost/ }),
  );
  await screen.findByRole("button", { name: "Remix video · 20 credits" });
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
  expect(
    screen.getByText(/Available after starting:\s*80 credits/),
  ).toBeTruthy();
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
    screen.getByRole("button", { name: "Remix video · 20 credits" }),
  );
  await waitFor(() =>
    expect(fake.operations["generation:start"]).toHaveBeenCalledWith({
      quoteId: "quote-1",
      requestId: expect.any(String),
    }),
  );
  expect(
    await screen.findByRole("heading", { name: "Creating your video" }),
  ).toBeTruthy();
  expect(screen.getByText(/sometimes longer than 5 minutes/)).toBeTruthy();
});
test("editing a prompt invalidates the previously reviewed quote", async () => {
  const user = await prepare();
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    " and change the lighting",
  );
  expect(
    screen.queryByRole("button", { name: "Remix video · 20 credits" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: /Review (?:credit|remix) cost/ }),
  ).toBeTruthy();
});
test("insufficient credits block generation after reviewing the cost", async () => {
  fake.available = 5;
  await prepare();
  expect(
    (
      screen.getByRole("button", {
        name: "Remix video · 20 credits",
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
  open("/create?job=job-1");
  const user = userEvent.setup();
  expect(screen.queryByRole("button", { name: "Publish video" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Publish…" }));
  await user.click(screen.getByRole("button", { name: "Publish video" }));
  await waitFor(() =>
    expect(fake.operations["publishing:publish"]).toHaveBeenCalledWith({
      jobId: "job-1",
      title: "My result",
      description: "",
      remixEnabled: true,
    }),
  );
  await user.click(screen.getByRole("button", { name: "Remix" }));
  await screen.findByRole("textbox", { name: "What would you change?" });
  expect(await screen.findByText("Source clip")).toBeTruthy();
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
  await user.click(
    screen.getByRole("button", { name: /Review (?:credit|remix) cost/ }),
  );
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
test("video uploads cannot silently turn a new creation into a remix", async () => {
  open();
  fireEvent.change(screen.getByLabelText("Upload reference images"), {
    target: { files: [new File(["video"], "clip.mp4", { type: "video/mp4" })] },
  });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(fake.operations["mediaActions:beginUpload"]).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Script" })).toBeTruthy();
});

test("adding and removing a base keeps the current prompt", async () => {
  open();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "Keep this draft",
  );
  await chooseBase(user);
  expect(
    (
      screen.getByRole("textbox", {
        name: "What would you change?",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Keep this draft");
  await removeBase(user);
  expect(
    (screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Keep this draft");
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
  fireEvent.change(screen.getByLabelText("Upload reference images"), {
    target: {
      files: [new File(["clip"], "reference.png", { type: "image/png" })],
    },
  });
  await screen.findByText("Preparing upload…");
  expect(screen.getByText("reference.png")).toBeTruthy();
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
  await act(async () => failVerification(new Error("Image rejected")));
  await screen.findByText("Image rejected");
  expect(
    screen.queryByRole("progressbar", { name: "Media upload progress" }),
  ).toBeNull();
});

test("returning to Remix uses the confirmed revision while its query is stale", async () => {
  const revisions = new Map<string, number>();
  fake.operations["studioScripts:save"].mockImplementation(
    async ({ segmentId, expectedRevision }) => {
      const actual = revisions.get(segmentId) ?? 0;
      if (actual !== expectedRevision)
        throw new Error("This script changed in another session.");
      revisions.set(segmentId, actual + 1);
      // Deliberately leave the reactive list behind the mutation response.
      return actual + 1;
    },
  );
  open();
  const user = userEvent.setup();
  await chooseBase(user);
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    "Keep my Remix edits",
  );
  await removeBase(user);
  await chooseBase(user);
  expect(
    (
      screen.getByRole("textbox", {
        name: "What would you change?",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Keep my Remix edits");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Add saved reference image" }),
    "image-1",
  );
  await user.click(
    screen.getByRole("button", { name: /Review (?:credit|remix) cost/ }),
  );
  await waitFor(() =>
    expect(fake.operations["generationActions:quote"]).toHaveBeenCalledWith({
      input: expect.objectContaining({
        sourceAssetId: "source-1",
        scriptVersion: 2,
        prompt: "Keep my Remix edits",
      }),
    }),
  );
  expect(revisions.get("remix-segment")).toBe(2);
});

test("a clean script follows a newer server revision after selecting its base", async () => {
  const view = open();
  const user = userEvent.setup();
  await chooseBase(user);
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    "Initial changes",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Add saved reference image" }),
    "image-1",
  );
  await user.click(screen.getByRole("button", { name: "Review remix cost" }));
  await screen.findByRole("button", { name: "Remix video · 20 credits" });
  fake.segments.remix = [
    {
      ...fake.segments.remix[0],
      revision: 4,
      input: {
        ...defaultStudioInput,
        mode: "remix",
        sourceAssetId: "source-1",
        referenceAssetIds: ["image-1"],
        prompt: "Updated elsewhere",
      },
    },
  ];
  view.rerender(
    <MemoryRouter>
      <Studio connected />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "What would you change?",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Updated elsewhere"),
  );
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    " with my changes",
  );
  await user.click(screen.getByRole("button", { name: "Review remix cost" }));
  expect(fake.operations["studioScripts:save"]).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 4 }),
  );
});

test("unsaved local edits cannot overwrite a newer script from another session", async () => {
  const view = open();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "My local edits",
  );
  fake.segments.create = [
    {
      ...fake.segments.create[0],
      revision: 4,
      input: { ...defaultStudioInput, prompt: "Changed elsewhere" },
    },
  ];
  fake.operations["studioScripts:save"].mockRejectedValue(
    new Error(
      "This script changed in another session. Reload the segment before saving.",
    ),
  );
  view.rerender(
    <MemoryRouter>
      <Studio connected />
    </MemoryRouter>,
  );
  expect(
    (screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement)
      .value,
  ).toBe("My local edits");
  await user.click(
    screen.getByRole("button", { name: /Review (?:credit|remix) cost/ }),
  );
  await waitFor(() =>
    expect(fake.operations["studioScripts:save"]).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 0 }),
    ),
  );
  expect(fake.operations["generationActions:quote"]).not.toHaveBeenCalled();
});

test("Create opens the library and editing requires an explicit create action", async () => {
  open("/create");
  expect(screen.getByRole("heading", { name: "Your creations" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Script" })).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Create a video/ }));
  expect(await screen.findByRole("textbox", { name: "Script" })).toBeTruthy();
});

test("library keeps results from other scripts and opens their details explicitly", async () => {
  fake.jobs = [
    {
      _id: "job-older",
      _creationTime: Date.now(),
      input: {
        ...defaultStudioInput,
        mode: "remix",
        segmentId: "another-script",
        prompt: "An older remix",
      },
      status: "succeeded",
      financialState: "settled",
      credits: 20,
      outputAssetId: "source-1",
      video: { title: "Older remix", status: "draft" },
    },
  ];
  open("/create");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Older remix/ }));
  expect(
    await screen.findByRole("button", { name: "Download video" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Publish video" })).toBeNull();
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});

test("long-running generations show elapsed time and remain safe to leave", async () => {
  open("/create?job=job-1");
  expect(
    await screen.findByRole("heading", { name: "Creating your video" }),
  ).toBeTruthy();
  expect(screen.getByText(/sometimes longer than 5 minutes/)).toBeTruthy();
  expect(screen.getByText(/Elapsed 5:/)).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Back to your creations" }));
  expect(
    await screen.findByRole("heading", { name: "Your creations" }),
  ).toBeTruthy();
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});

test("a failed video reports returned credits and retries through cost review", async () => {
  fake.jobs = [
    {
      _id: "job-failed",
      _creationTime: Date.now(),
      input: { ...defaultStudioInput, prompt: "Keep this idea" },
      status: "failed",
      financialState: "released",
      credits: 20,
      video: null,
    },
  ];
  open("/create?job=job-failed");
  expect(
    await screen.findByText("Your reserved credits were returned."),
  ).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Edit and try again" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement)
        .value,
    ).toBe("Keep this idea"),
  );
  expect(
    screen.getByRole("button", { name: /Review (?:credit|remix) cost/ }),
  ).toBeTruthy();
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});

test("library defaults to Ready, puts All second, and hides failed generations and credit activity", async () => {
  open("/create");
  const group = screen.getByRole("group", { name: "Filter creations" });
  const buttons = Array.from(group.querySelectorAll("button"));
  expect(buttons.map((button) => button.textContent)).toEqual([
    "Ready",
    "All",
    "In progress",
  ]);
  expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Failed" })).toBeNull();
  expect(screen.queryByText("Credit activity")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Settings" }).getAttribute("href"),
  ).toBe("/settings?tab=credits");
});

test("a failed preview request recovers automatically without another generation", async () => {
  fake.jobs = [
    {
      _id: "job-preview",
      _creationTime: Date.now(),
      input: defaultStudioInput,
      outputAssetId: "source-1",
      status: "succeeded",
      financialState: "settled",
      credits: 20,
      video: null,
    },
  ];
  fake.operations["mediaActions:preview"].mockRejectedValueOnce(
    new Error("Temporarily unavailable"),
  );
  open("/create?job=job-preview");
  await waitFor(
    () => expect(screen.getByLabelText("Generated video preview")).toBeTruthy(),
    { timeout: 2500 },
  );
  expect(fake.operations["mediaActions:preview"]).toHaveBeenCalledTimes(2);
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});

test("a playback failure refreshes its signed URL, and manual retry restores the player", async () => {
  fake.jobs = [
    {
      _id: "job-preview",
      _creationTime: Date.now(),
      input: defaultStudioInput,
      outputAssetId: "source-1",
      status: "succeeded",
      financialState: "settled",
      credits: 20,
      video: null,
    },
  ];
  open("/create?job=job-preview");
  fireEvent.error(await screen.findByLabelText("Generated video preview"));
  await waitFor(() =>
    expect(fake.operations["mediaActions:preview"]).toHaveBeenCalledTimes(2),
  );
  fireEvent.error(await screen.findByLabelText("Generated video preview"));
  await screen.findByText(/The video could not be played/);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry preview" }));
  expect(await screen.findByLabelText("Generated video preview")).toBeTruthy();
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});

test("credit activity is available under Settings and gated by authentication", () => {
  const view = render(
    <MemoryRouter initialEntries={["/settings?tab=credits"]}>
      <Settings connected />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Credit activity" })).toBeTruthy();
  expect(screen.getByText("No credit activity yet.")).toBeTruthy();
  fake.authenticated = false;
  view.rerender(
    <MemoryRouter initialEntries={["/settings?tab=credits"]}>
      <Settings connected />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  expect(screen.queryByText("No credit activity yet.")).toBeNull();
});

test("the unified editor has no mode tabs and removing a base clears its mentions", async () => {
  open();
  const user = userEvent.setup();
  expect(screen.queryByRole("group", { name: "Creation mode" })).toBeNull();
  await chooseBase(user);
  await user.type(
    screen.getByRole("textbox", { name: "What would you change?" }),
    "Change @video_1 into a winter scene",
  );
  await removeBase(user);
  expect(
    (screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Change the video into a winter scene");
  expect(screen.getByText("New video")).toBeTruthy();
  expect(fake.operations["generation:start"]).not.toHaveBeenCalled();
});

test("an idle script does not trigger periodic saves", async () => {
  open();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(fake.operations["studioScripts:save"]).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Script" }),
    "Save this change once",
  );
  await waitFor(
    () =>
      expect(fake.operations["studioScripts:save"]).toHaveBeenCalledTimes(1),
    { timeout: 2000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(fake.operations["studioScripts:save"]).toHaveBeenCalledTimes(1);
});

test("reference suggestions include thumbnails and linked mentions are highlighted", async () => {
  open();
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Script" }), "Use @");
  const picker = await screen.findByRole("listbox", {
    name: "Reference suggestions",
  });
  const option = picker.querySelector<HTMLButtonElement>("[role=option]")!;
  await waitFor(() => expect(option.querySelector("img")).not.toBeNull());
  await user.click(option);
  expect(document.querySelector("mark.mention-bound")?.textContent).toBe(
    "@image_1",
  );
});
