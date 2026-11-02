# Verification evidence

## Git-only staging patch 1.0.2

This patch carries the common npm-script development workflow, explicit lint
backend provisioning, identical generic lint configuration, and removal of the
obsolete GitHub workflows. All six libraries passed their lintfix commands in
the aligned Nix development environments before this dependency-pin update. The
final release graph receives a prepared archive build; broad runtime suites are
not repeated. Existing release tags remain immutable. No npm publication is
performed.
