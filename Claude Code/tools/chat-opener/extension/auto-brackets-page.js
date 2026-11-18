// Brackets in the Claude chat box, like in a code editor (18 Nov 2026).
// auto-brackets.js puts this at the end of Claude Code's webview/index.js.
//   (            types () with the cursor in between. Before a word only ( like VS Code.
//   ( on a selection   puts ( ) around it.
//   )            just before a ), the cursor steps over it instead of typing another.
//   Backspace    between ( and ), deletes both.
// The text goes in through the browser's own typing command (insertText), so the chat
// sees normal typing and Ctrl+Z works as usual.
void function () {
  // ( closes itself only when the next character is one of these, or at the end
  const closesBefore = ' \t\n)]},.:=>'

  // the chat box: an editable element with role textbox ("Message input")
  function chatBox(target) {
    if (!target || !target.closest) return null
    const box = target.closest('[contenteditable]')
    if (!box || box.getAttribute('role') !== 'textbox') return null
    return box
  }

  function textAfter(box, range) {
    const rest = document.createRange()
    rest.selectNodeContents(box)
    rest.setStart(range.endContainer, range.endOffset)
    return rest.toString()
  }

  function textBefore(box, range) {
    const rest = document.createRange()
    rest.selectNodeContents(box)
    rest.setEnd(range.startContainer, range.startOffset)
    return rest.toString()
  }

  function onKey(event) {
    if (event.defaultPrevented || event.isComposing || event.metaKey) return
    const box = chatBox(event.target)
    if (!box) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) return
    const empty = range.collapsed

    if (event.key === '(') {
      if (empty) {
        const next = textAfter(box, range).charAt(0)
        if (next !== '' && !closesBefore.includes(next)) return
        event.preventDefault()
        document.execCommand('insertText', false, '()')
        selection.modify('move', 'backward', 'character')
      } else {
        const inside = range.toString()
        event.preventDefault()
        document.execCommand('insertText', false, '(' + inside + ')')
      }
      return
    }

    if (event.key === ')' && empty && textAfter(box, range).charAt(0) === ')') {
      event.preventDefault()
      selection.modify('move', 'forward', 'character')
      return
    }

    const plainBackspace = event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.shiftKey
    if (plainBackspace && empty) {
      const before = textBefore(box, range).slice(-1)
      const after = textAfter(box, range).charAt(0)
      if (before === '(' && after === ')') {
        event.preventDefault()
        selection.modify('move', 'backward', 'character')
        selection.modify('extend', 'forward', 'character')
        selection.modify('extend', 'forward', 'character')
        document.execCommand('delete')
      }
    }
  }

  // capture: runs before the chat's own key handling
  document.addEventListener('keydown', onKey, true)
}()
