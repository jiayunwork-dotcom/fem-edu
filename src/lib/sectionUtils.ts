import type {
  SectionType,
  SectionRectParams,
  SectionCircleParams,
  SectionHollowCircleParams,
  SectionTShapeParams,
  SectionParams,
  SectionProperties,
  CrossSection,
  SectionValidationErrors
} from './types.js';

export function generateSectionId(): string {
  return 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function getSectionTypeLabel(type: SectionType): string {
  const map: Record<SectionType, string> = {
    rectangle: '矩形实心',
    circle: '圆形实心',
    hollowCircle: '空心圆管',
    tShape: 'T形截面'
  };
  return map[type];
}

export function getDefaultParams(type: SectionType): SectionParams {
  switch (type) {
    case 'rectangle':
      return { width: 100, height: 60 };
    case 'circle':
      return { diameter: 80 };
    case 'hollowCircle':
      return { outerDiameter: 100, innerDiameter: 60 };
    case 'tShape':
      return { flangeWidth: 120, flangeThickness: 15, webHeight: 80, webThickness: 12 };
  }
}

export function getParamLabels(type: SectionType): Record<string, string> {
  switch (type) {
    case 'rectangle':
      return { width: '宽度 b (mm)', height: '高度 h (mm)' };
    case 'circle':
      return { diameter: '直径 d (mm)' };
    case 'hollowCircle':
      return { outerDiameter: '外径 D (mm)', innerDiameter: '内径 d (mm)' };
    case 'tShape':
      return {
        flangeWidth: '翼缘宽度 B (mm)',
        flangeThickness: '翼缘厚度 t_f (mm)',
        webHeight: '腹板高度 h_w (mm)',
        webThickness: '腹板厚度 t_w (mm)'
      };
  }
}

export function computeRectangleProperties(p: SectionRectParams): SectionProperties {
  const { width: b, height: h } = p;
  const A = b * h;
  const Ix = (b * h ** 3) / 12;
  const Iy = (h * b ** 3) / 12;
  const Ip = Ix + Iy;
  const Wx = Ix / (h / 2);
  const Wy = Iy / (b / 2);
  return {
    area: A,
    Ix, Iy, Ip, Wx, Wy,
    centroidX: b / 2,
    centroidY: h / 2,
    maxX: b,
    maxY: h
  };
}

export function computeCircleProperties(p: SectionCircleParams): SectionProperties {
  const { diameter: d } = p;
  const r = d / 2;
  const A = Math.PI * r * r;
  const Ix = (Math.PI * d ** 4) / 64;
  const Iy = Ix;
  const Ip = Ix + Iy;
  const Wx = Ix / r;
  const Wy = Iy / r;
  return {
    area: A,
    Ix, Iy, Ip, Wx, Wy,
    centroidX: r,
    centroidY: r,
    maxX: d,
    maxY: d
  };
}

export function computeHollowCircleProperties(p: SectionHollowCircleParams): SectionProperties {
  const { outerDiameter: D, innerDiameter: d } = p;
  const R = D / 2, r = d / 2;
  const A = Math.PI * (R * R - r * r);
  const Ix = (Math.PI * (D ** 4 - d ** 4)) / 64;
  const Iy = Ix;
  const Ip = Ix + Iy;
  const Wx = Ix / R;
  const Wy = Iy / R;
  return {
    area: A,
    Ix, Iy, Ip, Wx, Wy,
    centroidX: R,
    centroidY: R,
    maxX: D,
    maxY: D
  };
}

export function computeTShapeProperties(p: SectionTShapeParams): SectionProperties {
  const { flangeWidth: B, flangeThickness: tf, webHeight: hw, webThickness: tw } = p;
  const H = tf + hw;

  const A1 = B * tf;
  const A2 = tw * hw;
  const A = A1 + A2;

  const y1 = hw + tf / 2;
  const y2 = hw / 2;

  const cy = (A1 * y1 + A2 * y2) / A;
  const cx = B / 2;

  const Ix1 = (B * tf ** 3) / 12 + A1 * (y1 - cy) ** 2;
  const Ix2 = (tw * hw ** 3) / 12 + A2 * (y2 - cy) ** 2;
  const Ix = Ix1 + Ix2;

  const Iy1 = (tf * B ** 3) / 12;
  const Iy2 = (hw * tw ** 3) / 12;
  const Iy = Iy1 + Iy2;

  const Ip = Ix + Iy;

  const yTop = H - cy;
  const yBottom = cy;
  const yMax = Math.max(yTop, yBottom);

  const xRight = B - cx;
  const xLeft = cx;
  const xMax = Math.max(xRight, xLeft);

  const Wx = Ix / yMax;
  const Wy = Iy / xMax;

  return {
    area: A,
    Ix, Iy, Ip, Wx, Wy,
    centroidX: cx,
    centroidY: cy,
    maxX: B,
    maxY: H
  };
}

export function computeSectionProperties(type: SectionType, params: SectionParams): SectionProperties {
  switch (type) {
    case 'rectangle':
      return computeRectangleProperties(params as SectionRectParams);
    case 'circle':
      return computeCircleProperties(params as SectionCircleParams);
    case 'hollowCircle':
      return computeHollowCircleProperties(params as SectionHollowCircleParams);
    case 'tShape':
      return computeTShapeProperties(params as SectionTShapeParams);
  }
}

export function validateSectionParams(type: SectionType, params: SectionParams): SectionValidationErrors {
  const errors: SectionValidationErrors = {};

  const checkPositive = (val: number, key: string, label: string) => {
    if (val === undefined || val === null || isNaN(val)) {
      errors[key] = `${label}不能为空`;
    } else if (val <= 0) {
      errors[key] = `${label}必须为正数`;
    }
  };

  switch (type) {
    case 'rectangle': {
      const p = params as SectionRectParams;
      checkPositive(p.width, 'width', '宽度');
      checkPositive(p.height, 'height', '高度');
      break;
    }
    case 'circle': {
      const p = params as SectionCircleParams;
      checkPositive(p.diameter, 'diameter', '直径');
      break;
    }
    case 'hollowCircle': {
      const p = params as SectionHollowCircleParams;
      checkPositive(p.outerDiameter, 'outerDiameter', '外径');
      checkPositive(p.innerDiameter, 'innerDiameter', '内径');
      if (p.outerDiameter > 0 && p.innerDiameter > 0 && p.innerDiameter >= p.outerDiameter) {
        errors.innerDiameter = '内径必须小于外径';
      }
      break;
    }
    case 'tShape': {
      const p = params as SectionTShapeParams;
      checkPositive(p.flangeWidth, 'flangeWidth', '翼缘宽度');
      checkPositive(p.flangeThickness, 'flangeThickness', '翼缘厚度');
      checkPositive(p.webHeight, 'webHeight', '腹板高度');
      checkPositive(p.webThickness, 'webThickness', '腹板厚度');
      if (p.flangeWidth > 0 && p.webThickness > 0 && p.flangeWidth <= p.webThickness) {
        errors.flangeWidth = '翼缘宽度必须大于腹板宽度';
      }
      break;
    }
  }

  return errors;
}

export function createSection(
  name: string,
  type: SectionType,
  params: SectionParams
): CrossSection {
  const now = Date.now();
  return {
    id: generateSectionId(),
    name: name.trim() || getSectionTypeLabel(type),
    type,
    params: JSON.parse(JSON.stringify(params)),
    properties: computeSectionProperties(type, params),
    createdAt: now,
    updatedAt: now
  };
}

export function updateSection(section: CrossSection, params?: SectionParams, name?: string): CrossSection {
  return {
    ...section,
    name: name !== undefined ? name.trim() || section.name : section.name,
    params: params ? JSON.parse(JSON.stringify(params)) : section.params,
    properties: params ? computeSectionProperties(section.type, params) : section.properties,
    updatedAt: Date.now()
  };
}

export function duplicateSection(section: CrossSection, allSections: CrossSection[]): CrossSection {
  const baseName = section.name.replace(/\(副本\)\d*$/, '').trim();
  let newName = baseName + '(副本)';
  let counter = 2;
  const names = new Set(allSections.map(s => s.name));
  while (names.has(newName)) {
    newName = `${baseName}(副本${counter})`;
    counter++;
  }
  const now = Date.now();
  return {
    id: generateSectionId(),
    name: newName,
    type: section.type,
    params: JSON.parse(JSON.stringify(section.params)),
    properties: JSON.parse(JSON.stringify(section.properties)),
    createdAt: now,
    updatedAt: now
  };
}

export function formatArea(areaMm2: number): string {
  if (areaMm2 >= 1e6) return (areaMm2 / 1e6).toFixed(3) + ' m²';
  if (areaMm2 >= 1e4) return (areaMm2 / 1e4).toFixed(2) + ' cm²';
  return areaMm2.toFixed(2) + ' mm²';
}

export function formatInertia(I: number): string {
  if (I >= 1e12) return (I / 1e12).toFixed(3) + ' m⁴';
  if (I >= 1e8) return (I / 1e8).toFixed(3) + ' cm⁴';
  return I.toExponential(3) + ' mm⁴';
}

export function formatModulus(W: number): string {
  if (W >= 1e9) return (W / 1e9).toFixed(3) + ' m³';
  if (W >= 1e6) return (W / 1e6).toFixed(3) + ' cm³';
  return W.toExponential(3) + ' mm³';
}
