export const formatTypeLabel = (type: string): string => {
  if (!type) return "";

  const lower = type.toLowerCase();

  if (lower === "ip") return "IP Address";
  if (lower === "ssh_key") return "SSH Key";

  const upper = type.toUpperCase();
  const acronyms = ["JSON", "URL", "OTP", "IP", "HTML", "ENV"];

  if (acronyms.includes(upper)) {
    return upper;
  }

  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
};

export function formatDate(
  date: string | number | Date | null | undefined,
  format: "absolute" | "relative" = "absolute",
): string {
  if (!date) return "N/A";

  const timestamp =
    date instanceof Date ? date.getTime() : new Date(date).getTime();

  if (format === "relative") {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const days = Math.floor(diff / 86400000);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!+bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const formatStorage = (bytes: number | undefined): string => {
  if (!bytes) return "0 B";
  return formatBytes(bytes);
};

export const formatRetention = (minutes: number | undefined): string => {
  if (!minutes || minutes === 0) return "Forever";
  const HOUR = 60;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  if (minutes % YEAR === 0) {
    const years = minutes / YEAR;
    return `${years} year${years > 1 ? "s" : ""}`;
  }
  if (minutes % MONTH === 0) {
    const months = minutes / MONTH;
    return `${months} month${months > 1 ? "s" : ""}`;
  }
  if (minutes % DAY === 0) {
    const days = minutes / DAY;
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (minutes % HOUR === 0) {
    const hours = minutes / HOUR;
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
};
