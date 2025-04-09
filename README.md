# brocconi

[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/3825fe86-83bd-4da7-9d1e-1fa20e21023b.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/3825fe86-83bd-4da7-9d1e-1fa20e21023b)
[![Node.js CI](https://github.com/ragaeeb/brocconi/actions/workflows/build.yml/badge.svg)](https://github.com/ragaeeb/brocconi/actions/workflows/build.yml)
![GitHub License](https://img.shields.io/github/license/ragaeeb/brocconi)
![GitHub Release](https://img.shields.io/github/v/release/ragaeeb/brocconi)
![typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label&color=blue)
![Types](https://img.shields.io/npm/types/brocconi)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ragaeeb/brocconi?utm_source=oss&utm_medium=github&utm_campaign=ragaeeb%2Fbrocconi&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
![Node & Bun](https://img.shields.io/badge/Works%20with-Node%20%26%20Bun-green)
![Maintenance](https://img.shields.io/maintenance/yes/2025)
![npm](https://img.shields.io/npm/v/brocconi)
![npm](https://img.shields.io/npm/dm/brocconi)

A CLI for OCRing images using `Gemini AI` with `ocr.space` as a fallback.

## Installation

```bash
# Clone the repository
git clone https://github.com/ragaeeb/brocconi.git
cd brocconi

# Install dependencies
bun install

# Link the command globally (optional)
```

```bash
brocconi [options] <directory> [<directory2> ...]
```

## Prerequisites

This library uses `pdftoppm` to convert the PDF to images which can be used for OCR. Ensure you have `pdftoppm` installed.

You can download it using homebrew:

```bash
brew install poppler
pdftoppm -v
```

## Commands

### Set API keys

In order to make calls to the Gemini API, you need to have your API keys set. Get your [API keys](https://aistudio.google.com/app/apikey) from Google AI Studio. Then you can set it like this:

```bash
bunx brocconi -k "GEMINI_API_KEY"
```

To work around rate-limiting, you can also set multiple API keys:

```bash
bunx brocconi -k "GEMINI_API_KEY1 GEMINI_API_KEY2 GEMINI_API_KEY3"
```

At runtime, the app will pick a random one.

#### Set ocr.space API key

Sometimes Gemini fails to OCR the image. The app will retry with different models, but if it cannot succeed with any of them, it can fall back to using a different platform like ocr.space. If you want this fallback, you can get a ocr.space [key](https://ocr.space/ocrapi/freekey). Then set the key like this:

```bash
bunx brocconi -b "OCRSPACEKEY"
```

### OCR a PDF

```bash
bunx brocconi /path/to/file.pdf
```

This will process the PDF and output the results to `/path/to/file.json`.

### Specify output file

```bash
bunx brocconi /path/to/file.pdf -o ./outputFile.json
```

### Extract footnotes

This will do a best-effort to identify footnotes separate from the paragraph body text and include the footnote text in a `footnotes` property per page.

```bash
bunx brocconi /path/to/file.pdf -f
```

### Include Volume Number

If you have a multi-volume book, you can include the `part` number like this.

```bash
bunx brocconi /path/to/file.pdf -p 3
```

This will add `part: 3` for each page.

### Delete all uploads before starting

In case of errors, you might want to do a cleanup of all the previously uploaded files. You can run the reset command like this:

```bash
bunx brocconi /path/to/file.pdf -r
```

This will first delete all the files in your Gemini AI Studio, then start OCR. Be careful with this command, it deletes ALL the files in your Gemini AI Studio. Use cautiously! The author of this package is NOT responsible for you accidentally erasing your data.

## Method

`brocconi` works by turning the PDF into images, filtering out blank pages so we don't waste API calls, then giving Gemini an image with an expected output how the OCR results should behave (this is called the "training image"), then giving the actual page to OCR. This allows fine-tuning and improving accuracy of how to format the text back.
