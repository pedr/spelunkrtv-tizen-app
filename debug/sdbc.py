"""Minimal sdb (Tizen debug bridge) client: run shell commands and open TCP streams on the TV.

  python3 sdbc.py <tv-ip> shell "<command>"
"""
import socket
import struct
import sys

A_CNXN, A_OPEN, A_OKAY, A_CLSE, A_WRTE = 0x4E584E43, 0x4E45504F, 0x59414B4F, 0x45534C43, 0x45545257
NAMES = {A_CNXN: "CNXN", A_OPEN: "OPEN", A_OKAY: "OKAY", A_CLSE: "CLSE", A_WRTE: "WRTE"}


class Sdb:
    def __init__(self, host, port=26101, timeout=90):
        self.s = socket.create_connection((host, port), timeout=timeout)
        self.local_id = 0
        self.send(A_CNXN, 0x02000000, 256 * 1024, b"host::\0")
        cmd, a0, a1, data = self.recv()
        if cmd != A_CNXN:
            raise RuntimeError("expected CNXN, got %s %r" % (NAMES.get(cmd, hex(cmd)), data))
        self.banner = data.decode("utf-8", "replace")

    def send(self, cmd, a0, a1, data=b""):
        hdr = struct.pack("<6I", cmd, a0, a1, len(data), sum(data) & 0xFFFFFFFF, cmd ^ 0xFFFFFFFF)
        self.s.sendall(hdr + data)

    def _read(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.s.recv(n - len(buf))
            if not chunk:
                raise EOFError("connection closed")
            buf += chunk
        return buf

    def recv(self):
        cmd, a0, a1, n, _crc, _magic = struct.unpack("<6I", self._read(24))
        return cmd, a0, a1, self._read(n) if n else b""

    def open(self, service):
        self.local_id += 1
        lid = self.local_id
        self.send(A_OPEN, lid, 0, service.encode() + b"\0")
        while True:
            cmd, a0, a1, data = self.recv()
            if cmd == A_OKAY and a1 == lid:
                return lid, a0
            if cmd == A_CLSE and a1 == lid:
                raise RuntimeError("service refused: %s" % service)

    def shell(self, command):
        lid, rid = self.open("shell:" + command)
        out = b""
        while True:
            cmd, a0, a1, data = self.recv()
            if cmd == A_WRTE and a1 == lid:
                out += data
                sys.stdout.write(data.decode("utf-8", "replace"))
                sys.stdout.flush()
                self.send(A_OKAY, lid, a0)
            elif cmd == A_CLSE and a1 == lid:
                self.send(A_CLSE, lid, a0)
                return out.decode("utf-8", "replace")


if __name__ == "__main__":
    host, action = sys.argv[1], sys.argv[2]
    sdb = Sdb(host)
    print("banner:", sdb.banner)
    if action == "shell":
        sdb.shell(sys.argv[3])
        print()
