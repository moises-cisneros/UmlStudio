export const canDropIntoParent = (childType: string, parentType: string): boolean => {
  if (parentType === "package") {
    return childType === "class" || childType === "package"
  }

  return true
}
