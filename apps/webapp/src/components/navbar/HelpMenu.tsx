import { FC } from "react"
import { HomeHelpMenu } from "@/components/home/HomeHelpMenu"

interface HelpMenuProps {
  color?: string
}

export const HelpMenu: FC<HelpMenuProps> = ({ color }) => (
  <HomeHelpMenu variant="editor" color={color} />
)
