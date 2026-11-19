# usage: perf.sh <folder with wallpaper.js> <port>
base="file:///$(cygpath -m "$1")/"
page="file:///$(cygpath -m "$(pwd)")/perf.html?base=$base&s=shadow&w=3840&h=1080"
prof="$TEMP/claude/edge-perf-$2"
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --remote-debugging-port=$2 --user-data-dir="$(cygpath -w "$prof")" --window-size=3900,1200 --force-device-scale-factor=1 "$page" >/dev/null 2>&1 &
pid=$!
for i in $(seq 1 60); do
  sleep 2
  title=$(curl -s "http://127.0.0.1:$2/json" | grep -o '"title": "PERF[^"]*"' | head -1)
  if [ -n "$title" ]; then echo "$title"; break; fi
done
[ -z "$title" ] && curl -s "http://127.0.0.1:$2/json" | grep '"title"'
kill $pid 2>/dev/null
taskkill //F //PID $pid >/dev/null 2>&1
