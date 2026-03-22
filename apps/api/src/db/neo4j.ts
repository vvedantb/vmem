import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI ?? "";
  const user = process.env.NEO4J_USERNAME ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "";

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return driver;
}

export async function ensureIndexes(): Promise<void> {
  const d = getDriver();
  const session = d.session();
  try {
    await session.run(
      `CREATE INDEX memory_user_url IF NOT EXISTS
       FOR (m:Memory) ON (m.userId, m.url)`,
    );
  } finally {
    await session.close();
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
