"""MX Keys backlight: force always-on via the hidden HID++ LED-test feature (0x18A1).
While forced, the battery LED shows the battery: red when low (20% or less), orange (green + red)
on battery, off while charging (the keyboard's own charging light), green when full on the cable.
After the keyboard slept, the lights are switched on again as soon as it wakes.
After 5 minutes without input the watcher switches all its lights off and leaves the keyboard
alone, so it can sleep.

Usage:  python mxkeys_backlight.py on|off|status|watch|restore
  on       force the backlight on, battery LED amber (and remember that choice)
  off      back to the keyboard's normal backlight behaviour (and remember that choice)
  status   print current state
  watch    run forever: keeps the remembered choice applied, and listens to the keyboard's
           backlight keys. F7 (backlight up) = force on, F6 (backlight down) = normal again.
           F7 while already forced on = switch the lights off and on again (they can be dark).
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

# After the keyboard sleeps it still reports the forced LEDs, but they are dark (18 Nov 2026).
# So the lights are switched off and on again when the computer is used after a pause,
# and when the keyboard (re)connects.
IDLE_PAUSE = 60                              # seconds without mouse or keyboard input = a pause
# Every question to the keyboard keeps it awake (19 Nov 2026: it answered every 5 seconds all
# through a 26 minute break). So while he is away the watcher asks nothing and only listens,
# and all the lights are off. Giving the keyboard its own backlight back did not work: it did
# not come back as the keyboard's normal light (19 Nov 2026). The first touch lights it again.
AWAY_AFTER = 300                             # seconds without input = away: let the keyboard sleep


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
# Byte 2 holds the three Easy-Switch LEDs. The test mode only knows on/off per LED, no brightness level.
LED_BATTERY_GREEN = 0x01
LED_BATTERY_RED = 0x02
LED_BACKLIGHT = 0x10
# Forced state: key backlight on, and the battery LED shows the battery (his choice, 18 Nov 2026).
# The LED is only a green and a red one, each on or off, so: red, green, or both (orange).
FORCED_MASK = bytes([LED_BACKLIGHT | LED_BATTERY_GREEN | LED_BATTERY_RED, 0x00, 0x00])   # on battery: orange
LOW_MASK = bytes([LED_BACKLIGHT | LED_BATTERY_RED, 0x00, 0x00])                          # battery low: red
FULL_MASK = bytes([LED_BACKLIGHT | LED_BATTERY_GREEN, 0x00, 0x00])                       # full on the cable: green
# While charging: battery LED not forced, so the keyboard's own charging light is not mixed
# with it (that gave odd colours, 18 Nov 2026). The key backlight stays forced on.
CHARGING_MASK = bytes([LED_BACKLIGHT, 0x00, 0x00])
LIGHT_NAMES = {FORCED_MASK: "orange (on battery)", LOW_MASK: "red (battery low)",
               FULL_MASK: "green (full on the cable)", CHARGING_MASK: "off (charging)"}
LOW_LEVEL = 20                               # battery percent at or below which the light is red
BATTERY_EVERY = 5                            # seconds between battery checks
# Battery status (feature 0x1000): 0 = on battery, 1 = charging, 2 = almost full, 3 = full,
# 4 = charging slowly.
CHARGING = {1, 2, 4}
FULL = 3
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
CHECK_EVERY = 15                             # seconds between re-checks of the keyboard

def log(msg):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 200_000:
            os.replace(LOG, LOG + ".old")
        with open(LOG, "a") as f: f.write(line + "\n")
    except OSError: pass

def load_wanted():
    """True = backlight forced on, False = normal behaviour. Default: forced on."""
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
        self.f_battery, _, _ = self.rx.feature_index(self.idx, 0x1000)   # None: always orange
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

    def light(self):
        """The forced LEDs that fit the battery now: red, orange, green, or none while charging."""
        if not self.f_battery:
            return FORCED_MASK
        answer = self.req(self.f_battery, 0)
        level = answer[0]
        status = answer[2]
        if status in CHARGING:
            return CHARGING_MASK
        if status == FULL:
            return FULL_MASK
        if level <= LOW_LEVEL:
            return LOW_MASK
        return FORCED_MASK

    def force_on(self, mask=FORCED_MASK):
        self.req(self.f_hidden, 1, b'\x01')
        self.req(self.f_led, 2, mask)
        return self.req(self.f_led, 1)[:3] == mask

    def normal(self):
        self.req(self.f_hidden, 1, b'\x01')
        self.req(self.f_led, 2, CLEAR)
        self.req(self.f_hidden, 1, b'\x00')

    def lights_off(self):
        """Every LED forced off (backlight and battery light), for while he is away."""
        self.req(self.f_hidden, 1, b'\x01')
        self.req(self.f_led, 2, CLEAR)
        return self.req(self.f_led, 1)[:3] == CLEAR

    def is_set(self, forced, mask=FORCED_MASK):
        """True if the keyboard already shows what forced and the battery light ask for."""
        if not forced:
            return not self.forced()
        if not self.req(self.f_hidden, 0)[0]:
            return False
        return self.req(self.f_led, 1)[:3] == mask

    def refresh(self, mask=FORCED_MASK):
        """Switch the forced LEDs off and on again: after sleep they are dark but still reported as on."""
        self.normal()
        return self.force_on(mask)

    def apply(self, forced, mask=FORCED_MASK):
        """Forced: backlight on plus the battery light in mask. Not forced: normal behaviour."""
        if forced:
            return self.force_on(mask)
        self.normal()
        return True

    # --- F6 / F7 diversion (reprogrammable controls v4) ---
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
    print(f"backlight forced on: {forced}   remembered choice: {'forced on' if load_wanted() else 'normal'}   "
          f"F6/F7 handled by watcher: {keys}")
    print(f"F1/F2 handled by watcher: {f1f2}   external screens (brightness): {screens.brightness()}")

def cmd_on():
    save_wanted(True)
    kb = Keyboard()
    ok = kb.force_on()
    kb.close()
    print("backlight forced on" if ok else "FAILED to force backlight on")
    return 0 if ok else 1

def cmd_off():
    save_wanted(False)
    kb = Keyboard()
    kb.normal()
    kb.close()
    print("backlight back to normal behaviour")

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
    next_check = 0
    repeat_at = None                              # when a held F1/F2 steps again
    light = None                                  # the battery light now (one of the masks)
    next_battery = 0
    need_refresh = False                          # switch the lights off and on again
    was_paused = False                            # no input for IDLE_PAUSE seconds
    away = False                                  # no input for AWAY_AFTER seconds: keyboard left alone
    last_key = 0                                  # time of the last F1/F2/F6/F7 press (Windows does not count those)
    failures = 0                                  # tries in a row the keyboard did not answer
    while True:
        try:
            if kb is None:
                kb = Keyboard()
                failures = 0
                log(f"connected to {DEVICE_NAME} (receiver slot {kb.idx})")
                missing = [f"{cid:#06x}" for cid in BRIGHTNESS_KEYS if cid not in kb.cids]
                if missing:
                    log(f"F1/F2 keys {missing} not on this keyboard. It has: {[f'{c:#06x}' for c in sorted(kb.cids)]}")
                next_check = 0
                need_refresh = True
            # Back at the computer after a pause: the keyboard may have slept and lost its lights
            idle = min(idle_seconds(), time.time() - last_key)
            if was_paused and idle < 2:
                need_refresh = True
            was_paused = idle >= IDLE_PAUSE
            # Away: lights off and ask the keyboard nothing, so it can sleep
            if idle >= AWAY_AFTER and not away:
                away = True
                if load_wanted():
                    log(f"away: lights off, keyboard left alone so it can sleep (ok={kb.lights_off()})")
                else:
                    log("away: keyboard left alone so it can sleep")
            if idle < AWAY_AFTER and away:
                away = False
                need_refresh = True
                next_battery = 0
                next_check = 0
                log("back at the computer")
            if not away:
                # The battery light: red low, orange on battery, off charging, green full on the cable
                if time.time() >= next_battery:
                    now_light = kb.light()
                    if now_light != light:
                        light = now_light
                        log(f"battery light: {LIGHT_NAMES[light]}")
                        next_check = 0            # apply it right away
                    next_battery = time.time() + BATTERY_EVERY
                if need_refresh:
                    need_refresh = False
                    if load_wanted():
                        log(f"lights switched off and on again (ok={kb.refresh(light)})")
                if time.time() >= next_check:
                    wanted = load_wanted()        # the on/off commands may have changed it
                    if not kb.is_set(wanted, light):
                        ok = kb.apply(wanted, light)
                        shown = f"forced on, battery light {LIGHT_NAMES[light]}" if wanted else "normal"
                        log(f"applied {shown} (ok={ok})")
                    if kb.ensure_diverted(True):
                        log("F6/F7 diverted to the watcher")
                    external = len(screens.brightness()) > 0
                    if kb.ensure_diverted(external, BRIGHTNESS_KEYS):
                        log("F1/F2 diverted to the watcher (external screens)" if external
                            else "F1/F2 back to Windows (no external screen)")
                    next_check = time.time() + CHECK_EVERY
            held_brightness = [cid for cid in BRIGHTNESS_KEYS if cid in held]
            timeout = max(0.0, repeat_at - time.time()) if held_brightness and repeat_at else 0.5
            report = kb.rx.read_report(timeout=timeout)
            if report is None:
                if held_brightness and repeat_at and time.time() >= repeat_at:
                    step_screens(held_brightness[0])
                    repeat_at = time.time() + HOLD_REPEAT
                continue
            # The receiver says the keyboard connected again (HID++ 1.0 notification 0x41)
            if len(report) > 2 and report[1] == kb.idx and report[2] == 0x41:
                log("keyboard reconnected to the receiver")
                time.sleep(1)                     # it needs a moment before it answers
                need_refresh = True
                continue
            keys = kb.pressed_keys(report)
            if keys is None:
                continue
            newly = keys - held
            held = keys
            if newly:
                last_key = time.time()            # a press of F1/F2/F6/F7 also means he is back
            if away and (CID_BACKLIGHT_UP in newly or CID_BACKLIGHT_DOWN in newly):
                continue                          # the next round lights the keyboard again
            for cid in BRIGHTNESS_KEYS:
                if cid in newly:
                    step_screens(cid, "F1 pressed" if cid == CID_BRIGHTNESS_DOWN else "F2 pressed")
                    repeat_at = time.time() + HOLD_DELAY
            if not any(cid in held for cid in BRIGHTNESS_KEYS):
                repeat_at = None
            if CID_BACKLIGHT_UP in newly and wanted:
                # Already forced on, but the lights can be dark all the same (19 Nov 2026): light them again
                log(f"F7 pressed: lights switched off and on again (ok={kb.refresh(light)})")
            elif CID_BACKLIGHT_UP in newly:
                wanted = True
                save_wanted(True)
                log(f"F7 pressed: forced on (ok={kb.apply(True, light)})")
            elif CID_BACKLIGHT_DOWN in newly and wanted:
                wanted = False
                save_wanted(False)
                log(f"F6 pressed: normal (ok={kb.apply(False)})")
        except Exception as e:
            log(f"keyboard unavailable: {e}")
            try:
                if kb: kb.close()
            except Exception: pass
            kb = None
            held = set()
            repeat_at = None
            light = None
            next_battery = 0
            need_refresh = False
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
