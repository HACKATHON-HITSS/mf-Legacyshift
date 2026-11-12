import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const outputDir = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(process.cwd(), 'dist', 'mf-PR-Guardian-AI', 'browser');

const indexHtmlPath = join(outputDir, 'index.html');
const remoteEntryPath = join(outputDir, 'remoteEntry.json');
const remoteAssetsPath = join(outputDir, 'remote-assets.json');

const indexHtml = await readFile(indexHtmlPath, 'utf8');
const styleHrefs = Array.from(
  indexHtml.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)
)
  .map((match) => match[1])
  .filter((href, index, all) => {
    const isRemoteAsset = !/^(?:[a-z]+:)?\/\//i.test(href);
    return isRemoteAsset && all.indexOf(href) === index;
  });

// Update remoteEntry.json with styles
const remoteEntry = JSON.parse(await readFile(remoteEntryPath, 'utf8'));
remoteEntry.styles = styleHrefs;
await writeFile(remoteEntryPath, `${JSON.stringify(remoteEntry, null, 2)}\n`, 'utf8');

const manifest = {
  styles: styleHrefs
};
await writeFile(remoteAssetsPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Added styles to remoteEntry.json: ${JSON.stringify(styleHrefs)}`);
console.log(`Generated remote assets manifest at ${remoteAssetsPath}`);
