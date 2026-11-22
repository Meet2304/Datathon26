import React from "react";
import { AppScene, Tag } from "../AppShot";
import { L } from "./layout";

// Real captures of the live Apollo app (public/app/*.png, 1920x1080), captured 2026-11-22.
export const S02: React.FC = () => (
  <AppScene
    shots={[
      { src: "01_home.png", from: -10, to: 45, zoom: [1, 1.02] },
      { src: "02_care_open.png", from: 35, to: 95, focus: L.care, zoom: [1.15, 1.2] },
      { src: "04_care_chosen.png", from: 85, to: 140, focus: L.care, zoom: [1.2, 1.22], box: { ...L.careBox, at: 92, label: "Dialysis" } },
      { src: "05_pin.png", from: 130, to: 220, focus: L.pin, zoom: [1.2, 1.25], box: { ...L.pinBox, at: 140, label: "PIN 492001" } },
    ]}
  >
    <Tag text="1 · Choose care" at={20} until={135} />
    <Tag text="2 · Enter location" at={135} />
  </AppScene>
);

export const S03: React.FC = () => (
  <AppScene
    shots={[
      { src: "05_pin.png", from: -10, to: 30, focus: L.pin, zoom: [1.25, 1.25] },
      { src: "06_results.png", from: 20, to: 280, focus: L.results, zoom: [1.0, 1.25], box: { ...L.firstCard, at: 130, label: "Top ranked match" } },
    ]}
  >
    <Tag text="3 · Compare nearby facilities" at={30} />
    <Tag text="Evidence · Capability · Closeness" at={80} y={170} />
  </AppScene>
);

export const S04: React.FC = () => (
  <AppScene
    shots={[
      { src: "06_results.png", from: -10, to: 30, focus: L.results, zoom: [1.25, 1.25] },
      { src: "07_why.png", from: 20, to: 150, focus: L.why, zoom: [1.3, 1.45] },
      { src: "08_why_scrolled.png", from: 140, to: 230, focus: [1915, 760], zoom: [1.45, 1.5] },
      { src: "09_leftout.png", from: 220, to: 340, focus: [1915, 560], zoom: [1.3, 1.38], box: { x: 1532, y: 662, w: 362, h: 282, at: 236, label: "Type doesn't fit" } },
    ]}
  >
    <Tag text="Why this option?" at={25} until={145} />
    <Tag text="What supports it? What should I check?" at={145} until={225} />
    <Tag text="Considered but not recommended" at={228} />
  </AppScene>
);
