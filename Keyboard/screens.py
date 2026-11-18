"""Brightness of external screens over the cable (DDC/CI), through Windows' dxva2.dll.

Windows' own brightness keys only reach a computer's built-in screen. External screens
(here two Dell P2412H) take the command over DDC/CI instead.

Usage:  python screens.py            show every screen and its brightness
        python screens.py -10        all screens 10 darker (or +10 brighter)
"""
import sys
import ctypes
from ctypes import wintypes

user32 = ctypes.WinDLL("user32")
dxva2 = ctypes.WinDLL("dxva2")


class PHYSICAL_MONITOR(ctypes.Structure):
    _fields_ = [("handle", wintypes.HANDLE), ("description", wintypes.WCHAR * 128)]


MONITOR_ENUM_PROC = ctypes.WINFUNCTYPE(
    wintypes.BOOL, wintypes.HMONITOR, wintypes.HDC, ctypes.POINTER(wintypes.RECT), wintypes.LPARAM
)
user32.EnumDisplayMonitors.argtypes = [wintypes.HDC, ctypes.c_void_p, MONITOR_ENUM_PROC, wintypes.LPARAM]
dxva2.GetNumberOfPhysicalMonitorsFromHMONITOR.argtypes = [wintypes.HMONITOR, ctypes.POINTER(wintypes.DWORD)]
dxva2.GetPhysicalMonitorsFromHMONITOR.argtypes = [wintypes.HMONITOR, wintypes.DWORD, ctypes.POINTER(PHYSICAL_MONITOR)]
dxva2.GetMonitorBrightness.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.DWORD)] * 3
dxva2.SetMonitorBrightness.argtypes = [wintypes.HANDLE, wintypes.DWORD]
dxva2.DestroyPhysicalMonitors.argtypes = [wintypes.DWORD, ctypes.POINTER(PHYSICAL_MONITOR)]


def _each_screen(action):
    """Call action(handle, lowest, current, highest) for every screen that answers over DDC/CI."""
    results = []

    def per_monitor(hmonitor, hdc, rect, data):
        count = wintypes.DWORD()
        if not dxva2.GetNumberOfPhysicalMonitorsFromHMONITOR(hmonitor, ctypes.byref(count)) or count.value == 0:
            return True
        screens = (PHYSICAL_MONITOR * count.value)()
        if not dxva2.GetPhysicalMonitorsFromHMONITOR(hmonitor, count.value, screens):
            return True
        for screen in screens:
            low, now, high = wintypes.DWORD(), wintypes.DWORD(), wintypes.DWORD()
            if dxva2.GetMonitorBrightness(screen.handle, ctypes.byref(low), ctypes.byref(now), ctypes.byref(high)):
                results.append(action(screen.handle, low.value, now.value, high.value))
        dxva2.DestroyPhysicalMonitors(count.value, screens)
        return True

    user32.EnumDisplayMonitors(None, None, MONITOR_ENUM_PROC(per_monitor), 0)
    return results


def brightness():
    """Current brightness of every DDC/CI screen, for example [91, 100]. Empty list = none (computer screen only)."""
    return _each_screen(lambda handle, low, now, high: now)


def change_brightness(step):
    """Move every DDC/CI screen step points darker (negative) or brighter (positive). Returns [(old, new), ...]."""
    def change(handle, low, now, high):
        new = max(low, min(high, now + step))
        if new != now:
            dxva2.SetMonitorBrightness(handle, new)
        return (now, new)

    return _each_screen(change)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(change_brightness(int(sys.argv[1])))
    else:
        print(brightness())
