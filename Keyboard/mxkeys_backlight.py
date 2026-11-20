"""MX Keys backlight: force the key lights on via the hidden HID++ LED-test feature (0x18A1).
Forced on, the lights also shine in a bright room (the keyboard's light sensor no longer turns them off).
F6/F7 stay with the keyboard itself (since 20 Nov 2026): they dim and brighten the forced lights.
The battery light is left to the keyboard.

The watcher leaves the keyboard alone (19 Nov 2026, the battery went from full to 20% in 4 hours):
no battery checks, no regular questions. It only talks to the keyboard
  - when it connects (lights as chosen, F6/F7 left to the keyboard, F1/F2 see below),
  - when F1/F2 is pressed,
  - after 5 minutes without input: one message, lights off, so the keyboard can sleep,
  - at the first touch after that, or when the receiver says the keyboard woke: lights on again,
  - when an external screen comes or goes (F1/F2 to the watcher or back to Windows).

Usage:  python mxkeys_backlight.py on|off|status|watch|restore
  on       key lights forced on (and remember that choice)
  off      key lights forced off (and remember that choice)
  status   print current state
  watch    run forever, see above.
           Also F1/F2 (screen brightness down/up): external screens over DDC/CI (screens.py),
           hold the key to keep going. Only while such a screen is connected. With the computer
           screen alone, F1/F2 go back to Windows' own brightness control.
  restore  full cleanup: normal backlight, F1/F2/F6/F7 back to their native function, hidden features off.
           Use this when you stop using the watcher for good.
"""
import sys, time, datetime, os, json, ctypes
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hidpp import Receiver
import screens

AWAY_AFTER = 300                             # seconds without input = away: lights off, keyboard can sleep
SCREENS_EVERY = 15                           # seconds between checks for external screens (no keyboard traffic)


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


def idle_seconds():
    """Seconds since the last mouse or keyboard input in Windows."""
    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(info)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info))
    return ((ctypes.windll.kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF) / 1000

DEVICE_NAME = "MX Keys"
# LED-test mask, byte 0: bit0 battery LED green, bit1 battery LED red, bit3 caps lock, bit4 key backlight.
# Byte 2 holds the three Easy-Switch LEDs. The test mode only knows on/off per LED, but the forced
# backlight follows the keyboard's own brightness level, which its own F6/F7 set (seen 20 Nov 2026).
LED_BACKLIGHT = 0x10
ON_MASK = bytes([LED_BACKLIGHT, 0x00, 0x00])
CLEAR = bytes([0x00, 0x00, 0x00])
CID_BACKLIGHT_DOWN = 0x00E2                  # F6 on the MX Keys
CID_BACKLIGHT_UP = 0x00E3                    # F7 on the MX Keys
BACKLIGHT_KEYS = (CID_BACKLIGHT_DOWN, CID_BACKLIGHT_UP)
CID_BRIGHTNESS_DOWN = 0x00C7                 # F1 on the MX Keys
CID_BRIGHTNESS_UP = 0x00C8                   # F2 on the MX Keys
BRIGHTNESS_KEYS = (CID_BRIGHTNESS_DOWN, CID_BRIGHTNESS_UP)
BRIGHTNESS_STEP = 10                         # points (of 0-100) per press
HOLD_DELAY = 0.4                             # seconds a held F1/F2 waits before repeating
HOLD_REPEAT = 0.15                           # seconds between repeats while held
LOG = os.path.join(HERE, "watch.log")
STATE = os.path.join(HERE, "state.json")

def log(msg):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 200_000:
            os.replace(LOG, LOG + ".old")
        with open(LOG, "a") as f: f.write(line + "\n")
    except OSError: pass

def load_wanted():
    """True = key lights on, False = off. Default: on."""
    try:
        with open(STATE) as f: return bool(json.load(f).get("forced", True))
    except (OSError, ValueError): return True

def save_wanted(forced):
    try:
        with open(STATE, "w") as f: json.dump({"forced": bool(forced)}, f)
    except OSError: pass

class Keyboard:
    def __init__(self):
        self.rx = Receiver()
        self.idx = None
        # Find the slot from the receiver's pairing table (works even while the keyboard sleeps),
        # then wake the keyboard with a patient ping.
        slots = [s for s in range(1, 7) if (self.rx.paired_name(s) or "").startswith(DEVICE_NAME)] or list(range(1, 7))
        for i in slots:
            if self.rx.ping(i, timeout=3.0, tries=2) and (self.rx.device_name(i) or "").startswith(DEVICE_NAME):
                self.idx = i
                break
        if self.idx is None:
            self.rx.close()
            raise RuntimeError(f"{DEVICE_NAME} not responding on the receiver")
        self.f_hidden, _, _ = self.rx.feature_index(self.idx, 0x1E00)
        self.f_led, _, _ = self.rx.feature_index(self.idx, 0x18A1)
        self.f_keys, _, _ = self.rx.feature_index(self.idx, 0x1B04)
        if not (self.f_hidden and self.f_led and self.f_keys):
            raise RuntimeError("required features not present on this keyboard")
        # The keys this keyboard lets us take over (reprogrammable controls v4, getCount + getCidInfo).
        self.cids = set()
        for i in range(self.req(self.f_keys, 0)[0]):
            self.cids.add(int.from_bytes(self.req(self.f_keys, 1, bytes([i]))[0:2], 'big'))

    def req(self, feat, fn, params=b''): return self.rx.request(self.idx, feat, fn, params)
    def close(self): self.rx.close()

    # --- backlight ---
    def forced(self):
        """True if the LED-test mask currently forces the backlight on."""
        if not self.req(self.f_hidden, 0)[0]:
            return False
        return bool(self.req(self.f_led, 1)[0] & LED_BACKLIGHT)

    def set_mask(self, mask):
        self.req(self.f_hidden, 1, b'\x01')
        self.req(self.f_led, 2, mask)
        return self.req(self.f_led, 1)[:3] == mask

    def lights_on(self):
        """Switch off and on again: after sleep the lights are dark but still reported as on."""
        self.set_mask(CLEAR)
        return self.set_mask(ON_MASK)

    def lights_off(self):
        return self.set_mask(CLEAR)

    def apply(self, wanted):
        return self.lights_on() if wanted else self.lights_off()

    def normal(self):
        """The keyboard's own backlight behaviour, hidden features off (only for restore)."""
        self.req(self.f_hidden, 1, b'\x01')
        self.req(self.f_led, 2, CLEAR)
        self.req(self.f_hidden, 1, b'\x00')

    # --- key diversion (reprogrammable controls v4) ---
    def diverted(self, cid):
        return bool(self.req(self.f_keys, 2, cid.to_bytes(2, 'big'))[2] & 0x01)

    def divert(self, cid, on):
        flags = 0x03 if on else 0x02          # bit1 = "divert flag is valid", bit0 = divert
        self.req(self.f_keys, 3, cid.to_bytes(2, 'big') + bytes([flags]))

    def ensure_diverted(self, on=True, cids=BACKLIGHT_KEYS):
        changed = False
        for cid in cids:
            if cid in self.cids and self.diverted(cid) != on:
                self.divert(cid, on)
                changed = True
        return changed

    def pressed_keys(self, report):
        """CIDs in a divertedButtonsEvent for this keyboard, or None if the report is something else."""
        if len(report) < 12 or report[1] != self.idx or report[2] != self.f_keys or report[3] != 0x00:
            return None
        return {int.from_bytes(report[4 + 2 * i:6 + 2 * i], 'big') for i in range(4)} - {0}

def cmd_status():
    kb = Keyboard()
    forced = kb.forced()
    keys = kb.diverted(CID_BACKLIGHT_DOWN) and kb.diverted(CID_BACKLIGHT_UP)
    f1f2 = all(cid in kb.cids for cid in BRIGHTNESS_KEYS) and all(kb.diverted(cid) for cid in BRIGHTNESS_KEYS)
    kb.close()
    print(f"key lights forced on: {forced}   remembered choice: {'on' if load_wanted() else 'off'}   "
          f"F6/F7 handled by watcher: {keys}")
    print(f"F1/F2 handled by watcher: {f1f2}   external screens (brightness): {screens.brightness()}")

def cmd_on():
    save_wanted(True)
    kb = Keyboard()
    ok = kb.lights_on()
    kb.close()
    print("key lights on" if ok else "FAILED to switch the key lights on")
    return 0 if ok else 1

def cmd_off():
    save_wanted(False)
    kb = Keyboard()
    kb.lights_off()
    kb.close()
    print("key lights off")

def cmd_restore():
    save_wanted(False)
    kb = Keyboard()
    kb.normal()
    kb.ensure_diverted(False)
    kb.ensure_diverted(False, BRIGHTNESS_KEYS)
    kb.close()
    print("normal backlight, F1/F2/F6/F7 native again, hidden features off")

def step_screens(cid, why=None):
    """F1 = darker, F2 = brighter, on every external screen. Logs only when why is given."""
    step = -BRIGHTNESS_STEP if cid == CID_BRIGHTNESS_DOWN else BRIGHTNESS_STEP
    try:
        changes = screens.change_brightness(step)
        if why:
            log(f"{why}: screens {' '.join(f'{old}->{new}' for old, new in changes)}")
    except Exception as e:
        log(f"screen brightness failed: {e}")

def cmd_watch():
    log("watch started")
    kb = None
    wanted = load_wanted()
    held = set()
    repeat_at = None                              # when a held F1/F2 steps again
    external = None                               # external screen connected (None = not checked yet)
    next_screens = 0
    away = False                                  # no input for AWAY_AFTER seconds: lights off, keyboard alone
    last_key = 0                                  # time of the last F1/F2/F6/F7 press (Windows does not count those)
    failures = 0                                  # tries in a row the keyboard did not answer
    while True:
        try:
            # Not connected and nobody at the computer: wait, every ping would wake the keyboard
            if kb is None and idle_seconds() >= AWAY_AFTER:
                time.sleep(1)
                continue
            if kb is None:
                kb = Keyboard()
                failures = 0
                log(f"connected to {DEVICE_NAME} (receiver slot {kb.idx})")
                if not kb.rx.enable_link_notifications():
                    log("receiver did not accept link notifications: sleep and wake will not be reported")
                missing = [f"{cid:#06x}" for cid in BRIGHTNESS_KEYS if cid not in kb.cids]
                if missing:
                    log(f"F1/F2 keys {missing} not on this keyboard. It has: {[f'{c:#06x}' for c in sorted(kb.cids)]}")
                kb.ensure_diverted(False)         # F6/F7 stay with the keyboard: they dim the forced lights
                external = None
                next_screens = 0
                wanted = load_wanted()
                log(f"key lights {'on' if wanted else 'off'} (ok={kb.apply(wanted)})")
            # External screens: checked over the screen cable, the keyboard is only asked when it changes
            if time.time() >= next_screens and not away:
                now_external = len(screens.brightness()) > 0
                if now_external != external:
                    external = now_external
                    kb.ensure_diverted(external, BRIGHTNESS_KEYS)
                    log("F1/F2 diverted to the watcher (external screens)" if external
                        else "F1/F2 with Windows (no external screen)")
                next_screens = time.time() + SCREENS_EVERY
            # Away and back, from Windows' own input clock (no keyboard traffic)
            idle = min(idle_seconds(), time.time() - last_key)
            if idle >= AWAY_AFTER and not away:
                away = True
                if wanted:
                    log(f"away: lights off, keyboard left alone so it can sleep (ok={kb.lights_off()})")
                else:
                    log("away: keyboard left alone so it can sleep")
            if idle < 2 and away:
                away = False
                if wanted:
                    log(f"back at the computer: lights on (ok={kb.lights_on()})")
                else:
                    log("back at the computer")
            held_brightness = [cid for cid in BRIGHTNESS_KEYS if cid in held]
            timeout = max(0.0, repeat_at - time.time()) if held_brightness and repeat_at else 0.5
            report = kb.rx.read_report(timeout=timeout)
            if report is None:
                if held_brightness and repeat_at and time.time() >= repeat_at:
                    step_screens(held_brightness[0])
                    repeat_at = time.time() + HOLD_REPEAT
                continue
            # The receiver reports the link (HID++ 1.0 notification 0x41): byte 4 bit 6 set = link lost
            if len(report) > 4 and report[1] == kb.idx and report[2] == 0x41:
                if report[4] & 0x40:
                    log("keyboard asleep (link to the receiver off)")
                else:
                    log("keyboard woke up")
                    time.sleep(1)                 # it needs a moment before it answers
                    if wanted and not away:
                        log(f"lights on after waking (ok={kb.lights_on()})")
                continue
            keys = kb.pressed_keys(report)
            if keys is None:
                continue
            newly = keys - held
            held = keys
            if newly:
                last_key = time.time()            # a press of F1/F2 also means he is back
            for cid in BRIGHTNESS_KEYS:
                if cid in newly:
                    step_screens(cid, "F1 pressed" if cid == CID_BRIGHTNESS_DOWN else "F2 pressed")
                    repeat_at = time.time() + HOLD_DELAY
            if not any(cid in held for cid in BRIGHTNESS_KEYS):
                repeat_at = None
        except Exception as e:
            log(f"keyboard unavailable: {e}")
            try:
                if kb: kb.close()
            except Exception: pass
            kb = None
            held = set()
            repeat_at = None
            # just woken up: try again soon, so the backlight is back within a few seconds
            failures = failures + 1
            time.sleep(2 if failures <= 10 else 10)

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    cmds = {"on": cmd_on, "off": cmd_off, "status": cmd_status, "watch": cmd_watch, "restore": cmd_restore}
    if cmd not in cmds:
        print(__doc__)
        sys.exit(2)
    sys.exit(cmds[cmd]() or 0)
