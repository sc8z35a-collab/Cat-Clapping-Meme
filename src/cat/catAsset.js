// Loads the generated cat (assets/cat/cat.json + cat.bin) and builds skeleton + geometries.
import * as THREE from 'three';
import { assetURL } from '../assets.js';

// De-interleave 4-component packed vectors into standalone 3-component attributes.
// (InterleavedBufferAttributes that view one shared ArrayBuffer break BufferGeometry.clone.)
function packedVec3(Type, buf, offset, count) {
  const src = new Type(buf, offset, count * 4);
  const dst = new Type(count * 3);
  for (let i = 0; i < count; i++) { dst[i * 3] = src[i * 4]; dst[i * 3 + 1] = src[i * 4 + 1]; dst[i * 3 + 2] = src[i * 4 + 2]; }
  return new THREE.BufferAttribute(dst, 3, true);
}
const i16x4Attr = (buf, offset, count) => packedVec3(Int16Array, buf, offset, count);

export async function loadCatAsset(base = 'assets/cat/') {
  const [json, buf] = await Promise.all([
    fetch(base + 'cat.json').then((r) => r.json()),
    fetch(assetURL(base + 'cat.bin')).then((r) => r.arrayBuffer()),
  ]);
  // ---------------------------------------------------------------- skeleton
  const bones = [];
  const byName = {};
  const restWorld = {};
  for (const b of json.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    byName[b.name] = bone;
    restWorld[b.name] = new THREE.Vector3(...b.pos);
    bones.push(bone);
  }
  for (const b of json.bones) {
    const bone = byName[b.name];
    if (b.parent) {
      byName[b.parent].add(bone);
      bone.position.copy(restWorld[b.name]).sub(restWorld[b.parent]);
    } else bone.position.copy(restWorld[b.name]);
  }
  // ---------------------------------------------------------------- body
  const B = json.body;
  const n = B.vertexCount;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, B.position, n * 3), 3));
  geo.setAttribute('normal', i16x4Attr(buf, B.normal, n));
  geo.setAttribute('comb', packedVec3(Int8Array, buf, B.comb, n));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(buf, B.skinIndex, n * 4), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(buf, B.skinWeight, n * 4), 4, true));
  geo.setAttribute('col', new THREE.BufferAttribute(new Uint8Array(buf, B.color, n * 4), 4, true));
  geo.setAttribute('furp', new THREE.BufferAttribute(new Uint8Array(buf, B.params, n * 4), 4, true));
  geo.setAttribute('extra', new THREE.BufferAttribute(new Uint8Array(buf, B.extra, n * 4), 4, true));
  geo.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(buf, B.grinPosition, n * 3), 3)];
  geo.morphAttributes.normal = [new THREE.BufferAttribute(new Float32Array(buf, B.grinNormal, n * 3), 3)];
  geo.morphTargetsRelative = true;
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, B.index, B.indexCount), 1));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 0.1;

  // fur shells use a lighter index buffer over the same vertices
  const furGeo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) furGeo.setAttribute(name, attr);
  furGeo.morphAttributes = geo.morphAttributes;
  furGeo.morphTargetsRelative = true;
  furGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, B.furIndex, B.furIndexCount), 1));
  furGeo.boundingSphere = geo.boundingSphere.clone();

  // ---------------------------------------------------------------- rigid parts
  const rigidGeo = (m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, m.position, m.vertexCount * 3), 3));
    g.setAttribute('normal', i16x4Attr(buf, m.normal, m.vertexCount));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, m.index, m.indexCount), 1));
    if (m.tdata !== undefined) g.setAttribute('tdata', new THREE.BufferAttribute(new Float32Array(buf, m.tdata, m.vertexCount * 2), 2));
    return g;
  };
  const teethUpper = rigidGeo(json.teeth.upper);
  const teethLower = rigidGeo(json.teeth.lower);
  const L = json.lips;
  const lipsGeo = new THREE.BufferGeometry();
  lipsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, L.position, L.vertexCount * 3), 3));
  lipsGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, L.uv, L.vertexCount * 2), 2));
  lipsGeo.setAttribute('side', new THREE.BufferAttribute(new Float32Array(buf, L.side, L.vertexCount), 1));
  const openPos = new Float32Array(buf, L.openPosition, L.vertexCount * 3);
  const closedPos = new Float32Array(buf, L.position, L.vertexCount * 3);
  const delta = new Float32Array(L.vertexCount * 3);
  for (let i = 0; i < delta.length; i++) delta[i] = openPos[i] - closedPos[i];
  lipsGeo.morphAttributes.position = [new THREE.BufferAttribute(delta, 3)];
  lipsGeo.morphTargetsRelative = true;
  lipsGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, L.index, L.indexCount), 1));
  // normals of the open state for shading, computed once
  const tmp = new THREE.BufferGeometry();
  tmp.setAttribute('position', new THREE.BufferAttribute(openPos.slice(), 3));
  tmp.setIndex(lipsGeo.index);
  tmp.computeVertexNormals();
  lipsGeo.setAttribute('normal', tmp.getAttribute('normal'));

  return { json, bones, byName, restWorld, geo, furGeo, teethUpper, teethLower, lipsGeo };
}
