# Publication assets

The mod catalog uses the H1 and first paragraph of `RECIPE.md`:

- Title: `Run Make, Just & package scripts` (32 characters).
- Description: Ciupaga finds tasks in Make, Just, Task, Mise, package.json, Composer and Deno files and runs them from a picker in Herdr. Start a build, test suite or dev server without typing its command. Switch task sources, search the list, and star the commands you use most. Tasks run in the background after you close the picker; return to check their status, cancel a run or open its console in a tab or split pane. Just tasks with declared parameters get an argument form. Keep the picker in a popover, sidebar, tab or pane. Runners must already be installed on the project machine; Ciupaga does not install them.

`preview.png` currently uses proposal 2. All proposals are 1672 by 941 pixels:

| Proposal | Illustration | Native view |
| --- | --- | --- |
| [1](images/previews/preview-1.png) | Shepherd holding a ciupaga, with a sheep | Task list |
| [2](images/previews/preview-2.png) | Sheep beside a ciupaga | Task list |
| [3](images/previews/preview-3.png) | Ciupaga, satchel and sheep on a trail | Argument form |

Illustrations were generated for this repository. Typography and native
screenshots are composed separately, following Juhas, Kolczyk and Sakwa.
The screenshots show the real Ciupaga renderer with synthetic in-memory sample
data. The displayed outcomes do not document executed tasks. The fixture
executes no tasks and does not change personal layouts or Ciupaga preferences.

## Rebuild a preview

On Windows, from the repository root:

```powershell
./scripts/create-preview.ps1 -Variant 2
Copy-Item docs/images/previews/preview-2.png preview.png
```

The composition script uses the committed backgrounds and screenshots. It
requires Windows PowerShell or PowerShell on Windows with System.Drawing.
These tools are for publication only; the mod does not depend on them.

## Capture native screenshots

With Herdr open, run `node scripts/capture-preview.mjs tasks` or
`node scripts/capture-preview.mjs arguments`. Each creates a separate temporary
mod named `ciupaga-marketing-tasks` or `ciupaga-marketing-arguments` in the app home.
It refuses to overwrite an existing folder. The original Ciupaga mod is untouched.

Use `herdr-app shot <file.png>`, wait for the file to be written, and crop to
the overlay alone before adding the image to the repository. The task overlay
is 620 by 510 logical pixels; the argument overlay is 620 by 620. Captured images
omit two pixels on each edge. A full window capture may include personal data;
keep it outside the repository. Close with `herdr-app do overlay.close`, then
remove only the fixture folder you created. Do not run both fixtures at once.

## GitHub About

Description:

> Ciupaga runs Make, Just, Task, Mise and package.json tasks from a picker in Herdr. Start builds, tests and dev servers, check their status, and open the console for output.

Topics: `herdr`, `herdr-mod`, `task-runner`, `developer-tools`, `gpui`, `just`,
`make`, `taskfile`, `mise`, `npm-scripts`.

The repository uses Apache 2.0, with Robert Gonek's copyright in `NOTICE`.
The package declares Apache-2.0 and includes LICENSE, NOTICE and Lucide's upstream notice.
The packaging script includes README screenshots; alternate posters and their
source backgrounds stay in the repository.
