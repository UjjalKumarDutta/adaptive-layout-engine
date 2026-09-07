import { createElement, useMemo, useRef, type CSSProperties, type ReactElement } from "react";
import type { AdElementSpec, AdSpec } from "./spec";
import type { ResolvedElement, ResolvedLayout } from "./resolver";

const POSITION_TRANSITION =
  "left 360ms cubic-bezier(0.4,0,0.2,1), top 360ms cubic-bezier(0.4,0,0.2,1), " +
  "width 360ms cubic-bezier(0.4,0,0.2,1), height 360ms cubic-bezier(0.4,0,0.2,1), " +
  "opacity 280ms ease, font-size 360ms ease";

export function elementToStyle(resolved: ResolvedElement): CSSProperties {
  return {
    position: "absolute",
    left: resolved.left,
    top: resolved.top,
    width: resolved.width,
    height: resolved.height,
    fontSize: resolved.fontSize,
    display: "flex",
    opacity: resolved.visible ? 1 : 0,
    pointerEvents: resolved.visible ? "auto" : "none",
    transition: POSITION_TRANSITION,
  };
}

export interface RenderableElement {
  spec: AdElementSpec;
  resolved: ResolvedElement;
  style: CSSProperties;
}

export function buildRenderableElements(spec: AdSpec, layout: ResolvedLayout): RenderableElement[] {
  const resolvedById = new Map(layout.elements.map((el) => [el.id, el]));

  return spec.elements
    .map((elementSpec) => {
      const resolved = resolvedById.get(elementSpec.id);
      if (!resolved) return undefined;
      return { spec: elementSpec, resolved, style: elementToStyle(resolved) };
    })
    .filter((entry): entry is RenderableElement => entry !== undefined);
}

export function useAnimatedRenderableElements(spec: AdSpec, layout: ResolvedLayout): RenderableElement[] {
  const lastKnownRef = useRef<Map<string, ResolvedElement>>(new Map());

  return useMemo(() => {
    const resolvedById = new Map(layout.elements.map((el) => [el.id, el]));

    return spec.elements
      .map((elementSpec) => {
        const resolved = resolvedById.get(elementSpec.id);
        if (!resolved) return undefined;

        if (resolved.visible) {
          lastKnownRef.current.set(elementSpec.id, resolved);
          return { spec: elementSpec, resolved, style: elementToStyle(resolved) };
        }

        const last = lastKnownRef.current.get(elementSpec.id);
        if (!last) {
          return { spec: elementSpec, resolved, style: elementToStyle(resolved) };
        }

        const heldInPlace: ResolvedElement = { ...last, visible: false, state: resolved.state };
        return { spec: elementSpec, resolved: heldInPlace, style: elementToStyle(heldInPlace) };
      })
      .filter((entry): entry is RenderableElement => entry !== undefined);
  }, [spec, layout]);
}

const STATE_BORDER: Record<ResolvedElement["state"], string> = {
  full: "1px solid rgba(255,255,255,0.18)",
  shrunk: "1px dashed rgba(255,196,110,0.85)",
  dropped: "none",
};

const ROLE_BACKGROUND: Record<AdElementSpec["role"], string> = {
  hero: "#2a3441",
  primary: "transparent",
  action: "#e8623f",
  secondary: "transparent",
  branding: "#3a4553",
};

function textContainerStyle(base: CSSProperties, resolved: ResolvedElement): CSSProperties {
  const fontSize = resolved.fontSize ?? 14;
  const lineHeightPx = fontSize * 1.15;
  const maxLines = Math.max(1, Math.floor(resolved.height / lineHeightPx));

  return {
    ...base,
    display: "-webkit-box",
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textOverflow: "ellipsis",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    lineHeight: 1.15,
  };
}

function renderElementNode(entry: RenderableElement): ReactElement {
  const { spec: elementSpec, resolved, style } = entry;

  const boxStyle: CSSProperties = {
    ...style,
    alignItems: "center",
    justifyContent: "center",
    border: STATE_BORDER[resolved.state],
    borderRadius: elementSpec.role === "action" ? 6 : 2,
    background: ROLE_BACKGROUND[elementSpec.role],
    color: "#f4f1ea",
    overflow: "hidden",
    boxSizing: "border-box",
    padding: elementSpec.type === "text" ? "0 6px" : 0,
    fontWeight: elementSpec.role === "primary" ? 700 : 500,
  };

  if (elementSpec.type === "image") {
    return createElement(
      "div",
      { key: elementSpec.id, style: boxStyle, title: elementSpec.imageAlt ?? elementSpec.id },
      createElement(
        "span",
        { style: { fontSize: 11, opacity: 0.7, letterSpacing: 0.4 } },
        elementSpec.role === "hero" ? "PRODUCT IMAGE" : "LOGO",
      ),
    );
  }

  if (elementSpec.type === "button") {
    return createElement(
      "button",
      {
        key: elementSpec.id,
        style: { ...boxStyle, cursor: "pointer", border: "none" },
      },
      createElement(
        "span",
        {
          style: {
            display: "block",
            width: "100%",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            textAlign: "center",
          },
        },
        elementSpec.content ?? "Shop now",
      ),
    );
  }

  return createElement(
    "div",
    { key: elementSpec.id, style: { ...boxStyle, textAlign: "center" } },
    createElement(
      "span",
      { style: textContainerStyle({ width: "100%" }, resolved) },
      elementSpec.content ?? elementSpec.id,
    ),
  );
}

export function renderAd(elements: RenderableElement[]): ReactElement[] {
  return elements.map(renderElementNode);
}

export interface AdCanvasProps {
  spec: AdSpec;
  layout: ResolvedLayout;
  backgroundColor?: string;
}

export function AdCanvas(props: AdCanvasProps): ReactElement {
  const { spec: adSpec, layout, backgroundColor } = props;
  const elements = useAnimatedRenderableElements(adSpec, layout);

  return createElement(
    "div",
    {
      style: {
        position: "relative",
        width: layout.surfaceWidth,
        height: layout.surfaceHeight,
        background: backgroundColor ?? "#12161c",
        overflow: "hidden",
        flexShrink: 0,
        transition: "width 360ms cubic-bezier(0.4,0,0.2,1), height 360ms cubic-bezier(0.4,0,0.2,1)",
      },
    },
    ...elements.map(renderElementNode),
  );
}
