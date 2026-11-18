# patch-color-highlight.ps1: colour words in R code get their border only when
# they stand inside quotes in the code, and the border goes around the whole
# "red", quotes included. Inside a comment (after a # that is not in a string)
# nothing is marked (his wishes, 18 Nov 2026). Patches the Color Highlight
# add-on (naumovs.color-highlight) in ~/.vscode/extensions. Run again after
# every update of that add-on. Safe to run twice: a patched file is left alone,
# an older version of this patch is replaced.
# Then Ctrl+Shift+P > Developer: Restart Extension Host.

$ErrorActionPreference = 'Stop'
$marker = '/*patch-quoted-colour-words-2*/'
$anyVersion = '/*patch-quoted-colour-words'
$folders = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory |
  Where-Object Name -like 'naumovs.color-highlight-*'
if (-not $folders) { Write-Output 'Color Highlight is not installed.'; exit 1 }

# the new colour-word finder. NAME = the regex variable, LIST = the colour-name
# list, FUNC = the function name, all read from the add-on's own code
$template = @'
=new RegExp("([\"'])("+LIST+")\\1","g");MARKER
const inCommentQ=(e,o)=>{let q=null;for(let k=e.lastIndexOf("\n",o-1)+1;k<o;k++){const c=e[k];if(q){if(c==="\\"){k++;continue}if(c===q)q=null;continue}if(c==='"'||c==="'"||c==="`"){q=c;continue}if(c==="#")return!0}return!1};
async function FUNC(e){let t=NAME.exec(e),r=[];for(;null!==t;){const i=t[2],o=t.index,s=NAME.lastIndex;if(!inCommentQ(e,o)){try{const e=a()(i).rgb().string();r.push({start:o,end:s,color:e})}catch(e){}}t=NAME.exec(e)}return r}
'@ -replace "`r?`n", ''

foreach ($folder in $folders) {
  $file = Join-Path $folder.FullName 'dist\extension-node.js'
  $js = [IO.File]::ReadAllText($file)
  if ($js.Contains($marker)) { Write-Output "already patched: $($folder.Name)"; continue }
  if ($js.Contains($anyVersion)) {
    if (-not (Test-Path "$file.orig")) { Write-Output "WRONG: older patch found but no .orig in $($folder.Name)"; exit 1 }
    $js = [IO.File]::ReadAllText("$file.orig")
  } else {
    Copy-Item $file "$file.orig" -Force
  }

  # the colour-word finder: from its regular expression to the end of its function
  $start = $js.IndexOf('=new RegExp(".?("+')
  if ($start -lt 0) { Write-Output "WRONG: colour-word code not found in $($folder.Name), the add-on changed"; exit 1 }
  $nameStart = $js.LastIndexOf(',', $start) + 1
  $name = $js.Substring($nameStart, $start - $nameStart)          # d in 2.8.0
  $listStart = $js.IndexOf('("+', $start) + 3
  $listEnd = $js.IndexOf('+")', $listStart)
  $list = $js.Substring($listStart, $listEnd - $listStart)        # f in 2.8.0
  $funcStart = $js.IndexOf('async function ', $start)
  $funcName = $js.Substring($funcStart + 15, $js.IndexOf('(', $funcStart) - $funcStart - 15)
  $end = $js.IndexOf('return r}', $funcStart) + 'return r}'.Length
  if ($end - $start -gt 600) { Write-Output "WRONG: unexpected code shape in $($folder.Name)"; exit 1 }

  $new = $template.Replace('MARKER', $marker).Replace('LIST', $list).Replace('FUNC', $funcName).Replace('NAME', $name)
  $js = $js.Substring(0, $start) + $new + $js.Substring($end)
  [IO.File]::WriteAllText($file, $js)
  Write-Output "patched: $($folder.Name)"
}
