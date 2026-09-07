import { ClassStereotype } from "./enums"

export type DefaultNodeProps = {
  name: string
  fillColor?: string
  strokeColor?: string
  textColor?: string
  tags?: string[]
}

export type ClassNodeElement = {
  id: string
  isAbstract?: boolean
} & DefaultNodeProps

export type ClassNodeProps = {
  methods: ClassNodeElement[]
  attributes: ClassNodeElement[]
  stereotype?: ClassStereotype
  isAbstract?: boolean
} & DefaultNodeProps
