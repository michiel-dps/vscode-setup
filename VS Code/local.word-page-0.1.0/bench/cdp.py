# Small Chrome DevTools client (standard library only) for the isolated test VS Code.
#   python -I cdp.py targets
#   python -I cdp.py shot out.png              screenshot of the VS Code window
#   python -I cdp.py webview file.js           run JS in the Quarto editor webview; the file holds
#                                              a function body with (doc, win) = inner document, window
#   python -I cdp.py claude file.js            the same, in the Claude chat panel (launch.ps1 -Claude)
#   python -I cdp.py page file.js              run JS in the workbench page
#   python -I cdp.py key <key> [mods]          press a key in the window (mods: ctrl,shift,alt);
#                                              Numpad5 = the 5 of the number pad
#   python -I cdp.py click x y                 mouse click at window coordinates
#   python -I cdp.py type "text"               type text
import base64, json, os, socket, struct, sys, time, urllib.request

PORT = int(os.environ.get("CDP_PORT", "9333"))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


class WS:
    def __init__(self, url):
        rest = url[len("ws://"):]
        hostport, path = rest.split("/", 1)
        host, port = hostport.split(":")
        self.s = socket.create_connection((host, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, hostport, key))
        self.s.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.next_id = 0
        self.events = []

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(1 << 20)
            if not chunk:
                raise ConnectionError("socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send_text(self, text):
        data = text.encode()
        n = len(data)
        hdr = bytearray([0x81])
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr.append(0x80 | 126)
            hdr += struct.pack(">H", n)
        else:
            hdr.append(0x80 | 127)
            hdr += struct.pack(">Q", n)
        mask = os.urandom(4)
        hdr += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.s.sendall(bytes(hdr) + masked)

    def recv_text(self):
        parts = []
        while True:
            b0, b1 = self._read(2)
            fin, op = b0 & 0x80, b0 & 0x0F
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            if op == 9:      # ping -> pong
                self.s.sendall(bytes([0x8A, 0x80]) + os.urandom(4))
                continue
            if op == 8:
                raise ConnectionError("closed by peer")
            parts.append(payload)
            if fin:
                return b"".join(parts).decode("utf-8", "replace")

    def call(self, method, params=None, session=None):
        self.next_id += 1
        msg = {"id": self.next_id, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        self.send_text(json.dumps(msg))
        while True:
            reply = json.loads(self.recv_text())
            if reply.get("id") == self.next_id:
                if "error" in reply:
                    raise RuntimeError("%s: %s" % (method, reply["error"]))
                return reply.get("result", {})
            self.events.append(reply)


def targets():
    with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % PORT, timeout=10) as r:
        return json.loads(r.read())


def workbench():
    for t in targets():
        if t["type"] == "page" and "workbench" in t["url"]:
            return t
    raise SystemExit("no workbench page found")


def evaluate(ws, expression, session=None):
    res = ws.call("Runtime.evaluate", {"expression": expression, "returnByValue": True,
                                       "awaitPromise": True}, session)
    if "exceptionDetails" in res:
        return "EXCEPTION: " + json.dumps(res["exceptionDetails"])[:2000]
    return res["result"].get("value")


def webview_sessions(ws):
    """Attach to every target; return sessions of the webview frames that hold an #active-frame."""
    found = []
    for t in ws.call("Target.getTargets")["targetInfos"]:
        if not t["url"].startswith("vscode-webview://"):
            continue
        sid = ws.call("Target.attachToTarget", {"targetId": t["targetId"], "flatten": True})["sessionId"]
        found.append((t, sid))
    return found


def main():
    cmd = sys.argv[1]
    if cmd == "targets":
        for t in targets():
            print(t["type"], "|", t["title"][:60], "|", t["url"][:110])
        return
    if cmd == "alltargets":
        with urllib.request.urlopen("http://127.0.0.1:%d/json/version" % PORT, timeout=10) as r:
            bws = WS(json.loads(r.read())["webSocketDebuggerUrl"])
        for t in bws.call("Target.getTargets")["targetInfos"]:
            print(t["type"], "|", t.get("title", "")[:50], "|", t["url"][:120])
        return
    wb = workbench()
    ws = WS(wb["webSocketDebuggerUrl"])
    if cmd == "shot":
        res = ws.call("Page.captureScreenshot", {"format": "png"})
        with open(sys.argv[2], "wb") as f:
            f.write(base64.b64decode(res["data"]))
        print("saved", sys.argv[2])
    elif cmd == "page":
        body = open(sys.argv[2], encoding="utf-8").read()
        print(evaluate(ws, "(async function(){%s})()" % body))
    elif cmd in ("webview", "claude"):
        body = open(sys.argv[2], encoding="utf-8").read()
        # both webviews have a #root; only the Claude chat panel sets CLAUDE_PANEL_STARTED
        wanted = "win.CLAUDE_PANEL_STARTED" if cmd == "claude" else "!win.CLAUDE_PANEL_STARTED"
        # browser-level connection so that the out-of-process webview frames can be reached
        with urllib.request.urlopen("http://127.0.0.1:%d/json/version" % PORT, timeout=10) as r:
            browser = json.loads(r.read())["webSocketDebuggerUrl"]
        bws = WS(browser)
        expr = ("(async function(){ const f = document.querySelector('iframe#active-frame');"
                " if (!f) return '__NO_ACTIVE_FRAME__'; const doc = f.contentDocument, win = f.contentWindow;"
                " if (!doc.getElementById('root') || !(%s)) return '__NOT_QUARTO__'; %s })()" % (wanted, body))
        hit = False
        for t, sid in webview_sessions(bws):
            val = evaluate(bws, expr, sid)
            if val in ("__NO_ACTIVE_FRAME__", "__NOT_QUARTO__"):
                continue
            hit = True
            print(val if isinstance(val, str) else json.dumps(val, indent=1))
        if not hit:
            print("NO CLAUDE CHAT PANEL FOUND" if cmd == "claude" else "NO QUARTO WEBVIEW FOUND")
    elif cmd == "key":
        key = sys.argv[2]
        mods = sys.argv[3].split(",") if len(sys.argv) > 3 else []
        m = (1 if "alt" in mods else 0) | (2 if "ctrl" in mods else 0) | (8 if "shift" in mods else 0)
        codes = {"F4": 115, "Enter": 13, "Escape": 27, "Tab": 9, "F1": 112, "F8": 119, "Backspace": 8,
                 "ArrowDown": 40, "ArrowUp": 38, "End": 35, "Home": 36, "Numpad5": 101}
        vk = codes.get(key, ord(key.upper()) if len(key) == 1 else 0)
        code = key if len(key) > 1 else "Key" + key.upper()
        # with Shift a real keyboard reports the capital letter ("K", not "k"); the page editor
        # looks at that: with "k" it took Ctrl+Shift+K for Ctrl+K and opened the Link dialog
        key_value = key.upper() if (len(key) == 1 and "shift" in mods) else key
        base = {"key": key_value, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk, "modifiers": m}
        if key.startswith("Numpad"):      # a key of the number pad, NumLock on
            base.update(key=key[6:], location=3, isKeypad=True)
        ws.call("Input.dispatchKeyEvent", dict(base, type="rawKeyDown"))
        ws.call("Input.dispatchKeyEvent", dict(base, type="keyUp"))
        print("pressed", key, mods)
    elif cmd == "click":
        x, y = float(sys.argv[2]), float(sys.argv[3])
        for typ in ("mousePressed", "mouseReleased"):
            ws.call("Input.dispatchMouseEvent", {"type": typ, "x": x, "y": y, "button": "left", "clickCount": 1})
        print("clicked", x, y)
    elif cmd == "type":
        ws.call("Input.insertText", {"text": sys.argv[2]})
        print("typed")
    elif cmd == "typekeys":
        # one real key press per character, so "typing rules" and completion popups react
        for ch in sys.argv[2]:
            ws.call("Input.dispatchKeyEvent", {"type": "keyDown", "text": ch, "unmodifiedText": ch, "key": ch})
            ws.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": ch})
            time.sleep(0.03)
        print("typed with keys")


main()
