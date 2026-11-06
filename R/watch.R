# watch.R  --  loaded by Rprofile.R in every VS Code R terminal (folder
# VS Code setup\R); the study units also source their own copy, study/watch.R.
#
# Makes the viewer tabs follow changes, like RStudio's View(): every
# object that is open in a viewer tab (clicked in the Workspace panel, or
# View(x)) is refreshed after each command in which it changed. Tables
# (data frames) and values (a number, a text, a vector, a list) alike.
# The tab is reused, not duplicated.
#
# When an object changes kind, the open tab follows as far as it can:
#   table tab, object becomes a value  -> the tab shows the value as a
#                                         one-column table
#   value tab, object becomes a table  -> the tab shows a one-line note
#                                         and the table opens in a new tab
#
# watch(x):   open x in the viewer (same as View(x)).
# watched():  names of the objects currently open in a viewer tab.

local({
    env <- new.env()

    # the R extension's helper package (sess) keeps a registry of the viewer
    # tabs: "table:<name>" / "list:<name>" -> view id, and
    # .sess_env$dataviews[[id]]$data is what the tab shows while it is open
    sess_env <- function() {
        test <- getOption("watch.sess_env")           # for offline tests
        if (!is.null(test)) return(test)
        if (!("sess" %in% loadedNamespaces())) return(NULL)
        ns <- asNamespace("sess")
        if (!exists(".sess_env", envir = ns, inherits = FALSE)) return(NULL)
        get(".sess_env", envir = ns, inherits = FALSE)
    }

    open_views <- function() {
        s <- sess_env()
        if (is.null(s) || is.null(s$dataview_registry)) return(list())
        keys <- ls(s$dataview_registry, all.names = TRUE)
        keys <- keys[grepl("^(table|list):", keys)]
        views <- list()
        for (key in keys) {
            id <- get(key, envir = s$dataview_registry)
            state <- if (is.null(s$dataviews)) NULL else s$dataviews[[id]]
            if (is.null(state)) next                    # tab was closed
            views[[length(views) + 1]] <- list(
                type = sub(":.*$", "", key),
                name = sub("^[a-z]+:", "", key),
                shown = state$data
            )
        }
        views
    }

    is_table <- function(x) is.data.frame(x) || is.matrix(x)
    is_value <- function(x) !is_table(x) && (is.atomic(x) || is.list(x))

    # what a tab of this type should show for the object now (NULL = leave it)
    to_show <- function(obj, type, name) {
        if (type == "table") {
            if (is_table(obj)) return(obj)
            if (is.atomic(obj)) {
                return(stats::setNames(data.frame(obj, stringsAsFactors = FALSE), name))
            }
            return(NULL)
        }
        if (is_value(obj)) return(obj)
        if (is_table(obj)) return(paste0(name, " is now a table: see its own tab"))
        NULL
    }

    env$watch <- function(x) {
        name <- deparse(substitute(x))
        View <- get("View", mode = "function")
        View(x, title = name)
        invisible(name)
    }
    env$watched <- function() unique(vapply(open_views(), `[[`, "", "name"))

    # one open tab: show the object as it is now, if that differs
    refresh_one <- function(v, View) {
        if (!exists(v$name, envir = globalenv(), inherits = FALSE)) return()
        obj <- get(v$name, envir = globalenv())
        shown <- to_show(obj, v$type, v$name)
        if (is.null(shown) || identical(shown, v$shown)) return()   # unchanged
        View(shown, title = v$name)            # same tab: same type:name key
        if (v$type == "list" && is_table(obj)) {
            View(obj, title = v$name)          # the table gets its own tab
        }
    }

    env$.refresh <- function(expr, value, ok, visible) {
        View <- get("View", mode = "function")
        for (v in open_views()) {
            tryCatch(refresh_one(v, View), error = function(e) {
                if (isTRUE(getOption("watch.debug"))) message("watch.R: ", conditionMessage(e))
            })
        }
        TRUE
    }
    removeTaskCallback("watchView")
    addTaskCallback(env$.refresh, name = "watchView")

    if ("tools:watch" %in% search()) detach("tools:watch")
    attach(env, name = "tools:watch", warn.conflicts = FALSE)
    message("Viewer tabs now follow changes (watch.R).")
})
