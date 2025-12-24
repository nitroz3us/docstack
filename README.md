# Docstack

A minimalist, privacy-focused PDF merger that runs entirely in your browser.

## Features

- **Merge** multiple PDFs into one
- **Splice** specific pages (e.g., `1..3, 5`)
- **Rotate** pages (90°, 180°, 270°)
- **Reorder** PDFs with drag-and-drop
- **Preview** pages before merging

## Privacy

🔒 **Your files never leave your device.** All processing happens client-side using JavaScript. No server uploads, no data collection.

## Usage

### Online
Visit the deployed site (coming soon on Vercel)

### Local
```bash
cd web
python3 -m http.server 3000
# Open http://localhost:3000
```

Or just open `web/index.html` directly in your browser.

## Page Selection Syntax

| Rule | Meaning |
|------|---------|
| `1..3` | Pages 1 through 3 |
| `1, 3, 5` | Pages 1, 3, and 5 |
| `-1` | Last page |
| `2..` | Page 2 to end |
| `3..1` | Pages 3 to 1 (reverse) |
| `1>` | Page 1 rotated 90° clockwise |
| `1V` | Page 1 rotated 180° |
| `1<` | Page 1 rotated 270° clockwise |

## Tech Stack

- **PDF.js** - Page preview rendering
- **pdf-lib** - PDF manipulation and merging
- **TailwindCSS** - Styling
- **SortableJS** - Drag-and-drop reordering

## License

MIT
