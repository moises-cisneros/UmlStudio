import type { SpringBootGeneratedFile } from "./springBootExport";

export interface MavenScaffoldOptions {
  groupId: string;
  artifactId: string;
  packageName: string;
  javaVersion?: number | undefined;
  platformVersion?: string | undefined;
}

export const MAVEN_WRAPPER_PROPERTIES = "wrapperVersion=3.3.4\ndistributionType=only-script\ndistributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.16/apache-maven-3.9.16-bin.zip\n";
export const GITIGNORE_CONTENT = "HELP.md\ntarget/\n.mvn/wrapper/maven-wrapper.jar\n!**/src/main/**/target/\n!**/src/test/**/target/\n\n### STS ###\n.apt_generated\n.classpath\n.factorypath\n.project\n.settings\n.springBeans\n.sts4-cache\n\n### IntelliJ IDEA ###\n.idea\n*.iws\n*.iml\n*.ipr\n\n### NetBeans ###\n/nbproject/private/\n/nbbuild/\n/dist/\n/nbdist/\n/.nb-gradle/\nbuild/\n!**/src/main/**/build/\n!**/src/test/**/build/\n\n### VS Code ###\n.vscode/\n";
export const GITATTRIBUTES_CONTENT = "/mvnw text eol=lf\n*.cmd text eol=crlf\n";
export const HELP_MD_CONTENT = "# Getting Started\n\n### Reference Documentation\nFor further reference, please consider the following sections:\n\n* [Official Apache Maven documentation](https://maven.apache.org/guides/index.html)\n* [Spring Boot Maven Plugin Reference Guide](https://docs.spring.io/spring-boot/4.0.8/maven-plugin)\n* [Create an OCI image](https://docs.spring.io/spring-boot/4.0.8/maven-plugin/build-image.html)\n* [Spring Web](https://docs.spring.io/spring-boot/4.0.8/reference/web/servlet.html)\n* [Spring Data JPA](https://docs.spring.io/spring-boot/4.0.8/reference/data/sql.html#data.sql.jpa-and-spring-data)\n* [Spring Boot DevTools](https://docs.spring.io/spring-boot/4.0.8/reference/using/devtools.html)\n\n### Guides\nThe following guides illustrate how to use some features concretely:\n\n* [Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)\n* [Serving Web Content with Spring MVC](https://spring.io/guides/gs/serving-web-content/)\n* [Building REST services with Spring](https://spring.io/guides/tutorials/rest/)\n* [Accessing Data with JPA](https://spring.io/guides/gs/accessing-data-jpa/)\n\n### Maven Parent overrides\n\nDue to Maven's design, elements are inherited from the parent POM to the project POM.\nWhile most of the inheritance is fine, it also inherits unwanted elements like `<license>` and `<developers>` from the parent.\nTo prevent this, the project POM contains empty overrides for these elements.\nIf you manually switch to a different parent and actually want the inheritance, you need to remove those overrides.\n\n";
export const MVNW_CONTENT = "#!/bin/sh\n# ----------------------------------------------------------------------------\n# Licensed to the Apache Software Foundation (ASF) under one\n# or more contributor license agreements.  See the NOTICE file\n# distributed with this work for additional information\n# regarding copyright ownership.  The ASF licenses this file\n# to you under the Apache License, Version 2.0 (the\n# \"License\"); you may not use this file except in compliance\n# with the License.  You may obtain a copy of the License at\n#\n#    http://www.apache.org/licenses/LICENSE-2.0\n#\n# Unless required by applicable law or agreed to in writing,\n# software distributed under the License is distributed on an\n# \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\n# KIND, either express or implied.  See the License for the\n# specific language governing permissions and limitations\n# under the License.\n# ----------------------------------------------------------------------------\n\n# ----------------------------------------------------------------------------\n# Apache Maven Wrapper startup batch script, version 3.3.4\n#\n# Optional ENV vars\n# -----------------\n#   JAVA_HOME - location of a JDK home dir, required when download maven via java source\n#   MVNW_REPOURL - repo url base for downloading maven distribution\n#   MVNW_USERNAME/MVNW_PASSWORD - user and password for downloading maven\n#   MVNW_VERBOSE - true: enable verbose log; debug: trace the mvnw script; others: silence the output\n# ----------------------------------------------------------------------------\n\nset -euf\n[ \"${MVNW_VERBOSE-}\" != debug ] || set -x\n\n# OS specific support.\nnative_path() { printf %s\\\\n \"$1\"; }\ncase \"$(uname)\" in\nCYGWIN* | MINGW*)\n  [ -z \"${JAVA_HOME-}\" ] || JAVA_HOME=\"$(cygpath --unix \"$JAVA_HOME\")\"\n  native_path() { cygpath --path --windows \"$1\"; }\n  ;;\nesac\n\n# set JAVACMD and JAVACCMD\nset_java_home() {\n  # For Cygwin and MinGW, ensure paths are in Unix format before anything is touched\n  if [ -n \"${JAVA_HOME-}\" ]; then\n    if [ -x \"$JAVA_HOME/jre/sh/java\" ]; then\n      # IBM's JDK on AIX uses strange locations for the executables\n      JAVACMD=\"$JAVA_HOME/jre/sh/java\"\n      JAVACCMD=\"$JAVA_HOME/jre/sh/javac\"\n    else\n      JAVACMD=\"$JAVA_HOME/bin/java\"\n      JAVACCMD=\"$JAVA_HOME/bin/javac\"\n\n      if [ ! -x \"$JAVACMD\" ] || [ ! -x \"$JAVACCMD\" ]; then\n        echo \"The JAVA_HOME environment variable is not defined correctly, so mvnw cannot run.\" >&2\n        echo \"JAVA_HOME is set to \\\"$JAVA_HOME\\\", but \\\"\\$JAVA_HOME/bin/java\\\" or \\\"\\$JAVA_HOME/bin/javac\\\" does not exist.\" >&2\n        return 1\n      fi\n    fi\n  else\n    JAVACMD=\"$(\n      'set' +e\n      'unset' -f command 2>/dev/null\n      'command' -v java\n    )\" || :\n    JAVACCMD=\"$(\n      'set' +e\n      'unset' -f command 2>/dev/null\n      'command' -v javac\n    )\" || :\n\n    if [ ! -x \"${JAVACMD-}\" ] || [ ! -x \"${JAVACCMD-}\" ]; then\n      echo \"The java/javac command does not exist in PATH nor is JAVA_HOME set, so mvnw cannot run.\" >&2\n      return 1\n    fi\n  fi\n}\n\n# hash string like Java String::hashCode\nhash_string() {\n  str=\"${1:-}\" h=0\n  while [ -n \"$str\" ]; do\n    char=\"${str%\"${str#?}\"}\"\n    h=$(((h * 31 + $(LC_CTYPE=C printf %d \"'$char\")) % 4294967296))\n    str=\"${str#?}\"\n  done\n  printf %x\\\\n $h\n}\n\nverbose() { :; }\n[ \"${MVNW_VERBOSE-}\" != true ] || verbose() { printf %s\\\\n \"${1-}\"; }\n\ndie() {\n  printf %s\\\\n \"$1\" >&2\n  exit 1\n}\n\ntrim() {\n  # MWRAPPER-139:\n  #   Trims trailing and leading whitespace, carriage returns, tabs, and linefeeds.\n  #   Needed for removing poorly interpreted newline sequences when running in more\n  #   exotic environments such as mingw bash on Windows.\n  printf \"%s\" \"${1}\" | tr -d '[:space:]'\n}\n\nscriptDir=\"$(dirname \"$0\")\"\nscriptName=\"$(basename \"$0\")\"\n\n# parse distributionUrl and optional distributionSha256Sum, requires .mvn/wrapper/maven-wrapper.properties\nwhile IFS=\"=\" read -r key value; do\n  case \"${key-}\" in\n  distributionUrl) distributionUrl=$(trim \"${value-}\") ;;\n  distributionSha256Sum) distributionSha256Sum=$(trim \"${value-}\") ;;\n  esac\ndone <\"$scriptDir/.mvn/wrapper/maven-wrapper.properties\"\n[ -n \"${distributionUrl-}\" ] || die \"cannot read distributionUrl property in $scriptDir/.mvn/wrapper/maven-wrapper.properties\"\n\ncase \"${distributionUrl##*/}\" in\nmaven-mvnd-*bin.*)\n  MVN_CMD=mvnd.sh _MVNW_REPO_PATTERN=/maven/mvnd/\n  case \"${PROCESSOR_ARCHITECTURE-}${PROCESSOR_ARCHITEW6432-}:$(uname -a)\" in\n  *AMD64:CYGWIN* | *AMD64:MINGW*) distributionPlatform=windows-amd64 ;;\n  :Darwin*x86_64) distributionPlatform=darwin-amd64 ;;\n  :Darwin*arm64) distributionPlatform=darwin-aarch64 ;;\n  :Linux*x86_64*) distributionPlatform=linux-amd64 ;;\n  *)\n    echo \"Cannot detect native platform for mvnd on $(uname)-$(uname -m), use pure java version\" >&2\n    distributionPlatform=linux-amd64\n    ;;\n  esac\n  distributionUrl=\"${distributionUrl%-bin.*}-$distributionPlatform.zip\"\n  ;;\nmaven-mvnd-*) MVN_CMD=mvnd.sh _MVNW_REPO_PATTERN=/maven/mvnd/ ;;\n*) MVN_CMD=\"mvn${scriptName#mvnw}\" _MVNW_REPO_PATTERN=/org/apache/maven/ ;;\nesac\n\n# apply MVNW_REPOURL and calculate MAVEN_HOME\n# maven home pattern: ~/.m2/wrapper/dists/{apache-maven-<version>,maven-mvnd-<version>-<platform>}/<hash>\n[ -z \"${MVNW_REPOURL-}\" ] || distributionUrl=\"$MVNW_REPOURL$_MVNW_REPO_PATTERN${distributionUrl#*\"$_MVNW_REPO_PATTERN\"}\"\ndistributionUrlName=\"${distributionUrl##*/}\"\ndistributionUrlNameMain=\"${distributionUrlName%.*}\"\ndistributionUrlNameMain=\"${distributionUrlNameMain%-bin}\"\nMAVEN_USER_HOME=\"${MAVEN_USER_HOME:-${HOME}/.m2}\"\nMAVEN_HOME=\"${MAVEN_USER_HOME}/wrapper/dists/${distributionUrlNameMain-}/$(hash_string \"$distributionUrl\")\"\n\nexec_maven() {\n  unset MVNW_VERBOSE MVNW_USERNAME MVNW_PASSWORD MVNW_REPOURL || :\n  exec \"$MAVEN_HOME/bin/$MVN_CMD\" \"$@\" || die \"cannot exec $MAVEN_HOME/bin/$MVN_CMD\"\n}\n\nif [ -d \"$MAVEN_HOME\" ]; then\n  verbose \"found existing MAVEN_HOME at $MAVEN_HOME\"\n  exec_maven \"$@\"\nfi\n\ncase \"${distributionUrl-}\" in\n*?-bin.zip | *?maven-mvnd-?*-?*.zip) ;;\n*) die \"distributionUrl is not valid, must match *-bin.zip or maven-mvnd-*.zip, but found '${distributionUrl-}'\" ;;\nesac\n\n# prepare tmp dir\nif TMP_DOWNLOAD_DIR=\"$(mktemp -d)\" && [ -d \"$TMP_DOWNLOAD_DIR\" ]; then\n  clean() { rm -rf -- \"$TMP_DOWNLOAD_DIR\"; }\n  trap clean HUP INT TERM EXIT\nelse\n  die \"cannot create temp dir\"\nfi\n\nmkdir -p -- \"${MAVEN_HOME%/*}\"\n\n# Download and Install Apache Maven\nverbose \"Couldn't find MAVEN_HOME, downloading and installing it ...\"\nverbose \"Downloading from: $distributionUrl\"\nverbose \"Downloading to: $TMP_DOWNLOAD_DIR/$distributionUrlName\"\n\n# select .zip or .tar.gz\nif ! command -v unzip >/dev/null; then\n  distributionUrl=\"${distributionUrl%.zip}.tar.gz\"\n  distributionUrlName=\"${distributionUrl##*/}\"\nfi\n\n# verbose opt\n__MVNW_QUIET_WGET=--quiet __MVNW_QUIET_CURL=--silent __MVNW_QUIET_UNZIP=-q __MVNW_QUIET_TAR=''\n[ \"${MVNW_VERBOSE-}\" != true ] || __MVNW_QUIET_WGET='' __MVNW_QUIET_CURL='' __MVNW_QUIET_UNZIP='' __MVNW_QUIET_TAR=v\n\n# normalize http auth\ncase \"${MVNW_PASSWORD:+has-password}\" in\n'') MVNW_USERNAME='' MVNW_PASSWORD='' ;;\nhas-password) [ -n \"${MVNW_USERNAME-}\" ] || MVNW_USERNAME='' MVNW_PASSWORD='' ;;\nesac\n\nif [ -z \"${MVNW_USERNAME-}\" ] && command -v wget >/dev/null; then\n  verbose \"Found wget ... using wget\"\n  wget ${__MVNW_QUIET_WGET:+\"$__MVNW_QUIET_WGET\"} \"$distributionUrl\" -O \"$TMP_DOWNLOAD_DIR/$distributionUrlName\" || die \"wget: Failed to fetch $distributionUrl\"\nelif [ -z \"${MVNW_USERNAME-}\" ] && command -v curl >/dev/null; then\n  verbose \"Found curl ... using curl\"\n  curl ${__MVNW_QUIET_CURL:+\"$__MVNW_QUIET_CURL\"} -f -L -o \"$TMP_DOWNLOAD_DIR/$distributionUrlName\" \"$distributionUrl\" || die \"curl: Failed to fetch $distributionUrl\"\nelif set_java_home; then\n  verbose \"Falling back to use Java to download\"\n  javaSource=\"$TMP_DOWNLOAD_DIR/Downloader.java\"\n  targetZip=\"$TMP_DOWNLOAD_DIR/$distributionUrlName\"\n  cat >\"$javaSource\" <<-END\n\tpublic class Downloader extends java.net.Authenticator\n\t{\n\t  protected java.net.PasswordAuthentication getPasswordAuthentication()\n\t  {\n\t    return new java.net.PasswordAuthentication( System.getenv( \"MVNW_USERNAME\" ), System.getenv( \"MVNW_PASSWORD\" ).toCharArray() );\n\t  }\n\t  public static void main( String[] args ) throws Exception\n\t  {\n\t    setDefault( new Downloader() );\n\t    java.nio.file.Files.copy( java.net.URI.create( args[0] ).toURL().openStream(), java.nio.file.Paths.get( args[1] ).toAbsolutePath().normalize() );\n\t  }\n\t}\n\tEND\n  # For Cygwin/MinGW, switch paths to Windows format before running javac and java\n  verbose \" - Compiling Downloader.java ...\"\n  \"$(native_path \"$JAVACCMD\")\" \"$(native_path \"$javaSource\")\" || die \"Failed to compile Downloader.java\"\n  verbose \" - Running Downloader.java ...\"\n  \"$(native_path \"$JAVACMD\")\" -cp \"$(native_path \"$TMP_DOWNLOAD_DIR\")\" Downloader \"$distributionUrl\" \"$(native_path \"$targetZip\")\"\nfi\n\n# If specified, validate the SHA-256 sum of the Maven distribution zip file\nif [ -n \"${distributionSha256Sum-}\" ]; then\n  distributionSha256Result=false\n  if [ \"$MVN_CMD\" = mvnd.sh ]; then\n    echo \"Checksum validation is not supported for maven-mvnd.\" >&2\n    echo \"Please disable validation by removing 'distributionSha256Sum' from your maven-wrapper.properties.\" >&2\n    exit 1\n  elif command -v sha256sum >/dev/null; then\n    if echo \"$distributionSha256Sum  $TMP_DOWNLOAD_DIR/$distributionUrlName\" | sha256sum -c - >/dev/null 2>&1; then\n      distributionSha256Result=true\n    fi\n  elif command -v shasum >/dev/null; then\n    if echo \"$distributionSha256Sum  $TMP_DOWNLOAD_DIR/$distributionUrlName\" | shasum -a 256 -c >/dev/null 2>&1; then\n      distributionSha256Result=true\n    fi\n  else\n    echo \"Checksum validation was requested but neither 'sha256sum' or 'shasum' are available.\" >&2\n    echo \"Please install either command, or disable validation by removing 'distributionSha256Sum' from your maven-wrapper.properties.\" >&2\n    exit 1\n  fi\n  if [ $distributionSha256Result = false ]; then\n    echo \"Error: Failed to validate Maven distribution SHA-256, your Maven distribution might be compromised.\" >&2\n    echo \"If you updated your Maven version, you need to update the specified distributionSha256Sum property.\" >&2\n    exit 1\n  fi\nfi\n\n# unzip and move\nif command -v unzip >/dev/null; then\n  unzip ${__MVNW_QUIET_UNZIP:+\"$__MVNW_QUIET_UNZIP\"} \"$TMP_DOWNLOAD_DIR/$distributionUrlName\" -d \"$TMP_DOWNLOAD_DIR\" || die \"failed to unzip\"\nelse\n  tar xzf${__MVNW_QUIET_TAR:+\"$__MVNW_QUIET_TAR\"} \"$TMP_DOWNLOAD_DIR/$distributionUrlName\" -C \"$TMP_DOWNLOAD_DIR\" || die \"failed to untar\"\nfi\n\n# Find the actual extracted directory name (handles snapshots where filename != directory name)\nactualDistributionDir=\"\"\n\n# First try the expected directory name (for regular distributions)\nif [ -d \"$TMP_DOWNLOAD_DIR/$distributionUrlNameMain\" ]; then\n  if [ -f \"$TMP_DOWNLOAD_DIR/$distributionUrlNameMain/bin/$MVN_CMD\" ]; then\n    actualDistributionDir=\"$distributionUrlNameMain\"\n  fi\nfi\n\n# If not found, search for any directory with the Maven executable (for snapshots)\nif [ -z \"$actualDistributionDir\" ]; then\n  # enable globbing to iterate over items\n  set +f\n  for dir in \"$TMP_DOWNLOAD_DIR\"/*; do\n    if [ -d \"$dir\" ]; then\n      if [ -f \"$dir/bin/$MVN_CMD\" ]; then\n        actualDistributionDir=\"$(basename \"$dir\")\"\n        break\n      fi\n    fi\n  done\n  set -f\nfi\n\nif [ -z \"$actualDistributionDir\" ]; then\n  verbose \"Contents of $TMP_DOWNLOAD_DIR:\"\n  verbose \"$(ls -la \"$TMP_DOWNLOAD_DIR\")\"\n  die \"Could not find Maven distribution directory in extracted archive\"\nfi\n\nverbose \"Found extracted Maven distribution directory: $actualDistributionDir\"\nprintf %s\\\\n \"$distributionUrl\" >\"$TMP_DOWNLOAD_DIR/$actualDistributionDir/mvnw.url\"\nmv -- \"$TMP_DOWNLOAD_DIR/$actualDistributionDir\" \"$MAVEN_HOME\" || [ -d \"$MAVEN_HOME\" ] || die \"fail to move MAVEN_HOME\"\n\nclean || :\nexec_maven \"$@\"\n";
export const MVNW_CMD_CONTENT = "<# : batch portion\n@REM ----------------------------------------------------------------------------\n@REM Licensed to the Apache Software Foundation (ASF) under one\n@REM or more contributor license agreements.  See the NOTICE file\n@REM distributed with this work for additional information\n@REM regarding copyright ownership.  The ASF licenses this file\n@REM to you under the Apache License, Version 2.0 (the\n@REM \"License\"); you may not use this file except in compliance\n@REM with the License.  You may obtain a copy of the License at\n@REM\n@REM    http://www.apache.org/licenses/LICENSE-2.0\n@REM\n@REM Unless required by applicable law or agreed to in writing,\n@REM software distributed under the License is distributed on an\n@REM \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY\n@REM KIND, either express or implied.  See the License for the\n@REM specific language governing permissions and limitations\n@REM under the License.\n@REM ----------------------------------------------------------------------------\n\n@REM ----------------------------------------------------------------------------\n@REM Apache Maven Wrapper startup batch script, version 3.3.4\n@REM\n@REM Optional ENV vars\n@REM   MVNW_REPOURL - repo url base for downloading maven distribution\n@REM   MVNW_USERNAME/MVNW_PASSWORD - user and password for downloading maven\n@REM   MVNW_VERBOSE - true: enable verbose log; others: silence the output\n@REM ----------------------------------------------------------------------------\n\n@IF \"%__MVNW_ARG0_NAME__%\"==\"\" (SET __MVNW_ARG0_NAME__=%~nx0)\n@SET __MVNW_CMD__=\n@SET __MVNW_ERROR__=\n@SET __MVNW_PSMODULEP_SAVE=%PSModulePath%\n@SET PSModulePath=\n@FOR /F \"usebackq tokens=1* delims==\" %%A IN (`powershell -noprofile \"& {$scriptDir='%~dp0'; $script='%__MVNW_ARG0_NAME__%'; icm -ScriptBlock ([Scriptblock]::Create((Get-Content -Raw '%~f0'))) -NoNewScope}\"`) DO @(\n  IF \"%%A\"==\"MVN_CMD\" (set __MVNW_CMD__=%%B) ELSE IF \"%%B\"==\"\" (echo %%A) ELSE (echo %%A=%%B)\n)\n@SET PSModulePath=%__MVNW_PSMODULEP_SAVE%\n@SET __MVNW_PSMODULEP_SAVE=\n@SET __MVNW_ARG0_NAME__=\n@SET MVNW_USERNAME=\n@SET MVNW_PASSWORD=\n@IF NOT \"%__MVNW_CMD__%\"==\"\" (\"%__MVNW_CMD__%\" %*)\n@echo Cannot start maven from wrapper >&2 && exit /b 1\n@GOTO :EOF\n: end batch / begin powershell #>\n\n$ErrorActionPreference = \"Stop\"\nif ($env:MVNW_VERBOSE -eq \"true\") {\n  $VerbosePreference = \"Continue\"\n}\n\n# calculate distributionUrl, requires .mvn/wrapper/maven-wrapper.properties\n$distributionUrl = (Get-Content -Raw \"$scriptDir/.mvn/wrapper/maven-wrapper.properties\" | ConvertFrom-StringData).distributionUrl\nif (!$distributionUrl) {\n  Write-Error \"cannot read distributionUrl property in $scriptDir/.mvn/wrapper/maven-wrapper.properties\"\n}\n\nswitch -wildcard -casesensitive ( $($distributionUrl -replace '^.*/','') ) {\n  \"maven-mvnd-*\" {\n    $USE_MVND = $true\n    $distributionUrl = $distributionUrl -replace '-bin\\.[^.]*$',\"-windows-amd64.zip\"\n    $MVN_CMD = \"mvnd.cmd\"\n    break\n  }\n  default {\n    $USE_MVND = $false\n    $MVN_CMD = $script -replace '^mvnw','mvn'\n    break\n  }\n}\n\n# apply MVNW_REPOURL and calculate MAVEN_HOME\n# maven home pattern: ~/.m2/wrapper/dists/{apache-maven-<version>,maven-mvnd-<version>-<platform>}/<hash>\nif ($env:MVNW_REPOURL) {\n  $MVNW_REPO_PATTERN = if ($USE_MVND -eq $False) { \"/org/apache/maven/\" } else { \"/maven/mvnd/\" }\n  $distributionUrl = \"$env:MVNW_REPOURL$MVNW_REPO_PATTERN$($distributionUrl -replace \"^.*$MVNW_REPO_PATTERN\",'')\"\n}\n$distributionUrlName = $distributionUrl -replace '^.*/',''\n$distributionUrlNameMain = $distributionUrlName -replace '\\.[^.]*$','' -replace '-bin$',''\n\n$MAVEN_M2_PATH = \"$HOME/.m2\"\nif ($env:MAVEN_USER_HOME) {\n  $MAVEN_M2_PATH = \"$env:MAVEN_USER_HOME\"\n}\n\nif (-not (Test-Path -Path $MAVEN_M2_PATH)) {\n    New-Item -Path $MAVEN_M2_PATH -ItemType Directory | Out-Null\n}\n\n$MAVEN_WRAPPER_DISTS = $null\nif ((Get-Item $MAVEN_M2_PATH).Target[0] -eq $null) {\n  $MAVEN_WRAPPER_DISTS = \"$MAVEN_M2_PATH/wrapper/dists\"\n} else {\n  $MAVEN_WRAPPER_DISTS = (Get-Item $MAVEN_M2_PATH).Target[0] + \"/wrapper/dists\"\n}\n\n$MAVEN_HOME_PARENT = \"$MAVEN_WRAPPER_DISTS/$distributionUrlNameMain\"\n$MAVEN_HOME_NAME = ([System.Security.Cryptography.SHA256]::Create().ComputeHash([byte[]][char[]]$distributionUrl) | ForEach-Object {$_.ToString(\"x2\")}) -join ''\n$MAVEN_HOME = \"$MAVEN_HOME_PARENT/$MAVEN_HOME_NAME\"\n\nif (Test-Path -Path \"$MAVEN_HOME\" -PathType Container) {\n  Write-Verbose \"found existing MAVEN_HOME at $MAVEN_HOME\"\n  Write-Output \"MVN_CMD=$MAVEN_HOME/bin/$MVN_CMD\"\n  exit $?\n}\n\nif (! $distributionUrlNameMain -or ($distributionUrlName -eq $distributionUrlNameMain)) {\n  Write-Error \"distributionUrl is not valid, must end with *-bin.zip, but found $distributionUrl\"\n}\n\n# prepare tmp dir\n$TMP_DOWNLOAD_DIR_HOLDER = New-TemporaryFile\n$TMP_DOWNLOAD_DIR = New-Item -Itemtype Directory -Path \"$TMP_DOWNLOAD_DIR_HOLDER.dir\"\n$TMP_DOWNLOAD_DIR_HOLDER.Delete() | Out-Null\ntrap {\n  if ($TMP_DOWNLOAD_DIR.Exists) {\n    try { Remove-Item $TMP_DOWNLOAD_DIR -Recurse -Force | Out-Null }\n    catch { Write-Warning \"Cannot remove $TMP_DOWNLOAD_DIR\" }\n  }\n}\n\nNew-Item -Itemtype Directory -Path \"$MAVEN_HOME_PARENT\" -Force | Out-Null\n\n# Download and Install Apache Maven\nWrite-Verbose \"Couldn't find MAVEN_HOME, downloading and installing it ...\"\nWrite-Verbose \"Downloading from: $distributionUrl\"\nWrite-Verbose \"Downloading to: $TMP_DOWNLOAD_DIR/$distributionUrlName\"\n\n$webclient = New-Object System.Net.WebClient\nif ($env:MVNW_USERNAME -and $env:MVNW_PASSWORD) {\n  $webclient.Credentials = New-Object System.Net.NetworkCredential($env:MVNW_USERNAME, $env:MVNW_PASSWORD)\n}\n[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12\n$webclient.DownloadFile($distributionUrl, \"$TMP_DOWNLOAD_DIR/$distributionUrlName\") | Out-Null\n\n# If specified, validate the SHA-256 sum of the Maven distribution zip file\n$distributionSha256Sum = (Get-Content -Raw \"$scriptDir/.mvn/wrapper/maven-wrapper.properties\" | ConvertFrom-StringData).distributionSha256Sum\nif ($distributionSha256Sum) {\n  if ($USE_MVND) {\n    Write-Error \"Checksum validation is not supported for maven-mvnd. `nPlease disable validation by removing 'distributionSha256Sum' from your maven-wrapper.properties.\"\n  }\n  Import-Module $PSHOME\\Modules\\Microsoft.PowerShell.Utility -Function Get-FileHash\n  if ((Get-FileHash \"$TMP_DOWNLOAD_DIR/$distributionUrlName\" -Algorithm SHA256).Hash.ToLower() -ne $distributionSha256Sum) {\n    Write-Error \"Error: Failed to validate Maven distribution SHA-256, your Maven distribution might be compromised. If you updated your Maven version, you need to update the specified distributionSha256Sum property.\"\n  }\n}\n\n# unzip and move\nExpand-Archive \"$TMP_DOWNLOAD_DIR/$distributionUrlName\" -DestinationPath \"$TMP_DOWNLOAD_DIR\" | Out-Null\n\n# Find the actual extracted directory name (handles snapshots where filename != directory name)\n$actualDistributionDir = \"\"\n\n# First try the expected directory name (for regular distributions)\n$expectedPath = Join-Path \"$TMP_DOWNLOAD_DIR\" \"$distributionUrlNameMain\"\n$expectedMvnPath = Join-Path \"$expectedPath\" \"bin/$MVN_CMD\"\nif ((Test-Path -Path $expectedPath -PathType Container) -and (Test-Path -Path $expectedMvnPath -PathType Leaf)) {\n  $actualDistributionDir = $distributionUrlNameMain\n}\n\n# If not found, search for any directory with the Maven executable (for snapshots)\nif (!$actualDistributionDir) {\n  Get-ChildItem -Path \"$TMP_DOWNLOAD_DIR\" -Directory | ForEach-Object {\n    $testPath = Join-Path $_.FullName \"bin/$MVN_CMD\"\n    if (Test-Path -Path $testPath -PathType Leaf) {\n      $actualDistributionDir = $_.Name\n    }\n  }\n}\n\nif (!$actualDistributionDir) {\n  Write-Error \"Could not find Maven distribution directory in extracted archive\"\n}\n\nWrite-Verbose \"Found extracted Maven distribution directory: $actualDistributionDir\"\nRename-Item -Path \"$TMP_DOWNLOAD_DIR/$actualDistributionDir\" -NewName $MAVEN_HOME_NAME | Out-Null\ntry {\n  Move-Item -Path \"$TMP_DOWNLOAD_DIR/$MAVEN_HOME_NAME\" -Destination $MAVEN_HOME_PARENT | Out-Null\n} catch {\n  if (! (Test-Path -Path \"$MAVEN_HOME\" -PathType Container)) {\n    Write-Error \"fail to move MAVEN_HOME\"\n  }\n} finally {\n  try { Remove-Item $TMP_DOWNLOAD_DIR -Recurse -Force | Out-Null }\n  catch { Write-Warning \"Cannot remove $TMP_DOWNLOAD_DIR\" }\n}\n\nWrite-Output \"MVN_CMD=$MAVEN_HOME/bin/$MVN_CMD\"\n";

export function emitPomXml(options: MavenScaffoldOptions): string {
  const bootVersion = options.platformVersion ?? "3.4.0";
  const javaVer = options.javaVersion ?? 17;
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>${bootVersion}</version>
    <relativePath/>
  </parent>
  <groupId>${options.groupId}</groupId>
  <artifactId>${options.artifactId}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${options.artifactId}</name>
  <description>Spring Boot backend generated by UmlStudio</description>
  <properties>
    <java.version>${javaVer}</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-devtools</artifactId>
      <scope>runtime</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <excludes>
            <exclude>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </exclude>
          </excludes>
        </configuration>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <annotationProcessorPaths>
            <path>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </path>
          </annotationProcessorPaths>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

export function emitApplicationEntryPoint(options: MavenScaffoldOptions): string {
  const parts = options.artifactId.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const className = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("") + "Application";
  return `package ${options.packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {

    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }

}
`;
}

export function emitApplicationTests(options: MavenScaffoldOptions): string {
  const parts = options.artifactId.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const className = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("") + "ApplicationTests";
  return `package ${options.packageName};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ${className} {

    @Test
    void contextLoads() {
    }

}
`;
}

export function generateMavenScaffold(options: MavenScaffoldOptions): SpringBootGeneratedFile[] {
  const packagePath = options.packageName.replace(/\./g, "/");
  const parts = options.artifactId.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const mainClass = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("") + "Application";
  const testClass = mainClass + "Tests";

  return [
    { path: "pom.xml", content: emitPomXml(options) },
    { path: ".mvn/wrapper/maven-wrapper.properties", content: MAVEN_WRAPPER_PROPERTIES },
    { path: "mvnw", content: MVNW_CONTENT },
    { path: "mvnw.cmd", content: MVNW_CMD_CONTENT },
    { path: ".gitignore", content: GITIGNORE_CONTENT },
    { path: ".gitattributes", content: GITATTRIBUTES_CONTENT },
    { path: "HELP.md", content: HELP_MD_CONTENT },
    { path: `src/main/java/${packagePath}/${mainClass}.java`, content: emitApplicationEntryPoint(options) },
    { path: `src/test/java/${packagePath}/${testClass}.java`, content: emitApplicationTests(options) },
  ];
}
