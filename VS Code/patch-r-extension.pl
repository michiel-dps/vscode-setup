#!/usr/bin/perl
# Nine fixes to the VS Code R extension (reditorsupport.r), applied by editing
# its dist/extension.js (fixes 1-4 and 6-9) and dist/webviews/httpgd/index.js (fix 5).
# Re-run after the R extension updates itself (the
# folder reditorsupport.r-x.y.z gets a new version number). Idempotent: each
# fix is skipped when it is already in place.
#
#   perl "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/VS Code/patch-r-extension.pl"
#
# Then: Ctrl+Shift+P, Developer: Restart Extension Host.
#
# Since 19 Nov 2026 (R extension 3.4.0, which renamed every short name):
# - A fix that cannot find its code prints a line "SKIPPED" with the reason and
#   the script goes on, so one changed spot does not block the other fixes.
#   The file is still written once at the end. The script ends with exit code 1
#   when a fix was skipped.
# - The places are found by pattern, not by exact text. The short names the
#   extension is built with (Je, Ly, Vn, s0 ...) change with every version, so
#   a pattern takes any name there ($ID) and the new code is built with the
#   names it found.
#
# 1. Data viewer: new tabs open with columns sized to content instead of
#    stretched to the window (the toolbar buttons still switch per table).
# 2. Completion: the session popup with column names (inside a pipe, e.g.
#    rename(look = lookout, |) ) comes after ", " (comma space), not right
#    after the comma, and also after "= " "== " "< " "> " "& " "| " "%in% "
#    (mutate(x = |), filter(year == |)). The popup after "(" "[" "$" "@" is
#    unchanged.
# 3. Knit (Ctrl+Shift+K): a knitted PDF opens in the editor to the right of
#    the .Rmd (Overleaf style). An open PDF tab there reloads by itself.
# 4. Plots: a new plot (print(p), plot(x)) brings the R Plot tab to the front
#    in its own editor window, also when another tab there was in front. The
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
# 9. Ctrl+click on a picture path (20 Nov 2026): the R language server's own
#    link on a string that names a picture is dropped, because it opened the
#    picture over the script. The Enter add-on (0.5.9 or later) has its own
#    link there, which opens it beside the script like a data tab.
use strict; use warnings;
my $ext = "$ENV{USERPROFILE}/.vscode/extensions";
opendir(my $dh, $ext) or die "cannot open $ext";
# newest version, compared number by number (3.10.0 comes after 3.4.0)
my ($name) = map { $_->[0] }
    sort { $b->[1] <=> $a->[1] || $b->[2] <=> $a->[2] || $b->[3] <=> $a->[3] }
    map { /^reditorsupport\.r-(\d+)\.(\d+)\.(\d+)/ ? [$_, $1, $2, $3] : () } readdir $dh;
closedir $dh;
die "R extension not found in $ext" unless $name;
print "R extension: $name\n";
my $dir = "$ext/$name/dist";
my $file = "$dir/extension.js";
local $/; open my $in, '<', $file or die "cannot read $file\n"; my $js = <$in>; close $in;
my $changed = 0;
my @skipped;
my $ID = qr/[\w\$]+/;   # a short name of the built extension (Je, s0, $t ...)

# literal, once-only replacement (no regex: the JS is full of $ " ' characters)
sub replace_once {
    my ($old, $new, $what) = @_;
    my $i = index($js, $old);
    die "$what: code not found\n" if $i < 0;
    die "$what: code found twice\n" if index($js, $old, $i + 1) >= 0;
    substr($js, $i, length $old) = $new;
}

# once-only replacement by pattern. $build gets what the pattern caught
# (the short names) and returns the new code.
sub replace_re {
    my ($re, $build, $what) = @_;
    my $n = 0;
    $n++ while $js =~ /$re/g;
    die "$what: code not found\n" if $n == 0;
    die "$what: code found $n times, not once\n" if $n > 1;
    $js =~ s/$re/$build->($1, $2, $3, $4)/e;
}

# a piece of new code with the found names put in: @@U@@ becomes $names{U}
sub fill {
    my ($text, %names) = @_;
    $text =~ s/\@\@(\w+)\@\@/defined $names{$1} ? $names{$1} : die "fill: no name for $1\n"/ge;
    return $text;
}

# One fix. Already there (its marker is in the file): say so. If its code
# cannot be found: put the text back as it was, say SKIPPED, go on.
sub try_fix {
    my ($what, $marker, $code) = @_;
    if (index($js, $marker) >= 0) { print "$what: already in place\n"; return; }
    my $before = $js;
    if (eval { $code->(); 1 }) { print "$what: applied\n"; $changed++; return; }
    my $why = $@;
    $why =~ s/\s+$//;
    $js = $before;
    print "$what: SKIPPED. $why. The extension changed here, patch this one by hand\n";
    push @skipped, $what;
}

# ---- 1. data viewer: size columns to content by default -------------------
try_fix("viewer fix", "patched: size to content by default", sub {
    my $n = 0;
    $n += $js =~ s/viewerSizingMode = saved\?\.schema === viewerSchema && saved\.sizingMode === 'content' \? 'content' : 'fit';/viewerSizingMode = saved?.schema === viewerSchema && saved.sizingMode === 'fit' ? 'fit' : 'content'; \/\/ patched: size to content by default/;
    $n += $js =~ s/(    function updateViewerSizingButtons\(\) \{)/    \/\/ patched: a fresh view (no saved widths) in content mode is auto-sized once the first rows are drawn\n    function applyInitialViewerSizing(event) {\n        if (viewerSizingMode === 'content' && !viewerInitialState?.columnSizing) {\n            event.api.autoSizeAllColumns({ defaultMaxWidth: 480 });\n        }\n    }\n\n$1/;
    $n += $js =~ s/(            tooltipShowDelay: 300,\n)(            onStateUpdated: saveViewerState\n)/$1            onFirstDataRendered: applyInitialViewerSizing, \/\/ patched\n$2/;
    $n += $js =~ s/(            onFirstDataRendered: function\(\) \{\n)(                updateFetchStatusPosition\(\);\n                attachScrollbarPositionIndicator\(\);\n)/$1                applyInitialViewerSizing(arguments[0]); \/\/ patched\n$2/;
    die "only $n of 4 edits matched\n" unless $n == 4;
});

# ---- 2. completion: column names after ", " instead of "," ----------------
# Since 18 Nov 2026 also after "= " "== " "< " "> " "& " "| " "%in% ", so
# mutate(x = |) and filter(year == |) show the column names too.
# @@C@@ is the provider's name for the trigger character (c in 3.2.2, u in 3.4.0)
my $space_code = q~if(@@C@@===" "){if(!/(,|=|<|>|&|\||%in%)\s$/.test(e.lineAt(n.line).text.slice(0,n.character)))return s;@@C@@=","}/* patched: column names after comma-space and after = */~;
try_fix("completion fix", "patched: column names after comma-space and after =", sub {
    if (index($js, "patched: column names after comma-space") >= 0) {
        # the patch from before 18 Nov 2026 is there: widen it
        replace_once(
            q~if(c===" "){if(!/,\s$/.test(e.lineAt(n.line).text.slice(0,n.character)))return s;c=","}/* patched: column names after comma-space */~,
            fill($space_code, C => 'c'),
            "after =");
        return;
    }
    # the session completion provider's trigger characters: drop "," add " "
    replace_re(
        qr~\["","\[","\(",",","\$","\@",'"',"'"\](?=;return t\.subscriptions\.push\($ID\.languages\.registerCompletionItemProvider\(\["r","rmd"\],new $ID,\.\.\.$ID\)\))~,
        sub { q~["","[","(","$","@",'"',"'"," "]~ },
        "trigger characters");
    # the new code uses the provider's own names: e the file, n the place, s the list it gives back
    die "provider: provideCompletionItems(e,n,r,i) with the list s not found\n"
        unless $js =~ /async provideCompletionItems\(e,n,r,i\)\{let s=\[\],/;
    # a space counts as the comma trigger only after a comma or a comparison
    replace_re(
        qr~let ($ID)=i\.triggerCharacter;(?=if\(\1===void 0\)\{let $ID=$ID\.workspaceData\.globalenv)~,
        sub { "let $_[0]=i.triggerCharacter;" . fill($space_code, C => $_[0]) },
        "provider");
});

# ---- 3. knit: a knitted PDF opens in the editor to the right -------------
try_fix("knit PDF fix", "patched: a knitted PDF opens in the editor to the right", sub {
    # after Ctrl+Shift+K: a .pdf result opens beside the .Rmd, the cursor stays
    # in the .Rmd. Other results (HTML) keep the old rule (openOutputFile, off).
    # U the file address, V vscode, P the path R printed, F node's fs
    my $old_rule = q~if(o){let @@U@@=@@V@@.Uri.file(@@P@@);@@F@@.existsSync(@@U@@.fsPath)?@@V@@.commands.executeCommand("vscode.open",@@U@@):@@V@@.window.showWarningMessage(`Could not find the output file at path: "${@@U@@.fsPath}"`)}~;
    my $pdf_rule = q~if(/\.pdf$/i.test(@@P@@)){let @@U@@=@@V@@.Uri.file(@@P@@);@@F@@.existsSync(@@U@@.fsPath)&&@@V@@.commands.executeCommand("vscode.open",@@U@@,{viewColumn:@@V@@.ViewColumn.Beside,preserveFocus:!0,preview:!1})}else ~;
    replace_re(
        qr~if\(o\)\{let ($ID)=($ID)\.Uri\.file\(($ID)\);($ID)\.existsSync\(\1\.fsPath\)\?\2\.commands\.executeCommand\("vscode\.open",\1\):\2\.window\.showWarningMessage\(`Could not find the output file at path: "\$\{\1\.fsPath\}"`\)\}(?=return!0\})~,
        sub { fill($pdf_rule . $old_rule . q~/* patched: a knitted PDF opens in the editor to the right */~, U => $_[0], V => $_[1], P => $_[2], F => $_[3]) },
        "the line that opens the output file");
});

# ---- 4. plots: a new plot brings the R Plot tab to the front ---------------
try_fix("plot to front fix", "patched: a new plot brings the plot tab to the front", sub {
    # httpgd viewer, refreshPlots(): B = the plot ids from before (a list with
    # .includes in 3.2.2, a Set with .has in 3.4.0), this.plots = the plots now.
    # Only a plot id that was not there before counts (not a resize redraw).
    # reveal(column undefined = where the tab is, preserveFocus true)
    replace_re(
        qr~else\{for\(let ($ID) of this\.plots\)($ID)\.(has|includes)\(\1\.id\)\?this\.updatePlot\(\1\):this\.addPlot\(\1\);this\._focusPlot\(\)\}(?=\}updatePlot\(e\)\{)~,
        sub {
            fill(q~else{for(let @@P@@ of this.plots)@@B@@.@@T@@(@@P@@.id)?this.updatePlot(@@P@@):this.addPlot(@@P@@);this._focusPlot()}this.plots.some(u=>!@@B@@.@@T@@(u.id))&&this.webviewPanel?.reveal(void 0,!0)/* patched: a new plot brings the plot tab to the front */~,
                P => $_[0], B => $_[1], T => $_[2]);
        },
        "the end of refreshPlots");
});

# ---- 6. Ctrl+click on a session object opens the data viewer ----------------
try_fix("Ctrl+click fix", "patched: Ctrl+click on a session object opens the data viewer", sub {
    # Before the language server answers a definition request (Ctrl+hover,
    # Ctrl+click), ask the Enter add-on (command rPipeIndent.ctrlClick) with the
    # document's R session. Its answer undefined = let the language server
    # answer as before.
    # The function that gives a document's R session (s0 in 3.2.2, Ea in 3.4.0):
    # the one the session completion provider calls first.
    my ($session) = $js =~ /async provideCompletionItems\(e,n,r,i\)\{let s=\[\],(?:$ID=e\.version,)?$ID=($ID)\(e\.uri\);if\(r\.isCancellationRequested\|\|!$ID\?\.workspaceData\?\.globalenv\)/;
    die "the function that gives a document's R session not found\n" unless $session;
    # Since 3.4.0 the list of R objects is loaded when asked for, not kept up to
    # date all the time. The session hover waits for it with this function
    # (Lte in 3.4.0). When the name is not in the list yet, wait for the list
    # (0.4 s at most, R may be busy) and ask once more. Not there in 3.2.2.
    my ($load) = $js =~ /if\(!await ($ID)\(s,r\)\|\|e\.version!==i\|\|\Q$session\E\(e\.uri\)!==s\)return null/;
    my $wait = $load
        ? fill(q~if(w===void 0&&S&&typeof @@L@@=="function"){await Promise.race([Promise.resolve().then(()=>@@L@@(S,T)).catch(()=>{}),new Promise(r=>setTimeout(r,400))]);w=await ask()}~, L => $load)
        : "";
    my $definition = fill(
        q~provideDefinition:async(D,P,T,N)=>{let w;try{const v=require("vscode"),S=typeof @@S@@=="function"?@@S@@(D.uri):void 0,ask=()=>v.commands.executeCommand("rPipeIndent.ctrlClick",D,P,S);w=await ask();@@WAIT@@}catch(e){}return w===void 0?N(D,P,T):w}/* patched: Ctrl+click on a session object opens the data viewer */,~,
        S => $session, WAIT => $wait);
    replace_re(
        qr~middleware:\{\.\.\.($ID),(?=provideSignatureHelp:async\()~,
        sub { "middleware:{...$_[0]," . $definition },
        "the language client middleware");
});

# ---- 7. an R tab opens in the editor group that already has an R tab -------
# A new data viewer, R Plot or widget viewer tab opens in the editor group
# (in any window, also a floating one) that already shows a data viewer or
# plot tab, a group with the same kind of tab first. With none open, or only
# in the script's own group, the setting (Beside) decides as before.
# Offline test: R tabs in group 3 of a floating window, data or plot, 9 checks
# (18 Nov 2026). An open tab of the same object still comes forward where it is.
try_fix("R tab group fix", "patched: an R tab opens where an R tab already is", sub {
    # title: the new tab's title. A stand-in tab of the same kind (fix 8) with
    # that title (any title for a plot) closes once the new tab is there.
    my $helper = q~function __rPreviewColumn(want,fallback,title){/* patched: an R tab opens where an R tab already is */try{const v=require("vscode"),ed=v.window.activeTextEditor,own=ed?ed.viewColumn:void 0,R=["dataview","RPlot","r.standardPlot","r.htmlViewer"],kind=tab=>{const x=tab.input;if(!(x instanceof v.TabInputWebview)||typeof x.viewType!="string")return"";return R.find(r=>x.viewType===r||x.viewType.endsWith("-"+r))||""};let best;for(const g of v.window.tabGroups.all){if(g.viewColumn===own)continue;for(const tab of g.tabs){const k=kind(tab);if(!k)continue;const same=want.includes(k);if(!best||same&&!best.same)best={col:g.viewColumn,same:same}}}if(typeof __rHolders!="undefined")for(const [p,h] of __rHolders)if(want.includes(h.kind)&&(h.kind!=="dataview"||h.title===title))setTimeout(()=>p.dispose(),300);return best?best.col:fallback}catch(e){return fallback}}~;
    die "file does not start with \"use strict\"\n" unless substr($js, 0, 13) eq '"use strict";';
    substr($js, 13, 0) = $helper;   # at the top, so every part of the file sees it
    # data viewer: a table and a list (the same code twice). n is the tab's title.
    my $dv = qr~createWebviewPanel\("dataview",n,\{preserveFocus:!0,viewColumn:($ID)\.ViewColumn\[i\]\},(?=\{enableScripts:!0,enableFindWidget:!0,retainContextWhenHidden:!0,localResourceRoots:\[$ID\.Uri\.file\($ID\)\]\})~;
    my $n = 0;
    $n++ while $js =~ /$dv/g;
    die "data viewer code found $n times, not 2\n" unless $n == 2;
    $js =~ s/$dv/fill(q~createWebviewPanel("dataview",n,{preserveFocus:!0,viewColumn:__rPreviewColumn(["dataview"],@@V@@.ViewColumn[i],n)},~, V => $1)/ge;
    # httpgd plot tab (the backend in settings.json)
    replace_once(
        q~createWebviewPanel("RPlot","R Plot",e||this.showOptions,~,
        q~createWebviewPanel("RPlot","R Plot",{...(e||this.showOptions),viewColumn:__rPreviewColumn(["RPlot"],(e||this.showOptions).viewColumn)},~,
        "httpgd plot");
    # standard plot tab: new tab next to an R tab, an open one stays where it is
    replace_once(
        q~createWebviewPanel("r.standardPlot","R Plot",{viewColumn:e,~,
        q~createWebviewPanel("r.standardPlot","R Plot",{viewColumn:__rPreviewColumn(["r.standardPlot"],e),~,
        "standard plot");
    replace_once(q~this.panel?(this.panel.reveal(e,!0)~, q~this.panel?(this.panel.reveal(void 0,!0)~, "standard plot reveal");
    # htmlwidget viewer (leaflet, plotly)
    replace_re(
        qr~viewColumn:($ID)\.ViewColumn\[String\(e\)\]\?\?\1\.ViewColumn\.Two\}~,
        sub { fill(q~viewColumn:__rPreviewColumn(["r.htmlViewer"],@@V@@.ViewColumn[String(e)]??@@V@@.ViewColumn.Two)}~, V => $_[0]) },
        "widget viewer");
});

# ---- 8. data and plot tabs keep their place over a restart ------------------
# The R extension cannot bring a data viewer or R Plot tab back after Reload
# Window or a restart (it has no serializer for them), so VS Code dropped them
# and a floating window with only those tabs came back empty or not at all.
# Now they come back as a stand-in tab with a short note, in the same place.
# Fix 7 then puts the new data tab (same name) or the new plot there and
# closes the stand-in. The R session itself is new: run the script again.
try_fix("R tab restore fix", "patched: R tabs keep their place over a restart", sub {
    # should the extension ever bring these tabs back by itself, ours would clash with it
    for my $kind ("dataview", "RPlot") {
        die "the extension now restores $kind tabs itself, this fix may no longer be needed\n"
            if index($js, qq~registerWebviewPanelSerializer("$kind"~) >= 0;
    }
    my $holders = q~var __rHolders=new Map();/* patched: R tabs keep their place over a restart */(function(){try{const v=require("vscode"),esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]),page=(t,m)=>`<!doctype html><html><body style="font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);padding:24px"><h3>${t}</h3><p>${m}</p></body></html>`,notes={dataview:t=>"Was open before the restart. Run your script, then Ctrl+click "+t+" again: it opens here.",RPlot:()=>"Was open before the restart. Make the plot again: it shows here."};for(const kind of Object.keys(notes))v.window.registerWebviewPanelSerializer(kind,{deserializeWebviewPanel:async p=>{__rHolders.set(p,{kind:kind,title:p.title});p.onDidDispose(()=>__rHolders.delete(p));p.webview.html=page(esc(p.title),notes[kind](esc(p.title)))}})}catch(e){}})();~;
    die "file does not start with \"use strict\"\n" unless substr($js, 0, 13) eq '"use strict";';
    substr($js, 13, 0) = $holders;
});

# ---- 9. picture links come from the Enter add-on ----------------------------
# The language server links every string that names a file that is there, and
# VS Code opens such a link over the script. The Enter add-on links picture
# paths itself (in strings and comments) and opens them beside the script, by
# the rules of fix 7. Two links on one string would open the picture twice,
# so the middleware drops the language server's link when its text is a
# picture. Its links on other files (a .csv) stay.
try_fix("picture link fix", "patched: picture links come from the Enter add-on", sub {
    replace_once(
        q~,provideSignatureHelp:async(~,
        q~,provideDocumentLinks:async(D,T,N)=>{const L=await N(D,T);try{const p=/\.(png|jpe?g|jpe|gif|bmp|webp|avif|svg|ico|pdf)$/i;return Array.isArray(L)?L.filter(l=>!p.test(D.getText(l.range))):L}catch(e){return L}}/* patched: picture links come from the Enter add-on */,provideSignatureHelp:async(~,
        "the language client middleware (signature help)");
});

if ($changed) {
    rename $file, "$file.orig" unless -e "$file.orig";
    open my $out, '>', $file or die "cannot write $file\n"; print $out $js; close $out;
    print "patched $file (original kept as extension.js.orig). Ctrl+Shift+P, Developer: Restart Extension Host.\n";
} else {
    print "nothing to do: $file\n";
}

# ---- 5. plots: Ctrl+wheel / pinch zoom at the mouse -------------------------
# A separate block added at the end of the plot tab's own script. It only
# needs the box #largePlot that holds the plot (an <svg>), so it does not
# depend on the minified code before it.
my $plotFile = "$dir/webviews/httpgd/index.js";
my $plotPage = "$dir/webviews/httpgd/index.ejs";
my ($pjs, $page);
if (open my $pin, '<', $plotFile) { $pjs = <$pin>; close $pin; }
if (open my $pagein, '<', $plotPage) { $page = <$pagein>; close $pagein; }
if (!defined $pjs) {
    print "plot zoom fix: SKIPPED. Cannot read $plotFile. The extension changed here, patch this one by hand\n";
    push @skipped, "plot zoom fix";
} elsif ($pjs =~ /patched: zoom the plot like a PDF/) {
    print "plot zoom fix: already in place\n";
} elsif (!defined $page || index($page, 'id="largePlot"') < 0) {
    print "plot zoom fix: SKIPPED. The plot page has no box largePlot any more. The extension changed here, patch this one by hand\n";
    push @skipped, "plot zoom fix";
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
  // while zooming the plot is only stretched (instant), and 250 ms after the
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

if (@skipped) {
    print "\n" . scalar(@skipped) . " fix(es) SKIPPED: " . join(", ", @skipped) . ". The others are in.\n";
    exit 1;
}
