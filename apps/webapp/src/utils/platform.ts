import { Capacitor } from "@capacitor/core"

const test = (expr: RegExp): boolean =>
  typeof navigator !== "undefined" && expr.test(navigator.userAgent)

const isIpad = (): boolean =>
  test(/iPad/i) ||
  (test(/Macintosh/i) &&
    typeof matchMedia !== "undefined" &&
    matchMedia("(any-pointer:coarse)").matches)

export const isIOS = (): boolean => test(/iPhone|iPod/i) || isIpad()

export const isAndroid = (): boolean => test(/android|sink/i)

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform()

export const isMacLike = (): boolean => isIOS() || test(/mac/i)
