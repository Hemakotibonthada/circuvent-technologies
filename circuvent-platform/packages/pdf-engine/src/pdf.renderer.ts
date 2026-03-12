// ──────────────────────────────────────────────────────────────
// Circuvent Platform — PDF Renderer
// Generic PDFKit wrapper for generating structured PDF
// documents from templates. Supports headers, footers,
// tables, and company branding.
// ──────────────────────────────────────────────────────────────

import PDFDocument from "pdfkit";
import { Writable } from "stream";
import crypto from "crypto";

export interface PDFTableColumn {
  header: string;
  key: string;
  width: number;
  align?: "left" | "center" | "right";
  format?: (value: unknown) => string;
}

export interface PDFRenderOptions {
  title: string;
  subtitle?: string;
  companyName?: string;
  companyAddress?: string;
  companyLogo?: Buffer;
  pageSize?: "A4" | "LETTER";
  orientation?: "portrait" | "landscape";
  margin?: number;
  headerColor?: string;
  accentColor?: string;
}

const COLORS = {
  PRIMARY: "#1e40af",
  SECONDARY: "#475569",
  ACCENT: "#3b82f6",
  TEXT: "#1e293b",
  LIGHT_TEXT: "#64748b",
  BORDER: "#cbd5e1",
  ROW_ALT: "#f8fafc",
  SUCCESS: "#16a34a",
  DANGER: "#dc2626",
};

export class PDFRenderer {
  private doc: PDFKit.PDFDocument;
  private options: PDFRenderOptions;
  private currentY: number;

  constructor(options: PDFRenderOptions) {
    this.options = options;
    this.doc = new PDFDocument({
      size: options.pageSize || "A4",
      layout: options.orientation || "portrait",
      margin: options.margin || 40,
      info: {
        Title: options.title,
        Author: options.companyName || "Circuvent Technologies",
        Creator: "Circuvent Platform PDF Engine",
        Producer: "PDFKit",
        CreationDate: new Date(),
      },
    });
    this.currentY = this.doc.y;
  }

  renderHeader(): this {
    const margin = this.options.margin || 40;

    // Company name
    this.doc
      .fontSize(18)
      .fillColor(this.options.headerColor || COLORS.PRIMARY)
      .text(this.options.companyName || "Circuvent Technologies", margin, margin, { align: "left" });

    if (this.options.companyAddress) {
      this.doc
        .fontSize(8)
        .fillColor(COLORS.LIGHT_TEXT)
        .text(this.options.companyAddress, margin, this.doc.y, { align: "left" });
    }

    // Title
    this.doc
      .moveDown(1)
      .fontSize(14)
      .fillColor(COLORS.TEXT)
      .text(this.options.title, { align: "center" });

    if (this.options.subtitle) {
      this.doc
        .fontSize(10)
        .fillColor(COLORS.LIGHT_TEXT)
        .text(this.options.subtitle, { align: "center" });
    }

    // Separator line
    this.doc.moveDown(0.5);
    const lineY = this.doc.y;
    this.doc
      .moveTo(margin, lineY)
      .lineTo(this.doc.page.width - margin, lineY)
      .strokeColor(COLORS.BORDER)
      .lineWidth(1)
      .stroke();

    this.doc.moveDown(1);
    this.currentY = this.doc.y;
    return this;
  }

  renderKeyValueSection(title: string, pairs: [string, string][], columns = 2): this {
    const margin = this.options.margin || 40;
    const contentWidth = this.doc.page.width - margin * 2;

    this.doc
      .fontSize(11)
      .fillColor(COLORS.PRIMARY)
      .text(title, margin, this.currentY);

    this.doc.moveDown(0.3);

    const colWidth = contentWidth / columns;
    const startY = this.doc.y;
    let maxY = startY;

    pairs.forEach((pair, idx) => {
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      const x = margin + col * colWidth;
      const y = startY + row * 16;

      this.doc.fontSize(8).fillColor(COLORS.LIGHT_TEXT).text(pair[0], x, y, { width: colWidth * 0.45 });
      this.doc.fontSize(9).fillColor(COLORS.TEXT).text(pair[1], x + colWidth * 0.45, y, { width: colWidth * 0.55 });

      maxY = Math.max(maxY, y + 16);
    });

    this.doc.y = maxY + 8;
    this.currentY = this.doc.y;
    return this;
  }

  renderTable(columns: PDFTableColumn[], rows: Record<string, unknown>[]): this {
    const margin = this.options.margin || 40;
    const headerHeight = 20;
    const rowHeight = 18;

    // Table header
    let x = margin;
    const headerY = this.currentY;

    this.doc.rect(margin, headerY, this.doc.page.width - margin * 2, headerHeight).fill(COLORS.PRIMARY);

    for (const col of columns) {
      this.doc
        .fontSize(8)
        .fillColor("#ffffff")
        .text(col.header, x + 4, headerY + 5, { width: col.width - 8, align: col.align || "left" });
      x += col.width;
    }

    // Table rows
    let rowY = headerY + headerHeight;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Check if we need a new page
      if (rowY + rowHeight > this.doc.page.height - 60) {
        this.doc.addPage();
        rowY = this.options.margin || 40;
      }

      // Alternating row background
      if (i % 2 === 1) {
        this.doc.rect(margin, rowY, this.doc.page.width - margin * 2, rowHeight).fill(COLORS.ROW_ALT);
      }

      x = margin;
      for (const col of columns) {
        const value = row[col.key];
        const displayValue = col.format ? col.format(value) : String(value ?? "");
        this.doc
          .fontSize(8)
          .fillColor(COLORS.TEXT)
          .text(displayValue, x + 4, rowY + 4, { width: col.width - 8, align: col.align || "left" });
        x += col.width;
      }
      rowY += rowHeight;
    }

    // Bottom border
    this.doc
      .moveTo(margin, rowY)
      .lineTo(this.doc.page.width - margin, rowY)
      .strokeColor(COLORS.BORDER)
      .lineWidth(0.5)
      .stroke();

    this.doc.y = rowY + 10;
    this.currentY = this.doc.y;
    return this;
  }

  renderSummaryRow(label: string, value: string, bold = false): this {
    const margin = this.options.margin || 40;
    const contentWidth = this.doc.page.width - margin * 2;

    this.doc
      .fontSize(bold ? 10 : 9)
      .fillColor(bold ? COLORS.PRIMARY : COLORS.TEXT)
      .text(label, margin, this.currentY, { width: contentWidth * 0.7, align: "right", continued: false });

    this.doc
      .fontSize(bold ? 10 : 9)
      .fillColor(bold ? COLORS.PRIMARY : COLORS.TEXT)
      .text(value, margin + contentWidth * 0.7, this.currentY, { width: contentWidth * 0.3, align: "right" });

    this.currentY = this.doc.y + 4;
    this.doc.y = this.currentY;
    return this;
  }

  renderNote(text: string): this {
    const margin = this.options.margin || 40;
    this.doc.moveDown(1);
    this.doc
      .fontSize(7)
      .fillColor(COLORS.LIGHT_TEXT)
      .text(text, margin, this.doc.y, { width: this.doc.page.width - margin * 2 });
    this.currentY = this.doc.y;
    return this;
  }

  renderFooter(text?: string): this {
    const margin = this.options.margin || 40;
    const footerY = this.doc.page.height - 40;

    this.doc
      .moveTo(margin, footerY - 10)
      .lineTo(this.doc.page.width - margin, footerY - 10)
      .strokeColor(COLORS.BORDER)
      .lineWidth(0.5)
      .stroke();

    this.doc
      .fontSize(7)
      .fillColor(COLORS.LIGHT_TEXT)
      .text(
        text || `Generated by Circuvent Platform on ${new Date().toLocaleDateString("en-IN")} | Confidential`,
        margin,
        footerY - 5,
        { align: "center", width: this.doc.page.width - margin * 2 }
      );

    return this;
  }

  moveDown(lines = 1): this {
    this.doc.moveDown(lines);
    this.currentY = this.doc.y;
    return this;
  }

  async toBuffer(): Promise<{ buffer: Buffer; checksum: string }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      stream.on("finish", () => {
        const buffer = Buffer.concat(chunks);
        const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
        resolve({ buffer, checksum });
      });

      stream.on("error", reject);
      this.doc.pipe(stream);
      this.doc.end();
    });
  }
}
