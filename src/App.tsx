import { useMemo, useState } from "react";
import { defineAd } from "./spec";
import { defineSurface, surfaceRegistry, type SurfaceProfile } from "./surfaces";
import { resolveLayout } from "./resolver";
import { AdCanvas } from "./render-dom";

const productAd = defineAd({
  id: "trailrunner-270",
  elements: [
    { id: "headline", type: "text", role: "primary", priority: 1, content: "Built for the next ridge line" },
    { id: "hero-image", type: "image", role: "hero", priority: 1, imageAlt: "Trail running shoe" },
    { id: "cta", type: "button", role: "action", priority: 1, content: "Shop the Trailrunner" },
    { id: "price", type: "text", role: "secondary", priority: 2, content: "$148" },
    { id: "logo", type: "image", role: "branding", priority: 3, imageAlt: "Brand logo" },
  ],
});

const PREVIEW_BOX = { width: 640, height: 420 };

function useScaledPreview(surface: SurfaceProfile) {
  const scale = Math.min(1, PREVIEW_BOX.width / surface.width, PREVIEW_BOX.height / surface.height);
  return scale;
}

interface CustomSurfaceDraft {
  width: string;
  height: string;
  minTapTarget: string;
  minTextSize: string;
  touchOnly: boolean;
}

const initialDraft: CustomSurfaceDraft = {
  width: "600",
  height: "340",
  minTapTarget: "48",
  minTextSize: "18",
  touchOnly: false,
};

export default function App() {
  const [selectedId, setSelectedId] = useState<string>(surfaceRegistry[0].id);
  const [customSurface, setCustomSurface] = useState<SurfaceProfile | undefined>(undefined);
  const [draft, setDraft] = useState<CustomSurfaceDraft>(initialDraft);
  const [draftError, setDraftError] = useState<string | undefined>(undefined);

  const allSurfaces = customSurface ? [...surfaceRegistry, customSurface] : surfaceRegistry;
  const surface = allSurfaces.find((s) => s.id === selectedId) ?? surfaceRegistry[0];

  const layout = useMemo(() => resolveLayout(productAd, surface), [surface]);
  const scale = useScaledPreview(surface);

  function applyCustomSurface() {
    try {
      const width = Number(draft.width);
      const height = Number(draft.height);
      const minTapTarget = draft.minTapTarget.trim() === "" ? undefined : Number(draft.minTapTarget);
      const minTextSize = draft.minTextSize.trim() === "" ? undefined : Number(draft.minTextSize);

      const built = defineSurface({
        id: "live-interview-surface",
        name: "Live Interview Surface",
        width,
        height,
        minTapTarget,
        minTextSize,
        touchOnly: draft.touchOnly,
        safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
      });

      setCustomSurface(built);
      setSelectedId(built.id);
      setDraftError(undefined);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Invalid surface");
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ADAPTIVE LAYOUT ENGINE</div>
          <h1 style={styles.title}>One ad spec. Five very different screens.</h1>
        </div>
        <div style={styles.axisTag}>
          main axis: <span style={styles.axisValue}>{layout.mainAxis}</span>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarLabel}>Surface profile</div>
          {surfaceRegistry.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                ...styles.surfaceButton,
                ...(s.id === selectedId ? styles.surfaceButtonActive : {}),
              }}
            >
              <span style={styles.surfaceName}>{s.name}</span>
              <span style={styles.surfaceDims}>
                {s.width} × {s.height}
              </span>
            </button>
          ))}

          <div style={styles.divider} />

          <div style={styles.sidebarLabel}>Try an unknown 5th surface</div>
          <div style={styles.draftGrid}>
            <label style={styles.draftLabel}>
              width
              <input
                style={styles.draftInput}
                value={draft.width}
                onChange={(e) => setDraft({ ...draft, width: e.target.value })}
              />
            </label>
            <label style={styles.draftLabel}>
              height
              <input
                style={styles.draftInput}
                value={draft.height}
                onChange={(e) => setDraft({ ...draft, height: e.target.value })}
              />
            </label>
            <label style={styles.draftLabel}>
              min tap target
              <input
                style={styles.draftInput}
                value={draft.minTapTarget}
                onChange={(e) => setDraft({ ...draft, minTapTarget: e.target.value })}
              />
            </label>
            <label style={styles.draftLabel}>
              min text size
              <input
                style={styles.draftInput}
                value={draft.minTextSize}
                onChange={(e) => setDraft({ ...draft, minTextSize: e.target.value })}
              />
            </label>
          </div>
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={draft.touchOnly}
              onChange={(e) => setDraft({ ...draft, touchOnly: e.target.checked })}
            />
            touch only
          </label>
          <button style={styles.resolveButton} onClick={applyCustomSurface}>
            Resolve this surface
          </button>
          {draftError && <div style={styles.draftError}>{draftError}</div>}
        </aside>

        <main style={styles.main}>
          <div
            style={{
              ...styles.previewFrame,
              width: surface.width * scale,
              height: surface.height * scale,
            }}
          >
            <div
              style={{
                width: surface.width,
                height: surface.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <AdCanvas spec={productAd} layout={layout} />
            </div>
          </div>
          <div style={styles.captionRow}>
            <span>
              {surface.name} — {surface.width}×{surface.height}px
            </span>
            {surface.touchOnly && <span style={styles.pill}>touch-only</span>}
            {surface.viewingDistance === "far" && <span style={styles.pill}>far viewing distance</span>}
          </div>
        </main>

        <section style={styles.readout}>
          <div style={styles.sidebarLabel}>Resolved elements</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>id</th>
                <th style={styles.th}>state</th>
                <th style={styles.th}>x, y</th>
                <th style={styles.th}>w × h</th>
              </tr>
            </thead>
            <tbody>
              {layout.elements.map((el) => (
                <tr key={el.id}>
                  <td style={styles.td}>{el.id}</td>
                  <td style={{ ...styles.td, color: stateColor(el.state) }}>{el.state}</td>
                  <td style={styles.td}>
                    {el.left}, {el.top}
                  </td>
                  <td style={styles.td}>
                    {el.width} × {el.height}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.sidebarLabel}>Warnings</div>
          {layout.warnings.length === 0 ? (
            <div style={styles.noWarnings}>None — everything placed at full priority.</div>
          ) : (
            <ul style={styles.warningList}>
              {layout.warnings.map((w, i) => (
                <li key={i} style={styles.warningItem}>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function stateColor(state: string): string {
  if (state === "dropped") return "#f5c26b";
  if (state === "shrunk") return "#7fb2e8";
  return "#6fcf97";
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0d1015",
    color: "#eef1f5",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "28px 32px 20px",
    borderBottom: "1px solid #1e242d",
  },
  eyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    letterSpacing: 1.5,
    color: "#e8623f",
    marginBottom: 6,
  },
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 26,
    margin: 0,
    fontWeight: 700,
  },
  axisTag: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    color: "#9aa4b2",
    display: "flex",
    alignItems: "center",
  },
  axisValue: {
    color: "#eef1f5",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "240px 1fr 300px",
    gap: 24,
    padding: 28,
    alignItems: "start",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sidebarLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    color: "#6b7480",
    marginTop: 6,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  surfaceButton: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#161b22",
    border: "1px solid #232a34",
    color: "#eef1f5",
    borderRadius: 8,
    padding: "10px 12px",
    cursor: "pointer",
    textAlign: "left",
  },
  surfaceButtonActive: {
    border: "1px solid #e8623f",
    background: "#221b17",
  },
  surfaceName: {
    fontSize: 13,
  },
  surfaceDims: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "#9aa4b2",
  },
  divider: {
    height: 1,
    background: "#1e242d",
    margin: "14px 0",
  },
  draftGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  draftLabel: {
    fontSize: 11,
    color: "#9aa4b2",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  draftInput: {
    background: "#161b22",
    border: "1px solid #232a34",
    borderRadius: 6,
    color: "#eef1f5",
    padding: "6px 8px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#9aa4b2",
    marginTop: 8,
  },
  resolveButton: {
    marginTop: 10,
    background: "#e8623f",
    border: "none",
    color: "#0d1015",
    fontWeight: 600,
    padding: "9px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
  draftError: {
    color: "#f5867a",
    fontSize: 12,
    marginTop: 6,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  previewFrame: {
    position: "relative",
    overflow: "hidden",
    border: "1px solid #232a34",
    background: "#0a0c10",
  },
  captionRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#9aa4b2",
  },
  pill: {
    border: "1px solid #2c3542",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 11,
  },
  readout: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    marginBottom: 10,
  },
  th: {
    textAlign: "left",
    color: "#6b7480",
    fontWeight: 500,
    padding: "4px 6px",
    borderBottom: "1px solid #1e242d",
  },
  td: {
    padding: "4px 6px",
    borderBottom: "1px solid #161b22",
  },
  noWarnings: {
    fontSize: 12,
    color: "#6fcf97",
  },
  warningList: {
    margin: 0,
    paddingLeft: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  warningItem: {
    fontSize: 12,
    color: "#f5c26b",
    lineHeight: 1.4,
  },
};
