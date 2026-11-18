# patch-color-highlight.ps1: colour words in R code get their border only when
# they stand inside quotes, and the border goes around the whole "red", quotes
# included (his wish, 18 Nov 2026). Patches the Color Highlight add-on
# (naumovs.color-highlight) in ~/.vscode/extensions. Run again after every
# update of that add-on. Safe to run twice: a patched file is left alone.
# Then Ctrl+Shift+P > Developer: Restart Extension Host.

$ErrorActionPreference = 'Stop'
$marker = '/*patch-quoted-colour-words*/'
$folders = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory |
  Where-Object Name -like 'naumovs.color-highlight-*'
if (-not $folders) { Write-Output 'Color Highlight is not installed.'; exit 1 }

foreach ($folder in $folders) {
  $file = Join-Path $folder.FullName 'dist\extension-node.js'
  $js = [IO.File]::ReadAllText($file)
  if ($js.Contains($marker)) { Write-Output "already patched: $($folder.Name)"; continue }

  # the colour-word finder: from its regular expression to the end of its function
  $start = $js.IndexOf('=new RegExp(".?("+')
  if ($start -lt 0) { Write-Output "WRONG: colour-word code not found in $($folder.Name), the add-on changed"; exit 1 }
  $nameStart = $js.LastIndexOf(',', $start) + 1
  $name = $js.Substring($nameStart, $start - $nameStart)          # the regex variable, d in 2.8.0
  $listStart = $js.IndexOf('("+', $start) + 3
  $listEnd = $js.IndexOf('+")', $listStart)
  $list = $js.Substring($listStart, $listEnd - $listStart)        # the colour-name list, f in 2.8.0
  $funcStart = $js.IndexOf('async function ', $start)
  $funcName = $js.Substring($funcStart + 15, $js.IndexOf('(', $funcStart) - $funcStart - 15)
  $end = $js.IndexOf('return r}', $funcStart) + 'return r}'.Length
  $old = $js.Substring($start, $end - $start)
  if ($old.Length -gt 600) { Write-Output "WRONG: unexpected code shape in $($folder.Name)"; exit 1 }

  # only "red" or 'red' (quote, colour name, the same quote), marked from quote to quote
  $new = '=new RegExp("([\"' + "'" + '])("+' + $list + '+")\\1","g");' + $marker +
    'async function ' + $funcName + '(e){let t=' + $name + '.exec(e),r=[];for(;null!==t;){' +
    'const i=t[2],o=t.index,s=' + $name + '.lastIndex;' +
    'try{const e=a()(i).rgb().string();r.push({start:o,end:s,color:e})}catch(e){}' +
    't=' + $name + '.exec(e)}return r}'

  Copy-Item $file "$file.orig" -Force
  $js = $js.Substring(0, $start) + $new + $js.Substring($end)
  [IO.File]::WriteAllText($file, $js)
  Write-Output "patched: $($folder.Name)"
}
