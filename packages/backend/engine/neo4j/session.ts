import type { Driver, Session } from "neo4j-driver";

export async function withSession<T>(
  driver: Driver,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = driver.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}
