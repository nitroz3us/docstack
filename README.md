# Docstack

A minimalist, privacy-focused PDF merger with advanced visual page management. Runs 100% in your browser.

## Features

- **Privacy First**: Files never leave your device. All processing is client-side.
- **Visual Merge**: Drag and drop entire PDFs to reorder.
- **Page Management**:
  - **Inline Preview**: Visualize all pages in a grid.
  - **Reorder**: Drag & drop individual pages.
  - **Delete**: Remove unwanted pages.
  - **Rotate**: Rotate pages 90° clockwise.
  - **Preview**: Fullscreen lightbox with keyboard navigation.
- **Advanced Selection**: Use text rules like `1..3, 5` for quick selection (if you prefer typing).

## Quick Start

You can run this app locally easily.

### Option 1: Python Simple Server
If you have Python installed:

```bash
cd web
python3 -m http.server 3000
# Open http://localhost:3000
```

### Option 2: Drag & Drop
Since it's a static site, you can technically just drag `web/index.html` into your browser, though some features might require a local server depending on browser security policies.



## Tech Stack

- **PDF.js**: Rendering page previews.
- **pdf-lib**: Client-side PDF modification and merging.
- **SortableJS**: Smooth drag-and-drop interactions.
- **TailwindCSS**: Styling.
