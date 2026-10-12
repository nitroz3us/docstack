/**
 * The words for each landing page. Everything here is plain text: build-pages.mjs escapes it.
 *
 * A landing page is the whole app with its own title, description, heading and text below the
 * first screen, so someone searching for one job, or for a private or offline PDF tool, lands on a
 * page about exactly that. Each page says things the others do not; keep it that way, and keep
 * every claim true of the app (the README and the app's own dialogs are the reference).
 *
 * A page has `steps` (three numbered steps), a `comparison` (a table against another product), or
 * both, then `facts` and `questions`.
 *
 * To add a page: add an entry here, link it from the list at the end of the about section in
 * web/index.html, then run `npm run build`.
 */

const NO_LIMIT = "There is no set limit. Your files are held in your browser's memory, so how much it can handle depends on your device.";

export const PAGES = [
    {
        slug: 'merge-pdf',
        title: 'Merge PDF files without uploading them · docstack',
        description: 'Combine several PDFs into one in your browser. See every page, drag them into order, delete what you do not need and download. Free, and nothing is uploaded.',
        heading: 'Merge PDF files, privately.',
        lede: 'Nothing is uploaded. Your PDFs are combined on this device, even with Wi‑Fi turned off.',
        aboutHeading: 'Combine PDF files into one',
        aboutIntro: 'Add two PDFs or twenty and docstack lays out every page, grouped by the file it came from. You decide the order before anything is merged, and the files stay on your device.',
        steps: [
            ['Add your PDFs', 'Choose or drop the files you want to combine. Each one appears as a group of pages under its file name.'],
            ['Put them in order', "Drag pages where they belong, or use a file's menu to move its whole group to the start or the end. Delete the pages you do not need."],
            ['Download the merged PDF', 'Name the file and download it. Everything you arranged is written into one PDF.'],
        ],
        factsHeading: 'What happens to your pages',
        facts: [
            ['Quality', 'Pages are copied into the new PDF as they are. Text stays selectable and images are not recompressed.'],
            ['Page sizes', 'Every page keeps its own size, so A4, Letter and landscape pages can sit in the same file.'],
            ['Adding more', 'Drop another file onto the pages and a line shows where it will land. You can also insert a file or a blank page between any two pages.'],
            ['Protected PDFs', 'A password-protected PDF opens once you enter its password. Its pages are added as images, and docstack tells you before you download.'],
            ['Other files', 'Images, PowerPoint and Word files can go into the same PDF.'],
        ],
        questions: [
            ['How many PDFs can I merge at once?', NO_LIMIT],
            ['Does merging reduce quality?', 'No. Pages are copied as they are. The exceptions are pages you redact and pages from password-protected PDFs, which are saved as images.'],
            ['Can I merge only some pages of a PDF?', 'Yes. Delete the pages you do not want before you download, or select the ones you do want and download only those.'],
            ['Can I undo a mistake?', 'Yes. Every change can be undone and redone, including deleting pages.'],
        ],
    },
    {
        slug: 'reorder-pdf-pages',
        title: 'Reorder PDF pages in your browser · docstack',
        description: 'Rearrange the pages of a PDF by dragging them, or send a page straight to a page number. Works across several files. Free, and nothing is uploaded.',
        heading: 'Reorder PDF pages, privately.',
        lede: 'Nothing is uploaded. Pages are rearranged on this device, and PDFs keep working with Wi‑Fi turned off.',
        aboutHeading: 'Rearrange the pages of a PDF',
        aboutIntro: 'Open a PDF and every page appears as a thumbnail you can pick up and move. It works the same for one file or several, and the pages are rearranged on your device.',
        steps: [
            ['Open your PDF', 'Choose or drop the file. Make the pages smaller for an overview, or larger to read them.'],
            ['Move the pages', 'Drag a page to its new place. Select several to move them together, even from one file into another.'],
            ['Download the result', 'Download the rearranged PDF, or select some pages and download only those.'],
        ],
        factsHeading: 'Ways to move a page',
        facts: [
            ['Drag', 'Pick up one page, or select several and move them together.'],
            ['Select', 'Click, Ctrl or ⌘ click, Shift click, or drag a box around pages. On a touch screen, long-press a page.'],
            ['Keyboard', 'Alt with the left or right arrow moves the selected pages earlier or later.'],
            ['Page number', 'Open a page, press M and type the position it should move to.'],
            ['Start or end', "A file's menu moves its whole group of pages to the start or the end in one step."],
            ['In the preview', 'The thumbnail strip beside an open page can be dragged too, so you can reorder while you read.'],
        ],
        questions: [
            ['Can I move several pages at once?', 'Yes. Select them, then drag any one of them and the whole selection moves together.'],
            ['Can I undo a move?', 'Yes. Undo and redo cover every change, and each confirmation has an Undo button.'],
            ['Does reordering change the pages themselves?', 'No. Pages are copied into the new PDF as they are, so text stays selectable.'],
            ['Can I rotate or delete pages too?', 'Yes. Select the pages, then press R to rotate them or Delete to remove them.'],
        ],
    },
    {
        slug: 'redact-pdf',
        title: 'Redact a PDF without uploading it · docstack',
        description: 'Draw boxes over text or images in a PDF and download a copy where that content is gone, not just covered. It runs in your browser, so the file is never uploaded.',
        heading: 'Redact a PDF, privately.',
        lede: 'Nothing is uploaded. Cover what should not be shared, and it is removed from the PDF you download.',
        aboutHeading: 'Remove sensitive content from a PDF',
        aboutIntro: 'Draw a box over a name, an account number or a signature, and docstack removes it from the copy you download. The content is not just hidden under the box: it is no longer in the file.',
        steps: [
            ['Open the page', 'Add your PDF, then open the page you want to redact. It fills the window, and you can zoom in.'],
            ['Draw over the content', 'Choose Redact and drag across the text or image to cover it. Click a box to select it, and press Delete to remove it.'],
            ['Download the redacted PDF', 'Thumbnails show exactly what will be covered. Download when it looks right, and check the file before you share it.'],
        ],
        factsHeading: 'How redaction works here',
        facts: [
            ['The page', 'A redacted page is saved as a picture of the page with the boxes drawn in. What was underneath is not in the file, so it cannot be selected, copied or recovered.'],
            ['Other pages', 'Pages without a box are copied as they are and keep their selectable text.'],
            ['The trade-off', 'Text on a redacted page can no longer be selected or searched, because the whole page is now an image. It may also look less sharp when you zoom in.'],
            ['Other files', 'Images, PowerPoint slides and Word pages you add can be redacted the same way.'],
        ],
        questions: [
            ['Is the text under a box really gone?', 'Yes. The downloaded page is an image, so there is no text left to copy or search, and nothing sits underneath the box.'],
            ['Can I change a redaction after drawing it?', 'Until you download, yes. Select a box and press Delete, undo the last box, or clear them all.'],
            ['Does docstack find the words to redact for me?', 'No. You draw each box yourself, so go through every page that needs it.'],
            ['Why not draw a black box in another editor?', 'A shape drawn on top of a page can leave the text underneath in the file, where it can still be copied. Here the text is removed.'],
        ],
    },
    {
        slug: 'word-to-pdf',
        title: 'Convert Word to PDF on your own device · docstack',
        description: 'Turn .docx, .doc, .odt and .rtf files into PDF with selectable text. The conversion runs in your browser, so the document is never uploaded. Free.',
        heading: 'Convert Word to PDF, privately.',
        lede: 'Your document is not uploaded. It is converted on this device, with text you can still select.',
        aboutHeading: 'Convert a Word document to PDF',
        aboutIntro: 'Add a .docx, .doc, .odt or .rtf file and docstack turns it into PDF pages with text you can still select. The conversion runs in your browser, so the document is not sent to a server.',
        steps: [
            ['Add your document', 'Choose or drop one or more Word files. The first time, your browser downloads the conversion tool, which can take a moment.'],
            ['Check the pages', 'Every page appears as a thumbnail. Open one to read it at full size, and reorder, rotate or delete pages if you need to.'],
            ['Download the PDF', 'Name the file and download it. Several documents become one PDF, in the order you arranged them.'],
        ],
        factsHeading: 'What to expect from the conversion',
        facts: [
            ['First use', 'Converting needs a tool of about 50 MB, downloaded from ZetaOffice the first time you add a Word or PowerPoint file. Your browser keeps it, so later files convert in seconds.'],
            ['On your device', 'The tool is ZetaOffice, a version of LibreOffice that runs inside your browser tab. Your document is opened and converted there, not on a server.'],
            ['Fonts', 'A font that is not available is replaced with a close match, which can move line and page breaks. Check the pages before you download.'],
            ['Connection', 'Converting Word files needs a connection, unlike working with PDFs and images.'],
            ['PowerPoint', 'PowerPoint files (.pptx, .ppt and .odp) are converted the same way.'],
        ],
        questions: [
            ['Is my document sent to a server?', 'No. Only the conversion tool is downloaded. The document itself is converted in your browser tab.'],
            ['Will the PDF look the same as it does in Word?', 'It follows the layout of the document, but fonts that are not available are replaced with close matches, so check the result.'],
            ['Can I convert password-protected Word files?', 'No. Remove the password in Word first, or export the document as a PDF from Word and add that.'],
            ['Can I convert Excel files?', 'Not here. A spreadsheet rarely fits a page well, so export it as a PDF from Excel, where you can choose the print area and scaling, then add the PDF.'],
        ],
    },
    {
        slug: 'images-to-pdf',
        title: 'Turn JPG and PNG images into a PDF, privately · docstack',
        description: 'Turn JPG, PNG, WebP, GIF, BMP and AVIF images into one PDF, a page per image, at full resolution. It runs in your browser, so nothing is uploaded. Free.',
        heading: 'Turn images into a PDF, privately.',
        lede: 'Nothing is uploaded. Photos and scans become PDF pages on this device, even with Wi‑Fi turned off.',
        aboutHeading: 'Turn photos and scans into a PDF',
        aboutIntro: 'Add images and each one becomes a page. Put them in order, turn any that are sideways, and download them as one PDF. The images stay on your device.',
        steps: [
            ['Add your images', 'Choose or drop JPG, PNG, WebP, GIF, BMP or AVIF files. Each becomes one page.'],
            ['Arrange the pages', 'Drag them into order. Press R to rotate a selected page, or Delete to remove it.'],
            ['Download the PDF', 'Name the file and download it. All the images are in one PDF.'],
        ],
        factsHeading: 'What happens to your images',
        facts: [
            ['Resolution', 'Photos are embedded at full resolution. JPG and PNG files go into the PDF as they are; other formats are converted to JPG or PNG first.'],
            ['Sideways photos', 'A photo the camera saved sideways is turned upright, and saved again as a high-quality JPG to do so.'],
            ['Page size', 'Each page takes the shape of its image, so nothing is cropped or stretched. A large photo gets a page no longer than an A4 sheet and still keeps its full resolution.'],
            ['Offline', 'Once this page has loaded, images are converted with Wi‑Fi turned off.'],
            ['Other files', 'Images can sit next to PDFs, PowerPoint and Word files in the same PDF, and parts of an image can be redacted like any other page.'],
        ],
        questions: [
            ['Does turning an image into a PDF reduce its quality?', 'Not for JPG and PNG files, which go into the PDF as they are. Other formats are converted to JPG or PNG at high quality.'],
            ['Can I put several images into one PDF?', 'Yes. Add them all, drag them into order and download one PDF.'],
            ['Can I add a photo to a PDF I already have?', 'Yes. Open the PDF, then drop the image where you want it or insert it between two pages.'],
            ['Can I turn a PDF back into images?', 'No. docstack makes PDFs; it does not save pages as image files.'],
        ],
    },
    {
        slug: 'offline-pdf-merger',
        title: 'An offline PDF merger that runs in your browser · docstack',
        description: 'Merge, reorder, rotate and redact PDFs with no internet connection. Open docstack once, go offline and keep working. Nothing to install, and nothing is uploaded.',
        heading: 'Merge PDFs offline, privately.',
        lede: 'Open this page, then turn off Wi‑Fi. PDFs and images are still merged and arranged on this device.',
        aboutHeading: 'Merge PDFs with no internet connection',
        aboutIntro: 'docstack is a web page that does its work on your device. Once it has loaded, it needs nothing more from the network for PDFs and images, so you can disconnect and keep working.',
        steps: [
            ['Open docstack while online', 'Load this page and give it a few seconds. The parts that read and write PDFs are fetched right after it opens.'],
            ['Go offline', 'Turn off Wi‑Fi or unplug the cable. Keep this tab open, because opening the page again needs a connection.'],
            ['Merge and download', 'Add PDFs and images, arrange the pages and download the result. The PDF is written by your browser, not fetched from a server.'],
        ],
        factsHeading: 'What works without a connection',
        facts: [
            ['Works offline', 'Opening PDFs and images, reordering, rotating and deleting pages, inserting blank pages, redacting, and downloading the merged PDF.'],
            ['Needs a connection', 'Loading the page in the first place, and converting PowerPoint and Word files.'],
            ['Nothing to install', 'docstack is not a program you download. It runs in the browser you already have, with no account.'],
            ['A way to check', 'A tool that keeps working with the connection off is not relying on a server to handle your files. It is a simple way to test a privacy claim yourself.'],
        ],
        questions: [
            ['Do I need to install anything to merge PDFs offline?', 'No. Open docstack in your browser while you are online, then disconnect. There is no installer.'],
            ['Can I open docstack with no connection at all?', 'Not the first time, and not after closing the tab. The page has to load once while you are online; after that it keeps working until you close it.'],
            ['Is it slower offline?', 'No. The work was always done on your device, so the connection makes no difference to PDFs and images.'],
            ['Can I convert Word files offline?', 'No. Converting PowerPoint and Word files needs a connection. PDFs and images do not.'],
        ],
    },
    {
        slug: 'ilovepdf-alternative',
        title: 'A private, open source alternative to iLovePDF · docstack',
        description: 'docstack merges, arranges and redacts PDFs in your browser, not on a server. Free and open source. See how it compares with iLovePDF and what it leaves out.',
        heading: 'A private alternative to iLovePDF.',
        lede: 'Nothing is uploaded. docstack merges, arranges and redacts PDFs on this device, and its code is open source.',
        aboutHeading: 'An open source alternative to iLovePDF',
        aboutIntro: 'iLovePDF is a large set of online PDF tools that work on files you upload. docstack does fewer things, and does them on your device: the files you add are never sent to a server. Here is how the two compare.',
        // Everything said about iLovePDF comes from its own help, pricing and home pages. Check those
        // pages again before changing a row, and update the date in the note.
        comparison: {
            columns: ['docstack', 'iLovePDF'],
            rows: [
                ['Where files go', 'Nowhere. They are opened and merged in your browser tab.', 'To its servers. iLovePDF says files are deleted within two hours of being processed.'],
                ['Offline', 'PDFs and images keep working once the page has loaded.', 'The website needs a connection. There is a separate desktop app.'],
                ['Price', 'Free. There is no paid plan.', 'Free with limits on processing and file size. A paid plan removes them.'],
                ['Source code', 'Open source under the MIT License.', 'Not open source.'],
                ['Tools', 'Merge, reorder, rotate, delete, insert, extract and redact pages. Converts images, Word and PowerPoint to PDF.', 'Many more, including compress, split, PDF to Word, OCR and signing.'],
            ],
            note: 'Details about iLovePDF are from its own help and pricing pages in October 2026 and may have changed.',
        },
        factsHeading: 'Which one to use',
        facts: [
            ['Use docstack', 'When the document is private, when you want to see and arrange every page before merging, or when you would rather not upload anything.'],
            ['Use iLovePDF', 'When you need something docstack does not do, such as compressing a PDF, converting a PDF to Word, running OCR or collecting signatures.'],
            ['Not included', 'docstack does not compress PDFs, split one into several files in a single step, convert PDFs into other formats, recognise text in scans or sign documents.'],
        ],
        questions: [
            ['Is docstack connected with iLovePDF?', 'No. docstack is an independent open source project and has no connection with iLovePDF.'],
            ['Is an online PDF tool safe for private documents?', 'It depends on where the work happens. A tool that uploads your file asks you to trust how it is stored and deleted. docstack never receives the file, so that question does not come up.'],
            ['Can I check that nothing is uploaded?', 'Yes. Turn off Wi‑Fi after the page has loaded and keep working, or read the code on GitHub.'],
            ['Does docstack limit file size?', NO_LIMIT],
        ],
    },
];
