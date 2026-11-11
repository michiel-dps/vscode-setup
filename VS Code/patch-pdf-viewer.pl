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
# 1. Smooth zoom at the mouse (viewer.js), version 3 (11 Nov 2026).
#    Ctrl+wheel and touchpad pinch:
#    - a pinch follows the fingers exactly (version 2 counted every small
#      pinch event as a full 7.5% step: one pinch ran to the maximum zoom);
#    - the mouse wheel zooms 7.5% per notch and glides there (was: a jump);
#    - while zooming nothing is laid out and no page is drawn: the pages on
#      screen are only moved and stretched (CSS transforms). 250 ms after the
#      last movement the real zoom is set once and the pages are drawn sharp
#      (version 2 laid out all pages on every step and let pages be drawn in
#      between, which froze the zoom for 0.1-0.5 s on map pages);
#    - the spot under the mouse stays there, and every page is shown where
#      the real layout will put it, so nothing jumps when it turns sharp.
#    The add-on's own zoom jumped 33% per mouse notch, drifted away from the
#    mouse, redrew every page on every step and ignored Ctrl+wheel for
#    1 second after scrolling.
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
patch_file("$ext/$name/lib/web/viewer.js", 'patched v3: smooth zoom at the mouse', "pdf zoom fix", sub {
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
/* patched v3: smooth zoom at the mouse.
   While you zoom (Ctrl+wheel or a touchpad pinch) nothing is laid out and
   nothing is drawn: the pages that are on screen are only moved and
   stretched with CSS transforms, which the graphics card does. 250 ms after
   the last movement the real zoom is set once and the pages are drawn sharp.
   - Touchpad pinch: the zoom follows the fingers exactly.
   - Mouse wheel: 7.5% per notch, gliding there instead of jumping.
   - The spot under the mouse stays under the mouse.
   - Every page is shown exactly where the real layout will put it, so
     nothing jumps when the pages turn sharp.
   - No page is drawn while zooming: drawing runs on the same thread and
     made the zoom stutter. */
var SMOOTH_ZOOM_STEP = 0.075;       // mouse wheel: zoom per notch
var SMOOTH_ZOOM_NOTCH = 100;        // deltaY of one wheel notch
var SMOOTH_ZOOM_FINE = 30;          // a smaller deltaY comes from a touchpad
var SMOOTH_ZOOM_GLIDE_MS = 50;      // mouse wheel: how fast the glide catches up
var SMOOTH_ZOOM_SHARPEN_MS = 250;   // draw sharp this long after the last movement
var smoothZoom = null;              // the zoom that is going on now, or null

// Start a zoom: remember where the page under the mouse is, stop the drawing
// of pages, and work out how the viewer lays its pages out.
function smoothZoomStart(evt) {
  var pdfViewer = PDFViewerApplication.pdfViewer;
  var container = pdfViewer.container;
  var viewer = pdfViewer.viewer;
  var pages = pdfViewer._pages;
  var scale = pdfViewer.currentScale;

  // the page under the mouse (or else the current page) is the one kept in place
  var index = pdfViewer.currentPageNumber - 1;
  var hits = document.elementsFromPoint(evt.clientX, evt.clientY);
  for (var h = 0; h < hits.length; h++) {
    var hit = hits[h].closest ? hits[h].closest(".page") : null;
    if (hit) {
      var number = parseInt(hit.getAttribute("data-page-number"), 10);
      if (pages[number - 1] && pages[number - 1].div === hit) {
        index = number - 1;
      }
      break;
    }
  }
  var pageView = pages[index];
  if (!pageView || !(scale > 0)) {
    return null;
  }

  var div = pageView.div;
  var box = container.getBoundingClientRect();
  var pageBox = div.getBoundingClientRect();
  var viewerBox = viewer.getBoundingClientRect();
  var originX = box.left + container.clientLeft;   // top left corner of the window on the PDF
  var originY = box.top + container.clientTop;
  var border = (pageBox.width - div.clientWidth) / 2;   // the shadow around a page
  var g = {
    pdfViewer: pdfViewer, container: container, viewer: viewer,
    pageView: pageView, index: index, div: div,
    baseScale: scale,      // the zoom of the real layout, until the end
    shown: scale,          // the zoom shown on screen now
    target: scale,         // the zoom we are going to
    glide: false, lastFrame: 0, raf: 0, timer: null, waits: 0,
    originX: originX, originY: originY,
    border: border,
    w0: div.clientWidth, h0: div.clientHeight,              // size of the page at the start
    X: pageBox.left + border - originX,                     // where the page is shown now,
    Y: pageBox.top + border - originY,                      //   counted from the corner of the window
    sx: container.scrollLeft, sy: container.scrollTop,      // scroll position when X and Y were set
    pageX: pageBox.left + border - viewerBox.left,          // the page inside the viewer element
    pageY: pageBox.top + border - viewerBox.top,
    offX: viewerBox.left - originX + container.scrollLeft,  // the viewer element inside the scrolled content
    mx: 0, my: 0, fx: 0, fy: 0,                             // the mouse, and the spot on the page under it
    width0: container.clientWidth,                          // the window on the PDF, without scroll bars
    fullW: container.offsetWidth, fullH: container.offsetHeight,   // and with them
    exact: false, unitW: [], unitH: [], baseW: [], baseH: [],
    bar: 0, gap: 0, top0: 0, docHeight: 0, moved: [], movedDivs: [], lo: Infinity, hi: -Infinity
  };
  g.offY = viewerBox.top - originY + g.sy;
  var scrollsX = container.scrollWidth > container.clientWidth;
  var scrollsY = container.scrollHeight > container.clientHeight;

  // Plain vertical scrolling: the final layout can be worked out in advance
  // (page sizes are whole pixels, the room between two pages does not grow).
  if (pdfViewer.scrollMode === 0 && pdfViewer.spreadMode === 0) {
    var total = 0;
    for (var i = 0; i < pages.length; i++) {
      g.unitW.push(pages[i].viewport.width / scale);    // size of the page at zoom 1
      g.unitH.push(pages[i].viewport.height / scale);
      g.baseW.push(Math.floor(pages[i].viewport.width));   // size of the page now
      g.baseH.push(Math.floor(pages[i].viewport.height));
      if (i < pages.length - 1) {
        total += g.baseH[i];
      }
    }
    var last = pages.length - 1;
    var lastDiv = pages[last].div;
    g.gap = last > 0 ? (lastDiv.offsetTop - pages[0].div.offsetTop - total) / last : 0;
    g.top0 = g.Y + g.sy;                  // top of our page in the scrolled content
    g.docHeight = scrollsY ? container.scrollHeight : lastDiv.offsetTop + lastDiv.offsetHeight;
    // how thick a scroll bar is: it takes room from the window when the document does not fit
    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:-999px;width:100px;height:100px;overflow:scroll;visibility:hidden";
    container.appendChild(probe);
    g.bar = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    g.exact = true;
    // only when the layout is really what this expects
    var lay = smoothZoomLayout(g, scale);
    var gap1 = last > 0 ? pages[1].div.offsetTop - pages[0].div.offsetTop - g.baseH[0] : 0;
    if (Math.abs(lay.left - (g.X + g.sx)) > 2 || Math.abs(g.gap - gap1) > 1 ||
        Math.abs(lay.width - container.clientWidth) > 1 || Math.abs(lay.height - container.clientHeight) > 1 ||
        Math.abs(lay.maxScrollX - (container.scrollWidth - container.clientWidth)) > 2) {
      g.exact = false;
    }
  }

  // no page is drawn while zooming
  var queue = pdfViewer.renderingQueue;
  queue.renderView = function () { return true; };   // nothing new starts
  queue.highestPriorityPage = null;                  // a page that is being drawn pauses at its next step

  // the scroll bars stay as they are (one that comes or goes would move the pages) ...
  g.overflowX = container.style.overflowX;
  g.overflowY = container.style.overflowY;
  container.style.overflowX = scrollsX ? "scroll" : "hidden";
  container.style.overflowY = scrollsY ? "scroll" : "hidden";
  // ... and an invisible dot at the far corner of the window keeps the scroll
  // position valid when the pages are shown smaller
  var keep = document.createElement("div");
  keep.style.cssText = "position:absolute;width:1px;height:1px;visibility:hidden;pointer-events:none;" +
    "left:" + (g.sx + container.clientWidth - 1) + "px;top:" + (g.sy + container.clientHeight - 1) + "px";
  container.appendChild(keep);
  g.keep = keep;

  if (!g.exact) {
    viewer.style.transformOrigin = "0 0";
    viewer.style.willChange = "transform";
  }
  container.addEventListener("scroll", smoothZoomScrolled);
  return g;
}

// Size of page i at zoom s, as the viewer will lay it out (whole pixels).
function smoothZoomWidth(g, i, s) {
  return s === g.baseScale ? g.baseW[i] : Math.floor(g.unitW[i] * s);
}

function smoothZoomHeight(g, i, s) {
  return s === g.baseScale ? g.baseH[i] : Math.floor(g.unitH[i] * s);
}

// Left edge of page i at zoom s inside the scrolled content, in a window of
// this width: centred when it fits.
function smoothZoomLeft(g, i, s, width) {
  var room = width - 2 * g.offX - smoothZoomWidth(g, i, s) - 2 * g.border;
  return g.offX + Math.max(0, room / 2) + g.border;
}

// The real layout at zoom s: the size of the window on the PDF, where our page
// is (inside the scrolled content), and how far one can scroll.
function smoothZoomLayout(g, s) {
  var above = 0, all = 0, widest = 0;
  for (var i = 0; i < g.unitH.length; i++) {
    var grown = smoothZoomHeight(g, i, s) - g.baseH[i];
    if (i < g.index) {
      above += grown;
    }
    all += grown;
    widest = Math.max(widest, smoothZoomWidth(g, i, s));
  }
  var docWidth = g.offX + widest + 2 * g.border;
  var docHeight = g.docHeight + all;
  // a scroll bar takes room from the window when the document does not fit
  var width = g.fullW, height = g.fullH;
  for (var pass = 0; pass < 2; pass++) {
    width = docHeight > height ? g.fullW - g.bar : g.fullW;
    height = docWidth > width ? g.fullH - g.bar : g.fullH;
  }
  return {
    width: width, height: height,
    left: smoothZoomLeft(g, g.index, s, width),
    top: g.top0 + above,
    maxScrollX: Math.max(0, docWidth - width),
    maxScrollY: Math.max(0, docHeight - height)
  };
}

// Where our page is on screen right now (it moves along when the user scrolls).
function smoothZoomWhere(g) {
  return { X: g.X - (g.container.scrollLeft - g.sx), Y: g.Y - (g.container.scrollTop - g.sy) };
}

// Remember which spot of our page is under the mouse: it stays there.
function smoothZoomSpot(g, clientX, clientY) {
  var here = smoothZoomWhere(g);
  var f = g.shown / g.baseScale;
  g.mx = clientX - g.originX;
  g.my = clientY - g.originY;
  g.fx = (g.mx - here.X) / (g.w0 * f);
  g.fy = (g.my - here.Y) / (g.h0 * f);
}

// Move and stretch page i: its top left corner goes from (left0, top0) to
// (left, top) on screen, and it is shown f times as large.
function smoothZoomPlacePage(g, i, left, top, left0, top0, f) {
  var div = g.pdfViewer._pages[i].div;
  if (!g.moved[i]) {
    g.moved[i] = true;
    g.movedDivs.push(div);
    g.lo = Math.min(g.lo, i);
    g.hi = Math.max(g.hi, i);
    div.style.transformOrigin = g.border + "px " + g.border + "px";
    div.style.willChange = "transform";   // the graphics card stretches the page; no redraw per step
  }
  div.style.transform = "translate(" + (left - left0) + "px, " + (top - top0) + "px) scale(" + f + ")";
}

// Show the pages at zoom g.shown, with the spot (fx, fy) under the mouse.
function smoothZoomPlace(g) {
  var s = g.shown;
  var f = s / g.baseScale;
  var X = g.mx - g.fx * g.w0 * f;
  var Y = g.my - g.fy * g.h0 * f;
  var sx = g.container.scrollLeft, sy = g.container.scrollTop;

  if (!g.exact) {
    // other page layouts: stretch the whole viewer around the mouse
    g.X = X; g.Y = Y; g.sx = sx; g.sy = sy;
    g.viewer.style.transform = "translate(" + (X - (g.offX - sx) - f * g.pageX) + "px, " +
      (Y - (g.offY - sy) - f * g.pageY) + "px) scale(" + f + ")";
    return;
  }

  // not past the edges of the document, and centred when the page is narrower than the window
  var lay = smoothZoomLayout(g, s);
  X = Math.min(lay.left, Math.max(lay.left - lay.maxScrollX, X));
  Y = Math.min(lay.top, Math.max(lay.top - lay.maxScrollY, Y));
  g.X = X; g.Y = Y; g.sx = sx; g.sy = sy;

  // every page that is on screen goes where the real layout will have it
  var scrollX = lay.left - X, scrollY = lay.top - Y;   // the scroll position of that layout
  var height = g.fullH, count = g.unitH.length, base = g.baseScale;
  var i, top = lay.top, top0 = g.top0;
  smoothZoomPlacePage(g, g.index, lay.left - scrollX, top - scrollY, smoothZoomLeft(g, g.index, base, g.width0) - sx, top0 - sy, f);
  for (i = g.index + 1; i < count; i++) {          // the pages below ours
    top += smoothZoomHeight(g, i - 1, s) + g.gap;
    top0 += g.baseH[i - 1] + g.gap;
    if (i > g.hi && top - scrollY > height + 200 && top0 - sy > height) {
      break;                                       // below the window, now and in the real layout
    }
    smoothZoomPlacePage(g, i, smoothZoomLeft(g, i, s, lay.width) - scrollX, top - scrollY, smoothZoomLeft(g, i, base, g.width0) - sx, top0 - sy, f);
  }
  top = lay.top;
  top0 = g.top0;
  for (i = g.index - 1; i >= 0; i--) {             // the pages above ours
    top -= smoothZoomHeight(g, i, s) + g.gap;
    top0 -= g.baseH[i] + g.gap;
    if (i < g.lo && top + smoothZoomHeight(g, i, s) - scrollY < -200 && top0 + g.baseH[i] - sy < 0) {
      break;                                       // above the window
    }
    smoothZoomPlacePage(g, i, smoothZoomLeft(g, i, s, lay.width) - scrollX, top - scrollY, smoothZoomLeft(g, i, base, g.width0) - sx, top0 - sy, f);
  }
}

// Still the same document, pages and zoom as when the zoom started?
function smoothZoomAlive(g) {
  return g.div.isConnected && g.pdfViewer._pages[g.index] === g.pageView &&
    g.pdfViewer.currentScale === g.baseScale && !g.pdfViewer.isInPresentationMode;
}

// One screen frame of the zoom.
function smoothZoomFrame() {
  var g = smoothZoom;
  if (!g) {
    return;
  }
  g.raf = 0;
  if (!smoothZoomAlive(g)) {
    smoothZoomEnd(false);
    return;
  }
  var time = performance.now();
  var left = Math.log(g.target / g.shown);
  if (g.glide && Math.abs(left) > 0.0005) {
    // mouse wheel: go part of the way to the target, more when more time has passed
    var passed = Math.min(50, Math.max(4, time - g.lastFrame));
    g.shown *= Math.exp(left * (1 - Math.exp(-passed / SMOOTH_ZOOM_GLIDE_MS)));
  } else {
    g.shown = g.target;
  }
  g.lastFrame = time;
  smoothZoomPlace(g);
  if (g.shown !== g.target) {
    g.raf = requestAnimationFrame(smoothZoomFrame);
  }
}

// The user scrolls during the zoom: the pages move along.
function smoothZoomScrolled() {
  var g = smoothZoom;
  if (!g) {
    return;
  }
  smoothZoomSpot(g, g.mx + g.originX, g.my + g.originY);
  if (!g.raf) {
    g.raf = requestAnimationFrame(smoothZoomFrame);
  }
}

// The zoom has stopped (apply = true), or the viewer changed under it (false):
// take the transforms away, set the real zoom and let the pages be drawn sharp.
function smoothZoomEnd(apply) {
  var g = smoothZoom;
  if (!g) {
    return;
  }
  smoothZoom = null;
  cancelAnimationFrame(g.raf);
  clearTimeout(g.timer);
  g.container.removeEventListener("scroll", smoothZoomScrolled);
  apply = apply && smoothZoomAlive(g);
  if (apply) {
    if (Math.abs(g.target / g.baseScale - 1) < 1e-9) {
      g.target = g.baseScale;   // back where it started: nothing to redraw
    }
    g.shown = g.target;
    smoothZoomPlace(g);
  }
  var here = smoothZoomWhere(g);
  g.viewer.style.transform = "";
  g.viewer.style.transformOrigin = "";
  g.viewer.style.willChange = "";
  for (var i = 0; i < g.movedDivs.length; i++) {
    g.movedDivs[i].style.transform = "";
    g.movedDivs[i].style.transformOrigin = "";
    g.movedDivs[i].style.willChange = "";
  }
  g.keep.remove();
  g.container.style.overflowX = g.overflowX;
  g.container.style.overflowY = g.overflowY;
  if (apply) {
    g.pdfViewer._setScale(g.target, true);   // the real zoom; true: the viewer does not scroll by itself
    var box = g.container.getBoundingClientRect();
    var pageBox = g.div.getBoundingClientRect();
    // scroll so that the page is where it was shown
    g.container.scrollLeft += pageBox.left + g.border - (box.left + g.container.clientLeft) - here.X;
    g.container.scrollTop += pageBox.top + g.border - (box.top + g.container.clientTop) - here.Y;
  }
  delete g.pdfViewer.renderingQueue.renderView;   // pages may be drawn again
  g.pdfViewer.update();                           // draw what is on screen now
}

function smoothZoomSharpen() {
  var g = smoothZoom;
  if (g && g.raf && g.waits < 12) {
    // the glide has not arrived yet (a fast spin of the wheel): wait for it
    g.waits++;
    g.timer = setTimeout(smoothZoomSharpen, 50);
    return;
  }
  smoothZoomEnd(true);
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

  if (document.visibilityState === "hidden" || !pdfViewer.pagesCount || !evt.deltaY) {
    return;
  }

  var g = smoothZoom;
  if (g && !smoothZoomAlive(g)) {
    smoothZoomEnd(false);
    g = null;
  }
  if (!g) {
    g = smoothZoom = smoothZoomStart(evt);
    if (!g) {
      return;
    }
  }

  // how much to zoom
  var time = performance.now();
  var change;
  if (evt.deltaMode === 0 && Math.abs(evt.deltaY) < SMOOTH_ZOOM_FINE) {
    // touchpad pinch: the browser sends -100 * log(how far the fingers moved apart)
    change = Math.exp(-evt.deltaY / 100);
    g.glide = false;
  } else {
    // mouse wheel: 7.5% per notch
    var notches = evt.deltaMode === 0 ? evt.deltaY / SMOOTH_ZOOM_NOTCH : (evt.deltaY > 0 ? 1 : -1);
    notches = Math.max(-3, Math.min(3, notches));
    change = Math.pow(1 + SMOOTH_ZOOM_STEP, -notches);
    if (!g.glide) {
      g.lastFrame = time;
    }
    g.glide = true;
  }

  smoothZoomSpot(g, evt.clientX, evt.clientY);
  g.target = Math.min(_ui_utils.MAX_SCALE, Math.max(_ui_utils.MIN_SCALE, g.target * change));
  if (!g.raf) {
    g.raf = requestAnimationFrame(smoothZoomFrame);
  }
  clearTimeout(g.timer);
  g.waits = 0;
  g.timer = setTimeout(smoothZoomSharpen, SMOOTH_ZOOM_SHARPEN_MS);
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
