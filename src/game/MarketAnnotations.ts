import { quoteOpacity } from './MobilePresentation';
import * as THREE from 'three';
import type { Day } from './MarketData';
import { columnPose, type Row, type Column } from './Obstacles';
import { B } from '../config/balance';
export interface PeriodMarker {
  label: string;
  index: number;
  date: string;
}
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function periodMarkers(days: Day[], previous: string): PeriodMarker[] {
  const markers: PeriodMarker[] = [];
  days.forEach((day, index) => {
    if (day.date.slice(0, 7) !== previous.slice(0, 7)) {
      const year = day.date.slice(0, 4);
      markers.push({
        label:
          months[Number(day.date.slice(5, 7)) - 1] +
          (year !== previous.slice(0, 4) ? ` ${year}` : ''),
        index,
        date: day.date,
      });
    }
    previous = day.date;
  });
  return markers;
}
export const changeLabel = (day: Day) => `${day.change > 0 ? '+' : ''}${day.change.toFixed(2)}`;
/** Per-glyph / per-instance alpha avoids separate materials for every quote. */
function fadeMaterial(material: THREE.MeshBasicMaterial, attribute: string) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float ${attribute};\nvarying float vQuoteOpacity;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvQuoteOpacity = ${attribute};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vQuoteOpacity;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a *= vQuoteOpacity;',
      );
  };
  material.customProgramCacheKey = () => `quote-fade-${attribute}`;
}
interface TextLayout {
  width: number;
  glyphs: {
    half: number;
    centerOffset: number;
    step: number;
    halfHeight: number;
    uv: Float32Array;
  }[];
}
const rightVertex = [false, true, true, false, true, false];
const topVertex = [false, false, true, false, true, true];
/** Local fonts, tightly spaced glyphs and one shared draw call for colored quote text. */
export class MarketAnnotations {
  mesh: THREE.Mesh;
  badges: THREE.InstancedMesh;
  labels: string[] = [];
  ready: Promise<void>;
  fontStatus: 'loading' | 'loaded' | 'fallback' = 'loading';
  private positions = new Float32Array(2048 * 18);
  private uvs = new Float32Array(2048 * 12);
  private colors = new Float32Array(2048 * 18);
  private opacity = new Float32Array(2048 * 6);
  private badgeOpacity = new Float32Array(128);
  private glyphs = new Map<string, { index: number; advance: number }>();
  private texture: THREE.CanvasTexture;
  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();
  private atlasRows = 4;
  // Weak keys release layouts as soon as their market rows leave the world.
  private layouts = new WeakMap<Row, Map<string, TextLayout>>();
  private quoteLabels = new WeakMap<
    Column,
    { change: number; direction: Day['direction']; label: string; text: string }
  >();
  constructor(stage: THREE.Group) {
    this.texture = new THREE.CanvasTexture(document.createElement('canvas'));
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const geometry = new THREE.BufferGeometry();
    for (const [key, data, size] of [
      ['position', this.positions, 3],
      ['uv', this.uvs, 2],
      ['color', this.colors, 3],
      ['glyphOpacity', this.opacity, 1],
    ] as const)
      geometry.setAttribute(
        key,
        new THREE.BufferAttribute(data, size).setUsage(THREE.DynamicDrawUsage),
      );
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: this.texture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    fadeMaterial(this.mesh.material as THREE.MeshBasicMaterial, 'glyphOpacity');
    this.badges = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x102832, transparent: true, depthWrite: false }),
      128,
    );
    this.badges.geometry.setAttribute(
      'badgeOpacity',
      new THREE.InstancedBufferAttribute(this.badgeOpacity, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.badges.renderOrder = 1;
    fadeMaterial(this.badges.material as THREE.MeshBasicMaterial, 'badgeOpacity');
    this.badges.count = 0;
    this.badges.frustumCulled = false;
    this.badges.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stage.add(this.badges, this.mesh);
    this.buildAtlas();
    this.ready = this.loadFonts();
  }
  private async loadFonts() {
    try {
      const fonts = await Promise.all([
        new FontFace('Flight Quote', `url("${import.meta.env.BASE_URL}fonts/RobotoMono.ttf")`, {
          weight: '500',
        }).load(),
        new FontFace('Flight Calendar', `url("${import.meta.env.BASE_URL}fonts/Manrope.ttf")`, {
          weight: '500',
        }).load(),
      ]);
      fonts.forEach((font) =>
        (document.fonts as FontFaceSet & { add(font: FontFace): FontFaceSet }).add(font),
      );
      this.fontStatus = 'loaded';
      this.buildAtlas();
    } catch {
      this.fontStatus = 'fallback';
    }
  }
  private buildAtlas() {
    const groups = [
      ['quote', '0123456789+-.▲▼ '],
      ['calendar', 'JanFebMarAprMayJunJulAugSepOctNovDec 0123456789'],
    ];
    const chars = groups.flatMap(([style, chars]) =>
      [...new Set(chars)].map((char) => ({ style, char })),
    );
    this.atlasRows = Math.ceil(chars.length / 16);
    const canvas = this.texture.image as HTMLCanvasElement;
    canvas.width = 1536;
    canvas.height = this.atlasRows * 128;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    this.glyphs.clear();
    this.layouts = new WeakMap();
    chars.forEach(({ style, char }, index) => {
      ctx.font =
        style === 'quote'
          ? '500 88px "Flight Quote", "Consolas", monospace'
          : '500 86px "Flight Calendar", "Segoe UI", sans-serif';
      const x = (index % 16) * 96 + 48,
        y = Math.floor(index / 16) * 128;
      const advance = ctx.measureText(char).width;
      if (char === '▲' || char === '▼') {
        ctx.beginPath();
        if (char === '▲') {
          ctx.moveTo(x - 22, y + 79);
          ctx.lineTo(x, y + 45);
          ctx.lineTo(x + 22, y + 79);
        } else {
          ctx.moveTo(x - 22, y + 45);
          ctx.lineTo(x + 22, y + 45);
          ctx.lineTo(x, y + 79);
        }
        ctx.closePath();
        ctx.fill();
      } else ctx.fillText(char, x, y + 94);
      this.glyphs.set(`${style}:${char}`, {
        index,
        advance: char === '▲' || char === '▼' ? 53 : advance,
      });
    });
    this.texture.needsUpdate = true;
  }
  private layout(row: Row, label: string, width: number, ground: boolean): TextLayout {
    let cache = this.layouts.get(row);
    if (!cache) this.layouts.set(row, (cache = new Map()));
    const key = `${ground}:${width}:${label}`;
    let layout = cache.get(key);
    if (layout) return layout;
    const style = ground ? 'calendar' : 'quote',
      tracking = ground ? 3 : 0;
    const glyphs = [...label].map((char) => this.glyphs.get(`${style}:${char}`)!);
    const total = glyphs.reduce((sum, glyph) => sum + glyph.advance + tracking, 0) - tracking;
    const scale = width / total;
    layout = {
      width,
      glyphs: glyphs.map((glyph) => {
        const u = (glyph.index % 16) / 16,
          v = 1 - (Math.floor(glyph.index / 16) + 1) / this.atlasRows,
          du = 1 / 16,
          dv = 1 / this.atlasRows;
        return {
          half: 48 * scale,
          centerOffset: (glyph.advance * scale) / 2,
          step: (glyph.advance + tracking) * scale,
          halfHeight: (128 * scale) / (ground ? 1 : B.visualHeightScale) / 2,
          uv: new Float32Array([u, v, u + du, v, u + du, v + dv, u, v, u + du, v + dv, u, v + dv]),
        };
      }),
    };
    cache.set(key, layout);
    return layout;
  }
  private writeText(
    row: Row,
    label: string,
    x: number,
    y: number,
    z: number,
    width: number,
    color: number,
    ground: boolean,
    opacity: number,
    count: number,
    angle = 0,
  ) {
    const layout = this.layout(row, label, width, ground);
    let cursor = x - width / 2;
    this.tint.setHex(color);
    for (const glyph of layout.glyphs) {
      if (count >= 2048) break;
      const center = cursor + glyph.centerOffset;
      const left = center - glyph.half,
        right = center + glyph.half;
      for (let k = 0; k < 6; k++) {
        const px = rightVertex[k] ? right : left;
        const py = topVertex[k] ? glyph.halfHeight : -glyph.halfHeight;
        const offset = count * 18 + k * 3;
        this.positions[offset] = ground
          ? px
          : x + (px - x) * Math.cos(angle) - py * Math.sin(angle);
        this.positions[offset + 1] = ground
          ? y
          : y + (px - x) * Math.sin(angle) + py * Math.cos(angle);
        this.positions[offset + 2] = ground ? z - py : z;
        this.colors[offset] = this.tint.r;
        this.colors[offset + 1] = this.tint.g;
        this.colors[offset + 2] = this.tint.b;
      }
      this.uvs.set(glyph.uv, count * 12);
      this.opacity.fill(opacity, count * 6, count * 6 + 6);
      cursor += glyph.step;
      count++;
    }
    return count;
  }
  update(rows: Row[], showChanges: boolean, reverse = false, portrait = false) {
    let count = 0,
      badges = 0;
    this.labels.length = 0;
    for (const r of rows) {
      const opacity = quoteOpacity(r.z, portrait);
      if (showChanges && opacity > 0)
        for (const c of r.columns) {
          const day = c.day ?? c.quoteDay;
          if (day && badges < 128) {
            const pose = columnPose(r, c);
            const offsetY = Math.max(0.8, c.height - 0.85) - c.height / 2;
            const x = pose.x - Math.sin(pose.angle) * offsetY,
              y = pose.y + Math.cos(pose.angle) * offsetY,
              z = r.z + B.thickness / 2;
            const up = reverse ? 0xff8292 : 0x68efd0,
              down = reverse ? 0x68efd0 : 0xff8292;
            let quote = this.quoteLabels.get(c);
            if (!quote || quote.change !== day.change || quote.direction !== day.direction) {
              const label = changeLabel(day);
              const arrow = day.direction === 'up' ? '▲ ' : day.direction === 'down' ? '▼ ' : '';
              quote = {
                change: day.change,
                direction: day.direction,
                label,
                text: arrow + label,
              };
              this.quoteLabels.set(c, quote);
            }
            this.labels.push(quote.label);
            const width = Math.min(c.width * 0.84, 3);
            this.dummy.position.set(x, y, z + 0.036);
            this.dummy.rotation.set(0, 0, pose.angle);
            this.dummy.scale.set(Math.min(c.width * 0.94, 3.4), 0.62 / B.visualHeightScale, 1);
            this.dummy.updateMatrix();
            this.badgeOpacity[badges] = opacity;
            this.badges.setMatrixAt(badges++, this.dummy.matrix);
            count = this.writeText(
              r,
              quote.text,
              x,
              y,
              z + 0.045,
              width,
              day.direction === 'up' ? up : day.direction === 'down' ? down : 0xc4d5df,
              false,
              opacity,
              count,
              pose.angle,
            );
          }
        }
      for (const marker of r.periods || []) {
        this.labels.push(marker.label);
        count = this.writeText(
          r,
          marker.label,
          0,
          0.035,
          r.z + B.rowSpacing * (0.4 - marker.index * 0.12),
          marker.label.length > 3 ? 6.4 : 3.6,
          0xa9c5d0,
          true,
          1,
          count,
        );
      }
    }
    this.badges.count = badges;
    this.badges.instanceMatrix.needsUpdate = true;
    this.badges.geometry.attributes.badgeOpacity.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, count * 6);
    for (const [key, size] of [
      ['position', 18],
      ['uv', 12],
      ['color', 18],
      ['glyphOpacity', 6],
    ] as const) {
      const attr = this.mesh.geometry.attributes[key] as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      if (count) attr.addUpdateRange(0, count * size);
      attr.needsUpdate = true;
    }
  }
}
