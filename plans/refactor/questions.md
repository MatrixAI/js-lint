I noticed that shellcheck run also depend on `find`. I wonder if that's a good idea, since that means `find` also must exist in the environment to run it... what do you think we should do about that?

I also think the lint.ts code @/src/bin/lint.ts is werid with `mainWithDeps`, I don't quite like it. Can you rewrite that script so that only `main` exists, and then explain if in the tests you actually need it? Like can you not make use of jest mocking to do any necessary injection?
