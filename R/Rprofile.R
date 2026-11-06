local({
  in_vscode <- nzchar(Sys.getenv("VSCODE_R_SESS_PKG_PATH")) ||
    identical(Sys.getenv("TERM_PROGRAM"), "vscode")
  if (!interactive() || !in_vscode) return(invisible())
  here <- dirname(Sys.getenv("R_PROFILE_USER"))
  if (!file.exists(file.path(here, "watch.R"))) {
    here <- "C:/Users/<you>/<Dropbox>/<name>/VS Code setup/R"
  }
  source(file.path(here, "watch.R"))
})
