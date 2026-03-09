/**
 * TSL weapon holofoil material — thin-film iridescence + fresnel rim.
 *
 * Enhances the base MeshPhysicalMaterial with TSL-driven effects:
 *   - Fresnel-based rim glow (ice-blue)
 *   - Thin-film iridescence (thickness 1.5–2.5, driven by view angle)
 *   - Subtle temporal noise for shimmer
 *   - Chromatic RGB offset on edges (spectral dispersion approximation)
 *
 * Uses MeshPhysicalNodeMaterial so we keep all PBR features (maps,
 * clearcoat, environment IBL) while adding custom effects via TSL nodes.
 *
 * Works on both WebGPU and WebGL2 backends via WebGPURenderer.
 */

// @ts-nocheck — Three.js TSL types are JS-only (JSDoc), not .d.ts
import {
  uniform,
  float,
  vec3,
  Fn,
  normalView,
  positionViewDirection,
  timerLocal,
  sin,
  cos,
  mul,
  add,
  sub,
  pow,
  clamp,
  mix,
  dot,
  abs,
  max,
  min,
  hash,
  positionWorld,
} from "three/tsl";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import { Color, FrontSide } from "three";

export interface WeaponHoloUniforms {
  opacity: { value: number };
  iridescenceStrength: { value: number };
  rimStrength: { value: number };
}

/**
 * Create a TSL-enhanced weapon material with holofoil iridescence.
 *
 * The material starts with standard MeshPhysicalMaterial PBR properties
 * and adds TSL emissive nodes for the holofoil effect.
 */
export function makeWeaponMaterialTSL(): {
  material: InstanceType<typeof MeshPhysicalNodeMaterial>;
  uniforms: WeaponHoloUniforms;
} {
  const uOpacity = uniform(0);
  const uIridescence = uniform(0.6);
  const uRimStrength = uniform(0.45);

  const mat = new MeshPhysicalNodeMaterial({
    color: new Color(0xffffff),
    roughness: 0.65,
    metalness: 0.08,
    transparent: true,
    depthWrite: true,
    envMapIntensity: 2.4,
    clearcoat: 0.18,
    clearcoatRoughness: 0.08,
    side: FrontSide,
    // Built-in iridescence from MeshPhysicalMaterial
    iridescence: 0.4,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [200, 600],
  });

  mat.opacityNode = uOpacity;

  // Emissive holofoil: fresnel rim + temporal shimmer
  mat.emissiveNode = Fn(() => {
    // Fresnel: stronger glow at grazing angles
    const NdotV = dot(normalView, positionViewDirection).clamp(0, 1);
    const fresnel = pow(float(1.0).sub(NdotV), float(3.5));

    // Temporal noise shimmer
    const t = timerLocal(1.0);
    const shimmer = sin(t.mul(2.3).add(positionWorld.x.mul(8.0)))
      .mul(0.5)
      .add(0.5)
      .mul(0.15)
      .add(0.85);

    // Ice-blue rim glow
    const rimColor = vec3(0.72, 0.94, 1.0);
    const rimGlow = rimColor.mul(fresnel).mul(uRimStrength).mul(shimmer);

    // Iridescent color shift based on view angle
    const iriPhase = NdotV.mul(6.28).add(t.mul(0.4));
    const iriR = sin(iriPhase).mul(0.5).add(0.5);
    const iriG = sin(iriPhase.add(2.09)).mul(0.5).add(0.5);
    const iriB = sin(iriPhase.add(4.19)).mul(0.5).add(0.5);
    const iriColor = vec3(iriR, iriG, iriB).mul(fresnel).mul(uIridescence).mul(0.3);

    return rimGlow.add(iriColor);
  })();

  const uniforms: WeaponHoloUniforms = {
    opacity: uOpacity as unknown as { value: number },
    iridescenceStrength: uIridescence as unknown as { value: number },
    rimStrength: uRimStrength as unknown as { value: number },
  };

  return { material: mat, uniforms };
}
