const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Only these game files may become part of the public website.
const files = [
  'index.html', 'style.css', 'engine.js', 'game.js', 'assets/bounds.js',
  ...['brown', 'gray', 'mugi', 'mocha', 'yuzu', 'meadow'].map(id => `assets/${id}.png`),
];
fs.rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Built ${files.length} game files into dist/`);
