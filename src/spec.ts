export type ElementType = "text" | "image" | "button";

export type ElementRole = "primary" | "hero" | "action" | "secondary" | "branding";

export type Priority = 1 | 2 | 3;

export interface AdElementSpec {
  id: string;
  type: ElementType;
  role: ElementRole;
  priority: Priority;
  content?: string;
  imageAlt?: string;
}

export interface AdSpec {
  id: string;
  elements: AdElementSpec[];
}

const VALID_TYPES: ElementType[] = ["text", "image", "button"];
const VALID_ROLES: ElementRole[] = ["primary", "hero", "action", "secondary", "branding"];
const VALID_PRIORITIES: Priority[] = [1, 2, 3];

export interface AdSpecInput {
  id: string;
  elements: AdElementSpec[];
}

export function defineAd(input: AdSpecInput): AdSpec {
  if (!input.id || input.id.trim().length === 0) {
    throw new Error("defineAd: an ad spec needs a non-empty id");
  }

  if (input.elements.length === 0) {
    throw new Error(`defineAd("${input.id}"): an ad needs at least one element`);
  }

  const seenIds = new Set<string>();

  for (const element of input.elements) {
    if (!element.id || element.id.trim().length === 0) {
      throw new Error(`defineAd("${input.id}"): every element needs a non-empty id`);
    }

    if (seenIds.has(element.id)) {
      throw new Error(`defineAd("${input.id}"): duplicate element id "${element.id}"`);
    }
    seenIds.add(element.id);

    if (!VALID_TYPES.includes(element.type)) {
      throw new Error(
        `defineAd("${input.id}"): element "${element.id}" has invalid type "${element.type}". Expected one of ${VALID_TYPES.join(", ")}`,
      );
    }

    if (!VALID_ROLES.includes(element.role)) {
      throw new Error(
        `defineAd("${input.id}"): element "${element.id}" has invalid role "${element.role}". Expected one of ${VALID_ROLES.join(", ")}`,
      );
    }

    if (!VALID_PRIORITIES.includes(element.priority)) {
      throw new Error(
        `defineAd("${input.id}"): element "${element.id}" has invalid priority "${element.priority}". Expected 1, 2 or 3`,
      );
    }

    if (element.type === "button" && element.role !== "action") {
      throw new Error(
        `defineAd("${input.id}"): element "${element.id}" is a button but its role is "${element.role}". Buttons should carry role "action" since tap-target rules key off that role`,
      );
    }
  }

  return { id: input.id, elements: input.elements };
}
