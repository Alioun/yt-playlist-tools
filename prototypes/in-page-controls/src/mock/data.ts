// THROWAWAY PROTOTYPE (ticket 14). Fake videos for the mock YouTube pages (the same as ticket 09's, extended).
export type MockVideo = { id: string; title: string; channel: string; views: string; age: string; len: string; hue: number; live?: boolean };

const id = (n: number) => `mockvideo${String(n).padStart(2, "0")}`;
export const videos: MockVideo[] = [
  { id: id(1), title: "How a compiler turns components into DOM updates", channel: "Byte Sized", views: "412K views", age: "3 days ago", len: "18:42", hue: 18 },
  { id: id(2), title: "The 20-minute weeknight ramen, from scratch", channel: "Kitchen Lab", views: "1.2M views", age: "2 weeks ago", len: "11:05", hue: 38 },
  { id: id(3), title: "Neon highways — 3 hour synthwave mix for deep focus", channel: "Night Drive Radio", views: "2.4M views", age: "1 year ago", len: "3:02:11", hue: 290 },
  { id: id(4), title: "The last glaciers of the Alps", channel: "Field Notes Docs", views: "880K views", age: "5 months ago", len: "52:30", hue: 195 },
  { id: id(5), title: "Designing for people who don't read manuals", channel: "Talk Archive", views: "96K views", age: "1 month ago", len: "41:17", hue: 220 },
  { id: id(6), title: "Why do magnets stick? (for 8-year-olds)", channel: "Tiny Science", views: "3.1M views", age: "2 years ago", len: "7:48", hue: 150 },
  { id: id(7), title: "Building a working LEGO clock", channel: "Brick by Brick", views: "640K views", age: "8 months ago", len: "16:20", hue: 60 },
  { id: id(8), title: "Hand-cut dovetails without a jig", channel: "The Shed Workshop", views: "210K views", age: "4 weeks ago", len: "23:09", hue: 30 },
  { id: id(9), title: "World record history: the 2-minute glitch", channel: "Any% Archive", views: "1.9M views", age: "6 months ago", len: "27:51", hue: 265 },
  { id: id(10), title: "A gentle intro to type theory", channel: "Byte Sized", views: "58K views", age: "1 year ago", len: "33:12", hue: 0 },
  { id: id(11), title: "Sourdough, the lazy way", channel: "Kitchen Lab", views: "2.2M views", age: "3 years ago", len: "14:40", hue: 45 },
  { id: id(12), title: "Live: storm chasing over the plains", channel: "Field Notes Docs", views: "4.1K watching", age: "", len: "LIVE", hue: 205, live: true },
];
export const watchVideo = { id: "mockwatch01", title: "How a compiler turns components into DOM updates", channel: "Byte Sized" };
export const shorts = [
  { id: "mockshort01", title: "One-pan crispy rice in 30s", channel: "@kitchenlab", views: "1.2M views", hue: 32 },
  { id: "mockshort02", title: "This magnet trick is unreal", channel: "@tinyscience", views: "880K views", hue: 160 },
  { id: "mockshort03", title: "Dovetail in 60 seconds", channel: "@shedworkshop", views: "210K views", hue: 25 },
  { id: "mockshort04", title: "LEGO gear ratios explained", channel: "@brickbybrick", views: "92K views", hue: 55 },
  { id: "mockshort05", title: "Glacier calving, real time", channel: "@fieldnotes", views: "3.3M views", hue: 200 },
];
export const thumb = (hue: number) =>
  `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 28%) 60%, hsl(${(hue + 80) % 360} 45% 18%))`;
