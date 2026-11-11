# Build inject/light-theme.json for the Word Page add-on from the captured theme variables.
#   python -I gen.py <vars_light.json> <vars_dark.json> <add-on folder>
import json, re, sys

light = json.load(open(sys.argv[1], encoding="utf-8-sig"))["vars"]
dark = json.load(open(sys.argv[2], encoding="utf-8-sig"))["vars"]
out_dir = sys.argv[3]

is_colour = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\(.*\)|transparent)$")
colours = {k: v for k, v in sorted(light.items()) if is_colour.match(v)}
drop = sorted(k for k, v in dark.items() if k not in light and is_colour.match(v))

# text on the page a little blacker than the theme's grey
colours["--vscode-editor-foreground"] = "#1f1f1f"

json.dump({"colours": colours, "drop": drop}, open(out_dir + "/inject/light-theme.json", "w", encoding="utf-8"),
          indent=0, sort_keys=True)
print("colours:", len(colours), "drop:", len(drop))
