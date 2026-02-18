import { inferMaxGbpsFromGeneration } from "$lib/capability";
import type { CableProfile, LabelRecommendation } from "$lib/types";

const isTbOrUsb4 = (value?: string): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes("thunderbolt") ||
    normalized.includes("tb") ||
    normalized.includes("usb4")
  );
};

const getAdapterColor = (
  profile: CableProfile
): LabelRecommendation["adapterColor"] => {
  const { maxWatts, eprSupported } = profile.power;

  if (maxWatts === 0) {
    return "White";
  }
  if (eprSupported || (typeof maxWatts === "number" && maxWatts >= 240)) {
    return "Red";
  }
  if (typeof maxWatts === "number" && maxWatts >= 100 && maxWatts <= 140) {
    return "Orange";
  }
  if (maxWatts === 60) {
    return "Green";
  }
  return "Black";
};

const getVelcroColor = (
  profile: CableProfile
): LabelRecommendation["velcroColor"] => {
  if (
    profile.connectorFrom === "Lightning" ||
    profile.connectorTo === "Lightning"
  ) {
    return "Black";
  }

  const inferredGbps =
    profile.data.maxGbps ??
    inferMaxGbpsFromGeneration(profile.data.usbGeneration);

  if (isTbOrUsb4(profile.data.usbGeneration) || (inferredGbps ?? 0) >= 40) {
    return "Orange";
  }
  if ((inferredGbps ?? 0) >= 10) {
    return "Blue";
  }
  return "Black";
};

export const recommendLabels = (profile: CableProfile): LabelRecommendation => {
  const adapterColor = getAdapterColor(profile);
  const velcroColor = getVelcroColor(profile);

  const reasons: string[] = [];

  if (adapterColor === "Red") {
    reasons.push("Power class indicates 240W/EPR capability.");
  } else if (adapterColor === "Orange") {
    reasons.push("Printed or inferred power falls in the 100W-140W range.");
  } else if (adapterColor === "Green") {
    reasons.push("Printed power is 60W.");
  } else if (adapterColor === "White") {
    reasons.push("Cable appears data-only/non-charging.");
  } else {
    reasons.push(
      "Power signal is low or unknown, using the default Black adapter."
    );
  }

  if (
    profile.connectorFrom === "Lightning" ||
    profile.connectorTo === "Lightning"
  ) {
    reasons.push("Lightning connector paths are capped at USB 2.0 speeds.");
  } else if (velcroColor === "Orange") {
    reasons.push("Data capability signals USB4/Thunderbolt or 40Gbps+.");
  } else if (velcroColor === "Blue") {
    reasons.push("Data capability signals high-speed 10Gbps-20Gbps class.");
  } else {
    reasons.push(
      "Data/video capability is basic or unknown, using Black velcro."
    );
  }

  return {
    adapterColor,
    velcroColor,
    reasons,
  };
};
