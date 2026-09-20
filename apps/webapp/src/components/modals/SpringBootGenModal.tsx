import React, { useState } from "react";
import { toast } from "react-toastify";
import JSZip from "jszip";
import { Button } from "@umlstudio/ui/components/button";
import { Input } from "@umlstudio/ui/components/input";
import { Field, FieldLabel } from "@umlstudio/ui/components/field";
import { DialogFooter } from "@umlstudio/ui/components/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@umlstudio/ui/components/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@umlstudio/ui/components/select";
import { Alert, AlertDescription } from "@umlstudio/ui/components/alert";
import { useEditorContext, useModalContext } from "@/contexts";
import { useFileDownload } from "@/hooks/useFileDownload";
import { useTranslation } from "@/i18n";
import {
  exportSpringBootFull,
  generateMavenScaffold,
  type SpringBootInheritanceStrategy,
} from "@umlstudio/core/export";
import { serverURL } from "@/constants/urls";
import { HomeDialogContent } from "./HomeDialog";

interface SpringBootGenModalProps {
  onClose?: () => void;
}

export const SpringBootGenModal: React.FC<SpringBootGenModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { editor } = useEditorContext();
  const { openModal, closeModal } = useModalContext();
  const downloadFile = useFileDownload();

  const modelTitle = editor?.model?.title || "demo";
  const defaultArtifactId = modelTitle
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, "-");

  const [groupId, setGroupId] = useState("com.example");
  const [artifactId, setArtifactId] = useState(defaultArtifactId);
  const [packageName, setPackageName] = useState(
    `com.example.${defaultArtifactId.replace(/[^a-z0-9_]/gi, "")}`,
  );
  const [serverPort, setServerPort] = useState<number>(9000);
  const [dbName, setDbName] = useState("umlstudio_demo");
  const [dbHost, setDbHost] = useState("localhost");
  const [dbPort, setDbPort] = useState<number>(5432);
  const [dbUser, setDbUser] = useState("postgres");
  const [dbPassword, setDbPassword] = useState("postgres");
  const [inheritance, setInheritance] = useState<SpringBootInheritanceStrategy>("JOINED");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClose = () => {
    onClose?.();
    closeModal();
  };

  const handleGroupIdChange = (value: string) => {
    setGroupId(value);
    const cleanArt = artifactId.replace(/[^a-z0-9_]/gi, "");
    setPackageName(`${value}.${cleanArt}`);
  };

  const handleArtifactIdChange = (value: string) => {
    setArtifactId(value);
    const cleanArt = value.replace(/[^a-z0-9_]/gi, "");
    setPackageName(`${groupId}.${cleanArt}`);
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editor?.model) return;

    const classCount = (editor.model.nodes ?? []).filter(
      (n) => !n.type || n.type === "class",
    ).length;

    if (classCount === 0) {
      toast.error(t.codegen.noClassesError);
      return;
    }

    setIsGenerating(true);
    const fileName = `${artifactId || "demo"}.zip`;

    const codegenBaseUrl =
      (import.meta.env["VITE_CODEGEN_SERVICE_URL"] as string | undefined) ||
      "http://localhost:8002";

    try {
      let zipBlob: Blob | null = null;

      // 1. Try apps/server endpoint (:8000), which is always active during dev and calls Spring Initializr
      try {
        const response = await fetch(`${serverURL}/api/codegen/spring-boot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: editor.model,
            options: {
              groupId,
              artifactId,
              packageName,
              serverPort,
              dbHost,
              dbPort,
              dbName,
              dbUser,
              dbPassword,
              inheritance,
            },
          }),
        });

        if (response.ok) {
          zipBlob = await response.blob();
        }
      } catch {
        // Fallback to codegen service or client engine
      }

      // 2. Try microservice apps/codegen (:8002) if server route was unavailable
      if (!zipBlob) {
        try {
          const response = await fetch(`${codegenBaseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: editor.model,
              options: {
                groupId,
                artifactId,
                packageName,
                serverPort,
                dbHost,
                dbPort,
                dbName,
                dbUser,
                dbPassword,
                inheritance,
              },
            }),
          });

          if (response.ok) {
            zipBlob = await response.blob();
          }
        } catch {
          // Fall back to client engine
        }
      }

      // 3. Complete Client Fallback: Build full Maven project scaffold with wrappers + 5 layers
      if (!zipBlob) {
        const fullExport = await exportSpringBootFull(editor.model, {
          packageName,
          inheritance,
        });

        const zip = new JSZip();

        // Add complete Maven project scaffolding (pom.xml, mvnw, mvnw.cmd, .mvn/, .gitignore, Application.java)
        const scaffoldFiles = generateMavenScaffold({
          groupId,
          artifactId,
          packageName,
          javaVersion: 17,
          platformVersion: "3.4.0",
        });

        for (const file of scaffoldFiles) {
          zip.file(file.path, file.content);
        }

        // Add 5 generated CRUD layers
        for (const file of fullExport.files) {
          zip.file(file.path, file.content);
        }

        // Add configured application.yml in port 9000
        const appYml = [
          "spring:",
          "  datasource:",
          `    url: jdbc:postgresql://${dbHost}:${dbPort}/${dbName}`,
          `    username: ${dbUser}`,
          `    password: ${dbPassword}`,
          "    driver-class-name: org.postgresql.Driver",
          "  jpa:",
          "    hibernate:",
          "      ddl-auto: update",
          "    show-sql: true",
          "    properties:",
          "      hibernate:",
          "        dialect: org.hibernate.dialect.PostgreSQLDialect",
          "        format_sql: true",
          "server:",
          `  port: ${serverPort}`,
          "",
        ].join("\n");
        zip.file("src/main/resources/application.yml", appYml);

        zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
        });
      }

      const fileToDownload = new File([zipBlob], fileName, {
        type: "application/zip",
      });
      downloadFile({ file: fileToDownload, fileName });

      toast.success(t.codegen.successToast);
      handleClose();
    } catch {
      toast.error(t.codegen.errorToast);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleGenerate} className="flex min-w-0 flex-col gap-4">
      <HomeDialogContent testId="spring-boot-gen-dialog">
        <p className="text-xs text-muted-foreground">{t.codegen.modalSubtitle}</p>

        <Tabs defaultValue="maven" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="maven">{t.codegen.tabMaven}</TabsTrigger>
            <TabsTrigger value="server">{t.codegen.tabServerDb}</TabsTrigger>
            <TabsTrigger value="jpa">{t.codegen.tabJpa}</TabsTrigger>
          </TabsList>

          {/* TAB 1: Maven Coordinates */}
          <TabsContent value="maven" className="mt-3 flex flex-col gap-3">
            <Field className="gap-1">
              <FieldLabel htmlFor="sb-group-id" className="text-xs font-semibold text-foreground">
                {t.codegen.groupId}
              </FieldLabel>
              <Input
                id="sb-group-id"
                value={groupId}
                onChange={(e) => handleGroupIdChange(e.target.value)}
                disabled={isGenerating}
                className="w-full text-xs"
              />
            </Field>

            <Field className="gap-1">
              <FieldLabel htmlFor="sb-artifact-id" className="text-xs font-semibold text-foreground">
                {t.codegen.artifactId}
              </FieldLabel>
              <Input
                id="sb-artifact-id"
                value={artifactId}
                onChange={(e) => handleArtifactIdChange(e.target.value)}
                disabled={isGenerating}
                className="w-full text-xs"
              />
            </Field>

            <Field className="gap-1">
              <FieldLabel htmlFor="sb-package-name" className="text-xs font-semibold text-foreground">
                {t.codegen.packageName}
              </FieldLabel>
              <Input
                id="sb-package-name"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                disabled={isGenerating}
                className="w-full text-xs"
              />
            </Field>

            <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
              <span>Java 17 (LTS) • Spring Boot 3.4.0 (3.x line)</span>
              <span className="font-mono text-[11px] text-primary">Maven + Lombok + JPA</span>
            </div>
          </TabsContent>

          {/* TAB 2: Server & Database */}
          <TabsContent value="server" className="mt-3 flex flex-col gap-3">
            <Field className="gap-1">
              <FieldLabel htmlFor="sb-server-port" className="text-xs font-semibold text-foreground">
                {t.codegen.serverPort}
              </FieldLabel>
              <Input
                id="sb-server-port"
                type="number"
                value={serverPort}
                onChange={(e) => setServerPort(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full text-xs font-mono"
              />
              <p className="text-[11px] text-primary">{t.codegen.serverPortHelp}</p>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field className="gap-1">
                <FieldLabel htmlFor="sb-db-host" className="text-xs font-semibold text-foreground">
                  {t.codegen.dbHost}
                </FieldLabel>
                <Input
                  id="sb-db-host"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  disabled={isGenerating}
                  className="w-full text-xs font-mono"
                />
              </Field>

              <Field className="gap-1">
                <FieldLabel htmlFor="sb-db-name" className="text-xs font-semibold text-foreground">
                  {t.codegen.dbName}
                </FieldLabel>
                <Input
                  id="sb-db-name"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  disabled={isGenerating}
                  className="w-full text-xs font-mono"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Field className="gap-1">
                <FieldLabel htmlFor="sb-db-port" className="text-xs font-semibold text-foreground">
                  {t.codegen.dbPort}
                </FieldLabel>
                <Input
                  id="sb-db-port"
                  type="number"
                  value={dbPort}
                  onChange={(e) => setDbPort(Number(e.target.value))}
                  disabled={isGenerating}
                  className="w-full text-xs font-mono"
                />
              </Field>

              <Field className="gap-1">
                <FieldLabel htmlFor="sb-db-user" className="text-xs font-semibold text-foreground">
                  {t.codegen.dbUser}
                </FieldLabel>
                <Input
                  id="sb-db-user"
                  value={dbUser}
                  onChange={(e) => setDbUser(e.target.value)}
                  disabled={isGenerating}
                  className="w-full text-xs font-mono"
                />
              </Field>

              <Field className="gap-1">
                <FieldLabel htmlFor="sb-db-password" className="text-xs font-semibold text-foreground">
                  {t.codegen.dbPassword}
                </FieldLabel>
                <Input
                  id="sb-db-password"
                  type="password"
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                  disabled={isGenerating}
                  className="w-full text-xs font-mono"
                />
              </Field>
            </div>
          </TabsContent>

          {/* TAB 3: JPA Strategy */}
          <TabsContent value="jpa" className="mt-3 flex flex-col gap-3">
            <Field className="gap-1">
              <FieldLabel htmlFor="sb-inheritance" className="text-xs font-semibold text-foreground">
                {t.codegen.inheritance}
              </FieldLabel>
              <Select
                value={inheritance}
                onValueChange={(val) => {
                  if (val === "JOINED" || val === "SINGLE_TABLE") {
                    setInheritance(val);
                  }
                }}
                disabled={isGenerating}
              >
                <SelectTrigger id="sb-inheritance" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JOINED">JOINED (Normalizado con FKs)</SelectItem>
                  <SelectItem value="SINGLE_TABLE">SINGLE_TABLE (Columna discriminadora)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Alert className="border-border bg-muted/40 p-2.5">
              <AlertDescription className="text-xs text-muted-foreground">
                {t.codegen.joinedHelp}
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </HomeDialogContent>

      <DialogFooter className="mt-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            handleClose();
            openModal("OPENAPI_DOCS");
          }}
          disabled={isGenerating}
          className="text-xs"
        >
          {t.codegen.viewApiDocs}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isGenerating}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="default"
            disabled={isGenerating || !artifactId || !packageName}
          >
            {isGenerating ? t.codegen.generating : t.codegen.generateBtn}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
};
