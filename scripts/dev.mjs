#!/usr/bin/env node
// Minimaler, dependency-freier Parallel-Runner für die Dev-Umgebung.
// Startet Server (tsx watch) + Web (vite) und leitet Logs mit Präfix weiter.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', color: '\x1b[36m', cmd: 'npm', args: ['run', 'dev', '--workspace', 'server'] },
  { name: 'web', color: '\x1b[35m', cmd: 'npm', args: ['run', 'dev', '--workspace', 'web'] },
];

const children = [];
let shuttingDown = false;

function prefix(name, color, chunk) {
  const reset = '\x1b[0m';
  const lines = chunk.toString().split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) process.stdout.write(`${color}[${name}]${reset} ${line}\n`);
}

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { stdio: ['inherit', 'pipe', 'pipe'] });
  child.stdout.on('data', (c) => prefix(p.name, p.color, c));
  child.stderr.on('data', (c) => prefix(p.name, p.color, c));
  child.on('exit', (code) => {
    if (!shuttingDown) {
      prefix('dev', '\x1b[31m', `${p.name} beendet (code ${code}) — fahre alles herunter`);
      shutdown();
    }
  });
  children.push(child);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
