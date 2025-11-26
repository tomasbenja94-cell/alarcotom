#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [rawKey, rawValue] = arg.split('=');
  if (!rawKey) return acc;
  const key = rawKey.replace(/^--/, '');
  const value = rawValue ?? 'true';
  acc[key] = value;
  return acc;
}, {});

const productsFile = args.productsFile ?? 'iamegenes y txt/o.txt';
const imagesDir = args.imagesDir ?? 'iamegenes y txt/imagenes_productos';
const baseUrl = args.baseUrl;
const outputFile = args.output ?? 'productos_con_url.csv';

if (!baseUrl) {
  console.error('❌ Debes indicar --baseUrl (ej: --baseUrl=https://tu-dominio.com/productos/imagenes_productos)');
  process.exit(1);
}

const ensurePath = (inputPath) => path.resolve(process.cwd(), inputPath);

const PRODUCTS_PATH = ensurePath(productsFile);
const IMAGES_DIR = ensurePath(imagesDir);
const OUTPUT_PATH = ensurePath(outputFile);

if (!fs.existsSync(PRODUCTS_PATH)) {
  console.error(`❌ No se encontró el archivo de productos: ${PRODUCTS_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(IMAGES_DIR)) {
  console.error(`❌ No se encontró la carpeta de imágenes: ${IMAGES_DIR}`);
  process.exit(1);
}

const CATEGORY_PREFIX_REGEX = /^\s*(?:\d+[\s_-]*)?\[([^\]]+)\]\s*/i;

const extractCategoryFromName = (rawName) => {
  let cleanName = rawName?.trim() ?? '';
  let explicitCategory = null;

  const match = cleanName.match(CATEGORY_PREFIX_REGEX);
  if (match) {
    explicitCategory = match[1]?.trim() ?? null;
    cleanName = cleanName.replace(match[0], '').trim();
  }

  return {
    cleanName,
    explicitCategory,
  };
};

const normalizeKey = (value, { stripCategory = false } = {}) => {
  if (!value) return '';
  let normalized = value
    .trim()
    .replace(/\.(jpg|jpeg|png|webp|gif)$/gi, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (stripCategory) {
    normalized = normalized.replace(/^\s*\[[^\]]+\]\s*/, '');
  }

  normalized = normalized.replace(/^[0-9]+\s*/, '').trim();
  return normalized;
};

const joinUrl = (root, fileName) => {
  const safeRoot = root.replace(/\/+$/, '');
  const segments = fileName.split(/[/\\]+/).map((segment) => encodeURIComponent(segment));
  return `${safeRoot}/${segments.join('/')}`;
};

const imageFiles = fs
  .readdirSync(IMAGES_DIR)
  .filter((file) => /\.(jpg|jpeg|png|webp|gif)$/i.test(file));

if (imageFiles.length === 0) {
  console.error(`❌ La carpeta ${IMAGES_DIR} no contiene imágenes válidas`);
  process.exit(1);
}

const imageMap = new Map();
const imageByIndex = new Map();

imageFiles.forEach((file) => {
  const original = file.trim();
  const keyFull = normalizeKey(original);
  const keyNoCat = normalizeKey(original, { stripCategory: true });
  const numberMatch = original.match(/^(\d+)/);
  if (numberMatch) {
    const numericIndex = Number(numberMatch[1]);
    if (!Number.isNaN(numericIndex)) {
      imageByIndex.set(numericIndex, original);
    }
  }

  if (!imageMap.has(keyFull)) {
    imageMap.set(keyFull, original);
  }
  if (!imageMap.has(keyNoCat)) {
    imageMap.set(keyNoCat, original);
  }
});

const productLines = fs.readFileSync(PRODUCTS_PATH, 'utf8').split(/\r?\n/).filter((line) => line.trim());

const outputLines = [];
const missingImages = [];

let productIndex = 0;

productLines.forEach((line, index) => {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith('#')) return;
  productIndex += 1;

  const lastCommaIndex = trimmedLine.lastIndexOf(',');
  if (lastCommaIndex === -1) {
    missingImages.push({
      lineNumber: index + 1,
      reason: 'No se encontró el separador de precio',
      raw: trimmedLine,
    });
    return;
  }

  const rawName = trimmedLine.substring(0, lastCommaIndex).trim();
  const price = trimmedLine.substring(lastCommaIndex + 1).trim();

  const { cleanName, explicitCategory } = extractCategoryFromName(rawName);
  const displayName = cleanName || rawName;

  const keyFull = normalizeKey(rawName);
  const keyNoCat = normalizeKey(rawName, { stripCategory: true }) || normalizeKey(cleanName);

  const matchedFile =
    imageMap.get(keyFull) ||
    imageMap.get(keyNoCat) ||
    imageByIndex.get(productIndex);

  if (!matchedFile) {
    missingImages.push({
      lineNumber: index + 1,
      reason: 'No se encontró una imagen que coincida',
      raw: rawName,
    });
    return;
  }

  const url = joinUrl(baseUrl, matchedFile);
  const prefixedName = explicitCategory ? `[${explicitCategory}] ${displayName}` : displayName;
  outputLines.push(`${prefixedName},${price},${url}`);
});

fs.writeFileSync(OUTPUT_PATH, outputLines.join('\n'), 'utf8');

console.log(`✅ Archivo generado: ${OUTPUT_PATH}`);
console.log(`📦 Productos procesados: ${outputLines.length}`);

if (missingImages.length > 0) {
  console.warn('⚠ Algunos productos no pudieron vincularse con una imagen:');
  missingImages.slice(0, 10).forEach((item) => {
    console.warn(`  - Línea ${item.lineNumber}: ${item.raw} (${item.reason})`);
  });
  if (missingImages.length > 10) {
    console.warn(`  ... y ${missingImages.length - 10} más`);
  }
} else {
  console.log('🖼 Todas las líneas encontraron imagen.');
}

