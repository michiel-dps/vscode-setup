local({
  in_vscode <- nzchar(Sys.getenv("VSCODE_R_SESS_PKG_PATH")) ||
    identical(Sys.getenv("TERM_PROGRAM"), "vscode")
  if (!interactive() || !in_vscode) return(invisible())
  here <- dirname(Sys.getenv("R_PROFILE_USER"))
  if (!file.exists(file.path(here, "watch.R"))) {
    here <- "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/R"
  }
  source(file.path(here, "watch.R"))

  # every error in the R terminal also goes to a log file, so Claude can read
  # it when he says "check" (18 Nov 2026)
  error_log <- file.path(Sys.getenv("TEMP"), "r-terminal-errors.log")
  options(error = function() {
    if (file.exists(error_log) && file.size(error_log) > 200000) {
      file.remove(error_log)
    }
    cat(
      format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " ",
      geterrmessage(), "\n",
      file = error_log,
      append = TRUE,
      sep = ""
    )
  })
  cat(format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " fresh R terminal started\n",
      file = error_log, append = TRUE, sep = "")
})
