const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "static", "app.js"), "utf8");

function viewer(fetch) {
  const elements = new Map();
  const timers = new Map();
  let nextTimer = 1;
  const context = {
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setTransform() {},
  };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: "", style: {}, classList: { toggle() {} },
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 400, height: 100 }),
      addEventListener() {},
    });
    return elements.get(id);
  }
  vm.runInNewContext(source, {
    document: { getElementById: element, documentElement: {} },
    window: {
      devicePixelRatio: 1,
      setTimeout(callback, delay) {
        const id = nextTimer++;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    ResizeObserver: class { observe() {} },
    requestAnimationFrame() {},
    AbortController,
    fetch,
  });
  return { elements, timers };
}

const liveState = {
  live: true, presence: true, move: true, activity: "移動", motion: 0.5,
  confidence: 0.8, jitter: 0.5, threshold: 1, rssi: -45, seq: 1, ageSeconds: 0,
  track: { x: 0, z: 0, heading: 0, gait: 0 },
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

function runTimer(app, delay) {
  const entry = [...app.timers].find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `timer with delay ${delay} should be scheduled`);
  app.timers.delete(entry[0]);
  entry[1].callback();
}

test("a stalled request expires the previous LIVE state and polling recovers", async () => {
  let calls = 0;
  let aborted = false;
  const app = viewer(async (_url, options) => {
    calls++;
    if (calls === 2) return new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("request timed out"));
      }, { once: true });
    });
    return { ok: true, json: async () => liveState };
  });
  await flush();
  assert.equal(app.elements.get("liveText").textContent, "LIVE");
  runTimer(app, 120);
  runTimer(app, 2500);
  await flush();
  assert.equal(aborted, true);
  assert.equal(app.elements.get("liveText").textContent, "WAITING");
  assert.equal(app.elements.get("activityValue").textContent, "サーバー切断");
  assert.equal(app.elements.get("motionValue").textContent, 0);
  assert.equal(app.elements.get("rssiValue").textContent, "-- dBm");
  runTimer(app, 120);
  await flush();
  assert.equal(app.elements.get("liveText").textContent, "LIVE");
});

test("completed requests cancel their deadline and schedule one next poll", async () => {
  const app = viewer(async () => ({ ok: true, json: async () => liveState }));
  await flush();
  assert.deepEqual([...app.timers.values()].map((timer) => timer.delay), [120]);
});

test("HTTP failures are displayed as disconnected and polling continues", async () => {
  const app = viewer(async () => ({ ok: false, status: 503 }));
  await flush();
  assert.equal(app.elements.get("liveText").textContent, "WAITING");
  assert.deepEqual([...app.timers.values()].map((timer) => timer.delay), [120]);
});


test("the polling deadline also covers a stalled response body", async () => {
  const app = viewer(async (_url, options) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("body timed out")), { once: true });
    }),
  }));
  await flush();
  runTimer(app, 2500);
  await flush();
  assert.equal(app.elements.get("liveText").textContent, "WAITING");
  assert.deepEqual([...app.timers.values()].map((timer) => timer.delay), [120]);
});
