#!/usr/bin/perl
# Three fixes to the VS Code R extension (reditorsupport.r), applied by editing
# its dist/extension.js. Re-run after the R extension updates itself (the
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

if ($changed) {
    rename $file, "$file.orig" unless -e "$file.orig";
    open my $out, '>', $file or die "cannot write $file\n"; print $out $js; close $out;
    print "patched $file (original kept as extension.js.orig). Reload Window.\n";
} else {
    print "nothing to do: $file\n";
}
