#!/usr/bin/perl
# Two fixes to the VS Code PDF viewer add-on (tomoki1207.pdf), applied by
# editing lib/web/viewer.js and lib/main.js. The untouched originals are kept
# as viewer.js.orig and main.js.orig, and every run starts from those copies.
# Re-run after the add-on updates itself (the folder tomoki1207.pdf-x.y.z
# gets a new version number). Idempotent.
#
#   perl "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/VS Code/patch-pdf-viewer.pl"
#
# Then: close the PDF tab and open it again (or Reload Window).
#
# 1. Smooth zoom at the mouse (viewer.js). Ctrl+wheel and touchpad pinch zoom
#    like VS Code's own image preview:
#    - every wheel step zooms 7.5% around the spot under the mouse (was: 33%
#      per mouse notch, after first jumping back to an old scroll position,
#      so the zoom drifted away from the mouse);
#    - while zooming the pages are only stretched, which is instant; 250 ms
#      after the last step they are drawn sharp once (was: every step redrew
#      every visible page and its text layer, which made zooming laggy);
#    - no 1-second pause in which Ctrl+wheel did nothing after scrolling.
# 2. Clean reload after a knit (main.js). When the PDF file changes, the
#    add-on loads the new file but kept the old pages and the old copy of
#    the PDF: 26 more pages inside the viewer after every knit, more memory,
#    and jumps (clicked citations, cross-references, the page number box)
#    landed on the wrong place after the first knit. Now the old pages and
#    the old copy are dropped; scroll position and zoom are still kept.
use strict; use warnings;
my $ext = "$ENV{USERPROFILE}/.vscode/extensions";
opendir(my $dh, $ext) or die "cannot open $ext";
my ($name) = (sort grep { /^tomoki1207\.pdf-[0-9]/ } readdir $dh)[-1];   # newest version
closedir $dh;
die "PDF viewer add-on (tomoki1207.pdf) not found in $ext" unless $name;

sub slurp { my ($f) = @_; local $/; open my $in, '<:raw', $f or die "cannot read $f\n"; my $t = <$in>; close $in; $t }

# Patch one file: start from the untouched original, let $edit change the
# text, write it back. Skipped when $marker is already in the file.
sub patch_file {
    my ($file, $marker, $what, $edit) = @_;
    my $orig = "$file.orig";
    if (slurp($file) =~ /\Q$marker\E/) { print "$what: already in place\n"; return; }
    my $js = -e $orig ? slurp($orig) : slurp($file);
    die "$orig is not the original; reinstall the add-on\n" if $js =~ /patched/;
    my $nl = ($js =~ /\r\n/) ? "\r\n" : "\n";   # keep the file's own line endings
    $js = $edit->($js, $nl);
    rename $file, $orig unless -e $orig;
    open my $out, '>:raw', $file or die "cannot write $file\n"; print $out $js; close $out;
    print "$what: applied to $file (original kept as .orig)\n";
}

# literal, once-only replacement (no regex: the JS is full of $ " ' characters)
sub replace_once {
    my ($js, $old, $new, $nl, $what) = @_;
    $old =~ s/\n/$nl/g; $new =~ s/\n/$nl/g;
    my $i = index($js, $old);
    die "$what: code not found; the add-on changed, patch by hand\n" if $i < 0;
    die "$what: code found twice; patch by hand\n" if index($js, $old, $i + 1) >= 0;
    substr($js, $i, length $old) = $new;
    return $js;
}

# ---- 1. smooth zoom at the mouse (viewer.js) -------------------------------
patch_file("$ext/$name/lib/web/viewer.js", 'patched v2: smooth zoom at the mouse', "pdf zoom fix", sub {
    my ($js, $nl) = @_;
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
    return $js;
});

# ---- 2. clean reload after a knit (main.js) --------------------------------
patch_file("$ext/$name/lib/main.js", 'patched: forget the old pages', "pdf reload fix", sub {
    my ($js, $nl) = @_;
    # the add-on's own reset keeps scroll and zoom, but also kept the old pages
    $js = replace_once($js, <<'OLD', <<'NEW', $nl, "pdf reload fix, old pages");
        this._pagesCapability = (0, pdfjsLib.createPromiseCapability)()

        this.viewer.textContent = ""
OLD
        this._pagesCapability = (0, pdfjsLib.createPromiseCapability)()
        /* patched: forget the old pages, or they pile up on every knit */
        this._buffer.resize(0)    // frees the drawn old pages
        this._buffer.resize(10)   // the viewer's normal number of drawn pages
        this._pages = []
        this._pagesRequests = new WeakMap()

        this.viewer.textContent = ""
NEW
    # close the old copy of the PDF once the new one is shown
    $js = replace_once($js, <<'OLD', <<'NEW', $nl, "pdf reload fix, old copy");
      const doc = await pdfjsLib.getDocument(loadOpts).promise
      doc._pdfInfo.fingerprints = [config.path]
      PDFViewerApplication.load(doc)

      PDFViewerApplication.pdfViewer._resetView = oldResetView
OLD
      const oldDoc = PDFViewerApplication.pdfDocument
      const doc = await pdfjsLib.getDocument(loadOpts).promise
      doc._pdfInfo.fingerprints = [config.path]
      PDFViewerApplication.load(doc)

      PDFViewerApplication.pdfViewer._resetView = oldResetView
      // patched: close the old copy of the PDF (it stayed in memory after every knit)
      if (oldDoc && oldDoc !== doc) {
        oldDoc.destroy()
      }
NEW
    return $js;
});

print "Close the PDF tab and open it again.\n";
