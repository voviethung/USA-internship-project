import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const rootDir = process.cwd();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function getEnv(key, fallback = '') {
  if (process.env[key]) return process.env[key];

  const fromLocal = envLocal[key];
  if (fromLocal) return fromLocal;

  const fromDefault = envDefault[key];
  if (fromDefault) return fromDefault;

  return fallback;
}

function getPublicTablesFromSchema(schemaPath) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const matches = [...schema.matchAll(/CREATE TABLE\s+public\.([a-zA-Z0-9_]+)/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function sqlEscapeLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return `'${sqlEscapeLiteral(JSON.stringify(value))}'`;
  return `'${sqlEscapeLiteral(value)}'`;
}

function buildInsertStatements(tableName, rows) {
  if (!rows.length) return '';

  const firstRow = rows[0];
  const columns = Object.keys(firstRow);

  if (!columns.length) return '';

  const columnSql = columns.map((col) => `"${col}"`).join(', ');
  const valueRowsSql = rows
    .map((row) => {
      const values = columns.map((col) => toSqlLiteral(row[col])).join(', ');
      return `(${values})`;
    })
    .join(',\n');

  return `INSERT INTO public.${tableName} (${columnSql})\nVALUES\n${valueRowsSql}\nON CONFLICT DO NOTHING;`;
}

function normalizeRowsForExport(tableName, rows) {
  if (tableName !== 'profiles') return rows;

  return rows.map((row) => {
    const approvalStatus = row.approval_status ?? 'approved';
    const approvedAt = row.approved_at ?? null;
    const approvedBy = row.approved_by ?? null;
    const rejectedNote = row.rejected_note ?? null;

    return {
      ...row,
      approval_status: approvalStatus,
      approved_at: approvedAt,
      approved_by: approvedBy,
      rejected_note: rejectedNote,
    };
  });
}

function reorderTablesForImport(tableNames) {
  const preferredOrder = [
    'training_templates',
    'template_sections',
    'template_lines',
    'profiles',
    'lectures',
    'mentor_students',
    'resources',
    'tasks',
    'notifications',
    'conversations',
    'conversation_segments',
    'conversation_messages',
    'translations',
  ];

  const inPreferred = preferredOrder.filter((name) => tableNames.includes(name));
  const remaining = tableNames.filter((name) => !inPreferred.includes(name));
  return [...inPreferred, ...remaining];
}

async function fetchAllRows(client, tableName, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch ${tableName}: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    rows.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

const envLocal = parseEnvFile(path.join(rootDir, '.env.local'));
const envDefault = parseEnvFile(path.join(rootDir, '.env'));

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env/.env.local/.env');
  process.exit(1);
}

const schemaPath = path.join(rootDir, 'supabase', 'schema.sql');
const outPath = path.join(rootDir, 'supabase', 'data_dump.json');
const sqlOutPath = path.join(rootDir, 'supabase', 'data_dump.sql');

if (!fs.existsSync(schemaPath)) {
  console.error(`Schema not found at ${schemaPath}`);
  process.exit(1);
}

const tables = reorderTablesForImport(getPublicTablesFromSchema(schemaPath));
if (tables.length === 0) {
  console.error('No public tables found in schema.sql');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const exportData = {
  exported_at: new Date().toISOString(),
  source: supabaseUrl,
  table_count: tables.length,
  tables: {},
};

const sqlChunks = [
  '-- Supabase data dump generated by scripts/export-supabase-data.mjs',
  `-- Exported at: ${new Date().toISOString()}`,
  'BEGIN;',
  '',
];

for (const table of tables) {
  console.log(`Exporting ${table}...`);
  const fetchedRows = await fetchAllRows(supabase, table);
  const rows = normalizeRowsForExport(table, fetchedRows);
  exportData.tables[table] = rows;

  if (rows.length > 0) {
    sqlChunks.push(`-- Table: public.${table} (${rows.length} rows)`);
    sqlChunks.push(buildInsertStatements(table, rows));
    sqlChunks.push('');
  } else {
    sqlChunks.push(`-- Table: public.${table} (0 rows)`);
    sqlChunks.push('');
  }

  console.log(`- ${table}: ${rows.length} rows`);
}

sqlChunks.push('COMMIT;');
sqlChunks.push('');

fs.writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf8');
fs.writeFileSync(sqlOutPath, sqlChunks.join('\n'), 'utf8');

console.log(`Done. Data dump written to ${outPath}`);
console.log(`Done. SQL dump written to ${sqlOutPath}`);
