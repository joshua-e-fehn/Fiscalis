# Fiscalis on mya-mini

Fiscalis is installed at `/Users/mya/Developer/Fiscalis` on `mya-mini`.
Use that repository folder as the remote Codex project. The MacBook project
currently points one folder above its repository; the mini uses the Git root.

## Continue coding from either device

In Codex on the MacBook, select the connected `mya-mini` host and add
`/Users/mya/Developer/Fiscalis` as a project. Choose the mini's Remote Control
connection when available so work lives on the always-on host. The project was
prepared through SSH; saving it in Codex requires this app step because the
available project tools cannot add saved projects.

On the phone, open ChatGPT's Codex/Remote view, choose `mya-mini`, and use the
Fiscalis project there. If the mini is absent, pair the phone with the mini
through Settings > Connections > Control this Mac > Add on the host. Use the
same account and workspace. Existing phone pairing has not been verified by
this project setup.

Remote chats execute on the mini; closing the MacBook does not stop them. This
setup chat itself remains on the MacBook. To move an existing chat, save the
matching Git-root project on both hosts and use the chat's run-location menu to
hand it off. The active chat cannot hand itself off through the agent tool.

Official device setup and handoff guide:
[Remote connections](https://learn.chatgpt.com/docs/remote-connections).

## Private development preview

A user LaunchAgent, `com.mya.fiscalis-dev`, runs the frontend at
`http://localhost:3100` on the mini. It starts at user login and restarts if the
process exits. The mini already has automatic idle sleep disabled. It still
needs power, network access, and a logged-in user session; recovery after a
restart/FileVault unlock was not tested.

On the MacBook, run:

```sh
fiscalis-mini preview
```

Leave that terminal open and visit `http://localhost:3100`. Ctrl-C closes the
tunnel; the frontend continues running on the mini. This tunnel only binds to
the MacBook's loopback address. Codex Remote Control does not itself forward
the app's HTTP port to a phone.

Other installed MacBook helper commands:

```sh
fiscalis-mini status
fiscalis-mini shell
```

The helper is installed at `/Users/atlas/.local/bin/fiscalis-mini`.
Its source and the LaunchAgent template are in `scripts/mac-mini/`. Reinstall
the helper on the MacBook with `install -m 700 scripts/mac-mini/fiscalis-mini
~/.local/bin/fiscalis-mini`. The template contains the installed mini account's
absolute paths; adjust those if using another account or checkout location.

The service uses `--hostname localhost` while listening on loopback only. Next
normalizes loopback IP request URLs to `localhost`; using `127.0.0.1` as the
server hostname caused Clerk's request rewrite to enter a failing proxy path.
The remote `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3100` to keep
the app's API client on the same origin as this private preview. The MacBook's
environment file was left unchanged.

On the mini:

```sh
# Restart the preview after a configuration change.
launchctl kickstart -k gui/$(id -u)/com.mya.fiscalis-dev

# Follow the preview's output.
tail -f ~/.local/state/fiscalis/dev.log ~/.local/state/fiscalis/dev.error.log

# Stop the preview until the next login or manual bootstrap.
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.mya.fiscalis-dev.plist

# Start it again after bootout.
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mya.fiscalis-dev.plist
```

Stop the LaunchAgent before doing another production build: development and
production builds share the frontend's `.next` directory.

## Dependencies and verification

The setup used Bun 1.4.3 and Node 24.22.0. Both packages installed with
`bun install --no-save`: the committed binary lockfiles are out of sync with
their manifests and reject `--frozen-lockfile`. The installation left the
package manifests and lockfiles unchanged. Future installs can resolve newer
versions allowed by the manifests; repairing the lockfiles is separate work.
Bun left Clerk's optional postinstall script blocked; the build and preview
were checked with that default intact.

```sh
cd /Users/mya/Developer/Fiscalis/services
bun run test --run

cd ../frontend
bunx next build --webpack
```

On 1 November 2026, all 148 tests in seven files passed, and the webpack
production build completed, including TypeScript checking and 50 static pages.
The build used the copied Convex generated files instead of the normal build
script's codegen step. No Convex deploy, backend development sync, database
migration, provider sync, or signed-in financial workflow was run.

The clone started from merged commit `b9f1654` on a dedicated
`codex/mac-mini-setup` branch. The MacBook's untracked
`docs/VALUATION_RESOLUTION_PLAN.md` and `.vscode/settings.json` were copied to
the mini and remain uncommitted. The existing ignored `.env.local` and Convex
generated files were transferred directly over SSH; the environment file is
mode 600 and remains ignored. Dependency folders and build caches were
recreated on the mini.

The live preview returned HTTP 200 with page title `Fiscalis`, both directly on
the mini and through the private MacBook SSH tunnel. The static icon also
returned HTTP 200. These are public-page checks; signed-in account access
and financial data workflows still need verification in the user's browser.
