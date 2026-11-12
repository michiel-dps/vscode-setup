The fonts of the PDF look (inject/pdf-look.css): Latin Modern, the fonts LaTeX uses
for a PDF when no other font is asked for. A page in the PDF look is drawn with them.

  lmroman10-regular.otf     the text
  lmroman10-italic.otf      italic text
  lmroman10-bold.otf        bold text, and the small headings
  lmroman10-bolditalic.otf  bold italic text
  lmroman12-bold.otf        the section and subsection headings
  lmroman12-regular.otf     subtitle, names and date of the title block (12 Nov 2026)
  lmroman17-regular.otf     the title of the title block (12 Nov 2026)
  lmmono10-regular.otf      code in a line

Copied unchanged on 11 and 12 Nov 2026 from TinyTeX:
  %APPDATA%\TinyTeX\texmf-dist\fonts\opentype\public\lm
Made by GUST e-foundry (B. Jackowski and J. M. Nowacki); free to use and to pass on
under the GUST Font License.

patch.js writes them into Quarto's style.css as data: addresses, so nothing has to be
installed in Windows.
