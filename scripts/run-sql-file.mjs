import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { Pool } from "@neondatabase/serverless";

function stripPsqlMetaCommands(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("\\"))
    .join("\n");
}

function readDollarTag(sql, index) {
  if (sql[index] !== "$") return null;
  const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index));
  return match?.[0] ?? null;
}

export function splitSqlStatements(sql) {
  const source = stripPsqlMetaCommands(sql);
  const statements = [];
  let current = "";
  let singleQuoted = false;
  let doubleQuoted = false;
  let dollarTag = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (!singleQuoted && !doubleQuoted) {
      const tag = readDollarTag(source, index);

      if (tag) {
        dollarTag = tag;
        current += tag;
        index += tag.length - 1;
        continue;
      }
    }

    if (!doubleQuoted && char === "'") {
      current += char;
      if (singleQuoted && next === "'") {
        current += next;
        index += 1;
      } else {
        singleQuoted = !singleQuoted;
      }
      continue;
    }

    if (!singleQuoted && char === "\"") {
      current += char;
      if (doubleQuoted && next === "\"") {
        current += next;
        index += 1;
      } else {
        doubleQuoted = !doubleQuoted;
      }
      continue;
    }

    if (!singleQuoted && !doubleQuoted && char === ";") {
      const statement = current.trim();

      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();

  if (tail) {
    statements.push(tail);
  }

  return statements;
}

async function main() {
  const filePath = process.argv[2];
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!filePath) {
    throw new Error("Usage: node scripts/run-sql-file.mjs <file.sql>");
  }

  if (!connectionString) {
    throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is required.");
  }

  const sql = await readFile(filePath, "utf8");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    for (const statement of splitSqlStatements(sql)) {
      await client.query(statement);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
