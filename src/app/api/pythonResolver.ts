import path from 'path';
import fs from 'fs';

export function getPythonExecutable(): string {
  const isWin = process.platform === 'win32';
  
  if (process.env.PYTHON_PATH) {
    return process.env.PYTHON_PATH;
  }
  
  if (isWin) {
    const pathsToTry = [
      path.join(process.cwd(), 'scrapling-mcp', 'venv', 'Scripts', 'python.exe'),
      path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
    ];
    for (const p of pathsToTry) {
      if (fs.existsSync(p)) return p;
    }
    return 'python'; // Fallback
  } else {
    const pathsToTry = [
      path.join(process.cwd(), 'venv', 'bin', 'python'),
      path.join(process.cwd(), 'venv', 'bin', 'python3'),
      path.join(process.cwd(), 'scrapling-mcp', 'venv', 'bin', 'python'),
      path.join(process.cwd(), 'scrapling-mcp', 'venv', 'bin', 'python3'),
      '/app/venv/bin/python',
      '/app/venv/bin/python3',
    ];
    for (const p of pathsToTry) {
      if (fs.existsSync(p)) return p;
    }
    return 'python3'; // Fallback
  }
}
