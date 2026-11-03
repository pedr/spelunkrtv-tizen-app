"""Print TV log events from logs.jsonl, starting at a line number: TV_IP=<ip> python3 summarize.py [start_line]"""
import json
import os
import sys

start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
tv_ip = os.environ.get("TV_IP")
if not tv_ip:
    sys.exit("set TV_IP to the TV's LAN IP")
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs.jsonl"), encoding="utf-8") as f:
    lines = f.readlines()[start:]
for line in lines:
    try:
        row = json.loads(line)
        if row.get("ip") != tv_ip:
            continue
        d = json.loads(row["e"])
        m = str(d.get("m"))
        if d.get("k") == "snap":
            v = json.loads(m).get("video") or {}
            print(d.get("t"), "snap", "rs", v.get("rs"), "err", v.get("errMsg"), "paused", v.get("paused"), "t", v.get("t"), "buf", v.get("buf"))
        elif d.get("k") not in ("key", "media.timeupdate"):
            print(d.get("t"), d.get("k"), m[:200])
    except Exception:
        pass
