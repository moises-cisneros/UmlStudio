import { appVersion } from "@/constants";
import { Button } from "@umlstudio/ui/components/button";
import { DialogFooter } from "@umlstudio/ui/components/dialog";

type AboutModalProps = {
  onClose: () => void;
};

export const AboutModal = ({ onClose }: AboutModalProps) => {
  return (
    <div className="flex flex-col gap-5 text-sm text-foreground">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold">UmlStudio</h2>
          <p className="text-xs text-muted-foreground">
            Editor de Diagramas de Clases UML
          </p>
        </div>
      </div>

      <p className="leading-relaxed">
        UmlStudio es una herramienta de modelado visual para diagramas de clases
        UML, diseñada para soportar edición interactiva, colaboración en tiempo
        real y generación de arquitectura de software.
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
        <dt className="font-medium">Versión</dt>
        <dd>{appVersion}</dd>
        <dt className="font-medium">Tipo</dt>
        <dd>UML Class Diagram Studio</dd>
      </dl>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </DialogFooter>
    </div>
  );
};
