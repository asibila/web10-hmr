import {
  CATEGORIES,
  type EntityClassification,
  OFFER_TYPES,
  STATES,
} from '@web10/shared';

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asId(value: unknown): string | null {
  if (typeof value === 'string') {
    return asString(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function asIsoDate(value: unknown): string | null {
  const text = asString(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSubcategory(value: unknown): string {
  const text = asString(value);

  if (!text) {
    return 'unknown';
  }

  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown'
  );
}

function normalizeCategory(value: unknown): string {
  const text = asString(value)?.toLowerCase();

  if (text && (CATEGORIES as readonly string[]).includes(text)) {
    return text;
  }

  return 'other';
}

function normalizeOfferType(value: unknown): string {
  const text = asString(value)?.toLowerCase();

  if (text && (OFFER_TYPES as readonly string[]).includes(text)) {
    return text;
  }

  return 'other';
}

function normalizeState(value: unknown): string {
  const text = asString(value)?.toUpperCase();

  if (text && (STATES as readonly string[]).includes(text)) {
    return text;
  }

  return 'UNKNOWN';
}

export function normalizeClassification(parsed: unknown): EntityClassification {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Classification output must be a JSON object.');
  }

  const root = parsed as Record<string, unknown>;
  const entity =
    root.entity && typeof root.entity === 'object' && !Array.isArray(root.entity)
      ? (root.entity as Record<string, unknown>)
      : root;

  return {
    category: normalizeCategory(entity.category),
    subcategory: normalizeSubcategory(entity.subcategory),
    title: asString(entity.title)?.slice(0, 500) ?? null,
    description_short:
      asString(entity.description_short)?.slice(0, 200) ?? null,
    description_full:
      asString(entity.description_full)?.slice(0, 20_000) ?? null,
    external_id: asId(entity.external_id),
    sku: asId(entity.sku),
    object_code: asId(entity.object_code),
    listing_type: asString(entity.listing_type),
    offer_type: normalizeOfferType(entity.offer_type),
    state: normalizeState(entity.state),
    created_at: asIsoDate(entity.created_at),
    expires_at: asIsoDate(entity.expires_at),
    view_count: asInteger(entity.view_count),
  };
}
