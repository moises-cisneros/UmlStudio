@ECHO OFF
REM Minimal Maven wrapper for Windows (UmlStudio FA-01 offline fallback).
SETLOCAL
SET BASE_DIR=%~dp0
IF EXIST "%BASE_DIR%.mvn\wrapper\maven-wrapper.properties" (
  FOR /F "tokens=1,* delims==" %%A IN ('findstr "^distributionUrl=" "%BASE_DIR%.mvn\wrapper\maven-wrapper.properties"') DO SET DISTRIBUTION_URL=%%B
)
WHERE mvn >NUL 2>NUL
IF %ERRORLEVEL% EQU 0 (
  mvn %*
  EXIT /B %ERRORLEVEL%
)
ECHO Maven distribution is not cached and no system Maven was found.
ECHO Install Apache Maven 3.9+ with JDK 17, or set MAVEN_HOME and retry.
ECHO Distribution: %DISTRIBUTION_URL%
EXIT /B 1
