{
  lint,
  src,
  npmDeps,
  npmDepsFetcherVersion,
}:
lint.mkCheck {
  inherit src;
  npmDependencies = {
    inherit npmDeps npmDepsFetcherVersion;
  };
  setup = "npm run prepare";
}
