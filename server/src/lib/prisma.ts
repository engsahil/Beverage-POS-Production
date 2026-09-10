import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
      prismaInstance = new Proxy({} as PrismaClient, {
        get(_target, prop) {
          if (prop === '$connect' || prop === '$disconnect') {
            return async () => {};
          }
          return new Proxy({}, {
            get() {
              return async () => {
                throw new Error(`Database operation unavailable during unit test: ${String(prop)}`);
              };
            },
          });
        },
      });
    } else {
      try {
        prismaInstance = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        });
      } catch {
        prismaInstance = new Proxy({} as PrismaClient, {
          get(_target, prop) {
            if (prop === '$connect' || prop === '$disconnect') {
              return async () => {};
            }
            return new Proxy({}, {
              get() {
                return async () => {
                  throw new Error(`Database operation unavailable: ${String(prop)}`);
                };
              },
            });
          },
        });
      }
    }
  }
  return prismaInstance;
}

const prismaProxy = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const instance = getPrisma();
    const val = (instance as any)[prop];
    if (typeof val === 'function') {
      return val.bind(instance);
    }
    return val;
  },
});

export default prismaProxy;
