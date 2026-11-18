# terminal-log.R: everything the R terminal shows also goes to one log file,
# so Claude can read what happened when he says "check" (18 Nov 2026).
# Loaded by Rprofile.R in every VS Code R terminal. Writes to
# %TEMP%\r-terminal.log: normal output, messages, warnings, errors, and a
# line after each command that ran. Emptied when it passes 2 MB.
# Must run at startup (not inside tryCatch): R only accepts the warning and
# message handlers there.

local({
  log_path <- file.path(Sys.getenv("TEMP"), "r-terminal.log")
  if (file.exists(log_path) && file.size(log_path) > 2000000) {
    file.remove(log_path)
  }
  # two connections to the same file: one for the copy of the screen, one for
  # the notes (a note written through the screen copy would show on screen)
  screen_con <- file(log_path, open = "a", encoding = "UTF-8")
  note_con <- file(log_path, open = "a", encoding = "UTF-8")

  now <- function() {
    format(Sys.time(), "%H:%M:%S")
  }

  write_log <- function(...) {
    flush(screen_con)
    writeLines(paste0(...), con = note_con)
    flush(note_con)
  }

  write_log("==== ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " fresh R terminal started")

  # normal output: shown on screen as always, and copied to the log
  sink(screen_con, append = TRUE, split = TRUE)

  # errors: R prints them on screen itself, this copies them to the log
  options(error = function() {
    write_log("!!!! ", now(), " ", trimws(geterrmessage()))
  })

  # warnings and messages: copied to the log, still shown on screen
  globalCallingHandlers(
    warning = function(w) {
      write_log("Warning: ", conditionMessage(w))
    },
    message = function(m) {
      write_log("Message: ", trimws(conditionMessage(m)))
    }
  )

  # after each command that worked: which command it was
  addTaskCallback(function(expr, value, ok, visible) {
    command <- paste(deparse(expr), collapse = " ")
    if (nchar(command) > 300) {
      command <- paste0(substr(command, 1, 300), " ...")
    }
    write_log("---- ", now(), " ran: ", command)
    TRUE
  }, name = "terminalLog")
})
