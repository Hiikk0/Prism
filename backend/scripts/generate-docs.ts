import fs from 'fs';
import path from 'path';
import { buildApp } from '../src/app';

async function generateDocs() {
  const app = buildApp({ logger: false });

  // Wait for plugins to be ready so swagger schemas are built
  await app.ready();

  const swaggerJson = app.swagger();
  const docsDir = path.join(__dirname, '../../docs');

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Create a markdown representation
  const mdLines = [];
  mdLines.push(`# ${swaggerJson.info.title}`);
  mdLines.push(`**Version:** ${swaggerJson.info.version}`);
  mdLines.push(`\n${swaggerJson.info.description}`);
  mdLines.push(`\n## Endpoints\n`);

  const paths = swaggerJson.paths || {};
  for (const [routePath, methods] of Object.entries(paths)) {
    if (!methods) continue;
    for (const [method, operation] of Object.entries(methods as any)) {
      const op = operation as any;
      if (typeof op === 'string') continue;

      mdLines.push(`### \`${method.toUpperCase()}\` ${routePath}`);
      if (op.summary) mdLines.push(`**Summary:** ${op.summary}`);
      if (op.description) mdLines.push(`**Description:** ${op.description}`);
      
      // Parse parameters (query, path, headers)
      if (op.parameters && op.parameters.length > 0) {
        mdLines.push(`\n**Parameters:**`);
        mdLines.push(`| Name | In | Required | Type |`);
        mdLines.push(`| --- | --- | --- | --- |`);
        op.parameters.forEach((p: any) => {
          mdLines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? 'Yes' : 'No'} | \`${p.schema?.type || 'string'}\` |`);
        });
      }

      // Parse requestBody
      if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
        mdLines.push(`\n**Request Body:**`);
        const schema = op.requestBody.content['application/json'].schema;
        mdLines.push("```json\n" + JSON.stringify(schema, null, 2) + "\n```");
      }

      // Parse responses
      if (op.responses) {
        mdLines.push(`\n**Responses:**`);
        for (const [code, res] of Object.entries(op.responses as any)) {
          const r = res as any;
          mdLines.push(`- **${code}**: ${r.description || ''}`);
        }
      }
      
      mdLines.push(`\n---\n`);
    }
  }

  const outputMd = mdLines.join('\n');
  const mdPath = path.join(docsDir, 'API.md');
  fs.writeFileSync(mdPath, outputMd, 'utf8');

  console.log(`\n✅ API Documentation successfully generated at: ${mdPath}`);
  
  await app.close();
  process.exit(0);
}

generateDocs().catch(err => {
  console.error('Failed to generate docs:', err);
  process.exit(1);
});
