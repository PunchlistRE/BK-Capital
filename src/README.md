# src/

`index.html` is built from these parts. Each part is one `<script>` or `<style>` block (or a run of page markup) of the original single file, in load order; the layered scripts depend on that order.

- `manifest.json` lists the parts in order, with the exact opening and closing tags for each.
- Edit a part here, then run `node build.js` to regenerate `index.html`. The built file is still committed and deployed as a single file.
- `node build.js --check` fails if `index.html` is out of date (CI runs it).
- Part names are `NNN-<script id>.js|css`. To add a block, add a file and an entry to `manifest.json`; renumber if you want to keep the order readable.
