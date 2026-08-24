from __future__ import annotations

import argparse
import getpass
import re
import time

import serial


def quote_console(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure ESP32 Wi-Fi without storing the password")
    parser.add_argument("--port", default="COM3")
    parser.add_argument("--ssid", required=True)
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()

    password = getpass.getpass("Wi-Fi password: ")
    if len(password) < 8:
        raise SystemExit("Password must contain at least 8 characters.")

    commands = [
        (
            f"wifi_config --ssid {quote_console(args.ssid)} "
            f"--password {quote_console(password)} --country_code JP"
        ),
    ]
    password = ""

    connected = False
    ip_address = None
    safe_events: list[str] = []
    with serial.Serial(args.port, 2_000_000, timeout=0.15, write_timeout=2.0) as device:
        device.write(b"restart\r\n")
        device.flush()
        time.sleep(4.5)
        device.reset_input_buffer()
        for command in commands:
            device.write((command + "\r\n").encode("utf-8"))
            device.flush()
            time.sleep(0.55)
        commands.clear()

        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline:
            line = device.readline().decode("utf-8", errors="replace").strip()
            if not line:
                continue
            lower = line.lower()
            if (
                any(word in lower for word in ("wifi", "connected", "disconnect", "got ip", "error", "fail"))
                and "password" not in lower
                and args.ssid.lower() not in lower
            ):
                safe_events.append(line[-240:])
                safe_events = safe_events[-8:]
            if "sta connected" in lower or "got ip" in lower or "sta got ip" in lower:
                connected = True
            match = re.search(r"(?:IP|ip)[:= ]+(\d+\.\d+\.\d+\.\d+)", line)
            if match:
                ip_address = match.group(1)
            if connected and (ip_address or "RADAR_DADA" in line or "CSI_DATA" in line):
                break

    if connected:
        print("ESP32 Wi-Fi connected" + (f" ({ip_address})" if ip_address else ""))
        return 0
    print("ESP32 Wi-Fi command sent, but connection was not confirmed before timeout.")
    for event in safe_events:
        print(f"  {event}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
