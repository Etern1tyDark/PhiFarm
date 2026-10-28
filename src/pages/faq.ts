/** Shown on the landing page and emitted as FAQPage structured data; the two must stay identical. */
export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'How is Phigros RKS calculated?',
    a: 'Your RKS is the average of 30 slots: your best 27 chart scores plus the constants of your 3 best APs (100% accuracy). A chart is worth ((accuracy − 55) / 45)² × its constant between 70% and 100% accuracy, nothing below 70%, and exactly its constant on an AP.',
  },
  {
    q: 'How much accuracy does one Good cost?',
    a: 'A Good counts as 65% of a Perfect, so on a chart with N notes each Good costs 35 / N accuracy points. On a 1,000-note chart that is 0.035% per Good. Drag and Flick notes cannot be Good, which is why charts with many of them are easier to hold at high accuracy.',
  },
  {
    q: 'Does PhiFarm upload my B30 image?',
    a: 'No. The image is read in your browser with Tesseract OCR and compared against a small chart database. There is no server and no account. Your scores are stored in your browser and can be exported as a file. Only the OCR engine files are downloaded from a CDN the first time you read an image.',
  },
  {
    q: 'Which B30 images are supported?',
    a: 'Images from phibot.dev / the PhiBot Discord bot and from the Phigros Score Lookup (PSL) Discord bot, in either language. Other renders can be aligned with the grid calibration sliders, or you can enter scores by hand.',
  },
  {
    q: 'Why does my RKS differ slightly from the game?',
    a: 'The game rounds RKS to two decimals, and PhiFarm shows four. PSL images only print accuracy to two decimals, so a total read from one can be off by about 0.002. A phibot.dev image prints four decimals and reproduces your RKS exactly.',
  },
];
