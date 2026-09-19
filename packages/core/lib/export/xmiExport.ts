import type { UMLModel, UmlStudioNode, UmlStudioEdge } from "../typings";
import {
  DiagramEdgeTypeRecord,
  DiagramNodeTypeRecord,
} from "../modelElementTypes";

export interface XmiExportOptions {
  /**
   * Target tool dialect for XMI compatibility.
   * @default "EnterpriseArchitect"
   */
  targetDialect?: "EnterpriseArchitect" | "GenericOMG";
  /**
   * XMI version standard.
   * @default "2.1"
   */
  xmiVersion?: "2.1" | "2.5.1";
  /**
   * Exported package/diagram root name.
   */
  diagramName?: string;
}

export interface XmiExportResult {
  /** Serialized XML/XMI content */
  xmiContent: string;
  /** Suggested filename for download/saving */
  filename: string;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mapVisibilityToXmi(
  symbol?: string,
): "public" | "private" | "protected" | "package" {
  switch (symbol) {
    case "-":
      return "private";
    case "#":
      return "protected";
    case "~":
      return "package";
    case "+":
    default:
      return "public";
  }
}

function mapPrimitiveTypeHref(typeName: string): string {
  const norm = typeName.trim().toLowerCase();
  if (norm === "string")
    return "http://schema.omg.org/spec/UML/2.1/uml.xml#String";
  if (norm === "integer" || norm === "int")
    return "http://schema.omg.org/spec/UML/2.1/uml.xml#Integer";
  if (
    norm === "real" ||
    norm === "float" ||
    norm === "double" ||
    norm === "number"
  ) {
    return "http://schema.omg.org/spec/UML/2.1/uml.xml#Real";
  }
  if (norm === "boolean" || norm === "bool")
    return "http://schema.omg.org/spec/UML/2.1/uml.xml#Boolean";
  return `http://schema.omg.org/spec/UML/2.1/uml.xml#${typeName.trim()}`;
}

function getDuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function buildMultiplicityXml(
  multStr: string | undefined,
  idPrefix: string,
  defaultIfMissing = false,
): string[] {
  const trimmed = multStr?.trim() || (defaultIfMissing ? "0..*" : "");
  if (!trimmed) return [];
  const lines: string[] = [];

  if (trimmed === "1") {
    lines.push(
      `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lv" value="1" />`,
    );
    lines.push(
      `          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_uv" value="1" />`,
    );
  } else if (trimmed === "0..1") {
    lines.push(
      `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lv" value="0" />`,
    );
    lines.push(
      `          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_uv" value="1" />`,
    );
  } else if (trimmed === "1..*") {
    lines.push(
      `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lv" value="1" />`,
    );
    lines.push(
      `          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${idPrefix}_uv" value="-1" />`,
    );
  } else if (trimmed === "*" || trimmed === "0..*") {
    lines.push(
      `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lv" value="0" />`,
    );
    lines.push(
      `          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${idPrefix}_uv" value="-1" />`,
    );
  } else {
    const parts = trimmed.split("..");
    if (parts.length === 2) {
      lines.push(
        `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lv" value="${parts[0].trim()}" />`,
      );
      if (parts[1].trim() === "*") {
        lines.push(
          `          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${idPrefix}_uv" value="-1" />`,
        );
      } else {
        lines.push(
          `          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_uv" value="${parts[1].trim()}" />`,
        );
      }
    }
  }
  return lines;
}

function serializeNode(
  node: UmlStudioNode,
  allEdges: UmlStudioEdge[],
): string[] {
  const lines: string[] = [];
  const nodeData = node.data as {
    name?: string;
    stereotype?: string;
    isAssociationClass?: boolean;
    associationEdgeId?: string;
    attributes?: Array<{ id?: string; name: string }>;
    methods?: Array<{ id?: string; name: string }>;
  };
  const name = escapeXml(String(nodeData?.name || "Unnamed"));
  const stereotype = String(nodeData?.stereotype || "").toLowerCase();
  const isAssocClass = Boolean(
    nodeData?.isAssociationClass ||
    allEdges.some(
      (e) =>
        (e.data as Record<string, unknown> | undefined)
          ?.associationClassNodeId === node.id,
    ),
  );
  const isPackage = node.type === DiagramNodeTypeRecord.package;
  const isInterface = stereotype === "interface";
  const isEnumeration = stereotype === "enumeration";
  const isAbstract = stereotype === "abstract";

  let elementType = "uml:Class";
  if (isAssocClass) elementType = "uml:AssociationClass";
  else if (isPackage) elementType = "uml:Package";
  else if (isInterface) elementType = "uml:Interface";
  else if (isEnumeration) elementType = "uml:Enumeration";

  const abstractAttr = isAbstract ? ' isAbstract="true"' : "";
  lines.push(
    `    <packagedElement xmi:type="${elementType}" xmi:id="${escapeXml(node.id)}" name="${name}"${abstractAttr}>`,
  );

  // Serialise Attributes
  if (Array.isArray(nodeData?.attributes)) {
    nodeData.attributes.forEach(
      (attr: { id?: string; name: string }, idx: number) => {
        const raw = attr.name || "";
        const match = raw.match(
          /^\s*([+\-#~])?\s*([a-zA-Z0-9_$]+)(?:\s*:\s*([a-zA-Z0-9_$<>,. ]+))?/,
        );
        const visSymbol = match?.[1] || "+";
        const attrName = escapeXml(match?.[2] || raw.trim() || `attr_${idx}`);
        const typeName = match?.[3]?.trim();
        const visibility = mapVisibilityToXmi(visSymbol);
        const attrId = escapeXml(attr.id || `attr_${node.id}_${idx}`);

        lines.push(
          `      <ownedAttribute xmi:type="uml:Property" xmi:id="${attrId}" name="${attrName}" visibility="${visibility}">`,
        );
        if (typeName) {
          lines.push(
            `        <type xmi:type="uml:PrimitiveType" href="${escapeXml(mapPrimitiveTypeHref(typeName))}" />`,
          );
        }
        lines.push("      </ownedAttribute>");
      },
    );
  }

  // Serialise Methods / Operations
  if (Array.isArray(nodeData?.methods)) {
    nodeData.methods.forEach(
      (method: { id?: string; name: string }, idx: number) => {
        const raw = method.name || "";
        const match = raw.match(
          /^\s*([+\-#~])?\s*([a-zA-Z0-9_$]+)\s*(?:\((.*?)\))?(?:\s*:\s*([a-zA-Z0-9_$<>,. ]+))?/,
        );
        const visSymbol = match?.[1] || "+";
        const methodName = escapeXml(match?.[2] || raw.trim() || `op_${idx}`);
        const paramsRaw = match?.[3];
        const returnType = match?.[4]?.trim();
        const visibility = mapVisibilityToXmi(visSymbol);
        const opId = escapeXml(method.id || `op_${node.id}_${idx}`);

        lines.push(
          `      <ownedOperation xmi:type="uml:Operation" xmi:id="${opId}" name="${methodName}" visibility="${visibility}">`,
        );

        // In parameters
        if (paramsRaw && paramsRaw.trim()) {
          const paramTokens = paramsRaw.split(",");
          paramTokens.forEach((pt, pIdx) => {
            const pMatch = pt
              .trim()
              .match(/^([a-zA-Z0-9_$]+)(?:\s*:\s*([a-zA-Z0-9_$<>,. ]+))?/);
            const pName = escapeXml(pMatch?.[1] || `param_${pIdx}`);
            const pType = pMatch?.[2]?.trim();
            const pId = `${opId}_p_${pIdx}`;
            lines.push(
              `        <ownedParameter xmi:type="uml:Parameter" xmi:id="${pId}" name="${pName}" direction="in">`,
            );
            if (pType) {
              lines.push(
                `          <type xmi:type="uml:PrimitiveType" href="${escapeXml(mapPrimitiveTypeHref(pType))}" />`,
              );
            }
            lines.push("        </ownedParameter>");
          });
        }

        // Return parameter
        const retId = `${opId}_ret`;
        if (returnType && returnType.toLowerCase() !== "void") {
          lines.push(
            `        <ownedParameter xmi:type="uml:Parameter" xmi:id="${retId}" name="return" direction="return">`,
          );
          lines.push(
            `          <type xmi:type="uml:PrimitiveType" href="${escapeXml(mapPrimitiveTypeHref(returnType))}" />`,
          );
          lines.push("        </ownedParameter>");
        } else {
          lines.push(
            `        <ownedParameter xmi:type="uml:Parameter" xmi:id="${retId}" name="return" direction="return" type="EAnone_void" />`,
          );
        }

        lines.push("      </ownedOperation>");
      },
    );
  }

  // Inner Class Relationships: Generalizations & Realizations
  const nodeEdges = allEdges.filter((e) => e.source === node.id);
  nodeEdges.forEach((edge) => {
    if (edge.type === DiagramEdgeTypeRecord.ClassInheritance) {
      lines.push(
        `      <generalization xmi:type="uml:Generalization" xmi:id="${escapeXml(edge.id)}" general="${escapeXml(edge.target)}" />`,
      );
    } else if (edge.type === DiagramEdgeTypeRecord.ClassRealization) {
      lines.push(
        `      <interfaceRealization xmi:type="uml:InterfaceRealization" xmi:id="${escapeXml(edge.id)}" supplier="${escapeXml(edge.target)}" client="${escapeXml(edge.source)}" contract="${escapeXml(edge.target)}" />`,
      );
    }
  });

  if (isAssocClass) {
    const assocEdge = allEdges.find(
      (e) =>
        (e.data as Record<string, unknown> | undefined)
          ?.associationClassNodeId === node.id ||
        nodeData?.associationEdgeId === e.id,
    );
    if (assocEdge) {
      const cleanEdgeId = assocEdge.id.replace(/[^a-zA-Z0-9_]/g, "_");
      const srcPropId = `EAID_src_${cleanEdgeId}`;
      const dstPropId = `EAID_dst_${cleanEdgeId}`;
      lines.push(`      <memberEnd xmi:idref="${dstPropId}"/>`);
      lines.push(
        `      <ownedEnd xmi:type="uml:Property" xmi:id="${dstPropId}" visibility="public" association="${escapeXml(node.id)}" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false" aggregation="none">`,
      );
      lines.push(`        <type xmi:idref="${escapeXml(assocEdge.target)}"/>`);
      lines.push("      </ownedEnd>");
      lines.push(`      <memberEnd xmi:idref="${srcPropId}"/>`);
      lines.push(
        `      <ownedEnd xmi:type="uml:Property" xmi:id="${srcPropId}" visibility="public" association="${escapeXml(node.id)}" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="true" isDerivedUnion="false" aggregation="none">`,
      );
      lines.push(`        <type xmi:idref="${escapeXml(assocEdge.source)}"/>`);
      lines.push("      </ownedEnd>");
    }
  }

  lines.push("    </packagedElement>");
  return lines;
}

function serializeModelEdges(edges: UmlStudioEdge[]): string[] {
  const lines: string[] = [];

  edges.forEach((edge) => {
    if (
      edge.type === DiagramEdgeTypeRecord.ClassInheritance ||
      edge.type === DiagramEdgeTypeRecord.ClassRealization
    ) {
      // Generalizations and realizations are already rendered inside the class element
      return;
    }

    if (edge.type === DiagramEdgeTypeRecord.ClassDependency) {
      lines.push(
        `    <packagedElement xmi:type="uml:Dependency" xmi:id="${escapeXml(edge.id)}" supplier="${escapeXml(edge.target)}" client="${escapeXml(edge.source)}" />`,
      );
      return;
    }

    const edgeData = edge.data as {
      label?: string;
      sourceRole?: string;
      targetRole?: string;
      sourceMultiplicity?: string;
      targetMultiplicity?: string;
      associationClassNodeId?: string;
    };

    if (edgeData?.associationClassNodeId) {
      // Handled via uml:AssociationClass packagedElement
      return;
    }

    // Associations, Aggregations, Compositions
    const isComposition = edge.type === DiagramEdgeTypeRecord.ClassComposition;
    const isAggregation = edge.type === DiagramEdgeTypeRecord.ClassAggregation;
    const rawLabel =
      typeof edgeData?.label === "string" ? edgeData.label.trim() : "";
    const edgeName =
      rawLabel && !rawLabel.startsWith("assoc_") ? escapeXml(rawLabel) : "";
    const srcPropId = `prop_${edge.id}_src`;
    const tgtPropId = `prop_${edge.id}_tgt`;

    lines.push(
      `    <packagedElement xmi:type="uml:Association" xmi:id="${escapeXml(edge.id)}" name="${edgeName}">`,
    );
    lines.push(`      <memberEnd xmi:idref="${srcPropId}" />`);
    lines.push(`      <memberEnd xmi:idref="${tgtPropId}" />`);

    // Source End
    const rawSourceRole =
      typeof edgeData?.sourceRole === "string" &&
      edgeData.sourceRole.trim() &&
      edgeData.sourceRole.trim().toLowerCase() !== "source"
        ? edgeData.sourceRole.replace(/^\+/, "").trim()
        : "";
    const srcRoleName = rawSourceRole ? escapeXml(rawSourceRole) : "";
    lines.push(
      `      <ownedEnd xmi:type="uml:Property" xmi:id="${srcPropId}" name="${srcRoleName}" type="${escapeXml(edge.source)}" association="${escapeXml(edge.id)}">`,
    );
    const srcMultLines = buildMultiplicityXml(
      edgeData?.sourceMultiplicity,
      `${srcPropId}_mult`,
      false,
    );
    lines.push(...srcMultLines);
    lines.push("      </ownedEnd>");

    // Target End
    const rawTargetRole =
      typeof edgeData?.targetRole === "string" &&
      edgeData.targetRole.trim() &&
      edgeData.targetRole.trim().toLowerCase() !== "target"
        ? edgeData.targetRole.replace(/^\+/, "").trim()
        : "";
    const tgtRoleName = rawTargetRole ? escapeXml(rawTargetRole) : "";
    const aggAttr = isComposition
      ? ' aggregation="composite"'
      : isAggregation
        ? ' aggregation="shared"'
        : "";
    lines.push(
      `      <ownedEnd xmi:type="uml:Property" xmi:id="${tgtPropId}" name="${tgtRoleName}" type="${escapeXml(edge.target)}"${aggAttr} association="${escapeXml(edge.id)}">`,
    );
    const tgtMultLines = buildMultiplicityXml(
      edgeData?.targetMultiplicity,
      `${tgtPropId}_mult`,
      false,
    );
    lines.push(...tgtMultLines);
    lines.push("      </ownedEnd>");

    lines.push("    </packagedElement>");
  });

  return lines;
}

function serializeEnterpriseArchitectConnectors(
  edges: UmlStudioEdge[],
  nodes: UmlStudioNode[],
): string[] {
  if (edges.length === 0) return [];
  const nodeMap = new Map(
    nodes.map((n) => {
      const d = n.data as Record<string, unknown> | undefined;
      return [n.id, typeof d?.name === "string" ? d.name : n.id];
    }),
  );
  const lines: string[] = ["    <connectors>"];

  edges.forEach((edge) => {
    const edgeData = edge.data as Record<string, unknown> | undefined;
    const rawLabel =
      typeof edgeData?.label === "string" ? edgeData.label.trim() : "";
    const edgeName =
      rawLabel && !rawLabel.startsWith("assoc_") ? escapeXml(rawLabel) : "";
    const edgeId = escapeXml(edge.id);
    const sourceNodeId = escapeXml(edge.source);
    const targetNodeId = escapeXml(edge.target);
    const sourceName = escapeXml(nodeMap.get(edge.source) || "SourceClass");
    const targetName = escapeXml(nodeMap.get(edge.target) || "TargetClass");

    let eaType: string;
    let direction: string;
    const sourceAgg = "none";
    let targetAgg = "none";
    let isAssoc = false;

    switch (edge.type) {
      case DiagramEdgeTypeRecord.ClassInheritance:
        eaType = "Generalization";
        direction = "Source -> Destination";
        break;
      case DiagramEdgeTypeRecord.ClassRealization:
        eaType = "Realisation";
        direction = "Source -> Destination";
        break;
      case DiagramEdgeTypeRecord.ClassComposition:
        eaType = "Aggregation";
        direction = "Source -> Destination";
        targetAgg = "composite";
        isAssoc = true;
        break;
      case DiagramEdgeTypeRecord.ClassAggregation:
        eaType = "Aggregation";
        direction = "Source -> Destination";
        targetAgg = "shared";
        isAssoc = true;
        break;
      case DiagramEdgeTypeRecord.ClassDependency:
        eaType = "Dependency";
        direction = "Source -> Destination";
        break;
      default:
        eaType = "Association";
        direction = "Unspecified";
        isAssoc = true;
        break;
    }

    if (!isAssoc) {
      lines.push(`      <connector xmi:idref="${edgeId}" name="${edgeName}">`);
      lines.push(`        <source xmi:idref="${sourceNodeId}">`);
      lines.push(`          <model type="Class" name="${sourceName}"/>`);
      lines.push(`          <type aggregation="${sourceAgg}"/>`);
      lines.push("        </source>");
      lines.push(`        <target xmi:idref="${targetNodeId}">`);
      lines.push(`          <model type="Class" name="${targetName}"/>`);
      lines.push(`          <type aggregation="${targetAgg}"/>`);
      lines.push("        </target>");
      lines.push(
        `        <properties ea_type="${eaType}" direction="${direction}"/>`,
      );
      lines.push('        <modifiers isRoot="false" isLeaf="false"/>');
      lines.push(
        '        <appearance linemode="3" linecolor="0" linewidth="0" seqno="0" headStyle="0" lineStyle="0"/>',
      );
      if (edgeName) {
        lines.push(`        <labels mt="${edgeName}"/>`);
      }
      lines.push("      </connector>");
      return;
    }

    const rawSourceRole =
      typeof edgeData?.sourceRole === "string" &&
      edgeData.sourceRole.trim() &&
      edgeData.sourceRole.trim().toLowerCase() !== "source"
        ? edgeData.sourceRole.replace(/^\+/, "").trim()
        : "";
    const rawTargetRole =
      typeof edgeData?.targetRole === "string" &&
      edgeData.targetRole.trim() &&
      edgeData.targetRole.trim().toLowerCase() !== "target"
        ? edgeData.targetRole.replace(/^\+/, "").trim()
        : "";
    const sourceRole = rawSourceRole ? escapeXml(rawSourceRole) : "";
    const targetRole = rawTargetRole ? escapeXml(rawTargetRole) : "";
    const srcMult =
      typeof edgeData?.sourceMultiplicity === "string" &&
      edgeData.sourceMultiplicity.trim()
        ? escapeXml(edgeData.sourceMultiplicity.trim())
        : "";
    const tgtMult =
      typeof edgeData?.targetMultiplicity === "string" &&
      edgeData.targetMultiplicity.trim()
        ? escapeXml(edgeData.targetMultiplicity.trim())
        : "";

    lines.push(`      <connector xmi:idref="${edgeId}" name="${edgeName}">`);
    lines.push(`        <source xmi:idref="${sourceNodeId}">`);
    lines.push(`          <model type="Class" name="${sourceName}"/>`);
    if (sourceRole) {
      lines.push(
        `          <role name="${sourceRole}" visibility="Public" targetScope="instance"/>`,
      );
    }
    const srcMultAttr = srcMult ? ` multiplicity="${srcMult}"` : "";
    lines.push(
      `          <type${srcMultAttr} aggregation="${sourceAgg}" containment="Unspecified"/>`,
    );
    lines.push("          <constraints/>");
    lines.push(
      '          <modifiers isOrdered="false" changeable="none" isNavigable="false"/>',
    );
    lines.push(
      '          <style value="Union=0;Derived=0;AllowDuplicates=0;Owned=0;Navigable=Unspecified;"/>',
    );
    lines.push("          <documentation/>");
    lines.push("          <xrefs/>");
    lines.push("          <tags/>");
    lines.push("        </source>");
    lines.push(`        <target xmi:idref="${targetNodeId}">`);
    lines.push(`          <model type="Class" name="${targetName}"/>`);
    if (targetRole) {
      lines.push(
        `          <role name="${targetRole}" visibility="Public" targetScope="instance"/>`,
      );
    }
    const tgtMultAttr = tgtMult ? ` multiplicity="${tgtMult}"` : "";
    lines.push(
      `          <type${tgtMultAttr} aggregation="${targetAgg}" containment="Unspecified"/>`,
    );
    lines.push("          <constraints/>");
    lines.push(
      '          <modifiers isOrdered="false" changeable="none" isNavigable="false"/>',
    );
    lines.push(
      '          <style value="Union=0;Derived=0;AllowDuplicates=0;Owned=0;Navigable=Unspecified;"/>',
    );
    lines.push("          <documentation/>");
    lines.push("          <xrefs/>");
    lines.push("          <tags/>");
    lines.push("        </target>");
    const assocClassNodeId =
      typeof edgeData?.associationClassNodeId === "string"
        ? edgeData.associationClassNodeId
        : undefined;
    const subtypeAttr = assocClassNodeId ? ' subtype="Class"' : "";
    lines.push(
      `        <properties ea_type="${eaType}"${subtypeAttr} direction="${direction}"/>`,
    );
    lines.push('        <modifiers isRoot="false" isLeaf="false"/>');
    lines.push(
      '        <appearance linemode="3" linecolor="0" linewidth="0" seqno="0" headStyle="0" lineStyle="0"/>',
    );

    const lbAttr = srcMult ? ` lb="${srcMult}"` : "";
    const ltAttr = sourceRole ? ` lt="+${sourceRole}"` : "";
    const mtAttr = edgeName ? ` mt="${edgeName}"` : "";
    const rbAttr = tgtMult ? ` rb="${tgtMult}"` : "";
    const rtAttr = targetRole ? ` rt="+${targetRole}"` : "";
    if (lbAttr || ltAttr || mtAttr || rbAttr || rtAttr) {
      lines.push(
        `        <labels${lbAttr}${ltAttr}${mtAttr}${rbAttr}${rtAttr}/>`,
      );
    }
    if (assocClassNodeId) {
      lines.push(
        `        <extendedProperties virtualInheritance="0" associationclass="${escapeXml(assocClassNodeId)}"/>`,
      );
    } else if (lbAttr || ltAttr || mtAttr || rbAttr || rtAttr) {
      lines.push('        <extendedProperties virtualInheritance="0"/>');
    }
    lines.push("      </connector>");
  });

  lines.push("    </connectors>");
  return lines;
}

function serializeEnterpriseArchitectExtension(
  modelId: string,
  packageId: string,
  diagramName: string,
  nodes: UmlStudioNode[],
  edges: UmlStudioEdge[],
): string[] {
  const cleanId = (modelId || "0001")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toUpperCase();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Build compact ptInstances string and formal <elements> for Enterprise Architect diagram geometry
  const ptInstancesList: string[] = [];
  const diagramElementsList: string[] = [];

  nodes.forEach((node, idx) => {
    const left = Math.round(node.position?.x ?? 100);
    const top = Math.round(node.position?.y ?? 100);
    const dataObj =
      typeof node.data === "object" && node.data !== null
        ? (node.data as Record<string, unknown>)
        : undefined;
    const sizeObj =
      dataObj && typeof dataObj.size === "object" && dataObj.size !== null
        ? (dataObj.size as Record<string, unknown>)
        : undefined;
    const width = Math.round(
      node.width ??
        node.measured?.width ??
        (typeof sizeObj?.width === "number" ? sizeObj.width : undefined) ??
        180,
    );
    const height = Math.round(
      node.height ??
        node.measured?.height ??
        (typeof sizeObj?.height === "number" ? sizeObj.height : undefined) ??
        120,
    );
    const right = left + width;
    const bottom = top + height;
    const seqno = idx + 1;
    const guid = node.id.startsWith("{") ? node.id.slice(1, -1) : node.id;
    const duid = getDuid(node.id);

    ptInstancesList.push(
      `SX=${left};SY=${top};EX=${right};EY=${bottom};SND=${seqno};GUID={${guid}};`,
    );
    diagramElementsList.push(
      `          <element geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" subject="${escapeXml(node.id)}" seqno="${seqno}" style="DUID=${duid};"/>`,
    );
  });

  edges.forEach((edge) => {
    diagramElementsList.push(
      `          <element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=1;Path=;" subject="${escapeXml(edge.id)}" style="Mode=3;Color=-1;LWidth=0;Hidden=0;"/>`,
    );
  });

  const ptInstancesStr = ptInstancesList.join(" ");

  const lines: string[] = [
    '  <xmi:Extension exporter="Enterprise Architect" exporterVersion="6.5">',
    "    <elements>",
    `      <element xmi:idref="${packageId}" xmi:type="uml:Package" name="${escapeXml(diagramName)}" scope="public">`,
    `        <model package2="${packageId}" package="${packageId}" tpos="0" ea_localid="2" ea_eleType="package"/>`,
    '        <properties isSpecification="false" sType="Package" nType="0" scope="public"/>',
    `        <project author="UmlStudio" version="1.0" created="${nowStr}" modified="${nowStr}" status="Proposed"/>`,
    "      </element>",
  ];

  // Element for each class
  nodes.forEach((node) => {
    const dataObj =
      typeof node.data === "object" && node.data !== null
        ? (node.data as Record<string, unknown>)
        : undefined;
    const nodeName = escapeXml(
      typeof dataObj?.name === "string" ? dataObj.name : node.id,
    );
    const isAssocClass = Boolean(
      dataObj?.isAssociationClass ||
      edges.some(
        (e) =>
          (e.data as Record<string, unknown> | undefined)
            ?.associationClassNodeId === node.id,
      ),
    );
    const nTypeAttr = isAssocClass ? ' nType="17"' : ' nType="0"';

    lines.push(
      `      <element xmi:idref="${escapeXml(node.id)}" xmi:type="uml:Class" name="${nodeName}" scope="public">`,
    );
    lines.push(
      `        <model package="${packageId}" tpos="0" ea_eleType="element"/>`,
    );
    lines.push(
      `        <properties isSpecification="false" sType="Class"${nTypeAttr} scope="public" isRoot="false" isLeaf="false" isAbstract="false" isActive="false"/>`,
    );
    lines.push(
      `        <project author="UmlStudio" version="1.0" created="${nowStr}" modified="${nowStr}" status="Proposed"/>`,
    );
    if (isAssocClass) {
      const assocEdge = edges.find(
        (e) =>
          (e.data as Record<string, unknown> | undefined)
            ?.associationClassNodeId === node.id ||
          (dataObj as Record<string, unknown> | undefined)
            ?.associationEdgeId === e.id,
      );
      const conIdAttr = assocEdge ? ` conID="${escapeXml(assocEdge.id)}"` : "";
      lines.push(
        `        <extendedProperties tagged="0" package_name="${escapeXml(diagramName)}"${conIdAttr}/>`,
      );
    }
    lines.push("      </element>");
  });

  lines.push("    </elements>");

  // Connectors
  const connectorLines = serializeEnterpriseArchitectConnectors(edges, nodes);
  lines.push(...connectorLines);

  // Primitive types block for EA
  lines.push("    <primitivetypes>");
  lines.push(
    '      <packagedElement xmi:type="uml:Package" xmi:id="EAPrimitiveTypesPackage" name="EA_PrimitiveTypes_Package" visibility="public">',
  );
  lines.push(
    '        <packagedElement xmi:type="uml:Package" xmi:id="EAnoneTypesPackage" name="EA_none_Types_Package" visibility="public">',
  );
  lines.push(
    '          <packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAnone_void" name="void" visibility="public"/>',
  );
  lines.push("        </packagedElement>");
  lines.push("      </packagedElement>");
  lines.push("    </primitivetypes>");

  // Diagrams with extendedProperties ptInstances and formal <elements>
  lines.push("    <diagrams>");
  lines.push(`      <diagram xmi:id="EAID_DIAGRAM_${cleanId}">`);
  lines.push(
    `        <model package="${packageId}" localID="2" owner="${packageId}"/>`,
  );
  lines.push(
    `        <properties name="${escapeXml(diagramName)}" type="Logical"/>`,
  );
  lines.push(
    `        <project author="UmlStudio" version="1.0" created="${nowStr}" modified="${nowStr}"/>`,
  );
  lines.push(
    '        <style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>',
  );
  lines.push(
    `        <extendedProperties ptInstances="${escapeXml(ptInstancesStr)}"/>`,
  );
  lines.push("        <elements>");
  lines.push(...diagramElementsList);
  lines.push("        </elements>");
  lines.push("      </diagram>");
  lines.push("    </diagrams>");
  lines.push("  </xmi:Extension>");

  return lines;
}

/**
 * Exporter translating a canonical UmlStudio UMLModel into Enterprise Architect XMI 2.1 format.
 * Fully compatible with Sparx Enterprise Architect 16+ and OMG UML 2.5 metamodel.
 */
export async function exportToXmi(
  model: UMLModel,
  options: XmiExportOptions = {},
): Promise<XmiExportResult> {
  const version = options.xmiVersion ?? "2.1";
  const name = options.diagramName || model.title || "CorporateSystem";
  const safeFilename = `${name.toLowerCase().replace(/[^a-z0-9_-]/gi, "_")}.xmi`;
  const modelId = model.id || "model-root";
  const cleanId = (model.id || "0001")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toUpperCase();
  const packageId = `EAPK_${cleanId}`;

  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xmi:XMI xmi:version="${version}" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">`,
    '  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5" />',
    `  <uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public" xmi:id="${escapeXml(modelId)}">`,
    `    <packagedElement xmi:type="uml:Package" xmi:id="${packageId}" name="${escapeXml(name)}" visibility="public">`,
  ];

  const nodeLines: string[] = [];
  const rawNodes = model.nodes || [];
  const edges = model.edges || [];

  // Deduplicate nodes by id and by name (preferring elements with active relationships)
  const nodes: UmlStudioNode[] = [];
  const seenNodeIds = new Set<string>();
  const nameToNode = new Map<string, UmlStudioNode>();

  rawNodes.forEach((node) => {
    if (seenNodeIds.has(node.id)) return;
    const nodeName = String(
      (node.data as { name?: string })?.name || "",
    ).trim();
    if (!nodeName) {
      seenNodeIds.add(node.id);
      nodes.push(node);
      return;
    }
    const hasEdges = edges.some(
      (e) => e.source === node.id || e.target === node.id,
    );
    const existing = nameToNode.get(nodeName);
    if (existing) {
      const existingHasEdges = edges.some(
        (e) => e.source === existing.id || e.target === existing.id,
      );
      if (!existingHasEdges && hasEdges) {
        const idx = nodes.indexOf(existing);
        if (idx >= 0) nodes[idx] = node;
        seenNodeIds.delete(existing.id);
        seenNodeIds.add(node.id);
        nameToNode.set(nodeName, node);
      }
      return;
    }
    seenNodeIds.add(node.id);
    nameToNode.set(nodeName, node);
    nodes.push(node);
  });

  nodes.forEach((node) => {
    nodeLines.push(...serializeNode(node, edges));
  });

  const edgeLines = serializeModelEdges(edges);
  const eaExtensionLines = serializeEnterpriseArchitectExtension(
    modelId,
    packageId,
    name,
    nodes,
    edges,
  );

  const footer = [
    "    </packagedElement>",
    "  </uml:Model>",
    ...eaExtensionLines,
    "</xmi:XMI>",
  ];

  const xmiContent = [...header, ...nodeLines, ...edgeLines, ...footer].join(
    "\n",
  );

  return {
    xmiContent,
    filename: safeFilename,
  };
}
