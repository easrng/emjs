/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-globals */
// @ts-ignore
import { globSync, readFileSync, writeFileSync } from "node:fs";

const outputFilePath = "build/lib.c";

// Function to encode file content into an encoded C-string
function encodeToCString(buffer: Uint8Array) {
  let encodedString = '"';
  for (let i = 0; i < buffer.length; i++) {
    encodedString +=
      "\\" +
      ((buffer[i]! >> 6) & 7).toString() +
      ((buffer[i]! >> 3) & 7).toString() +
      (buffer[i]! & 7).toString();
  }
  encodedString += '\\000"';
  return encodedString;
}

// Function to create the C output string
function createCOutputString(
  largeString: string,
  modules: { moduleName: string; offset: number; length: number }[]
) {
  const loadFunction =
    "const char *lib_load(size_t module_name_len, const char *module_name, size_t *buf_len) {\n";

  const caseStatements = modules
    .map(
      ({ moduleName, offset, length }) =>
        `    if (module_name_len == ${moduleName.length} && memcmp("${moduleName}", module_name, module_name_len) == 0) {\n` +
        `        *buf_len = ${length};\n` +
        `        return &lib_data[${offset}];\n` +
        `    }\n`
    )
    .join("");

  return (
    "#include <stddef.h>\n#include <string.h>\n\n" +
    "static const char lib_data[] = " +
    largeString +
    ";\n\n" +
    loadFunction +
    caseStatements +
    "\n    return NULL;\n}\n"
  );
}

function buildLibC() {
  const files: string[] = globSync("build/lib/**", { withFileTypes: true })
    .flatMap((e: any) => (e.isFile() ? [e.path] : []))
    .sort();

  let largeString = "";
  const modules: { moduleName: string; offset: number; length: number }[] = [];
  let currentOffset = 0;

  files.forEach((file) => {
    const content = readFileSync(file);
    const moduleName = file.endsWith(".json")
      ? `json:emjs:${file.slice("build/lib/".length, -5)}`
      : `emjs:${file.slice("build/lib/".length, -3)}`;

    const encodedContent = encodeToCString(content);

    modules.push({
      moduleName,
      offset: currentOffset,
      length: content.length,
    });

    largeString += encodedContent.slice(1, -1); // Remove the extra quotes as we concatenate

    currentOffset += content.length + 1;
  });

  const outputContent = createCOutputString(`"${largeString}"`, modules);
  writeFileSync(outputFilePath, outputContent);
}

buildLibC();
