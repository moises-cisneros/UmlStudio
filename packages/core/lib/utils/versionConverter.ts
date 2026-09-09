import type {
  UMLModel,
  UmlStudioNode,
  UmlStudioEdge,
  Assessment,
} from "../typings";
import { transformEdges } from "../services/migration/EdgeTransformer";
import { STRAIGHT_HOOK_EDGE_TYPES } from "../edges/edgeRoutingBehavior";
import { UMLDiagramType } from "../types/DiagramType";
import { ClassStereotype } from "../types/nodes/enums";
import type { IPoint } from "../edges/Connection";
import type {
  V3DiagramFormat,
  V3UMLModel,
  V3UMLElement,
  V3UMLRelationship,
  V3Assessment,
  V3Message,
  V3Messages,
  ObjectNodeProps,
  CommunicationObjectNodeProps,
  ComponentNodeProps,
  ComponentSubsystemNodeProps,
  DeploymentNodeProps,
  DeploymentComponentProps,
  PetriNetPlaceProps,
  BPMNTaskProps,
  BPMNGatewayProps,
  BPMNEventProps,
  ReachabilityGraphMarkingProps,
} from "./v3Typings";
import { log } from "../logger";
import { applyTags, taggableElements } from "./tagUtils";
import { INTERFACE } from "./geometry/routingConstants";

import type { ClassNodeProps } from "../types/nodes/NodeProps";
type MessageData = { id: string; text: string; direction: "target" | "source" };

export const CURRENT_MODEL_VERSION = "4.3.0" as const;
const STRAIGHT_WAYPOINT_MODEL_MINOR = 2;

function normalizeImportedInterfaceGeometry(
  nodeType: string,
  position: { x: number; y: number },
  width: number,
  height: number,
): { position: { x: number; y: number }; width: number; height: number } {
  const isInterfaceNode =
    nodeType === "componentInterface" || nodeType === "deploymentInterface";

  if (!isInterfaceNode) {
    return { position, width, height };
  }

  if (width === INTERFACE.SIZE && height === INTERFACE.SIZE) {
    return { position, width, height };
  }

  return {
    position: {
      x: position.x + (width - INTERFACE.SIZE) / 2,
      y: position.y + (height - INTERFACE.SIZE) / 2,
    },
    width: INTERFACE.SIZE,
    height: INTERFACE.SIZE,
  };
}

interface V2DiagramFormat {
  version: string;
  size: {
    width: number;
    height: number;
  };
  type: string;
  interactive: {
    elements: string[];
    relationships: string[];
  };
  elements: V3UMLElement[];
  relationships: V3UMLRelationship[];
  assessments: V3Assessment[];
}

export function convertV2ToV4(v2Data: V2DiagramFormat): UMLModel {
  const v3Data: V3DiagramFormat = {
    id: "converted-diagram-" + Date.now(),
    title: "Converted Diagram",
    model: {
      version: "3.0.0",
      type: v2Data.type,
      size: v2Data.size,
      interactive: {
        elements: {},
        relationships: {},
      },
      elements: {},
      relationships: {},
      assessments: {},
    },
  };

  if (v2Data.interactive?.elements) {
    v2Data.interactive.elements.forEach((id) => {
      v3Data.model.interactive.elements[id] = true;
    });
  }

  if (v2Data.interactive?.relationships) {
    v2Data.interactive.relationships.forEach((id) => {
      v3Data.model.interactive.relationships[id] = true;
    });
  }

  if (v2Data.elements) {
    v2Data.elements.forEach((element) => {
      v3Data.model.elements[element.id] = element;
    });
  }
  if (v2Data.relationships) {
    v2Data.relationships.forEach((relationship) => {
      v3Data.model.relationships[relationship.id] = relationship;
    });
  }

  if (v2Data.assessments) {
    v2Data.assessments.forEach((assessment) => {
      v3Data.model.assessments[assessment.modelElementId] = assessment;
    });
  }

  return convertV3ToV4(v3Data);
}

export function isV2Format(data: any): data is V2DiagramFormat {
  return (
    data &&
    data.version &&
    data.version.startsWith("2.") &&
    data.size &&
    data.type &&
    Array.isArray(data.elements) &&
    Array.isArray(data.relationships) &&
    Array.isArray(data.assessments) &&
    data.interactive &&
    Array.isArray(data.interactive.elements) &&
    Array.isArray(data.interactive.relationships) &&
    !data.model
  );
}

export function convertV3HandleToV4(v3Handle: string): string {
  const handleMap: Record<string, string> = {
    Up: "top",
    Right: "right",
    Down: "bottom",
    Left: "left",

    Upright: "right-top",
    Upleft: "left-top",
    Downright: "right-bottom",
    Downleft: "left-bottom",

    RightTop: "top-right",
    RightBottom: "bottom-right",
    LeftTop: "top-left",
    LeftBottom: "bottom-left",

    Topright: "top-right",
    Topleft: "top-left",
    Bottomright: "bottom-right",
    Bottomleft: "bottom-left",
  };

  return handleMap[v3Handle] || v3Handle.toLowerCase();
}

export function convertV3NodeTypeToV4(v3Type: string): string {
  const typeMap: Record<string, string> = {
    Class: "class",
    AbstractClass: "class",
    Interface: "class",
    Enumeration: "class",
    Package: "package",
    ClassAttribute: "classAttribute",
    ClassMethod: "classMethod",

    ActivityInitialNode: "activityInitialNode",
    ActivityFinalNode: "activityFinalNode",
    ActivityActionNode: "activityActionNode",
    ActivityObjectNode: "activityObjectNode",
    ActivityForkNode: "activityForkNode",
    ActivityForkNodeHorizontal: "activityForkNodeHorizontal",
    ActivityMergeNode: "activityMergeNode",
    ActivityDecisionNode: "activityMergeNode",
    Activity: "activity",

    UseCase: "useCase",
    UseCaseActor: "useCaseActor",
    UseCaseSystem: "useCaseSystem",

    CommunicationObject: "communicationObjectName",

    Component: "component",
    ComponentInterface: "componentInterface",
    Subsystem: "componentSubsystem",

    DeploymentNode: "deploymentNode",
    DeploymentComponent: "deploymentComponent",
    DeploymentArtifact: "deploymentArtifact",
    DeploymentInterface: "deploymentInterface",

    ObjectName: "objectName",
    ObjectAttribute: "objectAttribute",
    ObjectMethod: "objectMethod",

    PetriNetPlace: "petriNetPlace",
    PetriNetTransition: "petriNetTransition",

    ReachabilityGraphMarking: "reachabilityGraphMarking",

    SyntaxTreeNonterminal: "syntaxTreeNonterminal",
    SyntaxTreeTerminal: "syntaxTreeTerminal",

    FlowchartProcess: "flowchartProcess",
    FlowchartDecision: "flowchartDecision",
    FlowchartInputOutput: "flowchartInputOutput",
    FlowchartFunctionCall: "flowchartFunctionCall",
    FlowchartTerminal: "flowchartTerminal",

    BPMNTask: "bpmnTask",
    BPMNGateway: "bpmnGateway",
    BPMNStartEvent: "bpmnStartEvent",
    BPMNIntermediateEvent: "bpmnIntermediateEvent",
    BPMNEndEvent: "bpmnEndEvent",
    BPMNSubprocess: "bpmnSubprocess",
    BPMNTransaction: "bpmnTransaction",
    BPMNCallActivity: "bpmnCallActivity",
    BPMNAnnotation: "bpmnAnnotation",
    BPMNDataObject: "bpmnDataObject",
    BPMNDataStore: "bpmnDataStore",
    BPMNPool: "bpmnPool",
    BPMNGroup: "bpmnGroup",

    SfcStart: "sfcStart",
    SfcStep: "sfcStep",
    SfcActionTable: "sfcActionTable",
    SfcTransitionBranch: "sfcTransitionBranch",
    SfcJump: "sfcJump",
    SfcPreviewSpacer: "sfcPreviewSpacer",
  };

  return typeMap[v3Type] || v3Type.toLowerCase();
}

export function convertV3EdgeTypeToV4(
  v3Type: string,
  flowType?: string,
): string {
  const edgeTypeMap: Record<string, string> = {
    ClassBidirectional: "ClassBidirectional",
    ClassUnidirectional: "ClassUnidirectional",
    ClassInheritance: "ClassInheritance",
    ClassRealization: "ClassRealization",
    ClassDependency: "ClassDependency",
    ClassAggregation: "ClassAggregation",
    ClassComposition: "ClassComposition",

    ActivityControlFlow: "ActivityControlFlow",

    UseCaseAssociation: "UseCaseAssociation",
    UseCaseInclude: "UseCaseInclude",
    UseCaseExtend: "UseCaseExtend",
    UseCaseGeneralization: "UseCaseGeneralization",

    CommunicationLink: "CommunicationLink",

    ComponentDependency: "ComponentDependency",
    ComponentInterfaceProvided: "ComponentProvidedInterface",
    ComponentInterfaceRequired: "ComponentRequiredInterface",
    ComponentInterfaceRequiredQuarter: "ComponentRequiredQuarterInterface",
    ComponentInterfaceRequiredThreeQuarter:
      "ComponentRequiredThreeQuarterInterface",

    DeploymentDependency: "DeploymentDependency",
    DeploymentAssociation: "DeploymentAssociation",
    DeploymentInterfaceProvided: "DeploymentProvidedInterface",
    DeploymentInterfaceRequired: "DeploymentRequiredInterface",
    DeploymentInterfaceRequiredQuarter: "DeploymentRequiredQuarterInterface",
    DeploymentInterfaceRequiredThreeQuarter:
      "DeploymentRequiredThreeQuarterInterface",

    ObjectLink: "ObjectLink",

    PetriNetArc: "PetriNetArc",

    ReachabilityGraphArc: "ReachabilityGraphArc",

    SyntaxTreeLink: "SyntaxTreeLink",

    FlowchartFlowline: "FlowChartFlowline",
  };
  if (v3Type === "BPMNFlow" && flowType) {
    const flowTypeMap: Record<string, string> = {
      sequence: "BPMNSequenceFlow",
      message: "BPMNMessageFlow",
      association: "BPMNAssociationFlow",
      dataAssociation: "BPMNDataAssociationFlow",
    };
    return flowTypeMap[flowType] || "BPMNSequenceFlow";
  }

  return edgeTypeMap[v3Type] || v3Type;
}

function calculateRelativePosition(
  child: V3UMLElement,
  parent: V3UMLElement,
): { x: number; y: number } {
  return {
    x: child.bounds.x - parent.bounds.x,
    y: child.bounds.y - parent.bounds.y,
  };
}

function sortedByBoundsY(elements: V3UMLElement[]): V3UMLElement[] {
  return elements.sort((a, b) => (a.bounds?.y ?? 0) - (b.bounds?.y ?? 0));
}

function convertV3NodeDataToV4(
  element: V3UMLElement,
  allElements: Record<string, V3UMLElement>,
): any {
  const baseData = {
    name: element.name,
    ...(element.fillColor && { fillColor: element.fillColor }),
    ...(element.strokeColor && { strokeColor: element.strokeColor }),
    ...(element.textColor && { textColor: element.textColor }),
    ...(element.highlight && { highlight: element.highlight }),
    ...(element.assessmentNote && { assessmentNote: element.assessmentNote }),
  };

  switch (element.type) {
    case "Class":
    case "AbstractClass":
    case "Interface":
    case "Enumeration": {
      const attributes: Array<{ id: string; name: string }> = [];
      const methods: Array<{ id: string; name: string }> = [];
      sortedByBoundsY(Object.values(allElements)).forEach((childElement) => {
        if (childElement.owner === element.id) {
          if (childElement.type === "ClassAttribute") {
            attributes.push({
              id: childElement.id,
              name: childElement.name,
              ...(childElement.fillColor && {
                fillColor: childElement.fillColor,
              }),
              ...(childElement.textColor && {
                textColor: childElement.textColor,
              }),
            });
          } else if (childElement.type === "ClassMethod") {
            methods.push({
              id: childElement.id,
              name: childElement.name,
              ...(childElement.fillColor && {
                fillColor: childElement.fillColor,
              }),
              ...(childElement.textColor && {
                textColor: childElement.textColor,
              }),
            });
          }
        }
      });

      let stereotype: ClassStereotype | undefined;
      let isAbstract = false;
      if (element.type === "AbstractClass") {
        isAbstract = true;
      } else if (element.type === "Interface") {
        stereotype = ClassStereotype.Interface;
      } else if (element.type === "Enumeration") {
        stereotype = ClassStereotype.Enumeration;
      }

      const classData: ClassNodeProps = {
        ...baseData,
        methods,
        attributes,
        ...(stereotype && { stereotype }),
        ...(isAbstract && { isAbstract: true }),
      };
      return classData;
    }

    case "ObjectName": {
      const attributes: Array<{ id: string; name: string }> = [];
      const methods: Array<{ id: string; name: string }> = [];

      sortedByBoundsY(Object.values(allElements)).forEach((childElement) => {
        if (childElement.owner === element.id) {
          if (childElement.type === "ObjectAttribute") {
            attributes.push({
              id: childElement.id,
              name: childElement.name,
              ...(childElement.fillColor && {
                fillColor: childElement.fillColor,
              }),
              ...(childElement.textColor && {
                textColor: childElement.textColor,
              }),
            });
          } else if (childElement.type === "ObjectMethod") {
            methods.push({
              id: childElement.id,
              name: childElement.name,
              ...(childElement.fillColor && {
                fillColor: childElement.fillColor,
              }),
              ...(childElement.textColor && {
                textColor: childElement.textColor,
              }),
            });
          }
        }
      });

      const objectData: ObjectNodeProps = {
        ...baseData,
        methods,
        attributes,
      };
      return objectData;
    }

    case "CommunicationObject": {
      const attributes: Array<{ id: string; name: string }> = [];
      const methods: Array<{ id: string; name: string }> = [];
      sortedByBoundsY(Object.values(allElements)).forEach((childElement) => {
        if (childElement.owner === element.id) {
          if (childElement.type === "ObjectAttribute") {
            attributes.push({
              id: childElement.id,
              name: childElement.name,
              ...(childElement.fillColor && {
                fillColor: childElement.fillColor,
              }),
              ...(childElement.textColor && {
                textColor: childElement.textColor,
              }),
            });
          } else if (childElement.type === "ObjectMethod") {
            methods.push({
              id: childElement.id,
              name: childElement.name,
              ...(childElement.fillColor && {
                fillColor: childElement.fillColor,
              }),
              ...(childElement.textColor && {
                textColor: childElement.textColor,
              }),
            });
          }
        }
      });
      const communicationData: CommunicationObjectNodeProps = {
        ...baseData,
        methods,
        attributes,
      };
      return communicationData;
    }

    case "Component": {
      const componentData: ComponentNodeProps = {
        ...baseData,
        isComponentHeaderShown: element.displayStereotype !== false,
      };
      return componentData;
    }

    case "ComponentSubsystem": {
      const subsystemData: ComponentSubsystemNodeProps = {
        ...baseData,
        isComponentSubsystemHeaderShown: element.displayStereotype !== false,
      };
      return subsystemData;
    }

    case "DeploymentNode": {
      const deploymentData: DeploymentNodeProps = {
        ...baseData,
        isComponentHeaderShown: element.displayStereotype !== false,
        stereotype: element.stereotype || "",
      };
      return deploymentData;
    }

    case "DeploymentComponent": {
      const deploymentComponentData: DeploymentComponentProps = {
        ...baseData,
        isComponentHeaderShown: element.displayStereotype !== false,
      };
      return deploymentComponentData;
    }

    case "PetriNetPlace": {
      let capacity: number | "Infinity" = "Infinity";
      if (element.capacity !== undefined) {
        if (typeof element.capacity === "number") {
          capacity = element.capacity;
        } else if (typeof element.capacity === "string") {
          if (element.capacity === "Infinity" || element.capacity === "∞") {
            capacity = "Infinity";
          } else {
            const parsed = parseFloat(element.capacity);
            capacity = isNaN(parsed) ? "Infinity" : parsed;
          }
        }
      }

      const petriNetData: PetriNetPlaceProps = {
        ...baseData,
        tokens: element.amountOfTokens || 0,
        capacity,
      };
      return petriNetData;
    }

    case "BPMNTask": {
      const bpmnTaskData: BPMNTaskProps = {
        ...baseData,
        taskType: (element.taskType as any) || "default",
        marker: (element.marker as any) || "none",
      };
      return bpmnTaskData;
    }

    case "BPMNGateway": {
      const bpmnGatewayData: BPMNGatewayProps = {
        ...baseData,
        gatewayType: (element.gatewayType as any) || "exclusive",
      };
      return bpmnGatewayData;
    }

    case "BPMNStartEvent": {
      const bpmnStartEventData: BPMNEventProps = {
        ...baseData,
        eventType: (element.eventType as any) || "default",
      };
      return bpmnStartEventData;
    }

    case "BPMNIntermediateEvent": {
      const bpmnIntermediateEventData: BPMNEventProps = {
        ...baseData,
        eventType: (element.eventType as any) || "default",
      };
      return bpmnIntermediateEventData;
    }

    case "BPMNEndEvent": {
      const bpmnEndEventData: BPMNEventProps = {
        ...baseData,
        eventType: (element.eventType as any) || "default",
      };
      return bpmnEndEventData;
    }

    case "ReachabilityGraphMarking": {
      const reachabilityData: ReachabilityGraphMarkingProps = {
        ...baseData,
        isInitialMarking: element.isInitialMarking || false,
      };
      return reachabilityData;
    }

    case "BPMNSubprocess":
    case "BPMNTransaction":
    case "BPMNCallActivity":
    case "BPMNAnnotation":
    case "BPMNDataObject":
    case "BPMNDataStore":
    case "BPMNPool":
    case "BPMNGroup":
      return baseData;

    default:
      return baseData;
  }
}
export function convertV3MessagesToV4(
  messages: V3Messages | MessageData[] | undefined,
): MessageData[] {
  if (!messages) {
    return [];
  }

  if (Array.isArray(messages)) {
    return messages as MessageData[];
  }

  if (typeof messages === "object" && messages !== null) {
    return Object.values(messages).map((message: V3Message) => ({
      text: message.name,
      direction: message.direction === "source" ? "target" : "source",
      id: message.id,
    }));
  }

  return [];
}

function convertV3ElementToV4Node(
  element: V3UMLElement,
  allElements: Record<string, V3UMLElement>,
): UmlStudioNode {
  const nodeType = convertV3NodeTypeToV4(element.type);
  let position = { x: element.bounds.x, y: element.bounds.y };
  if (element.owner) {
    const parent = allElements[element.owner];
    if (parent) {
      position = calculateRelativePosition(element, parent);
    }
  }

  const data = convertV3NodeDataToV4(element, allElements);
  const normalizedGeometry = normalizeImportedInterfaceGeometry(
    nodeType,
    position,
    element.bounds.width,
    element.bounds.height,
  );

  const baseNode: UmlStudioNode = {
    id: element.id,
    type: nodeType as any,
    position: normalizedGeometry.position,
    width: normalizedGeometry.width,
    height: normalizedGeometry.height,
    measured: {
      width: normalizedGeometry.width,
      height: normalizedGeometry.height,
    },
    data,
    ...(element.owner && { parentId: element.owner }),
  };

  return baseNode;
}

function convertV3RelationshipToV4Edge(
  relationship: V3UMLRelationship,
): UmlStudioEdge {
  const edgeType = convertV3EdgeTypeToV4(
    relationship.type,
    relationship.flowType,
  );
  let points: IPoint[] = [];
  if (relationship.path && relationship.path.length > 0) {
    points = relationship.path.map((point) => ({
      x: point.x + relationship.bounds.x,
      y: point.y + relationship.bounds.y,
    }));
  }
  if (STRAIGHT_HOOK_EDGE_TYPES.has(edgeType as string)) {
    points = [];
  }

  const edge: UmlStudioEdge = {
    id: relationship.id,
    source: relationship.source.element,
    target: relationship.target.element,
    type: edgeType as any,
    sourceHandle: convertV3HandleToV4(relationship.source.direction || ""),
    targetHandle: convertV3HandleToV4(relationship.target.direction || ""),
    data: {
      label: relationship.name || "",
      sourceMultiplicity: relationship.source.multiplicity || "",
      targetMultiplicity: relationship.target.multiplicity || "",
      sourceRole: relationship.source.role || "",
      targetRole: relationship.target.role || "",
      isManuallyLayouted: relationship.isManuallyLayouted || false,
      messages: convertV3MessagesToV4(relationship.messages),
      ...(relationship.flowType && { flowType: relationship.flowType }),
      ...(relationship.fillColor && { fillColor: relationship.fillColor }),
      ...(relationship.strokeColor && {
        strokeColor: relationship.strokeColor,
      }),
      ...(relationship.textColor && { textColor: relationship.textColor }),
      ...(relationship.highlight && { highlight: relationship.highlight }),
      ...(relationship.assessmentNote && {
        assessmentNote: relationship.assessmentNote,
      }),
      points: points,
    },
  };

  return edge;
}

function convertV3AssessmentToV4(v3Assessment: V3Assessment): Assessment {
  return {
    modelElementId: v3Assessment.modelElementId,
    elementType: v3Assessment.elementType as any,
    score: v3Assessment.score,
    ...(v3Assessment.feedback && { feedback: v3Assessment.feedback }),
    ...(v3Assessment.dropInfo && { dropInfo: v3Assessment.dropInfo }),
    ...(v3Assessment.label && { label: v3Assessment.label }),
    ...(v3Assessment.labelColor && { labelColor: v3Assessment.labelColor }),
    ...(v3Assessment.correctionStatus && {
      correctionStatus: v3Assessment.correctionStatus,
    }),
  };
}

export function convertV3ToV4(v3Data: V3DiagramFormat | V3UMLModel): UMLModel {
  const model: V3UMLModel =
    (v3Data as V3DiagramFormat).model || (v3Data as V3UMLModel);
  const id =
    (v3Data as V3DiagramFormat).id || "converted-diagram-" + Date.now();
  const title = (v3Data as V3DiagramFormat).title || "";

  const nodes: UmlStudioNode[] = Object.values(model.elements)
    .filter(
      (element) =>
        ![
          "ClassAttribute",
          "ClassMethod",
          "ObjectAttribute",
          "ObjectMethod",
          "ColorDescription",
          "TitleAndDescription",
        ].includes(element.type),
    )
    .map((element) => convertV3ElementToV4Node(element, model.elements));

  const edges: UmlStudioEdge[] = Object.values(model.relationships).map(
    (relationship) => convertV3RelationshipToV4Edge(relationship),
  );

  const assessments: Record<string, Assessment> = {};
  if (model.assessments) {
    Object.entries(model.assessments).forEach(([id, v3Assessment]) => {
      try {
        assessments[id] = convertV3AssessmentToV4(v3Assessment);
      } catch (error) {
        log.warn(`Failed to convert assessment for element ${id}:`, error);
      }
    });
  }

  return {
    version: CURRENT_MODEL_VERSION,
    id,
    title,
    type: model.type as UMLDiagramType,
    nodes,
    edges,
    assessments,
    interactive:
      model.interactive &&
        (Object.values(model.interactive.elements ?? {}).some(Boolean) ||
          Object.values(model.interactive.relationships ?? {}).some(Boolean))
        ? {
          elements: Object.fromEntries(
            Object.entries(model.interactive.elements ?? {}).filter(
              ([, included]) => included,
            ),
          ),
          relationships: Object.fromEntries(
            Object.entries(model.interactive.relationships ?? {}).filter(
              ([, included]) => included,
            ),
          ),
        }
        : undefined,
  };
}

export function isV3Format(data: any): data is V3DiagramFormat {
  const wrapped =
    data &&
    data.model &&
    data.model.version &&
    typeof data.model.version === "string" &&
    data.model.version.startsWith("3.") &&
    data.model.elements &&
    data.model.relationships &&
    typeof data.model.elements === "object" &&
    typeof data.model.relationships === "object";

  const flat =
    data &&
    data.version &&
    typeof data.version === "string" &&
    data.version.startsWith("3.") &&
    data.elements &&
    data.relationships &&
    typeof data.elements === "object" &&
    typeof data.relationships === "object";

  return !!(wrapped || flat);
}

export function isV4Format(data: any): data is UMLModel {
  return (
    data &&
    data.version &&
    data.version.startsWith("4.") &&
    Array.isArray(data.nodes) &&
    Array.isArray(data.edges) &&
    data.edges.every(
      (edge: unknown) =>
        edge != null &&
        typeof edge === "object" &&
        ((edge as { data?: unknown }).data == null ||
          typeof (edge as { data: unknown }).data === "object"),
    )
  );
}

export function normalizeClassStereotypes(model: UMLModel): UMLModel {
  const V4_STEREOTYPE: Record<string, ClassStereotype> = {
    Interface: ClassStereotype.Interface,
    Enumeration: ClassStereotype.Enumeration,
  };
  for (const node of model.nodes) {
    if (node.type !== "class") continue;
    const data = node.data as ClassNodeProps;
    const raw = data.stereotype as unknown as string | undefined;
    if (raw === "Abstract") {
      data.isAbstract = true;
      delete (data as { stereotype?: unknown }).stereotype;
      if (typeof node.height === "number") node.height -= 10;
      if (node.measured && typeof node.measured.height === "number") {
        node.measured.height -= 10;
      }
    } else if (raw && raw in V4_STEREOTYPE) {
      data.stereotype = V4_STEREOTYPE[raw];
    }
    if (data.stereotype && data.isAbstract) {
      data.isAbstract = false;
    }
  }
  return model;
}

export function normalizeElementTags(model: UMLModel): UMLModel {
  for (const { data } of taggableElements(model.nodes)) {
    if ("tags" in data) applyTags(data, data.tags);
  }
  return model;
}

export function normalizeStraightEdgeWaypoints(model: UMLModel): UMLModel {
  const match = /^4\.(\d+)\.(\d+)$/.exec(model.version);
  if (!match) return model;
  const minor = Number(match[1]);
  if (minor < STRAIGHT_WAYPOINT_MODEL_MINOR) {
    for (const edge of model.edges) {
      if (!STRAIGHT_HOOK_EDGE_TYPES.has(edge.type ?? "")) continue;
      const data = edge.data as
        | (Record<string, unknown> & { points?: unknown })
        | null
        | undefined;
      if (data && Array.isArray(data.points)) data.points = [];
    }
    model.version = CURRENT_MODEL_VERSION;
  }
  return model;
}

function stripRuntimeInteractionState(model: UMLModel): UMLModel {
  let changed = false;

  const nodes = model.nodes.map((node) => {
    if (
      !("selected" in node) &&
      !("dragging" in node) &&
      !("resizing" in node)
    ) {
      return node;
    }

    changed = true;
    const persistentNode = { ...node } as UmlStudioNode & {
      selected?: unknown;
      dragging?: unknown;
      resizing?: unknown;
    };
    delete persistentNode.selected;
    delete persistentNode.dragging;
    delete persistentNode.resizing;
    return persistentNode;
  });

  const edges = model.edges.map((edge) => {
    if (!("selected" in edge)) return edge;

    changed = true;
    const persistentEdge = { ...edge } as UmlStudioEdge & {
      selected?: unknown;
    };
    delete persistentEdge.selected;
    return persistentEdge;
  });

  return changed ? { ...model, nodes, edges } : model;
}

export function normalizeModel(model: UMLModel): UMLModel {
  return stripRuntimeInteractionState(
    normalizeElementTags(
      normalizeClassStereotypes(
        sanitizeLegacyNodes(normalizeStraightEdgeWaypoints(model)),
      ),
    ),
  );
}

/**
 * Sanitize-on-load for the removed non-UML legacy node types. Persisted v4
 * snapshots (Yjs docs, Redis snapshots, IndexedDB `umlstudio-local`) that
 * still contain them are healed on first open: offending nodes are
 * discarded, all remaining nodes, edges and `model.title` are preserved,
 * and the model is stamped with the current 4.x version. Comparison is
 * case-insensitive so no casing variant of the removed types can slip
 * through.
 */
function sanitizeLegacyNodes(model: UMLModel): UMLModel {
  const LEGACY_NODE_TYPES: ReadonlySet<string> = new Set([
    "colordescription",
    "titleanddesctiption",
  ]);
  const isLegacyNodeType = (type: unknown): boolean =>
    typeof type === "string" && LEGACY_NODE_TYPES.has(type.toLowerCase());
  if (!model.nodes.some((node) => isLegacyNodeType(node.type))) {
    return model;
  }
  return {
    ...model,
    version: CURRENT_MODEL_VERSION,
    nodes: model.nodes.filter((node) => !isLegacyNodeType(node.type)),
  };
}

export function importDiagram(data: any | V3UMLModel): UMLModel {
  let model: UMLModel;

  if (isV4Format(data)) {
    model = data;
  } else if (isV3Format(data)) {
    model = convertV3ToV4(data);
  } else if (isV2Format(data)) {
    model = convertV2ToV4(data);
  } else if (data.model) {
    return importDiagram(data.model);
  } else {
    throw new Error(
      "Unsupported diagram format. Only 2.x.x, 3.x.x and 4.x.x formats are supported.",
    );
  }

  return transformEdges(normalizeModel(model));
}
