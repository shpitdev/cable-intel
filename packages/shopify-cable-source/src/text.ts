const stripBalancedTags = (value: string): string => {
  let cursor = 0;
  let output = "";

  while (cursor < value.length) {
    const tagStart = value.indexOf("<", cursor);
    if (tagStart === -1) {
      output += value.slice(cursor);
      break;
    }

    const tagEnd = value.indexOf(">", tagStart + 1);
    if (tagEnd === -1) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, tagStart);
    output += " ";
    cursor = tagEnd + 1;
  }

  return output;
};

export const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

export const cleanText = (value: string | undefined | null): string => {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(stripBalancedTags(value));
};
