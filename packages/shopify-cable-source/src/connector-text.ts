interface ConnectorPairMatch {
  from: string;
  matchedText: string;
  to: string;
}

interface ConnectorTokenMatch {
  connector: string;
  matchedText: string;
  nextIndex: number;
}

const createConnectorTokenMatch = (
  connector: string,
  matchedText: string,
  nextIndex: number
): ConnectorTokenMatch => {
  return {
    connector,
    matchedText,
    nextIndex,
  };
};

const tokenizeConnectorWords = (text: string): string[] => {
  const words: string[] = [];
  let current = "";

  for (const character of text.toLowerCase()) {
    const isDigit = character >= "0" && character <= "9";
    const isLowercaseLetter = character >= "a" && character <= "z";

    if (isDigit || isLowercaseLetter || character === ".") {
      current += character;
      continue;
    }

    if (current.length > 0) {
      words.push(current);
      current = "";
    }
  }

  if (current.length > 0) {
    words.push(current);
  }

  return words;
};

const isDigitsOnly = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }

  for (const character of value) {
    if (character < "0" || character > "9") {
      return false;
    }
  }

  return true;
};

const readLightningToken = (
  words: string[],
  startIndex: number
): ConnectorTokenMatch | null => {
  if (words[startIndex] !== "lightning") {
    return null;
  }

  return createConnectorTokenMatch("Lightning", "lightning", startIndex + 1);
};

const readMicroUsbToken = (
  words: string[],
  startIndex: number
): ConnectorTokenMatch | null => {
  const current = words[startIndex];
  if (current === "microusb") {
    return createConnectorTokenMatch("Micro-USB", "micro usb", startIndex + 1);
  }

  if (current === "micro" && words[startIndex + 1] === "usb") {
    return createConnectorTokenMatch("Micro-USB", "micro usb", startIndex + 2);
  }

  return null;
};

const readCollapsedUsbToken = (
  words: string[],
  startIndex: number
): ConnectorTokenMatch | null => {
  const current = words[startIndex];
  switch (current) {
    case "usbc":
      return createConnectorTokenMatch("USB-C", "usb c", startIndex + 1);
    case "usba":
      return createConnectorTokenMatch("USB-A", "usb a", startIndex + 1);
    case "usb3":
    case "usb3.0":
      return createConnectorTokenMatch("USB-A", "usb 3.0", startIndex + 1);
    default:
      return null;
  }
};

const readSplitUsbToken = (
  words: string[],
  startIndex: number
): ConnectorTokenMatch | null => {
  if (words[startIndex] !== "usb") {
    return null;
  }

  const next = words[startIndex + 1];
  switch (next) {
    case "c":
      return createConnectorTokenMatch("USB-C", "usb c", startIndex + 2);
    case "a":
      return createConnectorTokenMatch("USB-A", "usb a", startIndex + 2);
    case "3":
    case "3.0":
      return createConnectorTokenMatch("USB-A", "usb 3.0", startIndex + 2);
    default:
      return null;
  }
};

const readThunderboltToken = (
  words: string[],
  startIndex: number
): ConnectorTokenMatch | null => {
  const current = words[startIndex];
  if (!current?.startsWith("thunderbolt")) {
    return null;
  }

  const suffix = current.slice("thunderbolt".length);
  if (isDigitsOnly(suffix)) {
    return createConnectorTokenMatch(
      "USB-C",
      `thunderbolt ${suffix}`,
      startIndex + 1
    );
  }

  const next = words[startIndex + 1];
  if (next && isDigitsOnly(next)) {
    return createConnectorTokenMatch(
      "USB-C",
      `thunderbolt ${next}`,
      startIndex + 2
    );
  }

  return createConnectorTokenMatch("USB-C", "thunderbolt", startIndex + 1);
};

const readConnectorToken = (
  words: string[],
  startIndex: number
): ConnectorTokenMatch | null => {
  return (
    readLightningToken(words, startIndex) ??
    readMicroUsbToken(words, startIndex) ??
    readCollapsedUsbToken(words, startIndex) ??
    readSplitUsbToken(words, startIndex) ??
    readThunderboltToken(words, startIndex)
  );
};

export const collectNormalizedConnectors = (text: string): string[] => {
  const connectors = new Set<string>();
  const words = tokenizeConnectorWords(text);

  for (let index = 0; index < words.length; index += 1) {
    const token = readConnectorToken(words, index);
    if (!token) {
      continue;
    }

    connectors.add(token.connector);
    index = token.nextIndex - 1;
  }

  return [...connectors];
};

export const extractConnectorPairFromText = (
  text: string
): ConnectorPairMatch | null => {
  const words = tokenizeConnectorWords(text);

  for (let index = 0; index < words.length; index += 1) {
    const from = readConnectorToken(words, index);
    if (!from || words[from.nextIndex] !== "to") {
      continue;
    }

    const to = readConnectorToken(words, from.nextIndex + 1);
    if (!to) {
      continue;
    }

    return {
      from: from.connector,
      matchedText: `${from.matchedText} to ${to.matchedText}`,
      to: to.connector,
    };
  }

  return null;
};
