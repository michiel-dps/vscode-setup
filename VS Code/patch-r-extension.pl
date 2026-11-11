#!/usr/bin/perl
# Five fixes to the VS Code R extension (reditorsupport.r), applied by editing
# its dist/extension.js (fixes 1-4) and dist/webviews/httpgd/index.js (fix 5).
# Re-run after the R extension updates itself (the
# folder reditorsupport.r-x.y.z gets a new version number). Idempotent: each
# fix is skipped when it is already in place.
#
#   perl "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/VS Code/patch-r-extension.pl"
#
# Then: Reload Window.
#
# 1. Data viewer: new tabs open with columns sized to content instead of
#    stretched to the window (the toolbar buttons still switch per table).
# 2. Completion: the session popup with column names (inside a pipe, e.g.
#    rename(look = lookout, |) ) comes after ", " (comma space), not right
#    after the comma. The popup after "(" "[" "$" "@" is unchanged.
# 3. Knit (Ctrl+Shift+K): a knitted PDF opens in the editor to the right of
#    the .Rmd (Overleaf style); an open PDF tab there reloads by itself.
# 4. Plots: a new plot (print(p), plot(x)) brings the R Plot tab to the front
#    in its own editor window, also when another tab there was in front; the
#    cursor stays in the script. Redrawing an old plot (resize) does not.
# 5. Plots: Ctrl+wheel or a touchpad pinch zooms 7.5% per step around the
#    spot under the mouse, like the PDF viewer (patch-pdf-viewer.pl) and
#    VS Code's PNG preview. Zoomed in: the wheel or a mouse drag moves the
#    plot, a double-click zooms back out. A new plot starts unzoomed.
use strict; use warnings;
my $ext = "$ENV{USERPROFILE}/.vscode/extensions";
opendir(my $dh, $ext) or die "cannot open $ext";
my ($name) = (sort grep { /^reditorsupport.r-[0-9]/ } readdir $dh)[-1];   # newest version
closedir $dh;
die "R extension not found in $ext" unless $name;
my $dir = "$ext/$name/dist";
my $file = "$dir/extension.js";
local $/; open my $in, '<', $file or die "cannot read $file\n"; my $js = <$in>; close $in;
my $changed = 0;

# literal, once-only replacement (no regex: the JS is full of $ " ' characters)
sub replace_once {
    my ($old, $new, $what) = @_;
    my $i = index($js, $old);
    die "$what: code not found; the extension changed, patch by hand\n" if $i < 0;
    die "$what: code found twice; patch by hand\n" if index($js, $old, $i + 1) >= 0;
    substr($js, $i, length $old) = $new;
}

# ---- 1. data viewer: size columns to content by default -------------------
if ($js =~ /patched: size to content by default/) {
    print "viewer fix: already in place\n";
} else {
    my $n = 0;
    $n += $js =~ s/viewerSizingMode = saved\?\.schema === viewerSchema && saved\.sizingMode === 'content' \? 'content' : 'fit';/viewerSizingMode = saved?.schema === viewerSchema && saved.sizingMode === 'fit' ? 'fit' : 'content'; \/\/ patched: size to content by default/;
    $n += $js =~ s/(    function updateViewerSizingButtons\(\) \{)/    \/\/ patched: a fresh view (no saved widths) in content mode is auto-sized once the first rows are drawn\n    function applyInitialViewerSizing(event) {\n        if (viewerSizingMode === 'content' && !viewerInitialState?.columnSizing) {\n            event.api.autoSizeAllColumns({ defaultMaxWidth: 480 });\n        }\n    }\n\n$1/;
    $n += $js =~ s/(            tooltipShowDelay: 300,\n)(            onStateUpdated: saveViewerState\n)/$1            onFirstDataRendered: applyInitialViewerSizing, \/\/ patched\n$2/;
    $n += $js =~ s/(            onFirstDataRendered: function\(\) \{\n)(                updateFetchStatusPosition\(\);\n                attachScrollbarPositionIndicator\(\);\n)/$1                applyInitialViewerSizing(arguments[0]); \/\/ patched\n$2/;
    die "viewer fix: only $n of 4 edits matched; the extension code changed, patch by hand\n" unless $n == 4;
    print "viewer fix: applied\n"; $changed++;
}

# ---- 2. completion: column names after ", " instead of "," ----------------
if ($js =~ /patched: column names after comma-space/) {
    print "completion fix: already in place\n";
} else {
    # the session completion provider's trigger characters: drop "," add " "
    replace_once(
        q~let o=["","[","(",",","$","@",'"',"'"];return t.subscriptions.push(Je.languages.registerCompletionItemProvider(["r","rmd"],new Ly,...o))~,
        q~let o=["","[","(","$","@",'"',"'"," "];return t.subscriptions.push(Je.languages.registerCompletionItemProvider(["r","rmd"],new Ly,...o))~,
        "completion fix, trigger characters");
    # a space counts as the comma trigger only when it follows a comma
    replace_once(
        q~let c=i.triggerCharacter;~,
        q~let c=i.triggerCharacter;if(c===" "){if(!/,\s$/.test(e.lineAt(n.line).text.slice(0,n.character)))return s;c=","}/* patched: column names after comma-space */~,
        "completion fix, provider");
    print "completion fix: applied\n"; $changed++;
}

# ---- 3. knit: a knitted PDF opens in the editor to the right -------------
if ($js =~ /patched: a knitted PDF opens in the editor to the right/) {
    print "knit PDF fix: already in place\n";
} else {
    # after Ctrl+Shift+K: a .pdf result opens beside the .Rmd, the cursor stays
    # in the .Rmd; other results (HTML) keep the old rule (openOutputFile, off)
    replace_once(
        q~if(o){let C=Vn.Uri.file(m);d0.existsSync(C.fsPath)?Vn.commands.executeCommand("vscode.open",C):Vn.window.showWarningMessage(`Could not find the output file at path: "${C.fsPath}"`)}return!0}~,
        q~if(/\.pdf$/i.test(m)){let C=Vn.Uri.file(m);d0.existsSync(C.fsPath)&&Vn.commands.executeCommand("vscode.open",C,{viewColumn:Vn.ViewColumn.Beside,preserveFocus:!0,preview:!1})}else if(o){let C=Vn.Uri.file(m);d0.existsSync(C.fsPath)?Vn.commands.executeCommand("vscode.open",C):Vn.window.showWarningMessage(`Could not find the output file at path: "${C.fsPath}"`)}/* patched: a knitted PDF opens in the editor to the right */return!0}~,
        "knit PDF fix");
    print "knit PDF fix: applied\n"; $changed++;
}

# ---- 4. plots: a new plot brings the R Plot tab to the front ---------------
if ($js =~ /patched: a new plot brings the plot tab to the front/) {
    print "plot to front fix: already in place\n";
} else {
    # httpgd viewer, refreshPlots(): c = plot ids before, a = plot ids now.
    # Only a plot id that was not there before counts (not a resize redraw).
    # reveal(column undefined = where the tab is, preserveFocus true)
    replace_once(
        q~else{for(let u of this.plots)c.includes(u.id)?this.updatePlot(u):this.addPlot(u);this._focusPlot()}}updatePlot(e){~,
        q~else{for(let u of this.plots)c.includes(u.id)?this.updatePlot(u):this.addPlot(u);this._focusPlot()}a.some(u=>!c.includes(u.id))&&this.webviewPanel?.reveal(void 0,!0)/* patched: a new plot brings the plot tab to the front */}updatePlot(e){~,
        "plot to front fix");
    print "plot to front fix: applied\n"; $changed++;
}

if ($changed) {
    rename $file, "$file.orig" unless -e "$file.orig";
    open my $out, '>', $file or die "cannot write $file\n"; print $out $js; close $out;
    print "patched $file (original kept as extension.js.orig). Reload Window.\n";
} else {
    print "nothing to do: $file\n";
}

# ---- 5. plots: Ctrl+wheel / pinch zoom at the mouse -------------------------
# A separate block added at the end of the plot tab's own script. It only
# needs the box #largePlot that holds the plot (an <svg>), so it does not
# depend on the minified code before it.
my $plotFile = "$dir/webviews/httpgd/index.js";
open my $pin, '<', $plotFile or die "cannot read $plotFile\n"; my $pjs = <$pin>; close $pin;
if ($pjs =~ /patched: zoom the plot like a PDF/) {
    print "plot zoom fix: already in place\n";
} else {
    my $zoom = <<'ZOOM';

/* patched: zoom the plot like a PDF (patch-r-extension.pl, fix 5) */
(()=>{
  const box = document.querySelector("#largePlot");
  if (!box) return;
  const css = document.createElement("style");
  css.textContent =
    "#largePlot svg{transform-origin:0 0}" +
    "#largePlot.zoomed{overflow:hidden!important}" +
    "#largePlot.zoomed svg{cursor:grab}" +
    "#largePlot.panning svg{cursor:grabbing}" +
    "#largePlot.zooming svg{will-change:transform}";
  document.head.appendChild(css);
  const STEP = 0.075, MAX = 20;     // 7.5% per wheel step, as in the PDF viewer
  let z = 1, tx = 0, ty = 0, drag = null, sharpTimer;
  const plot = () => box.querySelector("svg");
  // the plot's box without our zoom: where it sits and how big it is
  function base(s) {
    const r = s.getBoundingClientRect();
    return { left: r.left - tx, top: r.top - ty, w: r.width / z, h: r.height / z };
  }
  function setView(s, b, nz, ntx, nty) {
    nz = Math.min(MAX, Math.max(1, nz));
    ntx = Math.min(0, Math.max(b.w - b.w * nz, ntx));   // never past an edge
    nty = Math.min(0, Math.max(b.h - b.h * nz, nty));
    z = nz; tx = ntx; ty = nty;
    if (z === 1) {
      s.style.transform = "";
      box.classList.remove("zoomed");
    } else {
      s.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + z + ")";
      box.classList.add("zoomed");
    }
  }
  // while zooming the plot is only stretched (instant); 250 ms after the
  // last step it is drawn sharp once (matters for big maps)
  function stretchThenSharpen() {
    box.classList.add("zooming");
    clearTimeout(sharpTimer);
    sharpTimer = setTimeout(() => box.classList.remove("zooming"), 250);
  }
  box.addEventListener("wheel", e => {
    const s = plot();
    if (!s) return;
    const b = base(s);
    if (e.ctrlKey) {                 // Ctrl+wheel, or a touchpad pinch
      e.preventDefault();
      if (e.deltaY === 0) return;
      const px = (e.clientX - b.left - tx) / z;   // plot point under the mouse
      const py = (e.clientY - b.top - ty) / z;
      const step = e.deltaY < 0 ? z * (1 + STEP) : z / (1 + STEP);
      const nz = Math.min(MAX, Math.max(1, step));
      stretchThenSharpen();
      setView(s, b, nz, e.clientX - b.left - px * nz, e.clientY - b.top - py * nz);
    } else if (z > 1) {              // zoomed in: the wheel moves the plot
      e.preventDefault();
      const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? b.h : 1;
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      setView(s, b, z, tx - dx * k, ty - dy * k);
    }
  }, { passive: false });
  box.addEventListener("mousedown", e => {
    const s = plot();
    if (z > 1 && e.button === 0 && s && s.contains(e.target)) {
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      box.classList.add("panning");
      e.preventDefault();
    }
  });
  window.addEventListener("mousemove", e => {
    const s = plot();
    if (drag && s) setView(s, base(s), z, drag.tx + e.clientX - drag.x, drag.ty + e.clientY - drag.y);
  });
  window.addEventListener("mouseup", () => {
    drag = null;
    box.classList.remove("panning");
  });
  box.addEventListener("dblclick", e => {
    const s = plot();
    if (s && s.contains(e.target)) setView(s, base(s), 1, 0, 0);
  });
  // a new or redrawn plot replaces the <svg>: start unzoomed
  new MutationObserver(() => {
    z = 1; tx = 0; ty = 0; drag = null;
    box.classList.remove("zoomed", "zooming", "panning");
  }).observe(box, { childList: true });
})();
ZOOM
    rename $plotFile, "$plotFile.orig" unless -e "$plotFile.orig";
    open my $pout, '>', $plotFile or die "cannot write $plotFile\n"; print $pout $pjs . $zoom; close $pout;
    print "plot zoom fix: applied\n";
    print "patched $plotFile (original kept as index.js.orig). Close the R Plot tab, plot again.\n";
}
