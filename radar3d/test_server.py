import csv
import os
import tempfile
import unittest
from pathlib import Path

from server import RadarEstimator, read_latest_csv


RADAR_FIELDS = [
    "type", "seq", "timestamp", "waveform_wander", "wander_average",
    "waveform_wander_threshold", "someone_status", "waveform_jitter",
    "jitter_midean", "waveform_jitter_threshold", "move_status",
]
CSI_FIELDS = ["type", "seq", "timestamp", "rssi"]


class RadarEstimatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.log_dir = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write_rows(self, name, fields, rows, mtime=999.0):
        path = self.log_dir / name
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        os.utime(path, (mtime, mtime))
        return path

    def test_read_latest_complete_record(self):
        path = self.write_rows("radar_data.csv", RADAR_FIELDS, [
            {"type": "RADAR_DADA", "seq": "7"},
            {"type": "RADAR_DADA", "seq": "8"},
        ])
        row, mtime = read_latest_csv(path)
        self.assertEqual(row["seq"], "8")
        self.assertEqual(mtime, 999.0)

    def test_live_motion_produces_bounded_estimated_track(self):
        self.write_rows("radar_data.csv", RADAR_FIELDS, [{
            "type": "RADAR_DADA", "seq": "12", "timestamp": "test",
            "waveform_wander": "0.08", "someone_status": "0",
            "waveform_jitter": "0.85", "jitter_midean": "0.2",
            "waveform_jitter_threshold": "1.0", "move_status": "1",
        }])
        self.write_rows("csi_data.csv", CSI_FIELDS, [{
            "type": "CSI_DATA", "seq": "30", "timestamp": "test", "rssi": "-47",
        }])
        estimator = RadarEstimator(self.log_dir, now_fn=lambda: 1000.0)
        result = estimator.snapshot()
        self.assertTrue(result["live"])
        self.assertTrue(result["move"])
        self.assertTrue(result["presence"])
        self.assertEqual(result["rssi"], -47)
        self.assertGreater(result["motion"], 0.7)
        self.assertEqual(result["inference"]["position"], "synthetic-single-node")
        self.assertLessEqual(abs(result["track"]["x"]), 1.85)
        self.assertLessEqual(abs(result["track"]["z"]), 1.35)

    def test_stale_data_is_not_reported_live(self):
        self.write_rows("radar_data.csv", RADAR_FIELDS, [{
            "type": "RADAR_DADA", "seq": "2", "move_status": "1",
            "waveform_jitter": "1.0",
        }], mtime=900.0)
        result = RadarEstimator(self.log_dir, now_fn=lambda: 1000.0).snapshot()
        self.assertFalse(result["live"])
        self.assertFalse(result["move"])
        self.assertFalse(result["presence"])
        self.assertEqual(result["motion"], 0.0)


if __name__ == "__main__":
    unittest.main()
