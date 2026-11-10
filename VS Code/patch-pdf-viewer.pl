#!/usr/bin/perl
# One fix to the VS Code PDF viewer add-on (tomoki1207.pdf), applied by
# editing its lib/web/viewer.js. Re-run after the add-on updates itself (the
# folder tomoki1207.pdf-x.y.z gets a new version number). Idempotent: skipped
# when the fix is already in place.
#
#   perl "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/VS Code/patch-pdf-viewer.pl"
#
# Then: close the PDF tab and open it again (or Reload Window).
#
# Zoom at the mouse: Ctrl+wheel and touchpad pinch zoom in on the spot under
# the mouse, as in an image viewer. The original viewer (pdf.js 2.10) first
# jumped back to the scroll position it last remembered, which is updated a
# moment late, so the zoom drifted away from the mouse (test 10 Nov 2026:
# up to 3475 px; with the fix 0 px in all 5 cases). The fix remembers the
# page under the mouse and the spot on it, zooms, then scrolls so that spot
# is under the mouse again. It also drops the 1-second pause in which
# Ctrl+wheel did nothing right after normal scrolling.
use strict; use warnings;
my $ext = "$ENV{USERPROFILE}/.vscode/extensions";
opendir(my $dh, $ext) or die "cannot open $ext";
my ($name) = (sort grep { /^tomoki1207\.pdf-[0-9]/ } readdir $dh)[-1];   # newest version
closedir $dh;
die "PDF viewer add-on (tomoki1207.pdf) not found in $ext" unless $name;
my $file = "$ext/$name/lib/web/viewer.js";
local $/; open my $in, '<:raw', $file or die "cannot read $file\n"; my $js = <$in>; close $in;
my $nl = ($js =~ /\r\n/) ? "\r\n" : "\n";   # keep the file's own line endings

if ($js =~ /patched: zoom at the mouse/) {
    print "pdf zoom fix: already in place\n";
    exit 0;
}

# literal, once-only replacement (no regex: the JS is full of $ " ' characters)
sub replace_once {
    my ($old, $new, $what) = @_;
    $old =~ s/\n/$nl/g; $new =~ s/\n/$nl/g;
    my $i = index($js, $old);
    die "$what: code not found; the add-on changed, patch by hand\n" if $i < 0;
    die "$what: code found twice; patch by hand\n" if index($js, $old, $i + 1) >= 0;
    substr($js, $i, length $old) = $new;
}

# 1. before zooming: remember the page under the mouse and the spot on it;
#    no 1-second pause after normal scrolling
replace_once(<<'OLD', <<'NEW', "pdf zoom fix, remember the spot");
    if (zoomDisabledTimeout || document.visibilityState === "hidden") {
      return;
    }

    var previousScale = pdfViewer.currentScale;
OLD
    if (document.visibilityState === "hidden") {
      return;
    }

    var previousScale = pdfViewer.currentScale;
    /* patched: zoom at the mouse. Remember the page under the mouse and the spot on it */
    var anchor = null;
    var hits = document.elementsFromPoint(evt.clientX, evt.clientY);
    for (var h = 0; h < hits.length && !anchor; h++) {
      var hitPage = hits[h].closest ? hits[h].closest(".page") : null;
      if (hitPage) {
        var r0 = hitPage.getBoundingClientRect();
        anchor = { page: hitPage, fx: (evt.clientX - r0.left) / r0.width, fy: (evt.clientY - r0.top) / r0.height };
      }
    }
NEW

# 2. after zooming: scroll so that spot is under the mouse again
#    (between two pages, no page is found and the old rule is used)
replace_once(<<'OLD', <<'NEW', "pdf zoom fix, scroll back");
    if (previousScale !== currentScale) {
      var scaleCorrectionFactor = currentScale / previousScale - 1;
OLD
    if (previousScale !== currentScale && anchor) {
      var r1 = anchor.page.getBoundingClientRect();
      pdfViewer.container.scrollLeft += r1.left + anchor.fx * r1.width - evt.clientX;
      pdfViewer.container.scrollTop += r1.top + anchor.fy * r1.height - evt.clientY;
      pdfViewer.update();
    } else if (previousScale !== currentScale) {
      var scaleCorrectionFactor = currentScale / previousScale - 1;
NEW

rename $file, "$file.orig" unless -e "$file.orig";
open my $out, '>:raw', $file or die "cannot write $file\n"; print $out $js; close $out;
print "pdf zoom fix: applied to $file (original kept as viewer.js.orig). Close the PDF tab and open it again.\n";
