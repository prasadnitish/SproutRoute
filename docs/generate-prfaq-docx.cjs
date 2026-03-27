const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageBreak, Header, Footer, PageNumber, LevelFormat, BorderStyle,
  ExternalHyperlink, ImageRun,
} = require("docx");

// ── Read source PRFAQ markdown ─────────────────────────────────────
const md = fs.readFileSync(path.join(__dirname, "SproutRoute-PRFAQ.md"), "utf8");

// ── SVG to PNG conversion not available, so embed SVG as-is note ───
const svgPath = path.resolve(__dirname, "../../nitishprasad-website/diagrams/architecture.svg");
const svgExists = fs.existsSync(svgPath);

// ── Parse markdown into structured sections ────────────────────────
function parseMd(text) {
  const lines = text.split("\n");
  const elements = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;

    if (trimmed.startsWith("# ")) {
      elements.push({ type: "h1", text: trimmed.slice(2) });
    } else if (trimmed.startsWith("## ")) {
      elements.push({ type: "h2", text: trimmed.slice(3) });
    } else if (trimmed.startsWith("### ")) {
      elements.push({ type: "h3", text: trimmed.slice(4) });
    } else if (trimmed.startsWith("**Q")) {
      // FAQ question
      elements.push({ type: "question", text: trimmed.replace(/\*\*/g, "") });
    } else {
      // Body paragraph — clean markdown formatting
      elements.push({ type: "body", text: trimmed });
    }
  }
  return elements;
}

// ── Build inline runs from text with **bold** and [links](url) ─────
function buildRuns(text, baseStyle = {}) {
  const runs = [];
  // Split on **bold** markers and [link](url) patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: "Arial", ...baseStyle }));
    } else if (part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      // Just render as text with the display name (hyperlinks in docx are complex)
      runs.push(new TextRun({ text: match[1], font: "Arial", color: "2E75B6", underline: {}, ...baseStyle }));
    } else if (part) {
      runs.push(new TextRun({ text: part, font: "Arial", ...baseStyle }));
    }
  }
  return runs;
}

// ── Generate document ──────────────────────────────────────────────
const elements = parseMd(md);
const children = [];
let needsPageBreak = false;

for (const el of elements) {
  if (el.type === "h1") {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 240 },
      children: [new TextRun({ text: el.text, bold: true, font: "Arial", size: 36, color: "1B4332" })],
    }));
  } else if (el.type === "h2") {
    // Page break before major sections
    if (children.length > 2) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 360, after: 200 },
      children: [new TextRun({ text: el.text, bold: true, font: "Arial", size: 32, color: "2D6A4F" })],
    }));
  } else if (el.type === "h3") {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: el.text, bold: true, font: "Arial", size: 26 })],
    }));
  } else if (el.type === "question") {
    children.push(new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: el.text, bold: true, font: "Arial", size: 22 })],
    }));
  } else if (el.type === "body") {
    children.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      children: buildRuns(el.text, { size: 22 }),
    }));
  }
}

// ── Appendix: System Architecture ──────────────────────────────────
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 360, after: 200 },
  children: [new TextRun({ text: "APPENDIX: System Architecture", bold: true, font: "Arial", size: 32, color: "2D6A4F" })],
}));

if (svgExists) {
  // Read SVG and convert to a note since docx doesn't natively support SVG
  children.push(new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [new TextRun({
      text: "The system architecture diagram is available as an SVG file at: diagrams/architecture.svg",
      font: "Arial", size: 22, italics: true, color: "666666",
    })],
  }));
  children.push(new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({
      text: "Architecture Overview: SproutRoute uses a React 18 + Vite frontend with a Node.js + Express backend. " +
        "The backend orchestrates 7+ APIs: Claude Sonnet (AI itinerary & packing), Google Places (restaurant verification & photos), " +
        "Weather.gov & OpenWeatherMap (forecasts), Nominatim (geocoding), and static databases for car seat laws (50 US states + international), " +
        "airline pet policies (6 US carriers: Delta, United, American, Southwest, JetBlue, Alaska), and international pet entry requirements " +
        "(US, Canada, Mexico, UK, EU countries). New pet travel services include petSafety.js (orchestrator), petAirlineRules.js, " +
        "and petEntryRules.js. The frontend includes FamilyStep (unified kids + pets input), PetSafetyTile (airline comparison + entry requirements), " +
        "and pet-friendly badges on ItineraryTile. Deployed on Railway with auto-deploy from GitHub main branch.",
      font: "Arial", size: 22,
    })],
  }));

  // Add the key data flow
  children.push(new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: "Pet Travel Data Flow:", bold: true, font: "Arial", size: 22 })],
  }));
  const flowSteps = [
    "1. User enters destination, dates, children, and pets (type, breed, weight, special needs) in FamilyStep wizard",
    "2. Backend derives travelMode (fly/drive) from distance + countryCode via haversine calculation",
    "3. Trip plan AI prompt includes pet-aware planning rules (pet-friendly restaurants, dog parks, daycare suggestions)",
    "4. Packing list AI generates per-pet packing category (carrier, food, meds, climate gear)",
    "5. Pet safety check queries all 6 airlines for eligibility + destination entry requirements",
    "6. Frontend renders: itinerary with pet-friendly badges, pet packing with Shop links, PetSafetyTile with airline comparison",
  ];
  for (const step of flowSteps) {
    children.push(new Paragraph({
      spacing: { before: 40, after: 40 },
      indent: { left: 360 },
      children: [new TextRun({ text: step, font: "Arial", size: 20 })],
    }));
  }
}

// ── Build document ─────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "SproutRoute \u2014 PRFAQ", font: "Arial", size: 18, color: "999999", italics: true })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: "999999" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "999999" }),
          ],
        })],
      }),
    },
    children,
  }],
});

// ── Write to disk ──────────────────────────────────────────────────
const outPath = path.join(__dirname, "SproutRoute-PRFAQ.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`PRFAQ Word doc written to: ${outPath}`);
  console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
});
