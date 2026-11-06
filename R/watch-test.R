# watch-test.R  --  offline test of watch.R against the real sess helper
# package of the VS Code R extension, no VS Code needed. 30 checks.
# Run from PowerShell in the folder VS Code setup\R:
#   & "C:/Program Files/R/R-4.5.1/bin/Rscript.exe" watch-test.R
# (tests VS Code setup\R\watch.R; set WATCH_FILE to test another copy)
# Fakes the transport: notify_client writes each notification into `sent`.
watch_file <- Sys.getenv("WATCH_FILE")
if (!nzchar(watch_file)) watch_file <- "watch.R"
root <- file.path(Sys.getenv("APPDATA"), "Code/User/globalStorage/reditorsupport.r/sess")
libs <- list.files(root, pattern = "^library$", recursive = TRUE, include.dirs = TRUE, full.names = TRUE)
libs <- libs[dir.exists(file.path(libs, "sess"))]
if (!length(libs)) stop("no sess helper package found under ", root)
S <- libs[which.max(file.mtime(libs))]        # the newest install
cat("sess library:", S, "
")
library(sess, lib.loc = S)
ns <- asNamespace("sess")
rt <- get(".sess_env", ns)
rt$dataview_registry <- new.env(parent = emptyenv())
rt$dataviews <- list(); rt$tempdir <- tempdir(); rt$latest_plot_path <- file.path(tempdir(), "p.png")
sent <- list()
fake_notify <- function(method, params = list()) {
  sent[[length(sent) + 1]] <<- list(method = method, params = params)
  invisible(NULL)
}
unlockBinding("notify_client", ns); assign("notify_client", fake_notify, ns); lockBinding("notify_client", ns)
sess:::runtime_start(use_rstudioapi = FALSE, plot_backend = "standard")
options(watch.debug = TRUE)
source(watch_file)
refresh <- get(".refresh", as.environment("tools:watch"))
removeTaskCallback("watchView")      # Rscript runs task callbacks too; tick() runs it by hand
tick <- function() { sent <<- list(); refresh(NULL, NULL, TRUE, TRUE); invisible(sent) }
views <- function() vapply(sent, function(m) paste0(m$params$source, ":", m$params$title, "@", m$params$view_id), "")
shown <- function(id) rt$dataviews[[id]]$data
ok <- TRUE
check <- function(label, cond) { cat(if (isTRUE(cond)) "ok  " else "FAIL", label, "\n"); if (!isTRUE(cond)) ok <<- FALSE }
click <- function(name) { sent <<- list(); sess:::handle_workspace_view(name); sent[[1]]$params$view_id }  # Workspace panel click
put <- function(name, value) assign(name, value, envir = globalenv())

# 1. a table, opened from the Workspace panel, changes -> refreshed, same tab
put("df", data.frame(a = 1:3)); id_df <- click("df")
check("table opens as table view", sent[[1]]$params$source == "table")
tick(); check("unchanged table: nothing sent", length(sent) == 0)
put("df", data.frame(a = 1:4))
tick(); check("changed table refreshed in same tab", identical(views(), paste0("table:df@", id_df)))
check("tab now holds the new table", identical(shown(id_df), data.frame(a = 1:4)))

# 2. a single number (max_breads) open as preview
put("max_breads", 12); id_mb <- click("max_breads")
check("number opens as list view", sent[[1]]$params$source == "list")
tick(); check("unchanged number: nothing sent", length(sent) == 0)
put("max_breads", 15)
tick(); check("changed number refreshed in same tab", identical(views(), paste0("list:max_breads@", id_mb)))
check("navigation says vector", isTRUE(sent[[1]]$params$navigation$vector))
check("tab now holds 15", identical(shown(id_mb), 15))
tick(); check("second tick quiet", length(sent) == 0)

# 3. a vector (ans_4_1c), a text, a list
put("ans_4_1c", c(12, 300)); id_v <- click("ans_4_1c")
put("ans_4_1c", c(15, 300))
tick(); check("vector refreshed", identical(views(), paste0("list:ans_4_1c@", id_v)))
put("txt", "Anna"); id_t <- click("txt"); put("txt", "Bob")
tick(); check("text refreshed", identical(views(), paste0("list:txt@", id_t)))
put("lst", list(a = 1, b = "x")); id_l <- click("lst")
put("lst", list(a = 2, b = "x"))
tick(); check("list refreshed", identical(views(), paste0("list:lst@", id_l)))

# 4. learn: 1x1 tibble open as table, then becomes a text -> same tab, one-column table
put("learn", data.frame(value = "Anna")); id_lt <- click("learn")
check("1x1 table opens as table", sent[[1]]$params$source == "table")
put("learn", "C7 text")
tick()
check("table -> text: same table tab refreshed", identical(views(), paste0("table:learn@", id_lt)))
check("table -> text: tab shows one-column table", identical(shown(id_lt), data.frame(learn = "C7 text", stringsAsFactors = FALSE)))
tick(); check("after switch quiet", length(sent) == 0)
put("learn", "other")
tick(); check("text change refreshed in table tab", identical(views(), paste0("table:learn@", id_lt)))
put("learn", data.frame(value = 1:2))
tick(); check("back to a table: same tab", identical(views(), paste0("table:learn@", id_lt)) && identical(shown(id_lt), data.frame(value = 1:2)))

# 5. n: number open as list tab, then becomes a table -> note in the list tab + table opens in its own tab
put("n", 5); id_n <- click("n")
put("n", data.frame(k = 1:3))
tick()
check("number -> table: list tab gets a note", any(views() == paste0("list:n@", id_n)) && identical(shown(id_n), "n is now a table: see its own tab"))
tab_n <- sent[[which(startsWith(views(), "table:n@"))]]$params$view_id
check("number -> table: table opened in its own tab", length(tab_n) == 1 && tab_n != id_n && identical(shown(tab_n), data.frame(k = 1:3)))
tick(); check("after switch quiet", length(sent) == 0)
put("n", data.frame(k = 1:4))
tick(); check("table change refreshes only the table tab", identical(views(), paste0("table:n@", tab_n)))

# 6. closed tab (dispose) -> no refresh
st <- rt$dataviews[[id_mb]]
sess:::handle_dataview_dispose(list(view_id = id_mb, state_generation = st$state_generation))
put("max_breads", 99)
tick(); check("closed preview not refreshed", !any(startsWith(views(), "list:max_breads")))

# 7. a function is left alone; removed object skipped; NULL skipped; factor / Date fine
put("f", function(x) x); click("f")
put("f", function(x) x + 1)
tick(); check("function not re-sent", length(sent) == 0)
rm("lst", envir = globalenv()); tick(); check("removed object skipped", length(sent) == 0)
put("ans_4_1c", NULL); tick(); check("NULL value leaves the tab alone", length(sent) == 0)
put("txt", factor("a")); tick(); check("factor refreshed", identical(views(), paste0("list:txt@", id_t)))
put("txt", as.Date("2024-01-01")); tick(); check("Date refreshed", identical(views(), paste0("list:txt@", id_t)))
put("learn", as.Date("2024-01-01")); tick(); check("Date in a table tab", identical(views(), paste0("table:learn@", id_lt)))

cat("\nwatched():", paste(watched(), collapse = ", "), "\n")
if (!ok) quit(status = 1) else cat("ALL OK\n")
