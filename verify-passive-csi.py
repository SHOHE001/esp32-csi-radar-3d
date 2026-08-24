import argparse
import time

import serial


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify passive ESP32 CSI/radar output")
    parser.add_argument("--port", default="COM3")
    parser.add_argument("--seconds", type=float, default=15.0)
    parser.add_argument("--target-bssid", default="")
    args = parser.parse_args()

    raw = bytearray()
    with serial.Serial(args.port, 2_000_000, timeout=0.1) as port:
        time.sleep(1.0)
        port.reset_input_buffer()
        port.write(b"radar --csi_output_type LLTF --csi_output_format base64\r\n")
        port.flush()
        deadline = time.monotonic() + args.seconds
        while time.monotonic() < deadline:
            raw.extend(port.read(65536))

    text = raw.decode("utf-8", errors="ignore")
    lines = text.splitlines()
    csi_lines = [line for line in lines if line.startswith("CSI_DATA,")]
    radar_lines = [line for line in lines if line.startswith("RADAR_DADA,")]
    target_lines = (
        [line for line in lines if args.target_bssid.lower() in line.lower()]
        if args.target_bssid
        else []
    )

    print(f"bytes={len(raw)}")
    print(f"csi_frames={len(csi_lines)}")
    print(f"radar_updates={len(radar_lines)}")
    if args.target_bssid:
        print(f"target_bssid_mentions={len(target_lines)}")
    if csi_lines:
        print(f"first_csi={csi_lines[0][:240]}")
    if radar_lines:
        print(f"first_radar={radar_lines[0]}")
        print(f"last_radar={radar_lines[-1]}")

    return 0 if csi_lines and radar_lines else 1


if __name__ == "__main__":
    raise SystemExit(main())
