import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadHelpers() {
  const source = await readFile(new URL("../export-utils.js", import.meta.url), "utf8");
  class TestFile {
    constructor(parts, name, options = {}) {
      this.parts = parts;
      this.name = name;
      this.type = options.type || "";
    }
  }
  const context = {
    Blob,
    File: TestFile,
    Promise,
    Error,
    setTimeout,
    window: { File: TestFile }
  };
  vm.runInNewContext(source, context, { filename: "export-utils.js" });
  return context.window.IntuitiveTrackerExport;
}

function fakeDocument(calls, capture = {}) {
  return {
    body: {
      appendChild(anchor) {
        capture.anchor = anchor;
        calls.push("appendChild");
      }
    },
    createElement(tag) {
      assert.equal(tag, "a");
      return {
        href: "",
        download: "",
        rel: "",
        click() {
          calls.push("click");
        },
        remove() {
          calls.push("remove");
        }
      };
    }
  };
}

function fakeUrl(calls, capture = {}) {
  return {
    createObjectURL(blob) {
      calls.push("createObjectURL");
      capture.blob = blob;
      assert.equal(blob.type, "application/json");
      return "blob:test-url";
    },
    revokeObjectURL(url) {
      calls.push("revokeObjectURL");
      assert.equal(url, "blob:test-url");
    }
  };
}

test("uses save file picker when browser supports it", async () => {
  const helpers = await loadHelpers();
  const calls = [];
  const writes = [];
  const entries = { "2026-08-03": { calories: "2200" } };
  const fields = ["sleep hours"];

  const result = await helpers.exportTrackingData({
    entries,
    fields,
    date: "2026-08-03",
    pickerRef: {
      async showSaveFilePicker(options) {
        assert.equal(options.suggestedName, "daily-log-2026-08-03.json");
        assert.equal(options.types[0].description, "JSON backup");
        assert.equal(options.types[0].accept["application/json"][0], ".json");
        calls.push("showSaveFilePicker");
        return {
          async createWritable() {
            calls.push("createWritable");
            return {
              async write(blob) {
                calls.push("write");
                writes.push(JSON.parse(await blob.text()));
              },
              async close() {
                calls.push("close");
              }
            };
          }
        };
      }
    },
    navigatorRef: {
      canShare() {
        calls.push("canShare");
        return true;
      },
      async share() {
        calls.push("share");
      }
    },
    documentRef: fakeDocument(calls),
    urlRef: fakeUrl(calls)
  });

  assert.equal(result.method, "picker");
  assert.equal(result.filename, "daily-log-2026-08-03.json");
  assert.deepEqual(writes, [{ entries, fields }]);
  assert.deepEqual(calls, ["showSaveFilePicker", "createWritable", "write", "close"]);
});

test("does not fall back to share or download when save picker is cancelled", async () => {
  const helpers = await loadHelpers();
  const calls = [];
  const abort = new Error("user cancelled");
  abort.name = "AbortError";

  await assert.rejects(
    helpers.exportTrackingData({
      entries: {},
      fields: [],
      date: "2026-08-03",
      pickerRef: {
        async showSaveFilePicker() {
          calls.push("showSaveFilePicker");
          throw abort;
        }
      },
      navigatorRef: {
        canShare() {
          calls.push("canShare");
          return true;
        },
        async share() {
          calls.push("share");
        }
      },
      documentRef: fakeDocument(calls),
      urlRef: fakeUrl(calls)
    }),
    { name: "AbortError" }
  );

  assert.deepEqual(calls, ["showSaveFilePicker"]);
});

test("falls back to download when navigator.share exists but cannot share files", async () => {
  const helpers = await loadHelpers();
  const calls = [];
  const capture = {};
  const entries = { "2026-08-02": { weight: "180" } };
  const fields = ["sleep hours"];

  const result = await helpers.exportTrackingData({
    entries,
    fields,
    date: "2026-08-02",
    navigatorRef: {
      share() {
        calls.push("share");
        throw new Error("share should not be called");
      },
      canShare() {
        return false;
      }
    },
    documentRef: fakeDocument(calls, capture),
    urlRef: fakeUrl(calls, capture)
  });

  assert.equal(result.method, "download");
  assert.equal(result.filename, "daily-log-2026-08-02.json");
  assert.equal(capture.anchor.download, "daily-log-2026-08-02.json");
  assert.deepEqual(JSON.parse(await capture.blob.text()), { entries, fields });
  assert.deepEqual(calls, ["createObjectURL", "appendChild", "click", "remove", "revokeObjectURL"]);
});

test("falls back to download when file sharing rejects", async () => {
  const helpers = await loadHelpers();
  const calls = [];

  const result = await helpers.exportTrackingData({
    entries: { "2026-08-02": { weight: "180" } },
    fields: [],
    date: "2026-08-02",
    navigatorRef: {
      canShare() {
        return true;
      },
      async share() {
        calls.push("share");
        throw new Error("share cancelled");
      }
    },
    documentRef: fakeDocument(calls),
    urlRef: fakeUrl(calls)
  });

  assert.equal(result.method, "download");
  assert.deepEqual(calls, ["share", "createObjectURL", "appendChild", "click", "remove", "revokeObjectURL"]);
});

test("uses file share when browser supports it", async () => {
  const helpers = await loadHelpers();
  const calls = [];

  const result = await helpers.exportTrackingData({
    entries: {},
    fields: [],
    date: "2026-08-02",
    navigatorRef: {
      canShare(payload) {
        calls.push(["canShare", payload.files[0].name]);
        return true;
      },
      async share(payload) {
        calls.push(["share", payload.files[0].name, payload.title]);
      }
    },
    documentRef: fakeDocument(calls),
    urlRef: fakeUrl(calls)
  });

  assert.equal(result.method, "share");
  assert.deepEqual(calls, [
    ["canShare", "daily-log-2026-08-02.json"],
    ["share", "daily-log-2026-08-02.json", "Intuitive Tracker"]
  ]);
});
