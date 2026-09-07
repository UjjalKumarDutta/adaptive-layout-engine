export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ViewingDistance = "near" | "far";

export interface SurfaceProfile {
  id: string;
  name: string;
  width: number;
  height: number;
  safeArea: SafeArea;
  minTapTarget?: number;
  minTextSize?: number;
  touchOnly?: boolean;
  viewingDistance?: ViewingDistance;
}

export interface SurfaceProfileInput {
  id: string;
  name: string;
  width: number;
  height: number;
  safeArea?: Partial<SafeArea>;
  minTapTarget?: number;
  minTextSize?: number;
  touchOnly?: boolean;
  viewingDistance?: ViewingDistance;
}

export function defineSurface(input: SurfaceProfileInput): SurfaceProfile {
  if (!input.id || input.id.trim().length === 0) {
    throw new Error("defineSurface: a surface needs a non-empty id");
  }

  if (!Number.isFinite(input.width) || input.width <= 0) {
    throw new Error(`defineSurface("${input.id}"): width must be a positive number, got ${input.width}`);
  }

  if (!Number.isFinite(input.height) || input.height <= 0) {
    throw new Error(`defineSurface("${input.id}"): height must be a positive number, got ${input.height}`);
  }

  const safeArea: SafeArea = {
    top: input.safeArea?.top ?? 0,
    right: input.safeArea?.right ?? 0,
    bottom: input.safeArea?.bottom ?? 0,
    left: input.safeArea?.left ?? 0,
  };

  const usableWidth = input.width - safeArea.left - safeArea.right;
  const usableHeight = input.height - safeArea.top - safeArea.bottom;

  if (usableWidth <= 0 || usableHeight <= 0) {
    throw new Error(
      `defineSurface("${input.id}"): safe area insets (${JSON.stringify(safeArea)}) leave no usable space inside a ${input.width}x${input.height} surface`,
    );
  }

  if (input.minTapTarget !== undefined) {
    if (input.minTapTarget <= 0) {
      throw new Error(`defineSurface("${input.id}"): minTapTarget must be positive`);
    }
    if (input.minTapTarget > usableWidth || input.minTapTarget > usableHeight) {
      throw new Error(
        `defineSurface("${input.id}"): minTapTarget (${input.minTapTarget}) cannot be larger than the surface's usable area (${usableWidth}x${usableHeight})`,
      );
    }
  }

  if (input.minTextSize !== undefined && input.minTextSize <= 0) {
    throw new Error(`defineSurface("${input.id}"): minTextSize must be positive`);
  }

  if (input.touchOnly && input.minTapTarget === undefined) {
    throw new Error(
      `defineSurface("${input.id}"): touchOnly surfaces must declare a minTapTarget so buttons stay tappable`,
    );
  }

  return {
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    safeArea,
    minTapTarget: input.minTapTarget,
    minTextSize: input.minTextSize,
    touchOnly: input.touchOnly,
    viewingDistance: input.viewingDistance,
  };
}

export const mobilePortrait = defineSurface({
  id: "mobile-portrait",
  name: "Mobile Portrait",
  width: 320,
  height: 480,
  safeArea: { top: 16, right: 12, bottom: 24, left: 12 },
  minTapTarget: 44,
  touchOnly: true,
});

export const mobileLandscape = defineSurface({
  id: "mobile-landscape",
  name: "Mobile Landscape",
  width: 568,
  height: 260,
  safeArea: { top: 8, right: 16, bottom: 8, left: 16 },
  minTapTarget: 44,
  touchOnly: true,
});

export const broadcastLowerThird = defineSurface({
  id: "broadcast-lower-third",
  name: "Broadcast Lower Third",
  width: 1920,
  height: 250,
  safeArea: { top: 10, right: 60, bottom: 10, left: 60 },
  minTextSize: 32,
  viewingDistance: "far",
});

export const squareKiosk = defineSurface({
  id: "square-kiosk",
  name: "Square Retail Kiosk",
  width: 1080,
  height: 1080,
  safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
  minTapTarget: 60,
  touchOnly: true,
});

export const constrainedBanner = defineSurface({
  id: "constrained-banner",
  name: "Constrained Banner (IAB 320x50, stress test)",
  width: 320,
  height: 50,
  safeArea: { top: 2, right: 4, bottom: 2, left: 4 },
  minTapTarget: 30,
  touchOnly: true,
});

export const surfaceRegistry: SurfaceProfile[] = [
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  squareKiosk,
  constrainedBanner,
];
