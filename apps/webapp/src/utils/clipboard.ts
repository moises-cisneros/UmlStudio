import { Clipboard } from "@capacitor/clipboard";
import { isNativePlatform } from "./platform";

export async function copyToClipboard(value: string): Promise<void> {
  if (isNativePlatform()) {
    await Clipboard.write({ string: value });
  } else {
    await navigator.clipboard.writeText(value);
  }
}
