# install-packages.R  --  installs the R packages listed in R/packages.txt
# that this laptop does not have yet. Run by install.ps1 (INSTALL.cmd):
#   Rscript --vanilla install-packages.R "<setup folder>/R/packages.txt"

package_file <- commandArgs(trailingOnly = TRUE)[1]
wanted <- readLines(package_file)

# Packages go to the user library; R does not create that folder by itself
user_library <- Sys.getenv("R_LIBS_USER")
dir.create(user_library, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(user_library, .libPaths()))

have <- rownames(installed.packages())
missing <- setdiff(wanted, have)

if (length(missing) == 0) {
  cat("All", length(wanted), "R packages are already installed.\n")
} else {
  cat("Installing", length(missing), "R packages. This can take 10-20 minutes.\n")
  install.packages(missing, lib = user_library, repos = "https://cloud.r-project.org")
}
