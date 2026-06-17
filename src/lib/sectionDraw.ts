import type {
  SectionType,
  SectionRectParams,
  SectionCircleParams,
  SectionHollowCircleParams,
  SectionTShapeParams,
  SectionParams,
  SectionProperties,
  CrossSection
} from './types.js';

export interface SectionDrawOptions {
  showDimensions?: boolean;
  showCentroid?: boolean;
  backgroundColor?: string;
  outlineColor?: string;
  fillColor?: string;
  centroidColor?: string;
  dimensionColor?: string;
  padding?: number;
}

const DEFAULT_OPTIONS: Required<SectionDrawOptions> = {
  showDimensions: true,
  showCentroid: true,
  backgroundColor: '#ffffff',
  outlineColor: '#2563eb',
  fillColor: 'rgba(37, 99, 235, 0.12)',
  centroidColor: '#dc2626',
  dimensionColor: '#374151',
  padding: 40
};

export function drawSection(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  type: SectionType,
  params: SectionParams,
  properties: SectionProperties,
  options: SectionDrawOptions = {}
) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = opt.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const { maxX, maxY } = properties;
  const padding = opt.padding;
  const drawAreaW = canvasWidth - padding * 2;
  const drawAreaH = canvasHeight - padding * 2;

  const scale = Math.min(drawAreaW / maxX, drawAreaH / maxY) * 0.9;
  const offsetX = (canvasWidth - maxX * scale) / 2;
  const offsetY = (canvasHeight - maxY * scale) / 2;

  const toScreen = (x: number, y: number) => ({
    x: offsetX + x * scale,
    y: offsetY + (maxY - y) * scale
  });

  ctx.save();
  switch (type) {
    case 'rectangle':
      drawRectangle(ctx, params as SectionRectParams, toScreen, opt);
      break;
    case 'circle':
      drawCircle(ctx, params as SectionCircleParams, properties, toScreen, opt);
      break;
    case 'hollowCircle':
      drawHollowCircle(ctx, params as SectionHollowCircleParams, properties, toScreen, opt);
      break;
    case 'tShape':
      drawTShape(ctx, params as SectionTShapeParams, toScreen, opt);
      break;
  }
  ctx.restore();

  if (opt.showCentroid) {
    drawCentroid(ctx, properties, toScreen, opt.centroidColor);
  }

  if (opt.showDimensions) {
    drawDimensions(ctx, canvasWidth, canvasHeight, type, params, properties, toScreen, scale, opt);
  }
}

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  params: SectionRectParams,
  toScreen: (x: number, y: number) => { x: number; y: number },
  opt: Required<SectionDrawOptions>
) {
  const { width, height } = params;
  const p1 = toScreen(0, 0);
  const p2 = toScreen(width, height);

  ctx.fillStyle = opt.fillColor;
  ctx.fillRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);

  ctx.strokeStyle = opt.outlineColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.rect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
  ctx.stroke();
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  params: SectionCircleParams,
  properties: SectionProperties,
  toScreen: (x: number, y: number) => { x: number; y: number },
  opt: Required<SectionDrawOptions>
) {
  const { diameter } = params;
  const r = diameter / 2;
  const center = toScreen(properties.centroidX, properties.centroidY);
  const scale = (toScreen(diameter, 0).x - toScreen(0, 0).x) / diameter;

  ctx.fillStyle = opt.fillColor;
  ctx.strokeStyle = opt.outlineColor;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.arc(center.x, center.y, r * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawHollowCircle(
  ctx: CanvasRenderingContext2D,
  params: SectionHollowCircleParams,
  properties: SectionProperties,
  toScreen: (x: number, y: number) => { x: number; y: number },
  opt: Required<SectionDrawOptions>
) {
  const { outerDiameter, innerDiameter } = params;
  const R = outerDiameter / 2;
  const r = innerDiameter / 2;
  const center = toScreen(properties.centroidX, properties.centroidY);
  const scale = (toScreen(outerDiameter, 0).x - toScreen(0, 0).x) / outerDiameter;

  ctx.fillStyle = opt.fillColor;
  ctx.strokeStyle = opt.outlineColor;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.arc(center.x, center.y, R * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center.x, center.y, r * scale, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = opt.outlineColor;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTShape(
  ctx: CanvasRenderingContext2D,
  params: SectionTShapeParams,
  toScreen: (x: number, y: number) => { x: number; y: number },
  opt: Required<SectionDrawOptions>
) {
  const { flangeWidth: B, flangeThickness: tf, webHeight: hw, webThickness: tw } = params;
  const H = tf + hw;
  const webX = (B - tw) / 2;

  const flangePoints = [
    toScreen(0, hw),
    toScreen(B, hw),
    toScreen(B, H),
    toScreen(0, H)
  ];
  const webPoints = [
    toScreen(webX, 0),
    toScreen(webX + tw, 0),
    toScreen(webX + tw, hw),
    toScreen(webX, hw)
  ];

  ctx.fillStyle = opt.fillColor;
  ctx.strokeStyle = opt.outlineColor;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(flangePoints[0].x, flangePoints[0].y);
  for (let i = 1; i < flangePoints.length; i++) {
    ctx.lineTo(flangePoints[i].x, flangePoints[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(webPoints[0].x, webPoints[0].y);
  for (let i = 1; i < webPoints.length; i++) {
    ctx.lineTo(webPoints[i].x, webPoints[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawCentroid(
  ctx: CanvasRenderingContext2D,
  properties: SectionProperties,
  toScreen: (x: number, y: number) => { x: number; y: number },
  color: string
) {
  const center = toScreen(properties.centroidX, properties.centroidY);
  const size = 8;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(center.x - size, center.y);
  ctx.lineTo(center.x + size, center.y);
  ctx.moveTo(center.x, center.y - size);
  ctx.lineTo(center.x, center.y + size);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center.x, center.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '10px -apple-system, "SF Mono", Monaco, monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText('C', center.x + 10, center.y - 8);
  ctx.restore();
}

function drawDimensions(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  type: SectionType,
  params: SectionParams,
  properties: SectionProperties,
  toScreen: (x: number, y: number) => { x: number; y: number },
  scale: number,
  opt: Required<SectionDrawOptions>
) {
  ctx.save();
  ctx.strokeStyle = opt.dimensionColor;
  ctx.fillStyle = opt.dimensionColor;
  ctx.lineWidth = 1;
  ctx.font = '10.5px -apple-system, "SF Mono", Monaco, monospace';

  const arrowSize = 4;

  const drawDimLine = (
    x1: number, y1: number, x2: number, y2: number,
    label: string, labelX: number, labelY: number, labelAlign: CanvasTextAlign = 'center'
  ) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const ang = Math.atan2(y2 - y1, x2 - x1);
    drawArrow(x1, y1, ang + Math.PI);
    drawArrow(x2, y2, ang);

    ctx.textAlign = labelAlign;
    ctx.fillText(label, labelX, labelY);
  };

  const drawArrow = (x: number, y: number, angle: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - arrowSize * Math.cos(angle - 0.4), y - arrowSize * Math.sin(angle - 0.4));
    ctx.moveTo(x, y);
    ctx.lineTo(x - arrowSize * Math.cos(angle + 0.4), y - arrowSize * Math.sin(angle + 0.4));
    ctx.stroke();
  };

  const drawExtensionLine = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.setLineDash([2, 2]);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  switch (type) {
    case 'rectangle': {
      const { width, height } = params as SectionRectParams;
      const botL = toScreen(0, 0);
      const botR = toScreen(width, 0);
      const topL = toScreen(0, height);

      const dimY = Math.max(botL.y + 18, canvasHeight - 15);
      drawExtensionLine(botL.x, botL.y, botL.x, dimY - 5);
      drawExtensionLine(botR.x, botR.y, botR.x, dimY - 5);
      drawDimLine(botL.x, dimY, botR.x, dimY, `b=${width}`, (botL.x + botR.x) / 2, dimY - 4);

      const dimX = Math.min(topL.x - 18, 15);
      drawExtensionLine(botL.x, botL.y, dimX + 5, botL.y);
      drawExtensionLine(topL.x, topL.y, dimX + 5, topL.y);
      drawDimLine(dimX, botL.y, dimX, topL.y, `h=${height}`, dimX - 3, (botL.y + topL.y) / 2, 'right');
      break;
    }
    case 'circle': {
      const { diameter } = params as SectionCircleParams;
      const center = toScreen(properties.centroidX, properties.centroidY);
      const r = (diameter / 2) * scale;

      const dimY = Math.max(center.y + r + 18, canvasHeight - 15);
      drawExtensionLine(center.x - r, center.y, center.x - r, dimY - 5);
      drawExtensionLine(center.x + r, center.y, center.x + r, dimY - 5);
      drawDimLine(center.x - r, dimY, center.x + r, dimY, `d=${diameter}`, center.x, dimY - 4);
      break;
    }
    case 'hollowCircle': {
      const { outerDiameter, innerDiameter } = params as SectionHollowCircleParams;
      const center = toScreen(properties.centroidX, properties.centroidY);
      const R = (outerDiameter / 2) * scale;
      const r = (innerDiameter / 2) * scale;

      const dimY1 = Math.max(center.y + R + 18, canvasHeight - 30);
      drawExtensionLine(center.x - R, center.y, center.x - R, dimY1 - 5);
      drawExtensionLine(center.x + R, center.y, center.x + R, dimY1 - 5);
      drawDimLine(center.x - R, dimY1, center.x + R, dimY1, `D=${outerDiameter}`, center.x, dimY1 - 4);

      const dimY2 = dimY1 + 22;
      drawExtensionLine(center.x - r, center.y, center.x - r, dimY2 - 5);
      drawExtensionLine(center.x + r, center.y, center.x + r, dimY2 - 5);
      drawDimLine(center.x - r, dimY2, center.x + r, dimY2, `d=${innerDiameter}`, center.x, dimY2 - 4);
      break;
    }
    case 'tShape': {
      const { flangeWidth: B, flangeThickness: tf, webHeight: hw, webThickness: tw } = params as SectionTShapeParams;
      const H = tf + hw;
      const webX = (B - tw) / 2;

      const botWebL = toScreen(webX, 0);
      const botWebR = toScreen(webX + tw, 0);
      const topFlangeL = toScreen(0, H);
      const topFlangeR = toScreen(B, H);
      const flangeBotL = toScreen(0, hw);
      const topWebL = toScreen(webX, hw);

      const dimY = Math.max(botWebL.y + 18, canvasHeight - 15);
      drawExtensionLine(topFlangeL.x, topFlangeL.y, topFlangeL.x, dimY - 5);
      drawExtensionLine(topFlangeR.x, topFlangeR.y, topFlangeR.x, dimY - 5);
      drawDimLine(topFlangeL.x, dimY, topFlangeR.x, dimY, `B=${B}`, (topFlangeL.x + topFlangeR.x) / 2, dimY - 4);

      const dimY2 = dimY + 20;
      drawExtensionLine(botWebL.x, botWebL.y, botWebL.x, dimY2 - 5);
      drawExtensionLine(botWebR.x, botWebR.y, botWebR.x, dimY2 - 5);
      drawDimLine(botWebL.x, dimY2, botWebR.x, dimY2, `t_w=${tw}`, (botWebL.x + botWebR.x) / 2, dimY2 - 4);

      const dimX = Math.min(topFlangeL.x - 18, 15);
      drawExtensionLine(botWebL.x, botWebL.y, dimX + 5, botWebL.y);
      drawExtensionLine(topWebL.x, topWebL.y, dimX + 5, topWebL.y);
      drawDimLine(dimX, botWebL.y, dimX, topWebL.y, `h_w=${hw}`, dimX - 3, (botWebL.y + topWebL.y) / 2, 'right');

      const dimX2 = dimX - 28;
      drawExtensionLine(flangeBotL.x, flangeBotL.y, dimX2 + 5, flangeBotL.y);
      drawExtensionLine(topFlangeL.x, topFlangeL.y, dimX2 + 5, topFlangeL.y);
      drawDimLine(dimX2, flangeBotL.y, dimX2, topFlangeL.y, `t_f=${tf}`, dimX2 - 3, (flangeBotL.y + topFlangeL.y) / 2, 'right');
      break;
    }
  }
  ctx.restore();
}

export function createSectionThumbnail(
  section: CrossSection,
  width: number = 80,
  height: number = 60
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  drawSection(ctx, width, height, section.type, section.params, section.properties, {
    showDimensions: false,
    showCentroid: false,
    padding: 8
  });

  return canvas.toDataURL();
}
