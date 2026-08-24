(() => {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const spark = document.getElementById("sparkline");
  const sparkCtx = spark.getContext("2d");
  const $ = (id) => document.getElementById(id);

  let state = {
    live: false, presence: false, move: false, activity: "データ待機", motion: 0,
    confidence: 0, jitter: 0, threshold: 0, rssi: null, seq: null, ageSeconds: null,
    track: { x: 0, z: 0.1, heading: 0, gait: 0 }
  };
  let targetTrack = { ...state.track };
  let displayTrack = { ...state.track };
  let lastSequence = null;
  const history = Array(80).fill(0);
  const trail = [];
  const camera = { yaw: -0.72, pitch: 0.38, distance: 6.8 };
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;

  function css(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  const v = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    mul: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
    norm: (a) => {
      const n = Math.hypot(a.x, a.y, a.z) || 1;
      return { x: a.x / n, y: a.y / n, z: a.z / n };
    }
  };

  function resizeCanvas(target, context) {
    const rect = target.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return rect;
  }

  function cameraBasis() {
    const target = { x: 0, y: 0.92, z: 0 };
    const cp = Math.cos(camera.pitch);
    const position = {
      x: target.x + Math.sin(camera.yaw) * cp * camera.distance,
      y: target.y + Math.sin(camera.pitch) * camera.distance,
      z: target.z + Math.cos(camera.yaw) * cp * camera.distance
    };
    const forward = v.norm(v.sub(target, position));
    const right = v.norm(v.cross(forward, { x: 0, y: 1, z: 0 }));
    const up = v.cross(right, forward);
    return { position, forward, right, up };
  }

  function project(point, rect, basis) {
    const relative = v.sub(point, basis.position);
    const depth = v.dot(relative, basis.forward);
    if (depth <= 0.05) return null;
    const f = Math.min(rect.width, rect.height) * 0.95;
    return {
      x: rect.width / 2 + v.dot(relative, basis.right) * f / depth,
      y: rect.height / 2 - v.dot(relative, basis.up) * f / depth,
      depth
    };
  }

  function line3(a, b, rect, basis, color, width = 1, alpha = 1) {
    const pa = project(a, rect, basis);
    const pb = project(b, rect, basis);
    if (!pa || !pb) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.restore();
  }

  function point3(point, radius, rect, basis, color, glow = 0) {
    const p = project(point, rect, basis);
    if (!p) return;
    const scaled = Math.max(1.8, radius * Math.min(rect.width, rect.height) / p.depth);
    ctx.save();
    ctx.fillStyle = color;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, scaled, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function rotateY(point, angle) {
    const s = Math.sin(angle), c = Math.cos(angle);
    return { x: point.x * c + point.z * s, y: point.y, z: -point.x * s + point.z * c };
  }

  function worldPoint(local) {
    const rotated = rotateY(local, displayTrack.heading);
    return { x: rotated.x + displayTrack.x, y: rotated.y, z: rotated.z + displayTrack.z };
  }

  function buildPose(time) {
    const intensity = state.live ? state.motion : 0;
    const active = state.move && state.live;
    const phase = displayTrack.gait;
    const swing = active ? Math.sin(phase) * (0.24 + intensity * 0.18) : 0;
    const bob = active ? Math.abs(Math.sin(phase * 2)) * 0.045 : Math.sin(time * 0.0015) * 0.008;
    const side = active ? Math.sin(phase * 0.5) * 0.025 * intensity : 0;
    const hipY = 0.92 + bob;
    const shoulderY = 1.43 + bob;

    const joints = {
      nose: { x: side, y: 1.75 + bob, z: 0 },
      leftEye: { x: -0.045 + side, y: 1.79 + bob, z: -0.025 },
      rightEye: { x: 0.045 + side, y: 1.79 + bob, z: -0.025 },
      leftEar: { x: -0.09 + side, y: 1.75 + bob, z: 0 },
      rightEar: { x: 0.09 + side, y: 1.75 + bob, z: 0 },
      leftShoulder: { x: -0.25 + side, y: shoulderY, z: 0 },
      rightShoulder: { x: 0.25 + side, y: shoulderY, z: 0 },
      leftElbow: { x: -0.37 + side, y: 1.16 + bob, z: -swing * 0.65 },
      rightElbow: { x: 0.37 + side, y: 1.16 + bob, z: swing * 0.65 },
      leftWrist: { x: -0.36 + side, y: 0.91 + bob, z: -swing },
      rightWrist: { x: 0.36 + side, y: 0.91 + bob, z: swing },
      leftHip: { x: -0.15, y: hipY, z: 0 },
      rightHip: { x: 0.15, y: hipY, z: 0 },
      leftKnee: { x: -0.16, y: 0.52 + Math.max(0, swing) * 0.16, z: swing },
      rightKnee: { x: 0.16, y: 0.52 + Math.max(0, -swing) * 0.16, z: -swing },
      leftAnkle: { x: -0.17, y: 0.06, z: swing * 0.38 },
      rightAnkle: { x: 0.17, y: 0.06, z: -swing * 0.38 }
    };
    Object.keys(joints).forEach((key) => { joints[key] = worldPoint(joints[key]); });
    return joints;
  }

  const bones = [
    ["leftEar", "leftEye"], ["leftEye", "nose"], ["nose", "rightEye"], ["rightEye", "rightEar"],
    ["leftShoulder", "rightShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
    ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"], ["leftShoulder", "leftHip"],
    ["rightShoulder", "rightHip"], ["leftHip", "rightHip"], ["leftHip", "leftKnee"],
    ["leftKnee", "leftAnkle"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"]
  ];

  function drawRoom(rect, basis) {
    const grid = css("--blue", "#318cff");
    for (let x = -2.5; x <= 2.51; x += 0.5) {
      const major = Math.abs(x % 1) < 0.01;
      line3({ x, y: 0, z: -2 }, { x, y: 0, z: 2 }, rect, basis, grid, major ? 0.7 : 0.45, major ? 0.18 : 0.08);
    }
    for (let z = -2; z <= 2.01; z += 0.5) {
      const major = Math.abs(z % 1) < 0.01;
      line3({ x: -2.5, y: 0, z }, { x: 2.5, y: 0, z }, rect, basis, grid, major ? 0.7 : 0.45, major ? 0.18 : 0.08);
    }
    const corners = [
      {x:-2.5,y:0,z:-2}, {x:2.5,y:0,z:-2}, {x:2.5,y:0,z:2}, {x:-2.5,y:0,z:2}
    ];
    for (let i = 0; i < 4; i++) {
      line3(corners[i], corners[(i + 1) % 4], rect, basis, grid, 1, 0.28);
      line3(corners[i], { ...corners[i], y: 2.3 }, rect, basis, grid, 0.8, 0.12);
    }
  }

  function drawSignalField(rect, basis, time) {
    const sensor = { x: -2.05, y: 0.32, z: -1.42 };
    const router = { x: 2.05, y: 1.05, z: 1.42 };
    const cyan = css("--cyan", "#5df3d0");
    const blue = css("--blue", "#318cff");
    line3(sensor, router, rect, basis, cyan, 1.2, state.live ? 0.2 : 0.07);
    point3(sensor, 0.055, rect, basis, cyan, state.live ? 14 : 0);
    point3(router, 0.055, rect, basis, blue, 8);

    const pulse = (time * 0.00035) % 1;
    for (let ring = 0; ring < 4; ring++) {
      const radius = 0.45 + ((pulse + ring / 4) % 1) * 2.2;
      let previous = null;
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const p = { x: sensor.x + Math.cos(a) * radius, y: sensor.y + Math.sin(a) * radius * 0.42, z: sensor.z };
        if (previous) line3(previous, p, rect, basis, blue, 0.65, state.live ? 0.12 * (1 - radius / 3) : 0.025);
        previous = p;
      }
    }
  }

  function drawTrail(rect, basis) {
    if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.32;
      line3({x:trail[i-1].x,y:0.018,z:trail[i-1].z}, {x:trail[i].x,y:0.018,z:trail[i].z}, rect, basis, css("--gold", "#f1b94d"), 1.5, alpha);
    }
  }

  function drawAvatar(rect, basis, time) {
    if (!state.live && state.ageSeconds == null) return;
    const joints = buildPose(time);
    const color = state.live ? css("--cyan", "#5df3d0") : "#516362";
    const jointColor = state.move ? "#f1b94d" : color;
    const alpha = state.live ? 0.98 : 0.25;
    bones.forEach(([a, b]) => line3(joints[a], joints[b], rect, basis, color, 3, alpha));
    Object.values(joints).forEach((joint) => point3(joint, 0.035, rect, basis, jointColor, state.live ? 8 : 0));
    line3({x:displayTrack.x,y:0.01,z:displayTrack.z}, {x:displayTrack.x,y:0.01,z:displayTrack.z+0.32}, rect, basis, css("--gold", "#f1b94d"), 1.4, 0.65);
  }

  function render(time) {
    const rect = resizeCanvas(canvas, ctx);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const gradient = ctx.createRadialGradient(rect.width * .52, rect.height * .48, 10, rect.width * .52, rect.height * .48, Math.max(rect.width, rect.height) * .55);
    gradient.addColorStop(0, "rgba(20,74,72,.11)");
    gradient.addColorStop(1, "rgba(2,5,8,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ["x", "z", "heading", "gait"].forEach((key) => {
      let delta = targetTrack[key] - displayTrack[key];
      if (key === "heading") delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      displayTrack[key] += delta * 0.11;
    });
    const basis = cameraBasis();
    drawRoom(rect, basis);
    drawSignalField(rect, basis, time);
    drawTrail(rect, basis);
    drawAvatar(rect, basis, time);
    requestAnimationFrame(render);
  }

  function drawSparkline() {
    const rect = resizeCanvas(spark, sparkCtx);
    sparkCtx.clearRect(0, 0, rect.width, rect.height);
    const w = rect.width, h = rect.height;
    sparkCtx.strokeStyle = "rgba(107,150,149,.14)";
    sparkCtx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((fraction) => {
      sparkCtx.beginPath(); sparkCtx.moveTo(0, h * fraction); sparkCtx.lineTo(w, h * fraction); sparkCtx.stroke();
    });
    sparkCtx.strokeStyle = css("--cyan", "#5df3d0");
    sparkCtx.shadowColor = css("--cyan", "#5df3d0");
    sparkCtx.shadowBlur = 7;
    sparkCtx.lineWidth = 1.5;
    sparkCtx.beginPath();
    history.forEach((value, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - 5 - value * (h - 10);
      if (i === 0) sparkCtx.moveTo(x, y); else sparkCtx.lineTo(x, y);
    });
    sparkCtx.stroke();
    sparkCtx.shadowBlur = 0;
  }

  function updateUI(next) {
    state = next;
    targetTrack = { ...targetTrack, ...next.track };
    const motionPct = Math.round(next.motion * 100);
    const confidencePct = Math.round(next.confidence * 100);
    $("liveChip").classList.toggle("online", next.live);
    $("liveText").textContent = next.live ? "LIVE" : "WAITING";
    $("activityValue").textContent = next.activity;
    $("motionValue").textContent = motionPct;
    $("motionMeter").style.width = `${motionPct}%`;
    $("confidenceValue").textContent = confidencePct;
    $("positionValue").textContent = `X ${next.track.x.toFixed(2)} · Z ${next.track.z.toFixed(2)}`;
    $("rssiValue").textContent = next.rssi == null ? "-- dBm" : `${next.rssi} dBm`;
    $("jitterValue").textContent = next.jitter.toFixed(3);
    $("thresholdValue").textContent = next.threshold.toFixed(3);
    $("sequenceValue").textContent = next.seq == null ? "--" : `#${next.seq}`;
    $("presenceBox").classList.toggle("active", next.presence);
    $("presenceValue").textContent = next.presence ? "PRESENT" : (next.live ? "ABSENT" : "待機中");
    $("sceneStatus").textContent = next.live ? `${next.activity} · 17 KEYPOINTS` : "ESP32データ待機中";
    $("sampleAge").textContent = next.ageSeconds == null ? "最新データ：--" : `最新データ：${next.ageSeconds.toFixed(1)}秒前`;

    if (next.seq !== lastSequence) {
      lastSequence = next.seq;
      history.push(next.motion);
      history.shift();
      if (next.live && next.move) {
        trail.push({ x: next.track.x, z: next.track.z });
        if (trail.length > 70) trail.shift();
      }
      drawSparkline();
    }
  }

  async function poll() {
    try {
      const response = await fetch(`/api/state?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateUI(await response.json());
    } catch (error) {
      updateUI({ ...state, live: false, presence: false, move: false, activity: "サーバー切断", motion: 0, confidence: 0 });
    } finally {
      window.setTimeout(poll, 120);
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true; pointerX = event.clientX; pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    camera.yaw -= (event.clientX - pointerX) * 0.006;
    camera.pitch = Math.max(0.08, Math.min(1.05, camera.pitch + (event.clientY - pointerY) * 0.004));
    pointerX = event.clientX; pointerY = event.clientY;
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.distance = Math.max(3.5, Math.min(10, camera.distance + event.deltaY * 0.006));
  }, { passive: false });
  $("resetCamera").addEventListener("click", () => {
    camera.yaw = -0.72; camera.pitch = 0.38; camera.distance = 6.8;
  });

  new ResizeObserver(() => drawSparkline()).observe(spark);
  poll();
  requestAnimationFrame(render);
})();
