from __future__ import annotations

import argparse
import csv
import json
import math
import mimetypes
import os
import threading
import time
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOG_DIR = (
    PROJECT_ROOT
    / "esp-csi"
    / "examples"
    / "esp-radar"
    / "console_test"
    / "tools"
    / "log"
)
STATIC_DIR = Path(__file__).resolve().parent / "static"


def _float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def read_latest_csv(path: Path) -> tuple[dict[str, str] | None, float | None]:
    """Read the last complete CSV record while another process is appending."""
    try:
        stat = path.stat()
        with path.open("rb") as handle:
            header_bytes = handle.readline()
            header = next(csv.reader([header_bytes.decode("utf-8-sig", errors="replace")]))
            data_start = handle.tell()
            tail_start = max(data_start, stat.st_size - 262_144)
            handle.seek(tail_start)
            chunk = handle.read().decode("utf-8", errors="replace")
        lines = chunk.splitlines()
        if tail_start > data_start and lines:
            lines = lines[1:]
        for line in reversed(lines):
            values = next(csv.reader([line]))
            if len(values) == len(header) and values and values[0]:
                return dict(zip(header, values)), stat.st_mtime
    except (FileNotFoundError, OSError, csv.Error):
        pass
    return None, None


@dataclass
class EstimatedTrack:
    x: float = 0.0
    z: float = 0.1
    heading: float = 0.0
    gait: float = 0.0
    previous_jitter: float = 0.0
    last_seq: int | None = None
    presence_until: float = 0.0


class RadarEstimator:
    """Map single-node motion evidence onto a bounded, explicitly synthetic track."""

    def __init__(self, log_dir: Path = DEFAULT_LOG_DIR, now_fn=time.time) -> None:
        self.log_dir = Path(log_dir)
        self.radar_path = self.log_dir / "radar_data.csv"
        self.csi_path = self.log_dir / "csi_data.csv"
        self.now_fn = now_fn
        self.track = EstimatedTrack()
        self.lock = threading.Lock()

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return self._snapshot_locked()

    def _snapshot_locked(self) -> dict[str, Any]:
        now = self.now_fn()
        radar, radar_mtime = read_latest_csv(self.radar_path)
        csi, csi_mtime = read_latest_csv(self.csi_path)

        newest_mtime = max(
            [value for value in (radar_mtime, csi_mtime) if value is not None],
            default=0.0,
        )
        age_seconds = max(0.0, now - newest_mtime) if newest_mtime else None
        live = bool(radar and radar_mtime and now - radar_mtime <= 3.0)

        seq = _int(radar.get("seq")) if radar else None
        jitter = _float(radar.get("waveform_jitter")) if radar else 0.0
        jitter_median = _float(radar.get("jitter_midean")) if radar else 0.0
        jitter_threshold = _float(radar.get("waveform_jitter_threshold")) if radar else 0.0
        wander = _float(radar.get("waveform_wander")) if radar else 0.0
        move = bool(_int(radar.get("move_status"))) if radar and live else False
        someone = bool(_int(radar.get("someone_status"))) if radar and live else False

        scale = max(jitter_threshold, jitter_median * 4.0, 0.35)
        motion = min(1.0, max(0.0, jitter / scale)) if live else 0.0
        if move:
            self.track.presence_until = now + 5.0
        presence = live and (someone or move or now < self.track.presence_until)

        is_new_frame = live and seq is not None and seq != self.track.last_seq
        if is_new_frame:
            delta = jitter - self.track.previous_jitter
            turn = math.sin(seq * 0.47 + jitter * 2.7) * (0.05 + 0.16 * motion)
            turn += max(-0.08, min(0.08, delta * 0.12))
            self.track.heading += turn

            if move:
                step = 0.018 + 0.065 * motion
                self.track.x += math.sin(self.track.heading) * step
                self.track.z += math.cos(self.track.heading) * step
                self.track.gait = (self.track.gait + 0.22 + motion * 0.42) % (math.pi * 2.0)

            x_limit, z_limit = 1.85, 1.35
            if abs(self.track.x) > x_limit:
                self.track.x = max(-x_limit, min(x_limit, self.track.x))
                self.track.heading = -self.track.heading
            if abs(self.track.z) > z_limit:
                self.track.z = max(-z_limit, min(z_limit, self.track.z))
                self.track.heading = math.pi - self.track.heading

            self.track.previous_jitter = jitter
            self.track.last_seq = seq

        rssi = _int(csi.get("rssi"), -100) if csi else None
        signal_quality = 0
        if rssi is not None:
            signal_quality = round(max(0.0, min(100.0, (rssi + 100) * 2.0)))

        if not live:
            activity = "データ待機"
        elif move and motion >= 0.55:
            activity = "大きな動き"
        elif move:
            activity = "移動"
        elif presence:
            activity = "静止"
        else:
            activity = "不在"

        confidence = 0.0
        if live:
            confidence = min(0.92, 0.38 + motion * 0.42 + (0.08 if someone else 0.0))

        return {
            "live": live,
            "source": "ESP32 CSI" if live else "ESP32 CSI（待機中）",
            "seq": seq,
            "sampleTimestamp": radar.get("timestamp") if radar else None,
            "ageSeconds": round(age_seconds, 2) if age_seconds is not None else None,
            "rssi": rssi,
            "signalQuality": signal_quality,
            "presence": presence,
            "move": move,
            "activity": activity,
            "motion": round(motion, 4),
            "jitter": round(jitter, 5),
            "wander": round(wander, 5),
            "threshold": round(jitter_threshold, 5),
            "confidence": round(confidence, 3),
            "track": {
                "x": round(self.track.x, 4),
                "y": 0.0,
                "z": round(self.track.z, 4),
                "heading": round(self.track.heading, 4),
                "gait": round(self.track.gait, 4),
            },
            "inference": {
                "position": "synthetic-single-node",
                "pose": "motion-driven-17-keypoint",
                "disclaimer": "位置と姿勢は単一ESP32の動体値から生成した推定演出です。",
            },
        }


class Radar3DServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], estimator: RadarEstimator) -> None:
        super().__init__(address, RadarRequestHandler)
        self.estimator = estimator


class RadarRequestHandler(BaseHTTPRequestHandler):
    server: Radar3DServer

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}", flush=True)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/state":
            self._send_json(self.server.estimator.snapshot())
            return
        if path == "/health":
            self._send_json({"ok": True, "service": "esp32-radar-3d"})
            return

        requested = "index.html" if path in ("", "/") else path.lstrip("/")
        target = (STATIC_DIR / requested).resolve()
        try:
            target.relative_to(STATIC_DIR.resolve())
        except ValueError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        mime, _ = mimetypes.guess_type(target.name)
        content = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{mime or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _send_json(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="ESP32 CSI estimated 3D motion viewer")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--log-dir", type=Path, default=DEFAULT_LOG_DIR)
    parser.add_argument("--open", action="store_true", dest="open_browser")
    args = parser.parse_args()

    server = Radar3DServer((args.host, args.port), RadarEstimator(args.log_dir))
    url = f"http://{args.host}:{args.port}/"
    print(f"ESP32 Radar 3D: {url}", flush=True)
    print(f"Watching: {args.log_dir}", flush=True)
    if args.open_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
