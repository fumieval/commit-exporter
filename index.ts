import { stringify } from "csv-stringify";
import { readFileSync } from "fs";
import path from "path";
import Git from "simple-git";
import { Readable } from "stream";
import { Glob } from "bun";

const git = Git();
const commits = await git.log();

const gitAttributeFile = readFileSync(".gitattributes", "utf-8");
const gitAttributes: Array<[Glob, string[]]> = gitAttributeFile
  .split("\n")
  .map((line) => {
    const [pattern, ...attrs] = line.split(/\s+/);
    return [new Glob(pattern), attrs];
  });

function getGitAttributes(file: string): string[] {
  return gitAttributes
    .filter((attr) => attr[0].match(file))
    .flatMap((attr) => attr[1]);
}

async function* generate() {
  let counter = 0;
  for (const commit of commits.all) {
    counter++;
    if (counter % 100 === 0) {
      console.error(
        `Processing commit (${counter} of ${commits.total}, ${commit.date})`
      );
    }
    const showText = await git.show([
      commit.hash,
      "--no-renames",
      "--numstat",
      "--format=",
    ]);
    const diffs = showText.split("\n");
    for (const diff of diffs) {
      const [added_lines_str, removed_lines_str, file] = diff.split(/\s+/);
      if (!file) {
        continue;
      }
      const attributes = getGitAttributes(file);
      if (attributes.includes("linguist-generated=true")) {
        continue;
      }
      const added_lines = parseInt(added_lines_str, 10);
      const removed_lines = parseInt(removed_lines_str, 10);
      yield {
        commit_hash: commit.hash,
        date: commit.date,
        author_name: commit.author_name,
        message: commit.message,
        directory: path.dirname(file),
        file,
        added_lines,
        removed_lines,
      };
    }
  }
}

Readable.from(generate())
  .pipe(stringify({ header: true }))
  .pipe(process.stdout);
