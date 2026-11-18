#!/usr/bin/perl
# Eight fixes to the VS Code R extension (reditorsupport.r), applied by editing
# its dist/extension.js (fixes 1-4 and 6-8) and dist/webviews/httpgd/index.js (fix 5).
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
#    after the comma, and also after "= " "== " "< " "> " "& " "| " "%in% "
#    (mutate(x = |), filter(year == |)). The popup after "(" "[" "$" "@" is
#    unchanged.
# 3. Knit (Ctrl+Shift+K): a knitted PDF opens in the editor to the right of
#    the .Rmd (Overleaf style); an open PDF tab there reloads by itself.
# 4. Plots: a new plot (print(p), plot(x)) brings the R Plot tab to the front
#    in its own editor window, also when another tab there was in front; the
#    cursor stays in the script. Redrawing an old plot (resize) does not.
# 5. Plots: Ctrl+wheel or a touchpad pinch zooms 7.5% per step around the
#    spot under the mouse, like the PDF viewer (patch-pdf-viewer.pl) and
#    VS Code's PNG preview. Zoomed in: the wheel or a mouse drag moves the
#    plot, a double-click zooms back out. A new plot starts unzoomed.
# 6. Ctrl+click on a name in R's global environment (a table, a value, a
#    function) opens it in the data viewer, like the eye button in the
#    Workspace panel. Needs the Enter add-on (local.r-pipe-indent 0.5.4 or
#    later), which decides. Other names keep Go to Definition.
# 7. A new data viewer, R Plot or widget tab opens in the editor group that
#    already has one of those tabs, also in a floating window (18 Nov 2026).
# 8. Data viewer and R Plot tabs come back after a restart as a stand-in with
#    a short note, in the same place, so a floating window keeps them.
#    The next data tab of that name or the next plot replaces the stand-in.
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
# Since 18 Nov 2026 also after "= " "== " "< " "> " "& " "| " "%in% ", so
# mutate(x = |) and filter(year == |) show the column names too.
my $space_old = q~if(c===" "){if(!/,\s$/.test(e.lineAt(n.line).text.slice(0,n.character)))return s;c=","}/* patched: column names after comma-space */~;
my $space_new = q~if(c===" "){if(!/(,|=|<|>|&|\||%in%)\s$/.test(e.lineAt(n.line).text.slice(0,n.character)))return s;c=","}/* patched: column names after comma-space and after = */~;
if ($js =~ /patched: column names after comma-space and after =/) {
    print "completion fix: already in place\n";
} elsif ($js =~ /patched: column names after comma-space/) {
    replace_once($space_old, $space_new, "completion fix, after =");   # older patch: widen it
    print "completion fix: widened to = == < > & | %in%\n"; $changed++;
} else {
    # the session completion provider's trigger characters: drop "," add " "
    replace_once(
        q~let o=["","[","(",",","$","@",'"',"'"];return t.subscriptions.push(Je.languages.registerCompletionItemProvider(["r","rmd"],new Ly,...o))~,
        q~let o=["","[","(","$","@",'"',"'"," "];return t.subscriptions.push(Je.languages.registerCompletionItemProvider(["r","rmd"],new Ly,...o))~,
        "completion fix, trigger characters");
    # a space counts as the comma trigger only after a comma or a comparison
    replace_once(q~let c=i.triggerCharacter;~, q~let c=i.triggerCharacter;~ . $space_new, "completion fix, provider");
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

# ---- 6. Ctrl+click on a session object opens the data viewer ----------------
if ($js =~ /patched: Ctrl\+click on a session object opens the data viewer/) {
    print "Ctrl+click fix: already in place\n";
} else {
    # Before the language server answers a definition request (Ctrl+hover,
    # Ctrl+click), ask the Enter add-on (command rPipeIndent.ctrlClick) with the
    # document's R session (s0, as the session hover uses). Its answer
    # undefined = let the language server answer as before.
    replace_once(
        q~middleware:{...Pte,provideSignatureHelp:async(j,V,Z,ce,fe)=>~,
        q~middleware:{...Pte,provideDefinition:async(j,V,Z,ce)=>{let w;try{w=await hr.commands.executeCommand("rPipeIndent.ctrlClick",j,V,typeof s0=="function"?s0(j.uri):void 0)}catch(e){}return w===void 0?ce(j,V,Z):w}/* patched: Ctrl+click on a session object opens the data viewer */,provideSignatureHelp:async(j,V,Z,ce,fe)=>~,
        "Ctrl+click fix");
    print "Ctrl+click fix: applied\n"; $changed++;
}

# ---- 7. an R tab opens in the editor group that already has an R tab -------
# A new data viewer, R Plot or widget viewer tab opens in the editor group
# (in any window, also a floating one) that already shows a data viewer or
# plot tab, a group with the same kind of tab first. With none open, or only
# in the script's own group, the setting (Beside) decides as before.
# Offline test: R tabs in group 3 of a floating window, data or plot, 9 checks
# (18 Nov 2026). An open tab of the same object still comes forward where it is.
if ($js =~ /patched: an R tab opens where an R tab already is/) {
    print "R tab group fix: already in place\n";
} else {
    # title: the new tab's title. A stand-in tab of the same kind (fix 8) with
    # that title (any title for a plot) closes once the new tab is there.
    my $helper = q~function __rPreviewColumn(want,fallback,title){/* patched: an R tab opens where an R tab already is */try{const v=require("vscode"),ed=v.window.activeTextEditor,own=ed?ed.viewColumn:void 0,R=["dataview","RPlot","r.standardPlot","r.htmlViewer"],kind=tab=>{const x=tab.input;if(!(x instanceof v.TabInputWebview)||typeof x.viewType!="string")return"";return R.find(r=>x.viewType===r||x.viewType.endsWith("-"+r))||""};let best;for(const g of v.window.tabGroups.all){if(g.viewColumn===own)continue;for(const tab of g.tabs){const k=kind(tab);if(!k)continue;const same=want.includes(k);if(!best||same&&!best.same)best={col:g.viewColumn,same:same}}}if(typeof __rHolders!="undefined")for(const [p,h] of __rHolders)if(want.includes(h.kind)&&(h.kind!=="dataview"||h.title===title))setTimeout(()=>p.dispose(),300);return best?best.col:fallback}catch(e){return fallback}}~;
    die "R tab group fix: file does not start with \"use strict\", patch by hand\n" unless substr($js, 0, 13) eq '"use strict";';
    substr($js, 13, 0) = $helper;   # at the top, so every part of the file sees it
    # data viewer: a table and a list (the same code twice)
    my $dv_old = q~{preserveFocus:!0,viewColumn:Me.ViewColumn[i]},{enableScripts:!0,enableFindWidget:!0,retainContextWhenHidden:!0,localResourceRoots:[Me.Uri.file(Uu)]}~;
    my $dv_new = q~{preserveFocus:!0,viewColumn:__rPreviewColumn(["dataview"],Me.ViewColumn[i],n)},{enableScripts:!0,enableFindWidget:!0,retainContextWhenHidden:!0,localResourceRoots:[Me.Uri.file(Uu)]}~;
    my $n = 0;
    while ((my $i = index($js, $dv_old)) >= 0) { substr($js, $i, length $dv_old) = $dv_new; $n++ }
    die "R tab group fix: data viewer code found $n times, not 2, patch by hand\n" unless $n == 2;
    # httpgd plot tab (the backend in settings.json)
    replace_once(
        q~createWebviewPanel("RPlot","R Plot",e||this.showOptions,~,
        q~createWebviewPanel("RPlot","R Plot",{...(e||this.showOptions),viewColumn:__rPreviewColumn(["RPlot"],(e||this.showOptions).viewColumn)},~,
        "R tab group fix, httpgd plot");
    # standard plot tab: new tab next to an R tab, an open one stays where it is
    replace_once(
        q~createWebviewPanel("r.standardPlot","R Plot",{viewColumn:e,~,
        q~createWebviewPanel("r.standardPlot","R Plot",{viewColumn:__rPreviewColumn(["r.standardPlot"],e),~,
        "R tab group fix, standard plot");
    replace_once(q~this.panel?(this.panel.reveal(e,!0)~, q~this.panel?(this.panel.reveal(void 0,!0)~, "R tab group fix, standard plot reveal");
    # htmlwidget viewer (leaflet, plotly)
    replace_once(
        q~viewColumn:lt.ViewColumn[String(e)]??lt.ViewColumn.Two}~,
        q~viewColumn:__rPreviewColumn(["r.htmlViewer"],lt.ViewColumn[String(e)]??lt.ViewColumn.Two)}~,
        "R tab group fix, widget viewer");
    print "R tab group fix: applied\n"; $changed++;
}

# ---- 8. data and plot tabs keep their place over a restart ------------------
# The R extension cannot bring a data viewer or R Plot tab back after Reload
# Window or a restart (it has no serializer for them), so VS Code dropped them
# and a floating window with only those tabs came back empty or not at all.
# Now they come back as a stand-in tab with a short note, in the same place.
# Fix 7 then puts the new data tab (same name) or the new plot there and
# closes the stand-in. The R session itself is new: run the script again.
if ($js =~ /patched: R tabs keep their place over a restart/) {
    print "R tab restore fix: already in place\n";
} else {
    my $holders = q~var __rHolders=new Map();/* patched: R tabs keep their place over a restart */(function(){try{const v=require("vscode"),esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]),page=(t,m)=>`<!doctype html><html><body style="font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);padding:24px"><h3>${t}</h3><p>${m}</p></body></html>`,notes={dataview:t=>"Was open before the restart. Run your script, then Ctrl+click "+t+" again: it opens here.",RPlot:()=>"Was open before the restart. Make the plot again: it shows here."};for(const kind of Object.keys(notes))v.window.registerWebviewPanelSerializer(kind,{deserializeWebviewPanel:async p=>{__rHolders.set(p,{kind:kind,title:p.title});p.onDidDispose(()=>__rHolders.delete(p));p.webview.html=page(esc(p.title),notes[kind](esc(p.title)))}})}catch(e){}})();~;
    die "R tab restore fix: file does not start with \"use strict\", patch by hand\n" unless substr($js, 0, 13) eq '"use strict";';
    substr($js, 13, 0) = $holders;
    print "R tab restore fix: applied\n"; $changed++;
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
