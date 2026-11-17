# System Map

[Open System Map](https://ppastabtw.github.io/systems-design-map-maker/) to turn a repository into an architecture overview and focused diagrams. Paste a public GitHub URL or open a local project folder. Choose a view above the canvas and select a component to see the files behind it.

The analyzer runs in your browser. Public GitHub repositories are fetched directly from GitHub. Local folders stay on your device, including private checkouts. There is no account or API key to configure.

The built-in example is a curated map of [Neural Network Playground](https://github.com/ppastabtw/Neural-Network-Playground). Its **Build**, **Train**, **Test & export**, and **Hosting** views link to source files at the revision they describe. The views available for a fresh scan depend on its source evidence. Downloads use the selected view.

- **Excalidraw** exports an editable drawing. Open the `.excalidraw` file in [Excalidraw](https://excalidraw.com/).
- **SVG** exports a standalone image for project pages and READMEs.
- **CLI** writes both formats and a JSON map with source evidence.

## Run locally

Requires Node.js 22 or newer.

```sh
git clone https://github.com/ppastabtw/systems-design-map-maker.git
cd systems-design-map-maker
npm ci
npm start
```

Open [the local preview](http://127.0.0.1:4173/). Opening `web/index.html` from disk takes you to the [hosted app](https://ppastabtw.github.io/systems-design-map-maker/). Run `npm test` for the analyzer and export checks or `npm run build` to build the static browser app into `dist/`.

## Generate a portfolio diagram

```sh
npm run map -- ../my-project --out output/my-project
```

You can also pass a public GitHub URL to the CLI. It reads from the repository's default branch and pins the fetched files to the commit it inspected. A local checkout lets you choose any revision or include working-tree changes.

The CLI prints the available view IDs. Add `--view <id>` to export a specific diagram, and use a separate output directory when keeping multiple views.

Copy `system-map.svg` to your portfolio's static assets and render it as an image. The app generates the diagram ahead of time so your portfolio can serve it like any other image.

```html
<img src="/projects/my-project/system-map.svg" alt="System architecture of My Project">
```

## What the map can infer

System Map samples source files, package manifests, and deployment configuration to find applications, APIs, workers, and infrastructure. It traces matching route definitions and client requests through local imports to produce workflow views. When that evidence is sparse, it looks for source modules, folders, or component connections. Each view provides source evidence, and dashed arrows show inferred connections. The analysis uses fixed rules and runs locally.

The map is a starting point for review. Custom layouts, unrecognized stacks, and runtime or infrastructure defined outside a repo can leave gaps. Large trees are sampled and maps show up to 12 components. GitHub's anonymous API has request limits. A local checkout is an alternative when the repository is private or GitHub limits requests.

Inspired by [Docbot](https://github.com/ariobarin/docbot).
The diagram uses [Rough.js](https://roughjs.com/) and [Excalifont](https://plus.excalidraw.com/excalifont), distributed under its [SIL Open Font License](assets/Excalifont-OFL.txt).
