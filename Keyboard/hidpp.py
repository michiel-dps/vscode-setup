"""Minimal HID++ 2.0 helper for Logitech devices behind a Unifying/Bolt receiver (Windows, hidapi)."""
import hid, time, struct

VID = 0x046D
SW_ID = 0x0A

class Receiver:
    def __init__(self, pid=None):
        devs = [d for d in hid.enumerate(VID, 0) if d['usage_page'] == 0xFF00 and (pid is None or d['product_id'] == pid)]
        self.long = self.short = None
        self.pending = []   # reports read while waiting for something else (key events etc.)
        for d in devs:
            if d['usage'] == 2 and self.long is None:
                self.long = hid.device()
                self.long.open_path(d['path'])
                self.long.set_nonblocking(1)
                self.pid = d['product_id']
            if d['usage'] == 1 and self.short is None:
                self.short = hid.device()
                self.short.open_path(d['path'])
                self.short.set_nonblocking(1)
        if self.long is None:
            raise RuntimeError("No Logitech HID++ long-report interface found")

    def close(self):
        for h in (self.long, self.short):
            if h: h.close()

    def _handles(self):
        return [h for h in (self.long, self.short) if h]

    def _stash(self, r):
        self.pending.append(bytes(r))
        del self.pending[:-64]

    def _drain(self):
        for h in self._handles():
            while True:
                r = h.read(64)
                if not r: break
                self._stash(r)

    def read_report(self, timeout=0.5):
        """Return the next unsolicited report (event/notification) or None after timeout."""
        if self.pending:
            return self.pending.pop(0)
        t0 = time.time()
        while time.time() - t0 < timeout:
            for h in self._handles():
                r = h.read(64)
                if r: return bytes(r)
            time.sleep(0.01)
        return None

    def request(self, dev_idx, feat_idx, fn, params=b'', timeout=2.0):
        """Send a long HID++ request. Return the 16 param bytes of the reply or raise."""
        self._drain()
        params = bytes(params)
        pkt = bytes([0x11, dev_idx, feat_idx, ((fn & 0x0F) << 4) | SW_ID]) + params + bytes(16 - len(params))
        self.long.write(pkt)
        t0 = time.time()
        while time.time() - t0 < timeout:
            for h in self._handles():
                r = h.read(64)
                if not r: continue
                r = bytes(r)
                if r[1] != dev_idx:
                    self._stash(r)
                    continue
                # HID++ 1.0 error (short 0x8F) or 2.0 error (0xFF)
                if r[2] == 0x8F and r[3] == feat_idx:
                    raise IOError(f"HID++1.0 error {r[5]:#x} (dev {dev_idx})")
                if r[2] == 0xFF and r[3] == feat_idx and r[4] == pkt[3]:
                    raise IOError(f"HID++2.0 error {r[5]:#x} (dev {dev_idx}, feat {feat_idx:#x}, fn {fn})")
                if r[2] == feat_idx and r[3] == pkt[3]:
                    return r[4:20]
                self._stash(r)
            time.sleep(0.005)
        raise TimeoutError(f"no reply from device index {dev_idx}")

    def feature_index(self, dev_idx, feature):
        r = self.request(dev_idx, 0x00, 0, struct.pack('>H', feature))
        return (r[0], r[1], r[2]) if r[0] else (None, None, None)  # index, type, version

    def ping(self, dev_idx, timeout=0.6, tries=1):
        """Ping a paired device. A sleeping keyboard can need a few seconds to wake, so allow a longer timeout."""
        for _ in range(tries):
            try:
                r = self.request(dev_idx, 0x00, 1, b'\x00\x00\x55', timeout=timeout)
                return f"HID++ {r[0]}.{r[1]}"
            except Exception:
                pass
        return None

    def enable_link_notifications(self):
        """Ask the receiver to report when a device connects or drops (falls asleep).
        HID++ 1.0 set register 0x00, flag 'wireless notifications'. Returns True if it said yes."""
        self._drain()
        self.short.write(bytes([0x10, 0xFF, 0x80, 0x00, 0x00, 0x01, 0x00]))
        t0 = time.time()
        while time.time() - t0 < 1.0:
            for h in self._handles():
                r = h.read(64)
                if not r: continue
                r = bytes(r)
                if r[1] == 0xFF and r[2] == 0x8F: return False
                if r[1] == 0xFF and r[2] == 0x80 and r[3] == 0x00: return True
                self._stash(r)
            time.sleep(0.005)
        return False

    def paired_name(self, slot):
        """Name of the device paired in receiver slot 1..6 (from the receiver's pairing table), or None."""
        self._drain()
        self.short.write(bytes([0x10, 0xFF, 0x83, 0xB5, 0x40 + slot - 1, 0, 0]))
        t0 = time.time()
        while time.time() - t0 < 1.0:
            for h in self._handles():
                r = h.read(64)
                if not r: continue
                r = bytes(r)
                if r[1] == 0xFF and r[2] == 0x8F: return None
                if r[1] == 0xFF and r[2] == 0x83 and r[3] == 0xB5:
                    return r[6:6 + r[5]].decode('ascii', 'replace')
            time.sleep(0.005)
        return None

    def device_name(self, dev_idx):
        idx, _, _ = self.feature_index(dev_idx, 0x0005)
        if idx is None: return None
        n = self.request(dev_idx, idx, 0)[0]
        name = b''
        while len(name) < n:
            name += self.request(dev_idx, idx, 1, bytes([len(name)]))
        return name[:n].decode('ascii', 'replace')
