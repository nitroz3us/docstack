# docstack

A privacy-focused PDF composition workspace with visual page management. Processing runs entirely in your browser with no third-party runtime requests.

## Features

- **Privacy First**: Files never leave your device. All processing is client-side.
- **Visual Merge**: Drag pages to reorder, or use accessible move controls.
- **Page Management**:
  - **Inline Preview**: Visualize all pages in a grid.
  - **Reorder**: Drag & drop individual pages.
  - **Delete**: Remove unwanted pages.
  - **Rotate**: Rotate pages 90° clockwise.
  - **Preview**: Fullscreen lightbox with keyboard navigation.
- **Advanced Selection**: Use text rules like `1..3, 5` for quick selection (if you prefer typing).
- **Accessible Editing**: Keyboard navigation, bulk actions, semantic dialogs, and undo/redo.

## Quick Start

You can run this app locally easily.

### Development

Install the local CSS build dependency, compile styles, and start a static server:

```bash
npm install
npm run build
cd web
python3 -m http.server 3000
# Open http://localhost:3000
```

Run the regression tests with `npm test`. Use `npm run watch:css` while changing HTML or component class names.



## Tech Stack

- **PDF.js**: Rendering page previews.
- **pdf-lib**: Client-side PDF modification and merging.
- **SortableJS**: Smooth drag-and-drop interactions.
- **TailwindCSS**: Build-time styling; the generated CSS is shipped locally.
