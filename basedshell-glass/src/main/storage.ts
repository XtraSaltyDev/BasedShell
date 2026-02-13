import fs from 'node:fs';
import path from 'node:path';

export class JsonStore<T extends object> {
  constructor(
    private readonly filePath: string,
    private readonly defaults: T
  ) {}

  read(): T {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<T>;
      return { ...this.defaults, ...parsed };
    } catch {
      return { ...this.defaults };
    }
  }

  write(value: T): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    const payload = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(tempPath, payload, 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }
}
