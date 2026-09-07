import type { AdElementSpec, AdSpec, ElementRole } from "./spec";
import type { SurfaceProfile } from "./surfaces";

export type DegradationState = "full" | "shrunk" | "dropped";

export interface ResolvedElement {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize?: number;
  visible: boolean;
  state: DegradationState;
}

export interface ResolvedLayout {
  surfaceId: string;
  surfaceWidth: number;
  surfaceHeight: number;
  mainAxis: "horizontal" | "vertical";
  elements: ResolvedElement[];
  warnings: string[];
}

const ROLE_WEIGHT: Record<ElementRole, number> = {
  hero: 5,
  primary: 4,
  action: 3,
  secondary: 2,
  branding: 1,
};

const SHRINK_STEP = 0.82;
const MAX_DEGRADE_ITERATIONS = 60;

interface ElementMinimums {
  minWidth: number;
  minHeight: number;
}

function elementMinimums(el: AdElementSpec, surface: SurfaceProfile): ElementMinimums {
  const tapFloor = surface.minTapTarget ?? 32;
  const textFloor = surface.minTextSize ?? 12;

  switch (el.role) {
    case "hero":
      return { minWidth: 48, minHeight: 48 };
    case "primary":
      return { minWidth: textFloor * 3, minHeight: textFloor * 1.4 };
    case "action":
      return { minWidth: tapFloor, minHeight: tapFloor };
    case "secondary":
      return { minWidth: textFloor * 2, minHeight: textFloor * 1.3 };
    case "branding":
      return { minWidth: 24, minHeight: 24 };
  }
}

interface WorkingElement {
  spec: AdElementSpec;
  weight: number;
  min: ElementMinimums;
  mainSize: number;
  crossSize: number;
  state: DegradationState;
}

interface Line {
  items: WorkingElement[];
  crossSize: number;
}

function placementOrder(a: WorkingElement, b: WorkingElement): number {
  if (a.spec.priority !== b.spec.priority) return a.spec.priority - b.spec.priority;
  return 0;
}

function mainMin(w: WorkingElement, axis: "horizontal" | "vertical"): number {
  return axis === "horizontal" ? w.min.minWidth : w.min.minHeight;
}

function crossMin(w: WorkingElement, axis: "horizontal" | "vertical"): number {
  return axis === "horizontal" ? w.min.minHeight : w.min.minWidth;
}

interface ReferenceSize {
  width: number;
  height: number;
}

const REFERENCE_SIZE: Record<ElementRole, ReferenceSize> = {
  hero: { width: 260, height: 220 },
  primary: { width: 240, height: 70 },
  action: { width: 170, height: 56 },
  secondary: { width: 100, height: 44 },
  branding: { width: 56, height: 56 },
};

const REFERENCE_AREA = 640 * 400;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.8;

function surfaceScaleFactor(mainAvailable: number, crossAvailable: number): number {
  const raw = Math.sqrt((mainAvailable * crossAvailable) / REFERENCE_AREA);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

function computePreferredSizes(
  items: WorkingElement[],
  axis: "horizontal" | "vertical",
  mainAvailable: number,
  crossAvailable: number,
  scale: number,
): void {
  for (const w of items) {
    const reference = REFERENCE_SIZE[w.spec.role];
    const referenceMain = axis === "horizontal" ? reference.width : reference.height;
    const referenceCross = axis === "horizontal" ? reference.height : reference.width;
    w.mainSize = Math.min(mainAvailable, Math.max(mainMin(w, axis), referenceMain * scale));
    w.crossSize = Math.max(crossMin(w, axis), Math.min(crossAvailable, referenceCross * scale));
  }
}

function wrapIntoLines(items: WorkingElement[], mainAvailable: number, gap: number): Line[] {
  const sorted = [...items].sort(placementOrder);
  const lines: Line[] = [];
  let current: WorkingElement[] = [];
  let currentMainUsed = 0;

  for (const item of sorted) {
    const additional = current.length === 0 ? item.mainSize : gap + item.mainSize;
    if (current.length > 0 && currentMainUsed + additional > mainAvailable) {
      lines.push({ items: current, crossSize: Math.max(...current.map((w) => w.crossSize)) });
      current = [];
      currentMainUsed = 0;
    }
    current.push(item);
    currentMainUsed += current.length === 1 ? item.mainSize : gap + item.mainSize;
  }

  if (current.length > 0) {
    lines.push({ items: current, crossSize: Math.max(...current.map((w) => w.crossSize)) });
  }

  return lines;
}

function totalCrossUsed(lines: Line[], gap: number): number {
  if (lines.length === 0) return 0;
  return lines.reduce((sum, line) => sum + line.crossSize, 0) + gap * (lines.length - 1);
}

function lowestDegradablePriorityPresent(items: WorkingElement[]): 3 | 2 | undefined {
  const inFlow = items.filter((w) => w.state !== "dropped");
  if (inFlow.some((w) => w.spec.priority === 3)) return 3;
  if (inFlow.some((w) => w.spec.priority === 2)) return 2;
  return undefined;
}

function degradeUntilItFits(
  items: WorkingElement[],
  axis: "horizontal" | "vertical",
  mainAvailable: number,
  crossAvailable: number,
  gap: number,
  warnings: string[],
): Line[] {
  let lines = wrapIntoLines(
    items.filter((w) => w.state !== "dropped"),
    mainAvailable,
    gap,
  );
  let iterations = 0;

  while (totalCrossUsed(lines, gap) > crossAvailable + 0.5 && iterations < MAX_DEGRADE_ITERATIONS) {
    iterations++;
    const tier = lowestDegradablePriorityPresent(items);

    if (tier === undefined) {
      warnings.push(
        "Priority-1 elements alone exceed the surface's usable space. Falling back to proportional clipping so nothing overlaps, but content is tighter than ideal.",
      );
      const scale = crossAvailable / totalCrossUsed(lines, gap);
      for (const line of lines) {
        line.crossSize *= scale;
        for (const item of line.items) {
          item.crossSize *= scale;
          item.state = "shrunk";
        }
      }
      break;
    }

    const candidates = items
      .filter((w) => w.state !== "dropped" && w.spec.priority === tier)
      .sort((a, b) => a.weight - b.weight || b.crossSize - a.crossSize);

    const target = candidates[0];
    const floor = crossMin(target, axis);

    if (target.crossSize > floor + 0.5) {
      target.crossSize = Math.max(floor, target.crossSize * SHRINK_STEP);
      target.state = "shrunk";
    } else {
      target.state = "dropped";
      warnings.push(
        `"${target.spec.id}" (priority ${target.spec.priority}) was dropped: the surface has no room left for it once higher-priority elements are placed.`,
      );
    }

    lines = wrapIntoLines(
      items.filter((w) => w.state !== "dropped"),
      mainAvailable,
      gap,
    );
  }

  if (iterations >= MAX_DEGRADE_ITERATIONS) {
    warnings.push("Degradation loop hit its iteration safety cap before fully converging.");
  }

  return lines;
}

function layOutLines(
  lines: Line[],
  axis: "horizontal" | "vertical",
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  crossAvailable: number,
  gap: number,
): ResolvedElement[] {
  const results: ResolvedElement[] = [];
  const mainAvailable = axis === "horizontal" ? innerWidth : innerHeight;

  const usedCross = totalCrossUsed(lines, gap);
  let crossCursor = Math.max(0, (crossAvailable - usedCross) / 2);

  for (const line of lines) {
    const totalGap = gap * Math.max(0, line.items.length - 1);
    const totalPreferredMain = line.items.reduce((s, w) => s + w.mainSize, 0);
    const leftover = Math.max(0, mainAvailable - totalGap - totalPreferredMain);
    const bonusPerItem = leftover / line.items.length;

    let mainCursor = 0;
    for (const item of line.items) {
      const finalMain = item.mainSize + bonusPerItem;
      const finalCross = line.crossSize;

      const left =
        axis === "horizontal" ? innerX + mainCursor : innerX + crossCursor + (line.crossSize - finalCross) / 2;
      const top =
        axis === "horizontal" ? innerY + crossCursor + (line.crossSize - finalCross) / 2 : innerY + mainCursor;
      const width = axis === "horizontal" ? finalMain : finalCross;
      const height = axis === "horizontal" ? finalCross : finalMain;

      const fontSize = deriveFontSize(item);

      results.push({
        id: item.spec.id,
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
        fontSize,
        visible: true,
        state: item.state,
      });

      mainCursor += finalMain + gap;
    }

    crossCursor += line.crossSize + gap;
  }

  return results;
}

function deriveFontSize(item: WorkingElement): number | undefined {
  if (item.spec.type !== "text") return undefined;
  const base = item.spec.role === "primary" ? 30 : 16;
  const bySize = Math.min(item.crossSize * 0.55, item.mainSize * 0.16);
  const scaled = Math.min(base, Math.max(base * 0.5, bySize));
  return Math.round(scaled);
}

function stableKey(spec: AdSpec, surface: SurfaceProfile): string {
  const specKey = spec.elements.map((e) => `${e.id}:${e.role}:${e.priority}:${e.type}`).join("|");
  const surfaceKey = [
    surface.width,
    surface.height,
    surface.safeArea.top,
    surface.safeArea.right,
    surface.safeArea.bottom,
    surface.safeArea.left,
    surface.minTapTarget ?? "-",
    surface.minTextSize ?? "-",
    surface.touchOnly ?? "-",
  ].join(",");
  return `${spec.id}::${specKey}::${surfaceKey}`;
}

const layoutCache = new Map<string, ResolvedLayout>();

export function resolveLayout(spec: AdSpec, surface: SurfaceProfile): ResolvedLayout {
  const cacheKey = stableKey(spec, surface);
  const cached = layoutCache.get(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];

  const innerX = surface.safeArea.left;
  const innerY = surface.safeArea.top;
  const innerWidth = surface.width - surface.safeArea.left - surface.safeArea.right;
  const innerHeight = surface.height - surface.safeArea.top - surface.safeArea.bottom;

  const axis: "horizontal" | "vertical" = innerWidth >= innerHeight ? "horizontal" : "vertical";
  const mainAvailable = axis === "horizontal" ? innerWidth : innerHeight;
  const crossAvailable = axis === "horizontal" ? innerHeight : innerWidth;
  const gap = Math.max(4, Math.min(innerWidth, innerHeight) * 0.02);

  const working: WorkingElement[] = spec.elements.map((el) => ({
    spec: el,
    weight: ROLE_WEIGHT[el.role],
    min: elementMinimums(el, surface),
    mainSize: 0,
    crossSize: 0,
    state: "full",
  }));

  for (const w of working) {
    if (mainMin(w, axis) > mainAvailable) {
      const shrink = mainAvailable / mainMin(w, axis);
      w.min = { minWidth: w.min.minWidth * shrink, minHeight: w.min.minHeight * shrink };
      warnings.push(
        `"${w.spec.id}" could not fit at its minimum size on this surface's main axis and was scaled down uniformly.`,
      );
    }
    if (crossMin(w, axis) > crossAvailable) {
      const shrink = crossAvailable / crossMin(w, axis);
      w.min = { minWidth: w.min.minWidth * shrink, minHeight: w.min.minHeight * shrink };
      warnings.push(
        `"${w.spec.id}" could not fit at its minimum size on this surface's cross axis and was scaled down uniformly.`,
      );
    }
  }

  const scale = surfaceScaleFactor(mainAvailable, crossAvailable);
  computePreferredSizes(working, axis, mainAvailable, crossAvailable, scale);

  const lines = degradeUntilItFits(working, axis, mainAvailable, crossAvailable, gap, warnings);

  const positioned = layOutLines(lines, axis, innerX, innerY, innerWidth, innerHeight, crossAvailable, gap);

  clampToSurfaceBounds(positioned, surface.width, surface.height, warnings);

  const dropped = working.filter((w) => w.state === "dropped");
  const droppedElements: ResolvedElement[] = dropped.map((w) => ({
    id: w.spec.id,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    visible: false,
    state: "dropped",
  }));

  const elements = [...positioned, ...droppedElements];

  assertNoOverlaps(elements, warnings);

  const layout: ResolvedLayout = {
    surfaceId: surface.id,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    mainAxis: axis,
    elements,
    warnings,
  };

  layoutCache.set(cacheKey, layout);
  return layout;
}

function clampToSurfaceBounds(
  elements: ResolvedElement[],
  surfaceWidth: number,
  surfaceHeight: number,
  warnings: string[],
): void {
  for (const el of elements) {
    if (!el.visible) continue;

    let corrected = false;

    if (el.left < 0) {
      el.width += el.left;
      el.left = 0;
      corrected = true;
    }
    if (el.top < 0) {
      el.height += el.top;
      el.top = 0;
      corrected = true;
    }
    if (el.left + el.width > surfaceWidth) {
      el.width = Math.max(0, surfaceWidth - el.left);
      corrected = true;
    }
    if (el.top + el.height > surfaceHeight) {
      el.height = Math.max(0, surfaceHeight - el.top);
      corrected = true;
    }

    if (corrected) {
      warnings.push(
        `"${el.id}" was nudged back inside the surface bounds by a final safety clamp (a small rounding gap upstream, not a placement decision).`,
      );
    }
  }
}

function assertNoOverlaps(elements: ResolvedElement[], warnings: string[]): void {
  const visible = elements.filter((e) => e.visible);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i];
      const b = visible[j];
      const overlapsX = a.left < b.left + b.width && b.left < a.left + a.width;
      const overlapsY = a.top < b.top + b.height && b.top < a.top + a.height;
      if (overlapsX && overlapsY) {
        warnings.push(
          `Internal check failed: "${a.id}" and "${b.id}" overlap. This should not happen and indicates a resolver bug.`,
        );
      }
    }
  }
}

export function clearLayoutCache(): void {
  layoutCache.clear();
}
