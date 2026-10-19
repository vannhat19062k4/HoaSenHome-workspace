const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../truck/truck.js'), 'utf8');
const match = source.match(/function boxMesh\(p\) \{[\s\S]*?\n\}/);
assert.ok(match, 'boxMesh must exist');
const mesh = vm.runInNewContext(`${match[0]}; boxMesh({x: 2, y: 3, z: 4, lx: 1.7, ly: .5, lz: .3})`);
assert.equal(mesh.i.length, 12);

const faceCounts = new Map();
let surfaceArea = 0;
for (let n = 0; n < mesh.i.length; n++) {
  const vertices = [mesh.i[n], mesh.j[n], mesh.k[n]].map(index => [mesh.x[index], mesh.y[index], mesh.z[index]]);
  const face = ['x', 'y', 'z'].flatMap((axis, index) => {
    const values = vertices.map(point => point[index]);
    return values.every(value => Math.abs(value - values[0]) < 1e-9) ? [`${axis}:${values[0].toFixed(3)}`] : [];
  });
  assert.equal(face.length, 1, `triangle ${n} must lie on exactly one box face`);
  faceCounts.set(face[0], (faceCounts.get(face[0]) || 0) + 1);
  const [a, b, c] = vertices;
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  surfaceArea += Math.hypot(...cross) / 2;
}
assert.equal(faceCounts.size, 6, 'all six faces must be present');
assert.ok([...faceCounts.values()].every(count => count === 2), 'each face must have two triangles');
assert.ok(Math.abs(surfaceArea - 2 * (1.7 * .5 + 1.7 * .3 + .5 * .3)) < 1e-9);
console.log('Box mesh has six complete faces and correct surface area.');
