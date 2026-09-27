import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';

/**
 * Ghost loads a storage adapter with a plain require() and uses the result as
 * the class (`new (require(adapterPath))(config)`). These tests compile
 * src/index.ts exactly as the published build does (CommonJS, per
 * tsconfig.json) and evaluate it with stubbed dependencies, so a change that
 * breaks that contract fails here without needing a prior `npm run build`.
 */

class FakeStorageBase {
  constructor(_config?: unknown) {}
}

function loadCompiled(files: Record<string, unknown> = {}) {
  const tsconfig = JSON.parse(readFileSync(join(__dirname, '..', 'tsconfig.json'), 'utf8'));
  const source = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { ...tsconfig.compilerOptions, module: ts.ModuleKind.CommonJS },
  });

  const stubs: Record<string, unknown> = {
    'ghost-storage-base': { StorageBase: FakeStorageBase },
    '@google-cloud/storage': {
      Storage: class {
        bucket() {
          return {
            file: (name: string) => ({
              createReadStream: () => {
                const rs = new EventEmitter();
                const chunks = (files[name] as Buffer[] | undefined) ?? [];
                setImmediate(() => {
                  for (const c of chunks) rs.emit('data', c);
                  rs.emit('end');
                });
                return rs;
              },
            }),
          };
        }
      },
    },
    path: require('node:path'),
    './types': {},
  };

  const module = { exports: {} as Record<string, unknown> };
  const sandboxRequire = (id: string) => {
    if (id in stubs) return stubs[id];
    throw new Error(`unexpected require: ${id}`);
  };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: sandboxRequire,
    Buffer,
    setImmediate,
    Promise,
    Object,
  });
  return module.exports as unknown as {
    new (config: { bucket: string }): { read(o: { path: string }): Promise<Buffer> };
    default: unknown;
    name: string;
  };
}

describe('CommonJS contract used by Ghost', () => {
  it('require() returns the adapter class itself', () => {
    const GStore = loadCompiled();
    expect(typeof GStore).toBe('function');
    expect(GStore.name).toBe('GStore');
    expect(new GStore({ bucket: 'b' })).toBeInstanceOf(GStore);
  });

  it('keeps .default pointing at the same class for esModuleInterop consumers', () => {
    const GStore = loadCompiled();
    expect(GStore.default).toBe(GStore);
  });

  it('read() concatenates multiple stream chunks in order', async () => {
    const GStore = loadCompiled({
      'multi.bin': [Buffer.from('ab'), Buffer.from('cd'), Buffer.from('ef')],
    });
    const out = await new GStore({ bucket: 'b' }).read({ path: 'multi.bin' });
    expect(out.toString()).toBe('abcdef');
  });
});
