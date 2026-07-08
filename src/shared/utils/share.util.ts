export const calculateExpiryDate = (expiryValue: string): string | null => {
  if (expiryValue === "never") return null;

  const now = new Date();
  const unit = expiryValue.slice(-1);
  const val = parseInt(expiryValue);

  if (isNaN(val)) return null;

  switch (unit) {
    case "m":
      now.setMinutes(now.getMinutes() + val);
      break;
    case "h":
      now.setHours(now.getHours() + val);
      break;
    case "d":
      now.setDate(now.getDate() + val);
      break;
    default:
      return null;
  }

  return now.toISOString();
};
