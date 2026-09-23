# Releasing

Versions come from [Intentional](https://github.com/wyrd-company/intentional).
A change a consumer can notice carries an intent, written with
`intentional add` and committed with the change:

```bash
intentional add --release-unit t3code-client:minor --message "Describe the change for the changelog."
```

Before 1.0.0 the bump names map directly onto version components: `minor`
for new capability or a breaking change, `patch` for fixes.

## Cutting a release

1. Run `intentional status` on an up-to-date `main` and read the computed
   version.
2. Tag the tip of `main` with that version and push the tag:

   ```bash
   git tag 0.2.0
   git push origin 0.2.0
   ```

The **Release** workflow checks that the tag is the tip of `main` and that the
pending intents compute the same version, runs the full check, applies the
intents (version, changelog, intent removal), commits
`chore(release): t3code-client X.Y.Z` to `main`, and pushes the annotated
`t3code-client@X.Y.Z` release record. The commit and the record are pushed
together or not at all.

The **Publish** workflow starts from that record. It verifies the record
against `package.json`, runs the full check again, packs once, publishes the
tarball to npmjs with provenance, and creates the GitHub Release with the
tarball and the changelog section as notes.

## Tracking T3 Code

Each release targets the latest T3 Code release. To move to a new one:

1. Set the `t3` devDependency to the new version and install.
2. Run `pnpm run test:live` and compare the upstream contracts
   (`packages/contracts/src`) between the two releases. Update the schemas in
   `src/schemas/` and the RPC registry in `src/rpc/` to match.
3. Update the version named in `docs/design.md` and add an intent.

## Recovery

- **Release failed before the push.** Nothing reached the repository. Fix the
  cause on `main`, delete the version tag (`git push origin :refs/tags/X.Y.Z`),
  and tag again.
- **Publish failed.** Rerun the Publish workflow. An npm version or GitHub
  Release that already exists is verified, not recreated.

## Repository setup

| Secret                    | Used by | Purpose                                                   |
| ------------------------- | ------- | --------------------------------------------------------- |
| `WYRD_CI_APP_ID`          | Release | GitHub App that pushes the release commit and record      |
| `WYRD_CI_APP_PRIVATE_KEY` | Release | Key for that App                                          |
| `NPM_TOKEN`               | Publish | npmjs automation token with publish rights on the package |

The App needs Contents write on this repository. Pushes made with the workflow
token start no workflows, which is why the release record is pushed with the
App.

The first release needs the baseline record `t3code-client@0.0.0` on `main`,
created once with `intentional tag --baseline` after the Intentional
configuration is merged.
