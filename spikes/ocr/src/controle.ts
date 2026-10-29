// Controle final : aucune donnee personnelle dans les fichiers de reference.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detecte } from "./anonymise.ts";
import { REFERENCES } from "./extraction.ts";

let fuites = 0;
for (const fichier of readdirSync(REFERENCES)) {
  const categories = detecte(readFileSync(join(REFERENCES, fichier), "utf8"));
  console.log(`${fichier.slice(0, 28).padEnd(30)} ${categories.length === 0 ? "aucune donnée personnelle" : `FUITE : ${categories.join(", ")}`}`);
  fuites += categories.length;
}
console.log(fuites === 0 ? "\nLes 6 références sont propres." : `\n${fuites} fuite(s) à corriger.`);
