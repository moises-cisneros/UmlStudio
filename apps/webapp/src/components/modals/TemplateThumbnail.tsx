import { useEffect, useState } from "react";
import { UMLDiagramType } from "@umlstudio/core";
import { Spinner } from "@umlstudio/ui/components/spinner";
import { getDiagramTypeIcon } from "@/components/home/diagramTypeMeta";
import { getCachedThumbnailSources } from "@/utils/thumbnailTheme";
import { runWhenIdle } from "@/utils/idle";
import {
  getResolvedTemplateSvg,
  requestTemplateThumbnail,
  subscribeTemplateThumbnails,
} from "@/utils/templateThumbnails";

export function TemplateThumbnail({ name }: { name: string }) {
  const [lightSvg, setLightSvg] = useState<string | null | undefined>(() =>
    getResolvedTemplateSvg(name),
  );
  const [darkDataUrl, setDarkDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const resolved = getResolvedTemplateSvg(name);
    setLightSvg(resolved);
    if (resolved !== undefined) return;

    const unsubscribe = subscribeTemplateThumbnails((readyName, svg) => {
      if (readyName === name) {
        setLightSvg(svg);
      }
    });
    requestTemplateThumbnail(name);
    return unsubscribe;
  }, [name]);

  const cacheKey = `template:${name}`;
  const lightDataUrl =
    typeof lightSvg === "string"
      ? (getCachedThumbnailSources(cacheKey, lightSvg)?.lightDataUrl ?? null)
      : null;

  useEffect(() => {
    if (typeof lightSvg !== "string") {
      setDarkDataUrl(null);
      return;
    }
    return runWhenIdle(() => {
      const sources = getCachedThumbnailSources(cacheKey, lightSvg, {
        eager: true,
      });
      if (sources) {
        setDarkDataUrl(sources.darkDataUrl);
      }
    });
  }, [cacheKey, lightSvg]);

  return (
    <div className="relative h-[120px] w-full">
      {lightDataUrl ? (
        <>
          <img
            src={lightDataUrl}
            alt=""
            aria-hidden="true"
            className="theme-thumbnail-image theme-thumbnail-light"
            loading="lazy"
          />
          {darkDataUrl && (
            <img
              src={darkDataUrl}
              alt=""
              aria-hidden="true"
              className="theme-thumbnail-image theme-thumbnail-dark"
              loading="lazy"
            />
          )}
        </>
      ) : lightSvg === null ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {getDiagramTypeIcon(UMLDiagramType.ClassDiagram, "h-7 w-7")}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner className="size-5 text-[var(--home-accent-base)]" />
        </div>
      )}
    </div>
  );
}
