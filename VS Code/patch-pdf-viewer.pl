#!/usr/bin/perl
# One fix to the VS Code PDF viewer add-on (tomoki1207.pdf): smooth zoom at
# the mouse. Applied by editing its lib/web/viewer.js; the untouched original
# is kept as viewer.js.orig and every run starts from that copy. Re-run after
# the add-on updates itself (the folder tomoki1207.pdf-x.y.z gets a new
# version number). Idempotent.
#
#   perl "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/VS Code/patch-pdf-viewer.pl"
#
# Then: close the PDF tab and open it again (or Reload Window).
#
# Ctrl+wheel and touchpad pinch now zoom like VS Code's own image preview:
# - every wheel step zooms 7.5% around the spot under the mouse (was: 33% per
#   mouse notch, after first jumping back to an old scroll position, so the
#   zoom drifted away from the mouse);
# - while zooming the pages are only stretched, which is instant; 250 ms
#   after the last step they are drawn sharp once (was: every step redrew
#   every visible page and its text layer, which made zooming laggy);
# - no 1-second pause in which Ctrl+wheel did nothing after normal scrolling.
use strict; use warnings;
my $ext = "$ENV{USERPROFILE}/.vscode/extensions";
opendir(my $dh, $ext) or die "cannot open $ext";
my ($name) = (sort grep { /^tomoki1207\.pdf-[0-9]/ } readdir $dh)[-1];   # newest version
closedir $dh;
die "PDF viewer add-on (tomoki1207.pdf) not found in $ext" unless $name;
my $file = "$ext/$name/lib/web/viewer.js";
my $orig = "$file.orig";

sub slurp { my ($f) = @_; local $/; open my $in, '<:raw', $f or die "cannot read $f\n"; my $t = <$in>; close $in; $t }

my $marker = 'patched v2: smooth zoom at the mouse';
if (slurp($file) =~ /\Q$marker\E/) {
    print "pdf zoom fix: already in place\n";
    exit 0;
}

# start from the untouched original (an earlier version of this fix may be in viewer.js)
my $js = -e $orig ? slurp($orig) : slurp($file);
die "$orig is not the original viewer; reinstall the add-on\n" if $js =~ /patched/;
my $nl = ($js =~ /\r\n/) ? "\r\n" : "\n";   # keep the file's own line endings

# the whole original wheel handler: from "function webViewerWheel" to the next function
my $start = index($js, "function webViewerWheel(evt) {");
my $end   = index($js, "function webViewerTouchStart(evt) {");
die "pdf zoom fix: wheel handler not found; the add-on changed, patch by hand\n" if $start < 0 || $end < $start;
die "pdf zoom fix: wheel handler found twice; patch by hand\n" if index($js, "function webViewerWheel(evt) {", $start + 1) >= 0;
my $old = substr($js, $start, $end - $start);
die "pdf zoom fix: wheel handler looks different; the add-on changed, patch by hand\n"
    unless $old =~ /PDFViewerApplication\.zoomIn\(ticks\)/ && $old =~ /scaleCorrectionFactor/;

my $new = <<'NEW';
/* patched v2: smooth zoom at the mouse, like VS Code's image preview.
   Every wheel step (a mouse notch, or one event of a touchpad pinch) zooms
   7.5% around the spot under the mouse. While zooming the pages are only
   stretched (instant); 250 ms after the last step they are drawn sharp. */
var SMOOTH_ZOOM_STEP = 0.075;
var SMOOTH_ZOOM_SHARPEN_MS = 250;
var smoothZoomTimer = null;

function smoothZoomSharpen() {
  smoothZoomTimer = null;
  var pdfViewer = PDFViewerApplication.pdfViewer;
  var pages = pdfViewer._pages;
  for (var i = 0; i < pages.length; i++) {
    pages[i].useOnlyCssZoom = false;
    if (pages[i].canvas) {
      pages[i].update(pdfViewer.currentScale);
    }
  }
  pdfViewer.update();
}

function webViewerWheel(evt) {
  var pdfViewer = PDFViewerApplication.pdfViewer,
      supportedMouseWheelZoomModifierKeys = PDFViewerApplication.supportedMouseWheelZoomModifierKeys;

  if (pdfViewer.isInPresentationMode) {
    return;
  }

  if (!(evt.ctrlKey && supportedMouseWheelZoomModifierKeys.ctrlKey || evt.metaKey && supportedMouseWheelZoomModifierKeys.metaKey)) {
    return;
  }

  evt.preventDefault();

  if (document.visibilityState === "hidden" || !pdfViewer.pagesCount || evt.deltaY === 0) {
    return;
  }

  var previousScale = pdfViewer.currentScale;
  var step = evt.deltaY > 0 ? 1 - SMOOTH_ZOOM_STEP : 1 + SMOOTH_ZOOM_STEP;
  var newScale = Math.min(_ui_utils.MAX_SCALE, Math.max(_ui_utils.MIN_SCALE, previousScale * step));

  if (newScale === previousScale) {
    return;
  }

  // the page under the mouse, and the spot on it as a fraction of the page
  var anchor = null;
  var hits = document.elementsFromPoint(evt.clientX, evt.clientY);
  for (var h = 0; h < hits.length && !anchor; h++) {
    var hitPage = hits[h].closest ? hits[h].closest(".page") : null;
    if (hitPage) {
      var r0 = hitPage.getBoundingClientRect();
      anchor = { page: hitPage, fx: (evt.clientX - r0.left) / r0.width, fy: (evt.clientY - r0.top) / r0.height };
    }
  }
  var container = pdfViewer.container;
  var box = container.getBoundingClientRect();
  var contentX = container.scrollLeft + evt.clientX - box.left;
  var contentY = container.scrollTop + evt.clientY - box.top;

  // stretch the pages that are already drawn; no drawing while zooming
  var pages = pdfViewer._pages;
  for (var i = 0; i < pages.length; i++) {
    pages[i].useOnlyCssZoom = true;
  }
  pdfViewer._setScale(newScale, true);   // true: no jump to the old scroll position

  // scroll so that the same spot is under the mouse again
  if (anchor) {
    var r1 = anchor.page.getBoundingClientRect();
    container.scrollLeft += r1.left + anchor.fx * r1.width - evt.clientX;
    container.scrollTop += r1.top + anchor.fy * r1.height - evt.clientY;
  } else {
    // between two pages: keep the same point of the whole document under the mouse
    var factor = pdfViewer.currentScale / previousScale;
    container.scrollLeft = contentX * factor - (evt.clientX - box.left);
    container.scrollTop = contentY * factor - (evt.clientY - box.top);
  }
  pdfViewer.update();

  // draw sharp once the zooming has stopped
  clearTimeout(smoothZoomTimer);
  smoothZoomTimer = setTimeout(smoothZoomSharpen, SMOOTH_ZOOM_SHARPEN_MS);
}

NEW
$new =~ s/\n/$nl/g;
substr($js, $start, $end - $start) = $new;

rename $file, $orig unless -e $orig;
open my $out, '>:raw', $file or die "cannot write $file\n"; print $out $js; close $out;
print "pdf zoom fix: applied to $file (original kept as viewer.js.orig). Close the PDF tab and open it again.\n";
