// Downloads the CC0 assets (Poly Haven) used by the interior scene.
// usage: node tools/fetch-assets.mjs
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.polyhaven.com';
const OUT = 'assets/ph';
const TEXTURES = {
  marble_01: { res: '2k', maps: ['Diffuse', 'nor_gl', 'arm'] },
  curly_teddy_natural: { res: '1k', maps: ['Diffuse', 'nor_gl', 'arm', 'Displacement'] },
  beige_wall_002: { res: '1k', maps: ['Diffuse', 'nor_gl', 'arm'] },
  poly_wool_herringbone: { res: '1k', maps: ['Diffuse', 'nor_gl', 'arm'] },
  terlenka: { res: '1k', maps: ['Diffuse', 'nor_gl'] },
  oak_wood_planks: { res: '1k', maps: ['Diffuse', 'nor_gl', 'arm'] },
};
const MODELS = {
  Sofa_01: '1k', modern_wooden_cabinet: '1k', potted_plant_02: '1k', potted_plant_04: '1k',
  hanging_picture_frame_02: '1k', modern_ceiling_lamp_01: '1k', ceramic_vase_01: '1k',
  side_table_01: '1k', wicker_basket_01: '1k', standing_picture_frame_01: '1k',
};
const HDRIS = { balcony: '2k' };

async function get(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === 4) throw e;
      await new Promise((res) => setTimeout(res, 2000 * 2 ** i));
    }
  }
}
async function save(url, file) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await get(url));
  console.log('  ', file);
}
const credits = [];
async function info(id) {
  const j = JSON.parse((await get(`${API}/info/${id}`)).toString());
  credits.push(`- **${j.name}** (\`${id}\`) by ${Object.keys(j.authors || {}).join(', ')} — https://polyhaven.com/a/${id} (CC0)`);
}

for (const [id, { res, maps }] of Object.entries(TEXTURES)) {
  console.log('texture', id);
  const files = JSON.parse((await get(`${API}/files/${id}`)).toString());
  for (const m of maps) {
    const f = files[m]?.[res]?.jpg || files[m]?.[res]?.png;
    if (!f) { console.log('   missing', m); continue; }
    await save(f.url, `${OUT}/${id}/${path.basename(f.url)}`);
  }
  await info(id);
}
for (const [id, res] of Object.entries(MODELS)) {
  console.log('model', id);
  const files = JSON.parse((await get(`${API}/files/${id}`)).toString());
  if (!files.gltf) { console.log('   no gltf, skipped'); continue; }
  const g = files.gltf[res].gltf;
  await save(g.url, `${OUT}/${id}/${path.basename(g.url)}`);
  for (const [rel, inc] of Object.entries(g.include || {})) await save(inc.url, `${OUT}/${id}/${rel}`);
  await info(id);
}
for (const [id, res] of Object.entries(HDRIS)) {
  console.log('hdri', id);
  const files = JSON.parse((await get(`${API}/files/${id}`)).toString());
  const f = files.hdri[res].hdr;
  await save(f.url, `${OUT}/${id}/${path.basename(f.url)}`);
  await info(id);
}
fs.writeFileSync(`${OUT}/CREDITS.md`, `# Third-party assets\n\nAll assets below come from [Poly Haven](https://polyhaven.com) and are released under **CC0** (public domain).\n\n${credits.join('\n')}\n`);
console.log('done');
