const PD_MENTION_REGEX = /\b(?:PD|Power\s+Delivery)\b/i;
const PD_NEGATIVE_REGEX =
  /\b(?:(?:not\s+compatible\s+with|does\s+not\s+support)\s+(?:USB[\s-]+)?(?:Power\s+Delivery|PD)|(?:Power\s+Delivery|PD)\s+(?:is\s+)?not\s+supported)\b/i;

// An explicit incompatibility takes precedence over incidental PD mentions.
// Absence of a PD statement remains unknown, not false.
export const parsePowerDeliverySupport = (
  text: string
): { supported: boolean; snippet: string } | undefined => {
  const negative = text.match(PD_NEGATIVE_REGEX);
  if (negative) {
    return { supported: false, snippet: negative[0] };
  }
  const mention = text.match(PD_MENTION_REGEX);
  return mention ? { supported: true, snippet: mention[0] } : undefined;
};
