import * as THREE from 'three';
import { MarketAnnotations } from '../../src/game/MarketAnnotations';
import { MarketAnnotations as Reference } from './reference-annotations';
import type { Row } from '../../src/game/Obstacles';

export async function compareAnnotations(source: Row[]) {
  const current = new MarketAnnotations(new THREE.Group());
  const reference = new Reference(new THREE.Group());
  await Promise.all([current.ready, reference.ready]);
  const equal = (a: ArrayLike<number>, b: ArrayLike<number>, length: number, name: string) => {
    for (let i = 0; i < length; i++)
      if (a[i] !== b[i]) throw Error(`${name}[${i}]: ${a[i]} != ${b[i]}`);
  };
  let cases = 0;
  const rows = structuredClone(source);
  rows[1].kind = 'moving';
  rows[1].lateral = -1.2;
  rows[0].periods = [{ label: 'Jan 2026', index: 0, date: '2026-01-01' }];
  for (const z of [-100, -28, -9, 0, 6, 20])
    for (const portrait of [false, true])
      for (const reverse of [false, true])
        for (const show of [false, true]) {
          rows.forEach((row, index) => {
            row.z = z - index * 16;
            row.age += 0.3;
          });
          for (const annotations of [reference, current])
            annotations.update(rows, show, reverse, portrait);
          if (JSON.stringify(current.labels) !== JSON.stringify(reference.labels))
            throw Error('Labels differ');
          const count = reference.mesh.geometry.drawRange.count;
          if (current.mesh.geometry.drawRange.count !== count) throw Error('Glyph counts differ');
          for (const key of ['position', 'uv', 'color', 'glyphOpacity']) {
            const a = current.mesh.geometry.attributes[key],
              b = reference.mesh.geometry.attributes[key];
            equal(a.array, b.array, count * a.itemSize, key);
          }
          if (current.badges.count !== reference.badges.count) throw Error('Badge counts differ');
          equal(
            current.badges.instanceMatrix.array,
            reference.badges.instanceMatrix.array,
            reference.badges.count * 16,
            'matrix',
          );
          equal(
            current.badges.geometry.attributes.badgeOpacity.array,
            reference.badges.geometry.attributes.badgeOpacity.array,
            reference.badges.count,
            'badgeOpacity',
          );
          cases++;
        }
  // Reused row identity with edited label / width, and font-atlas rebuild invalidation.
  rows[0].columns[0].width *= 0.75;
  if (rows[0].columns[0].day) rows[0].columns[0].day.change = -1.25;
  for (const annotations of [current, reference])
    (annotations as unknown as { buildAtlas(): void }).buildAtlas();
  current.update(rows, true);
  reference.update(rows, true);
  equal(
    current.mesh.geometry.attributes.position.array,
    reference.mesh.geometry.attributes.position.array,
    reference.mesh.geometry.drawRange.count * 3,
    'edited-position',
  );
  for (const annotations of [current, reference]) {
    annotations.mesh.geometry.dispose();
    (annotations.mesh.material as THREE.Material).dispose();
    (annotations.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
    annotations.badges.geometry.dispose();
    (annotations.badges.material as THREE.Material).dispose();
  }
  return { cases, exactBuffers: true };
}
